import {assert,error,uuid,sameOrigin} from './common.mjs';
const EDIT_VERSION='arch-raster-edit/1';
/** RPC transport only. The existing editing Worker owns every pixel operation. */
export function createEditingClient({workerURL=new URL(/* @vite-ignore */ '../editing/worker.mjs',import.meta.url),workerFactory,urlOrigin=globalThis.location?.origin,timeoutMs=120000}={}){
 const url=sameOrigin(urlOrigin??new URL(workerURL).origin,String(workerURL));
 assert(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000,'EDIT_WORKER_TIMEOUT');
 const worker=workerFactory?workerFactory(url):new Worker(url,{type:'module',name:'arch-raster-edit'});
 assert(worker&&typeof worker.postMessage==='function'&&typeof worker.terminate==='function','EDIT_WORKER_REQUIRED');
 let closed=false;const pending=new Map();
 function close(reason=error('EDIT_WORKER_CLOSED')){
  if(closed)return;closed=true;worker.removeEventListener('message',message);worker.removeEventListener('error',fault);worker.removeEventListener('messageerror',fault);worker.terminate();
  for(const p of pending.values()){p.clean();p.reject(reason);}pending.clear();
 }
 function fault(){close(error('EDIT_WORKER_FAILED'));}
 function message(event){
  const r=event.data,p=pending.get(r?.requestId);if(!p)return;
  if(r.type==='progress'){try{p.onProgress?.(r.progress);}catch(e){close(e);}return;}
  if(!['result','error'].includes(r.type)){close(error('EDIT_RPC_RESPONSE'));return;}
  pending.delete(r.requestId);p.clean();
  if(r.type==='error')p.reject(error(typeof r.error?.code==='string'?r.error.code:'EDIT_WORKER_FAILED'));
  else p.resolve(r.result);
 }
 worker.addEventListener('message',message);worker.addEventListener('error',fault);worker.addEventListener('messageerror',fault);
 function request(payload,{signal,onProgress}={},transfer=[]){
  if(closed)return Promise.reject(error('EDIT_WORKER_CLOSED'));
  if(signal?.aborted){close(error('CANCELLED'));return Promise.reject(error('CANCELLED'));}
  return new Promise((resolve,reject)=>{
   const requestId=uuid(),abort=()=>close(error('CANCELLED')),timer=setTimeout(()=>close(error('EDIT_WORKER_TIMEOUT')),timeoutMs);
   const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
   pending.set(requestId,{resolve,reject,clean,onProgress});signal?.addEventListener('abort',abort,{once:true});
   try{worker.postMessage({...payload,requestId},transfer);}catch(e){close(e);}
  });
 }
 return {
  version:EDIT_VERSION,
  async initialize(input,control){
   const data=new Uint8Array(input.image.data),result=await request({type:'init',input:{...input,image:{...input.image,data}}},control,[data.buffer]);
   assert(result?.version===EDIT_VERSION&&result.token,'EDIT_RPC_VERSION');return result.token;
  },
  prepare(command,control){return request({type:'prepare',command},control);},
  commit(id,expected,control){return request({type:'commit',gestureId:id,expected},control);},
  cancel(id){return request({type:'cancel',gestureId:id});},
  dispose:close
 };
}
