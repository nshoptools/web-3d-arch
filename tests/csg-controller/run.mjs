import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {stage,put,json,hash} from './stage.mjs';
import {runtime} from './runtime.mjs';
import {DEADLINES,deadline} from './driver.mjs';
const [inputPath,label,mode='run']=process.argv.slice(2);
let prepared,env;const results=[];let exitCode=2,declaredCases=0;
try{
 if(mode==='resume-stage'){
  const raw=await readFile(inputPath);prepared=JSON.parse(raw);
  assert.equal(prepared.version,'arch-csg-controller-stage/1');assert.equal(prepared.authorization,'parent-composition-ready');
 }else prepared=await stage(inputPath,label);
 console.log(JSON.stringify({prepared:{source:prepared.source,engine:prepared.engine,sourceSHA256:prepared.sourceSHA256}}));
 env=await runtime(prepared,label);
 const begin=performance.now();
 await deadline((async()=>{
  await env.page.goto(env.origin,{waitUntil:'domcontentloaded',timeout:DEADLINES.startup});
  await env.page.waitForFunction(()=>globalThis.csgAcceptance||globalThis.csgAcceptanceBootError,undefined,{timeout:DEADLINES.startup});
  const ready=await env.page.evaluate(async()=>{
   if(globalThis.csgAcceptanceBootError)throw Error(JSON.stringify(csgAcceptanceBootError));
   return {result:await csgAcceptance.initialized(),ready:csgAcceptance.readiness()};
  });
  assert.equal(ready.result.ok,true,JSON.stringify(ready));assert.equal(ready.ready.hasMeshTransactions,true);
  assert.equal(ready.ready.meshImport?.available,true);assert.equal(ready.ready.geometry?.available,true);
  assert.equal(ready.ready.crossOriginIsolated,true);assert.equal(ready.ready.secureContext,true);assert.equal(ready.ready.session,'signed-in');
 })(),DEADLINES.startup,'application-startup');
 env.phase('application-ready');await put(join(env.dir,'startup.json'),json({deadlineMs:DEADLINES.startup,actualMs:performance.now()-begin,met:true}));
 // Load only the immutable captured harness, never the mutable authoring tree.
 const {CASES}=await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)),'cases.mjs')).href);
 declaredCases=CASES.length;const selectedCases=CASES; // Stop after a failure; otherwise exercise all declared controller flows.
 for(const selected of selectedCases){
  const caseDir=join(env.dir,selected.id);await mkdir(caseDir);const begin=performance.now();
  console.log(JSON.stringify({case:selected.id,status:'started'}));
  try{
   const actual=await deadline(selected.run({...env,dir:caseDir}),DEADLINES.case,selected.id);
   const record={id:selected.id,status:'pass',durationMs:performance.now()-begin,actual};results.push(record);
   await put(join(caseDir,'result.json'),json(record));await env.capture(selected.id);
   console.log(JSON.stringify(record));
  }catch(e){
   const record={id:selected.id,status:'fail',durationMs:performance.now()-begin,error:env.redact(e.stack??e)};results.push(record);
   await put(join(caseDir,'result.json'),json(record));await env.capture(selected.id+'-FAILED').catch(()=>{});
   console.error(JSON.stringify(record));break; // no overlapping reruns after an unsettled action
  }
 }
 exitCode=results.length===CASES.length&&results.every(r=>r.status==='pass')?0:1;
}catch(e){console.error(String(e.stack??e));exitCode=1;if(env){await env.capture('STARTUP-FAILED').catch(()=>{});}}
finally{
 if(env){
  await put(join(env.dir,'summary.json'),json({version:'arch-csg-controller-results/1',exitCode,scope:'Actual composed controller/Worker/WASM integration with captured build flags and synthetic local identity; not whole release acceptance',deadlines:DEADLINES,stage:prepared,results,selectedCases:declaredCases,declaredCases,notSelected:0,notRun:Math.max(0,declaredCases-results.length),issues:env.issues}));
  await env.close();
 }
 process.exitCode=exitCode;
}

