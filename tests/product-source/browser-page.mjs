import {createKernelAdapters} from '../../src/integration/kernel-adapters.mjs';
import {createApplicationSources} from '../../src/integration/source-compositor.mjs';
import {createEngineTextRenderer} from '../../src/core/engine-text-renderer.mjs';
import {runBridgeCases} from './bridge-cases.mjs';
import {colorConsentCase} from './color-cases.mjs';
export async function run({catalog,assetURLs,runtime,matrix=true,color=false,families=['svg','raster']}){
 let live;const driver={get:()=>live,set:v=>{live=v;}};
 const kernel=createKernelAdapters({moduleURL:'/runtime/arch-kernel.mjs',workerURL:'/src/core/engine-worker.mjs',
  selectRecipe:()=>{throw Error('NO_BARE_EXTRUDE');},textConfig:{catalog,assetURLs,origin:location.origin,runtime},createTextRenderer:createEngineTextRenderer({catalog})});
 const sources=createApplicationSources({kernel,catalog,assetURLs,origin:location.origin,context:driver.get});
 const sentAssets=new Set();
 const post=async(id,kind,body)=>{const r=await fetch('/capture/'+runtime.engine+'/'+id+'.'+kind,{method:'POST',body});if(!r.ok)throw Error('CAPTURE_FAILED');};
 try{
  const result=await (color?colorConsentCase:runBridgeCases)({kernel,sources,driver,matrix,families,capture:async(id,{bytes,semantics,bindings,row,failure,state,assets})=>{
   for(const [h,b]of assets??[]){if(!sentAssets.has(h)){await post(h,'asset',b);sentAssets.add(h);}}
   if(failure){await post(id,'failure',JSON.stringify({failure,state,assetHashes:[...(assets?.keys()??[])]}));return;}
   await post(id,'arch',bytes);await post(id,'json',JSON.stringify({row,semantics,bindings,state,assetHashes:[...(assets?.keys()??[])]}));
  }});
  const client=await kernel.ensureRuntime({version:'arch-app-adapters/1',ticket:{id:'end',userId:live.userId,projectId:live.projectId,revision:live.state.revision,generation:99999},signal:new AbortController().signal,onProgress:()=>{}});
  return {...result,geometryVersions:client.serviceCapabilities.geometryVersions,crossOriginIsolated,workerEpoch:client.epoch};
 }finally{await sources.reset();await kernel.reset();}
}
