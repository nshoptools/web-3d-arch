import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
import {canonicalJSON,sha256} from '../../src/storage/common.mjs';
const must=(v,m)=>{if(!v)throw Error(m);};let serial=20000;
/** Deliberate consent driver for fixture tests, never a production auto-accept path. */
export async function runUpdateCase({kernel,sources,driver,id,capture}){
 const base=driver.get(),state=structuredClone(base.state),before=canonicalJSON(state);
 const ctl=()=>({version:'arch-app-adapters/1',ticket:{id:'update-case-'+ ++serial,userId:base.userId,projectId:base.projectId,revision:state.revision,generation:serial},signal:new AbortController().signal,onProgress:()=>{}});
 const bridge=createProductSourceContexts({frameTransport:'product-context-bundle/2',kernel,sources,context:driver.get,probeDatums:c=>product.probeDatums(c)});
 const product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context:driver.get,
  withPreparedSource:bridge.withPreparedSource,withPreparedDatumSource:bridge.withPreparedDatumSource,
  probeNative:(client,r,c)=>client.probeProduct(r,c)});
 let plan,model;
 try{
  const text={text:'I',placement:'on-model',xMm:'-1',yMm:'-1',sizeMm:'4',sizeDisplay:'4',baseEnabled:true,baseRadiusMm:'0',baseThicknessLayers:'2',heightLayers:'3'};
  let c=ctl();plan=await bridge.prepareUpdate({...c,state,assets:base.assetsMap,text});
  let alignment=null;
  if(plan.status==='blocked'&&plan.planeChoices.length){
   alignment=plan.planeChoices.find(v=>v.strategy==='ceil'&&v.domainValid);
   must(alignment,'NO_VALID_EXPLICIT_PLANE_CHOICE '+JSON.stringify(plan));plan.release();
   c=ctl();plan=await bridge.prepareUpdate({...c,state,assets:base.assetsMap,text,parameterChanges:alignment.parameterChanges});
  }
  must(plan.status==='proposal','UPDATE_PROBE_BLOCKED '+JSON.stringify(plan));
  must(canonicalJSON(driver.get().state)===before,'UPDATE_CHANGED_HEAD_BEFORE_CONSENT');
  const delta=await plan.confirm(c),assets=new Map(base.assetsMap);
  for(const a of delta.assets){must(await sha256(a.bytes)===a.sha256,'UPDATE_ASSET_HASH');assets.set(a.sha256,a.bytes);}
  driver.set({...base,state:delta.state,assetsMap:assets});
  const next=ctl();next.ticket.revision=delta.state.revision;
  model=await product.engine.build({...next,state:delta.state,assets});
  const metadata=model.product.semantics;
  must(metadata.mechanicsSemantics===3&&metadata.sourceSemantics===2,'STRICT_SEMANTICS');
  must(metadata.sourceIntervals.some(i=>i.datum===133&&i.referenceLayer>0),'ACTUAL_FACE_REFERENCE');
  const row={id,kind:'prospective-on-model-text',product:state.product,style:state.overrides?.artMode??null,faces:plan.faces,alignment,geometryVerified:false};
  await capture(id,{row,bytes:new Uint8Array(model.bytes()),semantics:metadata,bindings:delta.productBindings,state:delta.state,assets});
  return row;
 }finally{model?.release();plan?.release();bridge.reset();await product.reset();driver.set(base);}
}
