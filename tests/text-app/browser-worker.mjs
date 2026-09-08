import makeModule from '/engine/arch-kernel.mjs';
import {createTextOperations,probeWorkerColorCapabilities} from '../../src/core/text-operations.mjs';
import {parentPreview} from './kernel-preview.mjs';
import {coreChecks} from './core-checks.mjs';
let Module,service,active,serial=0,options;
const send=(id,type,body={})=>postMessage({id,type,...body});
onmessage=async({data})=>{
  const {id,type}=data;
  if(type==='cancel'){if(active?.id===id)active.abort.abort();return;}
  try{
    if(type==='init'){
      if(Module)throw Error('No second module');
      Module=await makeModule({print(){},printErr(){}});serial++;
      options={Module,catalog:data.fixture.catalog,assetURLs:data.assetURLs,origin:data.origin,runtime:data.runtime,fetchImpl:(...args)=>fetch(...args),previewPaths:parentPreview(Module).callback};
      service=createTextOperations(options);send(id,'result',{result:{capabilities:probeWorkerColorCapabilities(),moduleFactories:serial}});return;
    }
    if(type==='core-checks'){const checks=await coreChecks({options,fixture:data.fixture,readFixture:async digest=>new Uint8Array(await(await fetch('/library/'+digest)).arrayBuffer())});send(id,'result',{result:checks});return;}
    if(type==='reset'){service.reset({rendererPort:data.rendererPort});send(id,'result',{result:{reset:true}});return;}
    if(type==='dispose'){service.dispose();send(id,'result',{result:{disposed:true,moduleFactories:serial}});return;}
    if(type!=='run'||active)throw Object.assign(Error('Worker busy or unknown operation'),{code:'TEXT_OPERATIONS_BUSY'});
    const abort=new AbortController(),job={id,abort,ticket:data.request.ticket};active=job;
    try{
      const result=await service.run(data.request,{signal:abort.signal,isCurrent:t=>active===job&&JSON.stringify(t)===JSON.stringify(job.ticket),
        onProgress:p=>send(id,'progress',{progress:p})});
      send(id,'result',{result});
    }finally{active=null;}
  }catch(e){send(id,'error',{error:{code:e.code??'TEXT_WORKER_ERROR',message:e.message,stack:e.stack}});}
};
