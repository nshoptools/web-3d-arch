import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),repo=fs.realpathSync(process.env.PROJECT_ROOT),source=path.join(run,'work/review-source'),work=path.join(run,'work');
const tag=process.env.REVIEW_BROWSER_TAG??'independent-1';if(!/^[a-z0-9-]+$/.test(tag))throw Error('TAG');
const dest=path.join(run,'evidence',tag);if(fs.existsSync(dest))throw Error('Preserve prior attempt');fs.mkdirSync(dest);
const omittedDependencies=[],routes=new Map(),hash=b=>createHash('sha256').update(b).digest('hex');
// Closed transitive source allowlist; private backend, metadata and room contents are never mapped.
function addModule(file,url){
 if(routes.has(url))return;const real=fs.realpathSync(file);if(!real.startsWith(source+path.sep))throw Error('SOURCE_OUTSIDE_CAPTURE');if(real.includes(path.sep+'backend'+path.sep)||!real.endsWith('.mjs'))throw Error('FORBIDDEN_SOURCE_ROUTE');
 const b=fs.readFileSync(real),text=b.toString('utf8');routes.set(url,b);
 for(const match of text.matchAll(/(?:from\s*|import\s*\(\s*|new URL\(\s*)['"](\.{1,2}\/[^'"]+\.mjs)['"]/g)){
  const dep=path.resolve(path.dirname(real),match[1]),depURL=new URL(match[1],'http://localhost'+url).pathname;if(!dep.startsWith(path.join(source,'src')+path.sep)||!fs.existsSync(dep)){omittedDependencies.push(depURL);continue;}addModule(dep,depURL);
 }
}
for(const name of ['engine-client.mjs','engine-worker.mjs','mesh-qualification-client.mjs','mesh-qualification-worker.mjs'])addModule(path.join(source,'src/core',name),'/src/core/'+name);
for(const file of ['independent-browser-page.mjs','analytic-shapes.mjs'])routes.set('/review/'+file,fs.readFileSync(path.join(work,file==='independent-browser-page.mjs'?'independent-browser-page-v3.mjs':file)));
routes.set('/review/idle-worker.mjs',Buffer.from('self.onmessage=()=>{};'));
routes.set('/review/wrong-id-worker.mjs',Buffer.from("self.onmessage=({data})=>self.postMessage({version:data.version,id:'obsolete',result:{version:data.version,verdict:'pass'}});"));
for(const ext of ['mjs','wasm'])routes.set('/runtime/arch-kernel.'+ext,fs.readFileSync(path.join(work,'module/arch-kernel.'+ext)));
const requests=[],headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'"};
const server=createServer((req,res)=>{for(const [k,v]of Object.entries(headers))res.setHeader(k,v);const known=routes.has(req.url)||req.url==='/';requests.push({url:known?req.url:'[unlisted]',method:req.method});if(req.method!=='GET'){res.writeHead(405);return res.end();}if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta charset="utf-8"><title>Independent mesh review</title>');}const b=routes.get(req.url);if(!b){res.writeHead(404);return res.end();}res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(b);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
fs.writeFileSync(path.join(dest,'route-manifest.json'),JSON.stringify({headers,omittedDependencies,files:[...routes].map(([url,b])=>({url,bytes:b.length,sha256:hash(b)}))},null,2));
const pw=await import(pathToFileURL(path.join(repo,'.toolchain/app-runtime/node_modules/playwright/index.mjs')));let failures=0;
try{for(const engine of (process.env.REVIEW_BROWSER_ENGINES??'chromium,firefox,webkit').split(',')){
 let context;try{
  context=await pw[engine].launchPersistentContext(path.join(run,'cache/browser-profiles',tag+'-'+engine),{headless:true,acceptDownloads:false,downloadsPath:path.join(run,'temp',tag+'-'+engine),serviceWorkers:'block',...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());const page=context.pages()[0]??await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  const result=await page.evaluate(async()=>await(await import('/review/independent-browser-page.mjs')).run());
  for(const artifact of result.artifacts){const bytes=Buffer.from(artifact.bytes);if(hash(bytes)!==artifact.sha256)throw Error('EVIDENCE_TRANSFER_HASH');fs.writeFileSync(path.join(dest,engine+'-'+artifact.name),bytes);delete artifact.bytes;}
  result.browser=context.browser().version();result.errors=errors;fs.writeFileSync(path.join(dest,engine+'.json'),JSON.stringify(result,null,2));if(result.failure)throw Error(result.failure);if(errors.length||!result.crossOriginIsolated)throw Error('BROWSER_SECURITY_OR_SCRIPT');console.log(JSON.stringify({engine,browser:result.browser,checks:result.trace.map(t=>({name:t.name,verdict:t.verdict,code:t.code,volumeMm3:t.volumeMm3}))}));
 }catch(e){failures++;fs.writeFileSync(path.join(dest,engine+'-failure.json'),JSON.stringify({message:e.message,stack:e.stack},null,2));console.log(JSON.stringify({engine,error:e.message}));}finally{await context?.close();}
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(dest,'requests.json'),JSON.stringify(requests,null,2));}process.exitCode=failures?1:0;
