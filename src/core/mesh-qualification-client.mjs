import {MESH_QUALIFIER_VERSION,DEFAULT_MESH_LIMITS} from './mesh-qualification.mjs';
const error=code=>Object.assign(new Error(code),{code});
/** One disposable, non-native Worker per validation; cancellation terminates it.
 * No source URLs, Module imports, kernel handles or user identity enter this Worker. */
export function createMeshQualificationClient({workerURL=new URL(/* @vite-ignore */ './mesh-qualification-worker.mjs',import.meta.url),WorkerClass=globalThis.Worker,timeoutMs=120000}={}){
 if(typeof WorkerClass!=='function')throw error('MESH_WORKER_UNAVAILABLE');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>120000)throw error('MESH_WATCHDOG_CONFIG');
 const resolved=new URL(workerURL,import.meta.url);
 if(globalThis.location&&resolved.origin!==location.origin)throw error('MESH_WORKER_ORIGIN');
 const pending=new Set();let serial=0,epoch=0;
 return Object.freeze({
 async check(bytes,{format='ARCH/1',limits={},signal}={}){
  if(signal?.aborted)throw error('CANCELLED');
  if(!(bytes instanceof Uint8Array)||bytes.length>DEFAULT_MESH_LIMITS.bytes)throw error('MESH_BYTE_BUDGET');
  const id=epoch+':'+(++serial),worker=new WorkerClass(resolved,{type:'module',name:'arch-mesh-qualification'});
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(e,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);pending.delete(record);worker.onmessage=null;worker.onerror=null;worker.terminate();e?reject(e):resolve(result);};
   const cancel=()=>finish(error('CANCELLED')),record={cancel:()=>finish(error('PRIVATE_RESET'))};
   const timer=setTimeout(()=>finish(error('MESH_WATCHDOG')),timeoutMs);pending.add(record);
   signal?.addEventListener('abort',cancel,{once:true});
   worker.onerror=()=>finish(error('MESH_WORKER_FAILED'));
   worker.onmessage=({data})=>{if(data?.version!==MESH_QUALIFIER_VERSION||data.id!==id||data.result?.version!==MESH_QUALIFIER_VERSION)return finish(error('MESH_WORKER_PROTOCOL'));finish(null,data.result);};
   try{const copy=bytes.slice();worker.postMessage({version:MESH_QUALIFIER_VERSION,id,format,limits,bytes:copy},[copy.buffer]);}catch{finish(error('MESH_WORKER_TRANSPORT'));}
  });
 },
 async reset(){epoch++;for(const p of [...pending])p.cancel();},
 });
}