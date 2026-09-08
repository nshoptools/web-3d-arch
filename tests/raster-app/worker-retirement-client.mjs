import {createRasterTransport} from '../../src/core/raster-operations.mjs';
import {createRasterAdapters} from '../../src/integration/raster-adapters.mjs';
import {validatePacket} from '../../src/core/raster-schema.mjs';
const assert=(ok,label)=>{if(!ok)throw Error(label);};
export async function checkWorkerRetirement(worker){
 let id=0,calls=0,alive=true,hold=false,heldResolve;
 const waiters=new Map(),held=new Promise(resolve=>{heldResolve=resolve;});
 const listener=({data})=>{
  if(data?.type==='raster-rpc-held'){heldResolve();return;}
  if(data?.type!=='raster-rpc-result')return;
  const w=waiters.get(data.id);if(!w)return;waiters.delete(data.id);
  if(data.error)w.reject(Object.assign(Error(data.error.message),{code:data.error.code}));else w.resolve(data.result);
 };
 worker.addEventListener('message',listener);
 const runtime=createRasterTransport({call:(method,request,control)=>{
  calls++;assert(alive,'RPC attempted after identity invalidation');
  assert(control===undefined,'test uses raw root scheduler, no AppTicket');
  return new Promise((resolve,reject)=>{const key=++id;waiters.set(key,{resolve,reject});worker.postMessage({type:'raster-rpc',id:key,method,request,hold:hold&&method==='copy'});});
 }});
 const extension=createRasterAdapters({runtime});
 try{
  const p=await runtime.prepareRGBA({data:new Uint8ClampedArray([255,0,0,255,0,0,255,255]),width:2,height:1});
  const accepted=await runtime.confirm(p,p.summary.proposalHash),packet=await accepted.copy();
  assert(validatePacket(packet).summary.accepted&&packet.buffers.every(x=>x.bytes.buffer instanceof ArrayBuffer),'real typed Worker path');
  hold=true;const copy=accepted.copy();
  const rejected=copy.then(()=>{throw Error('retired copy published');},error=>{assert(error.code==='RASTER_LEASE_RETIRED','pending copy stale');});
  await held;const before=calls;
  // Parent contract: EngineClient termination/identity invalidation comes FIRST.
  worker.terminate();alive=false;
  for(const w of waiters.values())w.reject(Object.assign(Error('Terminated'),{code:'WORKER_TERMINATED'}));waiters.clear();
  runtime.retire();
  await extension.reset({runtimeRetired:true});await extension.source.reset();await runtime.reset();await rejected;
  await p.release();await accepted.release();
  let code=null;try{await runtime.prepareRGBA({data:new Uint8ClampedArray(4),width:1,height:1});}catch(error){code=error.code;}
  assert(code==='RASTER_RUNTIME_RETIRED'&&calls===before,'retired facade never restarts Worker');
  return {pass:true,workerTerminated:true,pendingCallRejected:true,cleanupWithoutTicket:true,callsAfterTermination:calls-before,terminalFacade:true,existingModuleOnly:true};
 }finally{worker.removeEventListener('message',listener);worker.terminate();}
}
