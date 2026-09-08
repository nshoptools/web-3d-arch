import {createKernelAdapters} from '../../src/integration/kernel-adapters.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createEngineTextRenderer} from '../../src/core/engine-text-renderer.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
export async function run({catalog,assetURLs,runtime}){
 let live,n=0;const context=()=>live,control=()=>({version:'arch-app-adapters/1',ticket:{id:'asfr-'+ ++n,userId:live.userId,projectId:live.projectId,revision:live.state.revision,generation:n},signal:new AbortController().signal,onProgress:()=>{}});
 const kernel=createKernelAdapters({moduleURL:'/runtime/arch-kernel.mjs',workerURL:'/src/core/engine-worker.mjs',selectRecipe:()=>{throw Error('NO_FALLBACK');},textConfig:{catalog,assetURLs,origin:location.origin,runtime},createTextRenderer:createEngineTextRenderer({catalog})});
 const sources=createApplicationSources({kernel,catalog,assetURLs,origin:location.origin,context});
 const bridge=createProductSourceContexts({kernel,sources,context}),product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context,withPreparedSource:bridge.withPreparedSource});
 const rows=[];
 try{
  for(const p of ['keychain','clicky','strap','lego','charm'])for(const s of ['noi','chim','phang','phang2']){
   const id='update-svg-'+p+'-'+s,saved=await (await fetch('/heads/'+id+'.json')).json(),assets=new Map();
   for(const h of saved.assetHashes)assets.set(h,new Uint8Array(await(await fetch('/head-assets/'+h)).arrayBuffer()));
   live={state:saved.state,userId:'source-bridge-user',projectId:'source-bridge-project',sessionKey:'asfr-worker:1',assetsMap:assets};
   const client=await kernel.ensureRuntime(control());if(client.serviceCapabilities.sourceFrameVersion!==1)throw Error('CHECKED_ASFR_GETTER');
   const model=await product.engine.build({...control(),state:live.state,assets});
   try{
    const bytes=new Uint8Array(model.bytes()),semantics=model.product.semantics;
    for(const [kind,body]of [['arch',bytes],['json',JSON.stringify({semantics,state:live.state,sourceFrameVersion:1})]]){
     const r=await fetch('/capture/'+runtime.engine+'/'+id+'.'+kind,{method:'POST',body});if(!r.ok)throw Error('CAPTURE_ORACLE');
    }
    const regions=await bridge.withValidatedRegions({control:control(),state:live.state,assets,includeOverlay:true},r=>{
     const overlay=r.contexts.find(c=>c.key==='text:primary');if(!overlay?.metadata.sourceFrame)throw Error('FRAME_METADATA');
     return {sourceHash:overlay.sourceHash,geometry:overlay.regions.map(r=>r.geometryHash),sourceFrame:overlay.metadata.sourceFrame};
    });
    rows.push({id,head:model.product.head,regions});
   }finally{model.release();}
  }
  return {status:'pass',crossOriginIsolated,rows};
 }finally{bridge.reset();await product.reset();await sources.reset();await kernel.reset();}
}

