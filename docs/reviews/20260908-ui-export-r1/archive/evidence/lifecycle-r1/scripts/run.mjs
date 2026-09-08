import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {env,write,safe} from './support.mjs';import {cases} from './cases.mjs';
const c=env(),{repo,run,stage,snapshot}=c,label=process.env.REVIEW_PHASE??'lifecycle-r1';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Bad label');const out=safe(run,path.join(run,'evidence',label));fs.mkdirSync(out,{recursive:true});
for(const d of ['cache/browser-appdata','cache/browser-localappdata'])fs.mkdirSync(path.join(run,d),{recursive:true});
Object.assign(process.env,{APPDATA:path.join(run,'cache/browser-appdata'),LOCALAPPDATA:path.join(run,'cache/browser-localappdata'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'});
const deps=path.join(repo,'.toolchain/app-runtime/node_modules');
const {createServer}=await import(pathToFileURL(path.join(deps,'vite/dist/node/index.js')));const pw=await import(pathToFileURL(path.join(deps,'playwright/index.mjs')));
const server=await createServer({configFile:false,root:stage,cacheDir:path.join(run,'cache/vite-independent'),resolve:{alias:[{find:'@review',replacement:path.join(snapshot,'src').replaceAll('\\','/')},...['react','react-dom','three'].map(n=>({find:new RegExp('^'+n+'(?=/|$)'),replacement:path.join(deps,n).replaceAll('\\','/')}))],dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:0,hmr:false,watch:null,fs:{allow:[stage,snapshot,deps]}},logLevel:'warn'});
const results=[];let address;
try{await server.listen();address=server.httpServer.address();const url='http://127.0.0.1:'+address.port+'/';write(path.join(out,'server.json'),{pid:process.pid,address,root:stage,snapshot,started:new Date().toISOString(),scope:'Captured AppShell and deferred AppBridge; no native exporter'});
for(const name of (process.env.REVIEW_ENGINES??'chromium').split(',')){let context;const checks=[],errors=[],consoleMessages=[],denied=[];try{
const profile=safe(run,path.join(run,'work/browser-profiles',label,name));const downloads=safe(run,path.join(run,'work/browser-downloads',label,name));fs.mkdirSync(downloads,{recursive:true});
context=await pw[name].launchPersistentContext(profile,{headless:true,viewport:{width:1280,height:900},acceptDownloads:false,downloadsPath:downloads,tracesDir:path.join(out,name+'-traces'),env:process.env,...(name==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('not wrapped in act'))consoleMessages.push(m.text())});
await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(url).origin)return route.continue();denied.push(u.origin);return route.abort()});
await page.goto(url);await page.waitForFunction(()=>!!window.review);
await cases(page,async result=>{checks.push(result);write(path.join(out,name+'-checks.json'),checks);console.log(name+' '+(result.pass?'PASS ':'FAIL ')+result.id+': '+result.name)},out,name);
results.push({engine:name,version:context.browser()?.version(),checks,errors,consoleMessages,denied,profile});
}catch(e){results.push({engine:name,checks,errors,consoleMessages,denied,fatal:String(e.stack)})}finally{await context?.close()}
write(path.join(out,name+'.json'),results.at(-1));
}}finally{await server.close();write(path.join(out,'cleanup.json'),{at:new Date().toISOString(),serverClosed:true,browserContextsClosed:true,pid:process.pid,address})}
write(path.join(out,'results.json'),{at:new Date().toISOString(),sourceManifest:'56949f2cd695ed86b206306f3f60113f25ba10788327c99c3e10751329924cac',packages:Object.fromEntries(['react','react-dom','vite','typescript','playwright'].map(n=>[n,JSON.parse(fs.readFileSync(path.join(deps,n,'package.json'),'utf8')).version])),results});
process.exitCode=results.some(r=>r.fatal||r.errors.length||r.checks.some(t=>!t.pass))?1:0;

