import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN;
if(!root||!run)throw Error('Own run environment required');
const overlay=path.join(run,'work/app-overlay'),out=path.join(run,'evidence/export-app-browser'),bundle=path.join(run,'work/browser-bundle');await fs.mkdir(out,{recursive:true});
const {build}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
await build({configFile:false,root:overlay,cacheDir:path.join(run,'cache/vite'),publicDir:false,logLevel:'warn',build:{outDir:bundle,emptyOutDir:false,minify:false,lib:{entry:path.join(overlay,'tests/integration/export-browser-worker.mjs'),formats:['es'],fileName:()=> 'worker.mjs'},rolldownOptions:{output:{codeSplitting:false}}}});
const {fixtureProfile}=await import(pathToFileURL(path.join(overlay,'src/printing/tests/profile-fixtures.mjs')));
const profiles={'export.3mf.bambu-project':await fixtureProfile(root,'bambu'),'export.3mf.snapmaker-project':await fixtureProfile(root,'u1')};
const {chromium,firefox,webkit}=await import(pathToFileURL(path.join(root,'node_modules/playwright/index.mjs')));
const files=new Map([['/worker.mjs',path.join(bundle,'worker.mjs')],['/engine/arch-kernel.mjs',path.join(run,'work/module/arch-kernel.mjs')],['/engine/arch-kernel.wasm',path.join(run,'work/module/arch-kernel.wasm')]]);
const server=createServer(async(req,res)=>{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Application export adapter test</title>');return;}
 const file=files.get(req.url);if(!file){res.writeHead(404);res.end();return;}try{res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await fs.readFile(file));}catch{res.writeHead(500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,results=[];
try{for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
 const profile=path.join(run,'cache/export-app-browsers',name);await fs.mkdir(profile,{recursive:true});let context;const messages=[];
 try{context=await engine.launchPersistentContext(profile,{headless:true,acceptDownloads:false});const page=await context.newPage();page.on('console',m=>messages.push(m.text()));page.on('pageerror',e=>messages.push(e.stack));await page.goto(url);
  const result=await page.evaluate(profiles=>new Promise((resolve,reject)=>{const worker=new Worker('/worker.mjs',{type:'module'}),timer=setTimeout(()=>{worker.terminate();reject(Error('test Worker timeout'));},45000);worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();if(!data.ok){reject(Error(data.error));return;}resolve({...data,files:data.files.map(f=>({...f,bytes:Array.from(f.bytes)}))});};worker.postMessage({profiles});}),profiles);
  assert.equal(result.sameModule,true);assert.deepEqual(result.rootStats,[0,0,0,0,0]);
  for(const f of result.files){await fs.writeFile(path.join(out,name+'-'+f.name),new Uint8Array(f.bytes));await fs.writeFile(path.join(out,name+'-'+f.name+'.json'),JSON.stringify(f.metadata,null,2)+'\n');}
  delete result.files;const record={engine:name,version:context.browser().version(),...result};results.push(record);console.log(JSON.stringify({engine:name,cases:result.records.length,passed:result.records.length}));
 }catch(e){results.push({engine:name,ok:false,error:e.stack});console.log(JSON.stringify({engine:name,error:e.message}));}
 finally{await context?.close();await fs.writeFile(path.join(out,name+'-console.log'),messages.join('\n'));}
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({results,passed:results.filter(r=>r.ok).length},null,2)+'\n');if(results.some(r=>!r.ok))process.exitCode=1;
