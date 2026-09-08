import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:https';
import {verifyApplication} from '../../tools/application/build.mjs';
import {environment,checked,hash,put,jsonBytes} from '../../tools/application/core.mjs';
import {directory} from './helpers.mjs';
const prepared=process.env.APPLICATION_OWNED_PREPARED,sha=process.env.APPLICATION_OWNED_SHA256,label=process.env.APPLICATION_BUILD_LABEL;
assert.ok(prepared&&sha&&label,'Explicit prepared directory/SHA and fresh label required');
const verification=verifyApplication(prepared,sha),input=JSON.parse(readFileSync(resolve(prepared,'package-input.json'))),pins=verification.receipt;
assert.equal(pins.engineBuild.generatedAssignmentObserved,true);
const assets=new Map(input.frontend.assets.map(a=>[a.url,{bytes:Buffer.from(checked({file:resolve(prepared,'frontend',a.file),sha256:a.sha256,bytes:a.bytes})),mime:a.url.endsWith('.wasm')?'application/wasm':a.url.endsWith('.css')?'text/css':'text/javascript'}]));
const worker=pins.frontend.workerEntries.find(r=>r.source.replaceAll('\\','/').endsWith('/engine-worker.mjs')).file;
const probe=readFileSync(fileURLToPath(new URL('./owned-worker-probe.mjs',import.meta.url)));
const toolchain=resolve(environment().root,'.toolchain/app-runtime/node_modules'),playwright=await import(pathToFileURL(resolve(toolchain,'playwright/index.mjs')).href);
assert.equal(JSON.parse(readFileSync(resolve(toolchain,'playwright/package.json'))).version,'1.63.0');
const expected={chromium:['1243','153.0.8010.12'],firefox:['1543','155.0'],webkit:['2359','26.6']};
for(const engine of ['chromium','firefox','webkit'])test(engine+': actual compiled Worker receives owned verified WASM exactly once; duplicate init and tamper refuse',{timeout:180000},async t=>{
 const browserPin=JSON.parse(readFileSync(resolve(toolchain,'playwright-core/browsers.json'))).browsers.find(r=>r.name===engine);assert.deepEqual([browserPin.revision,browserPin.browserVersion],expected[engine]);
 const tls=process.env.APPLICATION_BUILD_TLS;assert.ok(tls);const requests=[];
 const server=createServer({key:readFileSync(resolve(tls,'synthetic-key.pem')),cert:readFileSync(resolve(tls,'synthetic-cert.pem'))},(req,res)=>{
  const path=new URL(req.url,'https://localhost').pathname;requests.push(path);
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'");
  let bytes,mime;
  if(path==='/'){bytes=Buffer.from('<!doctype html><title>Compiled Worker observer harness</title>');mime='text/html';}
  else if(path==='/probe.mjs'){bytes=probe;mime='text/javascript';}
  else{const m=/^\/case\/(ok|tampered)\/(.+)$/.exec(path),a=m&&assets.get('/'+m[2]);if(a){bytes=a.bytes;mime=a.mime;if(m[1]==='tampered'&&mime==='application/wasm'){bytes=Buffer.from(bytes);bytes[bytes.length-1]^=1;}}}
  if(!bytes){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',mime);res.setHeader('Content-Length',bytes.length);res.end(bytes);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let context;t.after(async()=>{await context?.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const origin='https://127.0.0.1:'+server.address().port,root=directory(engine+'-owned');for(const d of ['profile','downloads','artifacts','appdata','localappdata'])mkdirSync(resolve(root,d));
 context=await playwright[engine].launchPersistentContext(resolve(root,'profile'),{headless:true,ignoreHTTPSErrors:true,acceptDownloads:false,downloadsPath:resolve(root,'downloads'),artifactsDir:resolve(root,'artifacts'),serviceWorkers:'block',
  ...(engine==='chromium'?{args:['--ignore-certificate-errors','--disable-background-networking']}:{}),env:{...process.env,APPDATA:resolve(root,'appdata'),LOCALAPPDATA:resolve(root,'localappdata')}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
 const page=context.pages()[0]??await context.newPage();await page.goto(origin+'/');
 assert.equal(await page.evaluate(()=>crossOriginIsolated&&isSecureContext),true);
 const outcomes=[];
 for(const kind of ['ok','tampered']){
  const prefix=origin+'/case/'+kind,integrity={version:'arch-engine-integrity/1',module:{url:prefix+input.engine.moduleUrl,sha256:pins.engine.moduleSHA256,bytes:pins.engine.moduleBytes},wasm:{url:prefix+input.engine.wasmUrl,sha256:pins.engine.wasmSHA256,bytes:pins.engine.wasmBytes}};
  const result=await page.evaluate(async({origin,workerURL,integrity,kind})=>{
   const w=new Worker(origin+'/probe.mjs',{type:'module'}),init={type:'init',moduleURL:integrity.module.url,integrity};const packets=[];
   try{return await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('OWNED_WORKER_DEADLINE')),60000);
    w.onerror=e=>{clearTimeout(timer);no(Error(e.message));};
    w.onmessage=({data})=>{if(data.probeError){clearTimeout(timer);no(Error(data.probeError));return;}const e=data.event;packets.push({type:e.type,code:e.code,error:e.error,message:e.message,runtimeIntegrity:e.runtimeIntegrity,abi:e.abi,serviceCapabilities:e.serviceCapabilities,memoryIsShared:e.memory instanceof SharedArrayBuffer,memoryBytes:e.memory?.byteLength,controlOffset:e.controlOffset,observed:data.observed});
     if(e.type==='ready'&&kind==='ok'){w.postMessage(init);return;}if(e.type==='failed'){clearTimeout(timer);yes(packets);}};
    w.postMessage({workerURL,init});
   });}finally{w.terminate();}
  },{origin,workerURL:prefix+'/'+worker,integrity,kind});
  const last=result.at(-1);assert.ok(last);
  if(kind==='ok'){
   assert.equal(result.length,2);const ready=result[0];assert.equal(ready.type,'ready');assert.equal(ready.abi,2);assert.equal(ready.memoryIsShared,true);assert.equal(ready.controlOffset%4,0);assert.ok(ready.controlOffset>=0&&ready.controlOffset+16<=ready.memoryBytes);
   assert.deepEqual(ready.runtimeIntegrity,{...integrity,wasmLoading:'verified-owned-wasmBinary',moduleLoading:'immutable-host-content-addressed-import'});
   assert.equal(ready.observed.instantiate,1);assert.equal(ready.observed.streaming,0);assert.equal(ready.observed.constructors,0);assert.equal(ready.observed.binarySHA256,integrity.wasm.sha256);
   assert.equal(ready.observed.fetches.filter(u=>u===integrity.wasm.url).length,1);
   assert.equal(last.code??last.error??last.message,'DUPLICATE_INIT');assert.equal(last.observed.instantiate,1);
  }else{assert.equal(last.code??last.error??last.message,'RUNTIME_HASH');assert.equal(last.observed.instantiate,0);assert.equal(last.observed.streaming,0);assert.equal(result.some(r=>r.type==='ready'),false);}
  outcomes.push({kind,packets:result});
 }
 const result={version:'arch-compiled-worker-owned-evidence/1',status:'passed',engine,playwright:'1.63.0',browser:{revision:browserPin.revision,version:browserPin.browserVersion},preparedSHA256:sha,engineBuildReceiptSHA256:pins.engineBuild.receipt.sha256,
  originalWrapperSHA256:pins.engine.sourceWrapperSHA256,derivedWrapperSHA256:pins.engine.moduleSHA256,wasmSHA256:pins.engine.wasmSHA256,probeSHA256:hash(probe),outcomes,requests,coverage:'compiled Worker initialization and duplicate/tampered-byte refusal; no product geometry/UI workflow',applicationComplete:false,independentReview:false};
 put(resolve(environment().run,'evidence',label+'-'+engine+'-owned.json'),jsonBytes(JSON.parse(JSON.stringify(result))));
});
