import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
import http from 'node:http';import assert from 'node:assert/strict';
import {sha256} from '../src/contracts.mjs';
const run=process.env.PROJECT_REVIEW_RUN,repo=process.env.PROJECT_ROOT;
const source=fileURLToPath(new URL('../',import.meta.url)),modulePath=process.env.ARCH_WASM_MODULE??join(run,'work/module/arch-kernel.mjs');
const out=join(run,'work/unified-browser'),evidence=join(run,'evidence/unified-browser');
await mkdir(out,{recursive:true});await mkdir(evidence,{recursive:true});
const {build}=await import(pathToFileURL(join(repo,'.toolchain/app-runtime/node_modules/vite/dist/node/index.js')));
await build({configFile:false,root:source,cacheDir:join(run,'cache/vite-unified'),logLevel:'warn',
 build:{outDir:out,emptyOutDir:false,minify:false,lib:{entry:join(source,'tests/unified-checks.mjs'),formats:['es'],fileName:()=> 'checks.mjs'}}});
const playwright=await import(pathToFileURL(join(repo,'.toolchain/app-runtime/node_modules/playwright/index.mjs')));
const sourceHashes=[{id:'src/kernel/src/lib.rs',sha256:await sha256(await readFile(join(repo,'src/kernel/src/lib.rs')))}];
const worker=`import{runUnifiedChecks}from'/checks.mjs';import*as hb from'/hb.mjs';
let instances=0;
const original=WebAssembly.instantiate,streaming=WebAssembly.instantiateStreaming;
WebAssembly.instantiate=(...a)=>{instances++;return original(...a);};
WebAssembly.instantiateStreaming=async(...a)=>{instances++;return streaming(...a);};
self.onmessage=async()=>{try{
 const factory=(await import('/arch-kernel.mjs')).default;
 const module=await factory();
 const profiles={bambu:await(await fetch('/bambu.json')).json(),u1:await(await fetch('/u1.json')).json()};
 const sourceHashes=await(await fetch('/sources.json')).json();
 const font=new Uint8Array(await(await fetch('/Inter.ttf')).arrayBuffer());
 const result=await runUnifiedChecks(module,profiles,hb,font,sourceHashes);
 result.wasmInstantiationCalls=instances;result.crossOriginIsolated=crossOriginIsolated;
 postMessage({ok:true,result},result.files.map(f=>f.bytes.buffer));
}catch(e){postMessage({ok:false,error:e.stack||e.message});}};`;
await writeFile(join(out,'worker.mjs'),worker);
const routes=new Map([
 ['/checks.mjs',join(out,'checks.mjs')],['/worker.mjs',join(out,'worker.mjs')],
 ['/arch-kernel.mjs',modulePath],
 ['/arch-kernel.wasm',modulePath.replace(/\.mjs$/,'.wasm')],
 ['/hb.mjs',join(repo,'src/input/harfbuzz-engine.mjs')],['/Inter.ttf',join(repo,'src/assets/fonts/ttf/Inter.ttf')],
 ['/bambu.json',join(run,'inputs/printing/bambu-profile.json')],['/u1.json',join(run,'inputs/printing/u1-profile.json')]
]);
const requests=[];
const server=http.createServer(async(req,res)=>{
 requests.push(req.url);
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
 try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Unified printing test</title><pre>Rust + HarfBuzz + lib3MF in one module</pre>');return;}
  if(req.url==='/sources.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(sourceHashes));return;}
  const path=routes.get(req.url);
  if(!path){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',path.endsWith('.mjs')?'text/javascript':path.endsWith('.wasm')?'application/wasm':path.endsWith('.json')?'application/json':'application/octet-stream');
  res.end(await readFile(path));
 }catch{res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port,records=[];
try{
 for(const engine of ['chromium','firefox','webkit']){
  const context=await playwright[engine].launchPersistentContext(join(run,'cache/unified-browser-profiles',engine),{
   headless:true,downloadsPath:join(run,'work/unified-browser-downloads',engine),
   ...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  try{
   // Only this fixed loopback origin is allowed; there is no raw filesystem route.
   await context.route('**/*',route=>route.request().url().startsWith(url+'/')?route.continue():route.abort());
   const page=context.pages()[0];await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const w=new Worker('/worker.mjs',{type:'module'}),timer=setTimeout(()=>{w.terminate();reject(new Error('unified worker timeout'));},60000);
    w.onerror=e=>{clearTimeout(timer);w.terminate();reject(new Error(e.message));};
    w.onmessage=({data})=>{
     clearTimeout(timer);w.terminate();
     if(!data.ok){reject(new Error(data.error));return;}
     const result=data.result;
     result.files=result.files.map(f=>{let s='';for(const b of f.bytes)s+=String.fromCharCode(b);return {...f,bytes:undefined,base64:btoa(s)};});
     resolve(result);
    };
    w.postMessage({});
   }));
   assert.equal(result.wasmInstantiationCalls,1);assert.equal(result.crossOriginIsolated,true);
   assert.equal(result.records.length,7);assert.ok(result.records.every(r=>r.verdict==='pass'));
   for(const f of result.files)await writeFile(join(evidence,engine+'-'+f.name),Buffer.from(f.base64,'base64'));
   delete result.files;records.push({engine,version:context.browser().version(),verdict:'pass',...result});
   console.log(engine,'pass; one WASM instantiation; 7 behavior groups');
  }catch(e){records.push({engine,verdict:'fail',error:e.stack||e.message});console.error(engine,e.message);}
  finally{await context.close();}
 }
}finally{
 await new Promise(resolve=>server.close(resolve));
 await writeFile(join(evidence,'records.json'),JSON.stringify(records,null,2));
 await writeFile(join(evidence,'routes.json'),JSON.stringify({bound:'127.0.0.1',allowlisted:[...routes.keys(),'/','/sources.json'],requests},null,2));
}
assert.equal(records.filter(x=>x.verdict==='pass').length,3);
