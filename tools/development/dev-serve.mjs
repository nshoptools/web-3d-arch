// Development server for the real product shell: Vite serves the live source
// tree, the real backend/SQLite runs behind /api, and the checked engine
// (WASM) and source library are read from an already-built release package.
//
// Local development aid only. It is not a release assembler, it is not the
// production host and it never ships: the synthetic identity, the synthetic
// loopback certificate and the cookie hand-off route exist so a developer can open
// the actual application, sign in as a local test member and iterate on the
// interface without re-packaging 375 MB per change. It serves HTTPS on the
// loopback with a synthetic certificate (tmp/development/tls). Usage:
//
//   node tools/development/dev-serve.mjs [--release <releaseRoot>] [--port 5180]
//
// Everything it writes stays inside the repository under tmp/reviews/codex/runs.
import {existsSync,mkdirSync,statSync,createReadStream,readFileSync} from 'node:fs';
import {request as httpsRequest} from 'node:https';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join,resolve,extname,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer as createNetServer} from 'node:net';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..','..');
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0&&args[i+1]?args[i+1]:fallback;};
const releaseRoot=resolve(root,option('release','report/release/20260908-internal'));
const port=Number(option('port','5180'));
const releasePublic=join(releaseRoot,'public');
if(!existsSync(join(releasePublic,'release-bindings.json')))throw new Error('Release package missing: '+releasePublic);

// Review-room isolation (AGENTS.md): every file this process writes lands in
// the repository, never in the machine TEMP.
if(!process.env.PROJECT_REVIEW_RUN){
 const runId='dev-serve-'+new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);
 const run=join(root,'tmp','reviews','codex','runs',runId);
 for(const dir of ['inputs','work','evidence','reports','cache','temp'])mkdirSync(join(run,dir),{recursive:true});
 process.env.PROJECT_ROOT=root;process.env.PROJECT_REVIEW_RUN=run;
 process.env.TEMP=join(run,'temp');process.env.TMP=process.env.TEMP;process.env.TMPDIR=process.env.TEMP;
}

const isFree=p=>new Promise(r=>{const s=createNetServer();s.once('error',()=>r(false));s.listen(p,'127.0.0.1',()=>s.close(()=>r(true)));});
if(!await isFree(port))throw new Error('Port busy: '+port);
// The application refuses to bind a session over plain http (src/app/http.mjs:
// FRESH_HTTPS_RESPONSE_REQUIRED), so the development server speaks HTTPS with a
// synthetic loopback certificate kept inside the run. Browsers must be told to
// accept it (Playwright: ignoreHTTPSErrors; a desktop browser: proceed past the
// warning). It is never installed in a trust store.
const tlsDir=join(root,'tmp','development','tls');
const tlsKey=join(tlsDir,'synthetic-key.pem'),tlsCert=join(tlsDir,'synthetic-cert.pem');
{const made=spawnSync('pwsh',['-NoProfile','-File',join(here,'synthetic-tls.ps1'),'-OutputDirectory',tlsDir],{encoding:'utf8'});
 if(made.status!==0||!existsSync(tlsKey)||!existsSync(tlsCert))throw new Error('Synthetic TLS unavailable: '+(made.stderr||made.stdout||made.error));}
const origin='https://127.0.0.1:'+port;

// Real backend with a synthetic local identity (same fixture the repo tests use).
const {setup}=await import(pathToFileURL(join(root,'tests/server/helpers.mjs')).href);
const {createBackend}=await import(pathToFileURL(join(root,'src/server/app.mjs')).href);
const after=[];
const f=await setup({after(fn){after.push(fn);}});
f.provider.metadata.models[0].qualities=['test'];f.provider.metadata.models[0].sizes=['1x1'];f.provider.metadata.prices.currency='USD';
// The fixture clock is frozen for deterministic tests. The application persists a
// monotonic "last seen" watermark from serverTime and treats a server clock more
// than five minutes behind it as a rollback (src/storage/access.mjs), which locks
// the store into rescue mode: with a frozen backend every reload after a session
// longer than five minutes showed "Phiên đã hết hạn". Keep the fixture's base
// time (its sessions and the IdP were minted at it) and advance it in real time.
const clockBase=f.clock(),clockStarted=Date.now();
const clockTicker=setInterval(()=>f.setTime(clockBase+(Date.now()-clockStarted)),250);
clockTicker.unref();after.push(()=>clearInterval(clockTicker));
await f.app.close();
f.app=createBackend({...f.config,origin});
const backend=await f.app.listen(0);
const backendOrigin='http://127.0.0.1:'+backend.port;

