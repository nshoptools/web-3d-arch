import fs from 'node:fs/promises';import path from 'node:path';import {createServer} from 'node:http';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN;if(!root||!run)throw Error('own run environment required');
const candidate=fileURLToPath(new URL('../../',import.meta.url)),out=path.join(run,'evidence/root-browser-'+(process.env.ARCH_EXPORT_EVIDENCE_TAG??'r1')),bundle=path.join(run,'work/root-browser-bundle');
if(!path.resolve(candidate).startsWith(path.resolve(root)+path.sep)||!path.resolve(out).startsWith(path.resolve(run)+path.sep))throw Error('scope');await fs.mkdir(out,{recursive:true});
const H=b=>createHash('sha256').update(b).digest('hex'),pins=JSON.parse(await fs.readFile(path.join(run,'inputs/production-pair.json'),'utf8')),integrity=JSON.parse(await fs.readFile(path.join(run,'inputs/runtime-integrity.json'),'utf8')),moduleDir=path.join(run,pins.moduleDirectory??'work/module');
for(const name of ['arch-kernel.mjs','arch-kernel.wasm']){const b=await fs.readFile(path.join(moduleDir,name));if(H(b)!==pins.pins[name].sha256||b.length!==pins.pins[name].bytes)throw Error('pair pin changed');}
const {build}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
const entryPoints=[['tests/export-root-integration/export-root-page.mjs','root-page'],['src/core/engine-worker.mjs','root-worker'],['src/core/mesh-qualification-worker.mjs','qualification-worker']];
for(const [entry,name]of entryPoints)await build({configFile:false,root:candidate,cacheDir:path.join(run,'cache/vite-root-export'),publicDir:false,logLevel:'warn',build:{outDir:bundle,emptyOutDir:false,minify:false,lib:{entry:path.join(candidate,entry),formats:['es'],fileName:()=>name+'.mjs'},rolldownOptions:{output:{codeSplitting:false}}}});
const files=new Map(entryPoints.map(([,name])=>['/'+name+'.mjs',path.join(bundle,name+'.mjs')]));
files.set(integrity.module.url,path.join(moduleDir,'arch-kernel.mjs'));files.set(integrity.wasm.url,path.join(moduleDir,'arch-kernel.wasm'));
for(const name of ['keychain','clicky'])files.set('/fixtures/'+name+'.json',path.join(candidate,'tests/final-scene/fixtures',name+'.json'));
const requests=[],server=createServer(async(req,res)=>{requests.push(req.url);res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Current app final-scene export integration</title>');return;}
 if(req.url==='/integrity.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(integrity));return;}
 const file=files.get(req.url);if(!file){res.writeHead(404);res.end();return;}
 try{const b=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'text/javascript');res.setHeader('Content-Length',b.length);res.end(b);}catch{res.writeHead(500);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const {chromium,firefox,webkit}=await import(pathToFileURL(path.join(root,'node_modules/playwright/index.mjs'))),results=[];
try{for(const [engine,driver]of Object.entries({chromium,firefox,webkit})){
 if(process.env.ARCH_EXPORT_BROWSER&&!process.env.ARCH_EXPORT_BROWSER.split(',').includes(engine))continue;
 const profile=path.join(run,'cache/root-export-browsers',engine);await fs.mkdir(profile,{recursive:true});let context;const log=[],start=requests.length;
 try{context=await driver.launchPersistentContext(profile,{headless:true,acceptDownloads:false,downloadsPath:path.join(run,'temp/root-export-downloads',engine),serviceWorkers:'block',...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});const page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(180000);page.on('console',m=>log.push(m.text()));page.on('pageerror',e=>log.push(e.stack));page.on('requestfailed',r=>log.push(r.url()+': '+r.failure()?.errorText));
  await context.route('**/*',route=>route.request().url().startsWith(url+'/')?route.continue():route.abort());
  page.on('request',r=>log.push('request '+r.method()+' '+r.url()));page.on('response',r=>log.push('response '+r.status()+' '+r.url()));
  await page.goto(url,{timeout:30000});const result=await page.evaluate(async()=>{const {run}=await import('/root-page.mjs'),r=await run();return {...r,files:r.files.map(f=>({...f,bytes:Array.from(f.bytes)}))};});
  for(const f of result.files){await fs.writeFile(path.join(out,engine+'-'+f.name),new Uint8Array(f.bytes));await fs.writeFile(path.join(out,engine+'-'+f.name+'.json'),JSON.stringify({metadata:f.metadata,receipt:f.receipt},null,2)+'\n');}delete result.files;
  const loaded=requests.slice(start),wasmRequests=loaded.filter(p=>p.endsWith('.wasm')).length;if(wasmRequests!==1)throw Error('Expected one verified WASM fetch, got '+wasmRequests);
  results.push({engine,version:context.browser().version(),wasmRequests,...result});console.log(JSON.stringify({engine,cases:result.records.length,passed:result.records.length,wasmRequests,actualFinalSceneProvider:result.actualFinalSceneProvider}));
 }catch(e){results.push({engine,ok:false,error:e.stack});console.log(JSON.stringify({engine,error:e.stack}));}
 finally{await context?.close();await fs.writeFile(path.join(out,engine+'-console.log'),log.join('\n'));await fs.writeFile(path.join(out,engine+'-requests.json'),JSON.stringify(requests.slice(start),null,2)+'\n');}
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({pins,results},null,2)+'\n');if(results.some(r=>!r.ok))process.exitCode=1;
