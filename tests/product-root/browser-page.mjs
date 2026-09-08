import {createKernelAdapters} from '../../src/integration/kernel-adapters.mjs';
import {createEngineTextRenderer} from '../../src/core/engine-text-renderer.mjs';
import {runControllerCases} from './controller-cases.mjs';
import {createEditor} from '../../src/editing/index.mjs';
// Editing here uses actual production editor in-process; the geometry client
// uses the real production Worker. No separate geometry/WASM Module is created.
const createEditingClient=()=>{let editor;return {async initialize(input){editor=await createEditor(input);return editor.token();},prepare:(c,control)=>editor.prepare(c,control),commit:(id,token)=>editor.commit(id,token),dispose(){editor=null;}};};
export async function run({catalog,assetURLs,runtime,integrity,moduleURL,group}){
 const kernel=createKernelAdapters({moduleURL,engineIntegrity:integrity,workerURL:'/tests/product-root/audited-worker.mjs?engine='+runtime.engine,
  selectRecipe:()=>{throw Error('BARE_EXTRUDE_FORBIDDEN');},textConfig:{catalog,assetURLs,origin:location.origin,runtime},createTextRenderer:createEngineTextRenderer({catalog})});
 const assetsSent=new Set();
 const post=async(id,kind,body)=>{const r=await fetch('/capture/'+runtime.engine+'/'+id+'.'+kind,{method:'POST',body});if(!r.ok)throw Error('CAPTURE_'+r.status);};
 try{
  const result=await runControllerCases({kernel,catalog,assetURLs,origin:location.origin,createEditingClient,
   ...group,beforeDispose:async control=>{const client=await kernel.ensureRuntime(control);const port=new MessageChannel();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('AUDIT_FLUSH_TIMEOUT')),10000);port.port1.onmessage=e=>{clearTimeout(timeout);e.data==='ok'?resolve():reject(Error('AUDIT_FLUSH_FAILED'));};client.worker.postMessage({type:'test-owned-audit-flush'},[port.port2]);}).finally(()=>port.port1.close());},recordCase:async row=>{await fetch('/case-time/'+runtime.engine,{method:'POST',body:JSON.stringify({...row,group:group.id})});},capture:async(id,r)=>{
    for(const[h,b]of r.assets)if(!assetsSent.has(h)){await post(h,'asset',b);assetsSent.add(h);}
    await post(id,'arch',r.bytes);await post(id,'json',JSON.stringify({...r,bytes:undefined,assets:undefined,assetHashes:[...r.assets.keys()]}));
   }});

  return {...result,crossOriginIsolated,integrity};
 }finally{await kernel.reset();}
}