const {MIME}=await import(pathToFileURL(join(root,'src/host/manifest.mjs')).href);
const bindings=JSON.parse(await readFile(join(releasePublic,'release-bindings.json'),'utf8'));
bindings.entry='/src/main.mjs';
const bindingsBytes=Buffer.from(JSON.stringify(bindings));

const accounts={a:f.a,b:f.b,owner:f.owner},subjects={a:'member-a',b:'member-b',owner:'owner-subject'};
// A fixture session expires like a real one (12 h absolute, 1 h idle), so a
// sign-in signs the account in again instead of re-issuing the cookies minted
// at start-up, which would be dead after an hour away from the page.
//
// The fixture client talks to `f.app.origin`, which is this server's public
// HTTPS origin once the backend is bound to it, and Node's fetch refuses the
// synthetic certificate. So the sign-in dance (auth start → test IdP → callback
// → me) is made here through the Vite proxy with the certificate check off:
// loopback only, the same path the browser takes.
async function devRequest(method,path,jar,body){
 const headers={Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(method==='GET'?{}:{'content-type':'application/json',Origin:origin})};
 return new Promise((resolve,reject)=>{
  const request=httpsRequest({host:'127.0.0.1',port,path,method,headers,rejectUnauthorized:false},response=>{
   for(const value of response.headers['set-cookie']??[]){
    const [kv,...attributes]=value.split(';'),i=kv.indexOf('='),name=kv.slice(0,i),cleared=attributes.some(a=>/^\s*max-age=0\s*$/i.test(a));
    if(cleared)jar.delete(name);else jar.set(name,kv.slice(i+1));
   }
   const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve({status:response.statusCode,text:Buffer.concat(chunks).toString('utf8')}));
  });
  request.on('error',reject);if(body!==undefined)request.write(JSON.stringify(body));request.end();
 });
}
async function freshLogin(who){
 const client=accounts[who];
 try{
  const jar=new Map();
  const start=await devRequest('POST','/api/v1/auth/start',jar,{deviceId:client.deviceId});
  if(start.status!==200)throw new Error('auth/start '+start.status+' '+start.text.slice(0,120));
  const back=await devRequest('GET',f.idp.issue(subjects[who],JSON.parse(start.text).authorizationUrl),jar);
  if(back.status!==303)throw new Error('callback '+back.status+' '+back.text.slice(0,120));
  const me=await devRequest('GET','/api/v1/me',jar);
  if(me.status!==200)throw new Error('me '+me.status+' '+me.text.slice(0,120));
  client.cookies.clear();for(const [k,v] of jar)client.cookies.set(k,v);
 }catch(error){console.error('dev login could not refresh the session for '+who+': '+(error?.message??error));}
 return client;
}
function loginPage(client){
 // __Host- cookies are rejected without Secure; loopback http origins count as
 // secure contexts in Chromium and Firefox, so the flag is accepted here.
 const cookies=[...client.cookies].map(([k,v])=>k+'='+v+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400');
 const html='<!doctype html><meta charset="utf-8"><title>dev sign-in</title><script>try{localStorage.setItem("arch-device-v1",'+JSON.stringify(client.deviceId)+');}catch(e){}location.replace("/");</script>';
 return {cookies,html};
}

const {createServer:createVite}=await import('vite');
// Same module resolution as the release compiler (tools/application/compile.mjs):
// React/Three come from the pinned app toolchain, fflate and xmldom from the
// printing toolchain. Dependency scanning is limited to the product entry so
// Vite never crawls tmp/, report/ or .toolchain/ (a full-repository scan took
// minutes and pulled in unrelated vendored examples).
const appDeps=join(root,'.toolchain','app-runtime','node_modules'),printingDeps=join(root,'src','printing','node_modules');
const slash=p=>p.split('\\').join('/');
const aliases=[
 {find:/^three\/addons\//,replacement:slash(join(appDeps,'three','examples','jsm'))+'/'},
 ...['react-dom','react','scheduler'].map(name=>({find:new RegExp('^'+name+'(?=/|$)'),replacement:slash(join(appDeps,name))})),
 {find:/^three$/,replacement:slash(join(appDeps,'three','build','three.module.js'))},
 {find:/^fflate$/,replacement:slash(join(printingDeps,'fflate','esm','browser.js'))},
 {find:/^@xmldom\/xmldom$/,replacement:slash(join(printingDeps,'@xmldom','xmldom','lib','index.js'))}
];
const vite=await createVite({
 root,configFile:false,envDir:false,publicDir:false,appType:'spa',logLevel:'info',clearScreen:false,
 cacheDir:join(process.env.PROJECT_REVIEW_RUN,'cache','vite'),
 resolve:{alias:aliases,dedupe:['react','react-dom']},
 optimizeDeps:{entries:['index.html'],include:['react','react-dom','react-dom/client','scheduler']},
 server:{host:'127.0.0.1',port,strictPort:true,https:{key:readFileSync(tlsKey),cert:readFileSync(tlsCert)},
  watch:{ignored:['**/tmp/**','**/report/**','**/.toolchain/**','**/docs/**','**/tests/**','**/node_modules/**']},
  headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'},
  proxy:{'/api':{target:backendOrigin,changeOrigin:false}}},
 plugins:[{name:'arch-dev-entry-url',
  // After any module invalidation Vite stamps the entry script with `?t=…`.
  // The product bootstrap verifies `import.meta.url` of the entry against the
  // release bindings and refuses a query string (RUNTIME_ORIGIN), so the stamp
  // is removed from the HTML; module-level imports keep theirs for HMR.
  transformIndexHtml:{order:'post',handler:html=>html.replace(/(src="\/src\/main\.mjs)\?t=\d+"/g,'$1"')}},
  {name:'arch-dev-release-runtime',configureServer(server){
  server.middlewares.use((req,res,next)=>{
   const url=new URL(req.url,origin);const path=decodeURIComponent(url.pathname);
   if(path==='/release-bindings.json'){res.writeHead(200,{'Content-Type':'application/json','Content-Length':bindingsBytes.length,'Cache-Control':'no-store'});res.end(bindingsBytes);return;}
   if(path.startsWith('/__dev/login')){
    const who=url.searchParams.get('as')??'a';
    if(!accounts[who]){res.writeHead(404);res.end('unknown account');return;}
    void freshLogin(who).then(client=>{const {cookies,html}=loginPage(client);
     res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Set-Cookie':cookies,'Cache-Control':'no-store'});res.end(html);});return;
   }
   if(path==='/'||path==='/index.html'||path.startsWith('/assets/')||path.startsWith('/src/')||path.startsWith('/@')||path.startsWith('/node_modules/')||path.startsWith('/api/')){next();return;}
   const file=join(releasePublic,path);
   if(!file.startsWith(releasePublic)||!existsSync(file)||!statSync(file).isFile()){next();return;}
   const mime=MIME[extname(file)]??'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime,'Content-Length':statSync(file).size,'Cache-Control':'no-store'});
   createReadStream(file).pipe(res);
  });
 }}]
});
await vite.listen();
console.log(JSON.stringify({status:'ready',origin,signIn:origin+'/__dev/login?as=a',accounts:Object.keys(accounts),backend:backendOrigin,release:releaseRoot,run:process.env.PROJECT_REVIEW_RUN}));
const stop=async()=>{try{await vite.close();await f.app.close();for(const fn of after.reverse())await fn();}finally{process.exit(0);}};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
