import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {stageEnvironment} from './environment.mjs';
import {typecheck} from './typecheck.mjs';
let env;
try{env=stageEnvironment();}catch(error){console.error('Raster staging unavailable: '+error.message);process.exit(2);}
const {root:repo,run,stage:work,evidence,label,manifest}=env;
const require=createRequire(import.meta.url),moduleDir=path.join(work,'runtime');
const result={kind:'implementation integration tests; not independent review',label,staging:'staging.json',module:manifest.rootModule,engines:[]};
const {exercise}=await import(pathToFileURL(path.join(work,'tests/raster-app/suite.mjs')));
const {default:factory}=await import(pathToFileURL(path.join(moduleDir,'arch-kernel.mjs')));
try {
 result.types=typecheck(env);
 const m=await factory({print:()=>{},printErr:()=>{}});
 const node=await exercise(m,{readFixture:async n=>new Uint8Array(fs.readFileSync(path.join(work,'tests/raster-app/fixtures',n)))});
 result.engines.push({engine:'node',version:process.version,...node,moduleInstances:1});
 console.log('Node: PASS '+node.checks+' groups');
}catch(e){result.engines.push({engine:'node',pass:false,error:e.stack});console.log('Node: FAIL '+e.stack);}
const route=(url)=>{
 const p=decodeURIComponent(new URL(url,'http://localhost').pathname);
 if(p==='/')return {mime:'text/html',bytes:Buffer.from('<!doctype html><meta charset="utf-8"><title>Raster binding implementation tests</title>')};
 let base,rel;if(p.startsWith('/staged/runtime/')){base=moduleDir;rel=p.slice('/staged/runtime/'.length);}
 else if(p.startsWith('/staged/')){base=work;rel=p.slice('/staged/'.length);}

 else return null;
 const file=path.resolve(base,rel);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return null;
 if(!fs.realpathSync(file).startsWith(fs.realpathSync(base)+path.sep))return null;
 return {bytes:fs.readFileSync(file),mime:file.endsWith('.wasm')?'application/wasm':file.endsWith('.mjs')?'text/javascript':'application/octet-stream'};
};
const server=http.createServer((req,res)=>{
 try{const item=route(req.url);res.writeHead(item?200:404,{'Content-Type':item?.mime??'text/plain','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'});res.end(item?.bytes??'not found');}
 catch{res.writeHead(400);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,{chromium,firefox,webkit}=require(path.join(repo,'.toolchain/app-runtime/node_modules/playwright'));
try {
 for(const [engine,type] of Object.entries({chromium,firefox,webkit})){
  let context;
  try {
   context=await type.launchPersistentContext(path.join(run,'temp/raster-app-'+label+'-'+engine),{headless:true,downloadsPath:path.join(run,'temp/raster-app-downloads-'+label+'-'+engine)});
   const page=await context.newPage();page.on('console',msg=>{if(msg.type()==='error')console.log(engine+' console: '+msg.text().slice(0,500));});page.on('requestfailed',req=>console.log(engine+' request failed: '+req.url()+' '+req.failure()?.errorText));await page.goto(base);
   const output=await page.evaluate(async()=>{
    const {checkWorkerRetirement}=await import('/staged/tests/raster-app/worker-retirement-client.mjs');
    return new Promise((resolve,reject)=>{
    const worker=new Worker('/staged/tests/raster-app/browser-worker.mjs',{type:'module'});
    let observed=null,poll=null;
    const timer=setTimeout(()=>{clearInterval(poll);worker.terminate();reject(Error('Worker timeout'));},60000);
    worker.onmessage=async({data})=>{
     if(data.type==='echo-packet'){
      if(data.packet?.version!=='arch-raster-packet/1'||!data.packet.buffers.every(b=>b.bytes instanceof Uint8Array&&b.bytes.buffer instanceof ArrayBuffer)){reject(Error('Bad typed packet'));worker.terminate();return;}
      worker.postMessage({type:'echo-packet',packet:data.packet},data.packet.buffers.map(b=>b.bytes.buffer));return;
     }
     if(data.type==='cancel-window'){
      const c=new Int32Array(data.memory,data.offset,4);
      poll=setInterval(()=>{const progress=Atomics.load(c,2);if(Atomics.load(c,1)===1&&progress>=1){observed=progress;Atomics.store(c,3,data.generation);clearInterval(poll);}},0);return;
     }
     if(data.type==='failed'){clearTimeout(timer);clearInterval(poll);worker.terminate();reject(Error(data.error));return;}
     if(data.type!=='complete')return;
     clearInterval(poll);
     try{const retirement=await checkWorkerRetirement(worker);clearTimeout(timer);resolve({...data.result,retirement,cancelObservedProgress:observed,crossOriginIsolated});}
     catch(error){clearTimeout(timer);worker.terminate();reject(error);}
    };
    worker.onerror=e=>{clearTimeout(timer);clearInterval(poll);worker.terminate();reject(Error(e.message));};
    worker.postMessage({type:'run'});
   });});
   const parity=JSON.stringify(output.geometry)===JSON.stringify(result.engines[0].geometry);
   const pass=output.pass&&parity&&output.retirement?.pass&&output.typedTransferRoundTrip&&output.detachedAfterTransfer&&output.moduleInstances===1&&output.cancelObservedProgress>=1&&output.crossOriginIsolated;
   result.engines.push({engine,version:context.browser().version(),...output,geometryParity:parity,pass});console.log(engine+': '+(pass?'PASS':'FAIL')+' '+output.checks+' groups + active cancellation + real Worker termination');
  }catch(e){result.engines.push({engine,pass:false,error:String(e.stack||e)});console.log(engine+': FAIL '+e.message);}
  finally{await context?.close();}
 }
}finally{await new Promise(r=>server.close(r));}
result.pass=result.engines.length===4&&result.engines.every(e=>e.pass);
result.completedUtc=new Date().toISOString();fs.writeFileSync(path.join(evidence,'integration-tests.json'),JSON.stringify(result,null,2)+'\n');
console.log('Raster binding: '+(result.pass?'PASS':'FAIL'));process.exit(result.pass?0:1);
