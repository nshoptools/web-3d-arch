import {createKernelAdapters} from '../../src/integration/kernel-adapters.mjs';
import {createEngineTextRenderer} from '../../src/core/engine-text-renderer.mjs';
import {runControllerCases} from '../product-root/controller-cases.mjs';
import {createEditor} from '../../src/editing/index.mjs';
// Editing here uses actual production editor in-process; the geometry client
// uses the real production Worker. No separate geometry/WASM Module is created.
const createEditingClient=()=>{let editor;return {async initialize(input){editor=await createEditor(input);return editor.token();},prepare:(c,control)=>editor.prepare(c,control),commit:(id,token)=>editor.commit(id,token),dispose(){editor=null;}};};
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
export async function run({catalog,assetURLs,runtime,integrity,moduleURL,group}){
 const rootKernel=createKernelAdapters({moduleURL,engineIntegrity:integrity,workerURL:'/tests/product-root/audited-worker.mjs?engine='+runtime.engine,
  selectRecipe:()=>{throw Error('BARE_EXTRUDE_FORBIDDEN');},textConfig:{catalog,assetURLs,origin:location.origin,runtime},createTextRenderer:createEngineTextRenderer({catalog})});
 const paintAudit=[],observed=new WeakSet();let captured=null;
 const kernel={...rootKernel,operation:(control,invoke)=>rootKernel.operation(control,(client,generation)=>{
  if(!observed.has(client)){
   observed.add(client);const actual=client.textOperation.bind(client);
   client.textOperation=async(...args)=>{
    const result=await actual(...args),p=result.prepared;
    if(p?.source?.paint&&['emoji.select','source.convert','prepare.source'].includes(args[0].op)){
     const paint=p.source.paint,serialized=canonicalJSON(paint);
     if(serialized.length>262144)throw Error('TEST_PAINT_AUDIT_BUDGET');
     const gradients=paint.operations.filter(op=>/gradient/i.test(op.op??'')).length;
     paintAudit.push({op:args[0].op,hash:await sha256(serialized),operations:paint.operations.length,gradients,paint,
      sourceRecords:p.sourceAssets.map(a=>a.record),selection:p.selection});
    }
    return result;
   };
  }
  return invoke(client,generation);
 })};
 const assetsSent=new Set();
 const post=async(id,kind,body)=>{const r=await fetch('/capture/'+runtime.engine+'/'+id+'.'+kind,{method:'POST',body});if(!r.ok)throw Error('CAPTURE_'+r.status);};
 try{
  const result=await runControllerCases({kernel,catalog,assetURLs,origin:location.origin,createEditingClient,
   ...group,beforeDispose:async control=>{
    if(!captured)throw Error('MISSING_CURRENT_COLOR_CAPTURE');
    const reply=await kernel.operation(control,(client,generation)=>client.textOperation({version:'arch-app-adapters/1',ticket:control.ticket,op:'prepare.source',state:captured.state,assetsMap:captured.assets},{generation}));
    if(reply.prepared?.kind!=='color-source'||paintAudit.length!==3)throw Error('COLOR_SOURCE_RECONSTRUCTION_REQUIRED');
    const client=await kernel.ensureRuntime(control);const port=new MessageChannel();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('AUDIT_FLUSH_TIMEOUT')),10000);port.port1.onmessage=e=>{clearTimeout(timeout);e.data==='ok'?resolve():reject(Error('AUDIT_FLUSH_FAILED'));};client.worker.postMessage({type:'test-owned-audit-flush'},[port.port2]);}).finally(()=>port.port1.close());},recordCase:async row=>{await fetch('/case-time/'+runtime.engine,{method:'POST',body:JSON.stringify({...row,group:group.id})});},capture:async(id,r)=>{
    captured=r;
    for(const[h,b]of r.assets)if(!assetsSent.has(h)){await post(h,'asset',b);assetsSent.add(h);}
    await post(id,'arch',r.bytes);await post(id,'json',JSON.stringify({...r,bytes:undefined,assets:undefined,assetHashes:[...r.assets.keys()]}));
   }});

  return {...result,crossOriginIsolated,integrity,paintAudit};
 }finally{await kernel.reset();}
}
