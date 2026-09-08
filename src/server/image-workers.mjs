import {Worker} from 'node:worker_threads';
import {fail,Fault} from './core.mjs';
let active=0;
export async function checkImage(bytes,mediaType,limits,{signal,timeoutMs=5000}={}){
 fail(active<2,429,'IMAGE_CODEC_BUSY');fail(!signal?.aborted,409,'IMAGE_CANCELLED');
 fail(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=10_000,500,'IMAGE_DEADLINE_INVALID');
 active++;
 try{return await new Promise((resolve,reject)=>{
  let finished=false;
  const worker=new Worker(new URL('./image-codec-worker.mjs',import.meta.url),{execArgv:[],workerData:{bytes,mediaType,limits},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
  const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate().then(()=>error?reject(error):resolve(value),()=>reject(new Fault(422,'IMAGE_INVALID')));};
  const abort=()=>finish(new Fault(409,'IMAGE_CANCELLED'));
  const timer=setTimeout(()=>finish(new Fault(422,'IMAGE_DECODE_TIMEOUT')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  worker.on('message',m=>{if(m.error)finish(new Fault(422,m.error));else{m.value.thumbnail.bytes=Buffer.from(m.value.thumbnail.bytes);finish(null,m.value);}});
  worker.on('error',()=>finish(new Fault(422,'IMAGE_DECODE_LIMIT')));
  worker.on('exit',()=>{if(!finished)finish(new Fault(422,'IMAGE_INVALID'));});
  if(signal?.aborted)abort();
 });}finally{active--;}
}
