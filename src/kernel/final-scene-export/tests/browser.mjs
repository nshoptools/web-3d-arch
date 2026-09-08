import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createServer} from 'node:http';import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';import cases from './cases.mjs';import {oracle,oracleSources} from './oracles.mjs';
const run=process.env.PROJECT_REVIEW_RUN;if(!run)throw Error('run environment required');
const here=fileURLToPath(new URL('./',import.meta.url)),modulePath=process.env.ARCH_FINAL_WASM??path.join(run,'work/module/arch-kernel.mjs');const out=path.join(run,'evidence/final-export-browser');await fs.mkdir(out,{recursive:true});
const files=new Map([['/engine/arch-kernel.mjs',modulePath],['/engine/arch-kernel.wasm',modulePath.replace(/\.mjs$/,'.wasm')],...['browser-worker.mjs','module-api.mjs','options.mjs'].map(f=>['/tests/'+f,path.join(here,f)])]);
const server=createServer(async(req,res)=>{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Final scene export Worker probe</title>');return}
 const f=files.get(req.url);if(!f){res.writeHead(404);res.end();return}try{res.setHeader('Content-Type',f.endsWith('.wasm')?'application/wasm':'text/javascript;charset=utf-8');res.end(await fs.readFile(f));}catch(e){res.writeHead(500);res.end(e.message)}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const results=[];
try{for(const [name,engine]of Object.entries({chromium,firefox,webkit})){
 const profile=path.join(run,'cache','browser-profiles',name);await fs.mkdir(profile,{recursive:true});
 const context=await engine.launchPersistentContext(profile,{headless:true,acceptDownloads:false});const page=await context.newPage();const log=[];page.on('console',m=>log.push(m.text()));page.on('pageerror',e=>log.push(e.stack));
 try{
  await page.goto(origin);const ready=await page.evaluate(async()=>{window.worker=new Worker('/tests/browser-worker.mjs',{type:'module'});window.messages=[];window.waiters=[];
   worker.onmessage=e=>{const i=waiters.findIndex(w=>w.kind===e.data.kind||e.data.kind==='error');if(i>=0){const w=waiters.splice(i,1)[0];if(e.data.kind==='error')w.reject(Error(e.data.error));else w.resolve(e.data)}else messages.push(e.data)};
   window.waitFor=kind=>new Promise((resolve,reject)=>{const i=messages.findIndex(m=>m.kind===kind||m.kind==='error');if(i>=0){const m=messages.splice(i,1)[0];if(m.kind==='error')reject(Error(m.error));else resolve(m)}else waiters.push({kind,resolve,reject});});
   worker.postMessage({kind:'init'});const r=await waitFor('ready');window.controlMemory=r.memory;window.controlOffset=r.control;return {abi:r.abi,exportABI:r.exportABI,isolated:r.isolated,shared:r.memory instanceof SharedArrayBuffer};});
  assert.deepEqual(ready,{abi:2,exportABI:1,isolated:true,shared:true});const records=[];
  // All normal formats/poses + representative negative gates run through this
  // one Module in the same Dedicated Worker, not independent WASM instances.
  const selected=cases.filter(c=>!c.id.startsWith('fuzz-'));
  for(const test of selected){const raw=await page.evaluate(async test=>{worker.postMessage({kind:'case',test});const r=await waitFor('case');return {result:r.result,bytes:r.bytes?Array.from(r.bytes):null};},test);
   const bytes=raw.bytes?Buffer.from(raw.bytes):undefined;const metrics=oracle(test,raw.result,bytes);records.push({id:test.id,pass:true,metrics});
   const stem=path.join(out,`${name}-${test.id}`);await fs.writeFile(stem+'.json',JSON.stringify(raw.result,null,2));if(bytes)await fs.writeFile(stem+'.bin',bytes);
  }
  const lifetime=await page.evaluate(async()=>{worker.postMessage({kind:'ownership'});return (await waitFor('ownership')).result});assert.equal(lifetime.passed,25);
  const cancellation=await page.evaluate(async()=>{
   worker.postMessage({kind:'cancel'});const ready=await waitFor('cancel-ready');const control=new Uint32Array(ready.memory,ready.control,4);let seen=0,cancelledAt=null;let frames=0,active=true;
   const frame=()=>{frames++;if(active)requestAnimationFrame(frame)};requestAnimationFrame(frame);
   const observer=setInterval(()=>{const generation=Atomics.load(control,0),phase=Atomics.load(control,1),progress=Atomics.load(control,2);if(generation===ready.generation&&phase===1){seen=Math.max(seen,progress);if(progress>=30&&cancelledAt===null){cancelledAt=progress;Atomics.store(control,3,generation);}}},0);
   try{const done=await waitFor('cancel-result');return {...done.result,observedProgress:seen,cancelledAt,frames};}finally{clearInterval(observer);active=false;}
  });
  assert.equal(cancellation.id,0);assert.equal(cancellation.error,'CANCELLED');assert.equal(cancellation.phase,4);assert.equal(cancellation.sourceUnchanged,true);assert.ok(cancellation.cancelledAt>=30);assert.deepEqual(cancellation.stats,[0,0,0,0,0]);
  const result={engine:name,version:context.browser()?.version()??'persistent-context',ready,cases:records.length,passed:records.length,records,ownership:lifetime,cancellation};results.push(result);
  await fs.writeFile(path.join(out,`${name}-summary.json`),JSON.stringify(result,null,2));console.log(JSON.stringify({engine:name,cases:records.length,ownership:lifetime.passed,cancelledAt:cancellation.cancelledAt}));
 }catch(error){await page.screenshot({path:path.join(out,`${name}-failure.png`)}).catch(()=>{});results.push({engine:name,error:error.stack});console.log(error.stack)}
 finally{await fs.writeFile(path.join(out,`${name}-console.log`),log.join('\n'));await context.close();}
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
await fs.writeFile(path.join(run,'evidence/final-export-browser-results.json'),JSON.stringify({oracleSources,results,passed:results.filter(r=>!r.error).length},null,2));if(results.some(r=>r.error))process.exitCode=1;
