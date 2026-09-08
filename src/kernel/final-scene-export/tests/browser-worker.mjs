import {api,runCase,ownership} from './module-api.mjs';
import {configuration} from './options.mjs';
let A;
onmessage=async({data})=>{
 try{
  if(data.kind==='init'){const create=(await import('/engine/arch-kernel.mjs')).default;const M=await create();A=api(M);postMessage({kind:'ready',memory:M.HEAPU8.buffer,control:M._arch_control_ptr(),abi:M._arch_abi_version(),exportABI:M._arch_final_export_version(),isolated:crossOriginIsolated});}
  else if(data.kind==='case'){const output=runCase(A,data.test);postMessage({kind:'case',id:data.test.id,...output},output.bytes?[output.bytes.buffer]:[]);}
  else if(data.kind==='ownership'){postMessage({kind:'ownership',result:ownership(A)});}
  else if(data.kind==='cancel'){
   const source=A.source(200);const saved=A.snapshot(source.id);const c=configuration(200,{generation:source.g});
   postMessage({kind:'cancel-ready',generation:source.g+1,memory:A.M.HEAPU8.buffer,control:A.M._arch_control_ptr()});
   // A real Worker event boundary allows the main thread to install its atomic
   // observer before synchronous native CSG starts. No host geometry callbacks.
   setTimeout(()=>{try{const out=A.exportOne(source,c);const same=saved.every((b,i)=>A.M.HEAPU8[A.M._arch_snapshot_ptr(source.id)+i]===b);
    if(out.id)A.M._arch_final_output_release(out.id);A.M._arch_snapshot_release(source.id);
    postMessage({kind:'cancel-result',result:{...out,sourceUnchanged:same,stats:A.stats()}});
   }catch(error){postMessage({kind:'error',error:error.stack})}},40);
  }
 }catch(error){postMessage({kind:'error',error:error.stack});}
};
