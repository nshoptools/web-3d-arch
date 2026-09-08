import * as domain from '../../src/domain/index.mjs';
import {appContent,validateState} from '../../src/app/documents.mjs';
import {SourceOperations} from '../../src/app/sources.mjs';
import {createSourceContext,sourceReceipt} from '../../src/app/source-approval.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters} from '../../src/integration/product-adapters.mjs';
const must=(v,m)=>{if(!v)throw Error(m);};
export async function colorConsentCase({kernel,sources,driver,capture}){
 let state=domain.createProject({product:'keychain',content:{app:appContent('Original color emoji')}}),n=0;
 const records=new Map(),writer=new SourceOperations(),userId='color-user',projectId='color-project';
 const assets=()=>new Map([...records].map(([h,r])=>[h,r.bytes.slice()]));
 const sync=()=>driver.set({userId,projectId,state,assetsMap:assets()});sync();
 const bridge=createProductSourceContexts({frameTransport:'product-context-bundle/2',kernel,sources,context:driver.get}),product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context:driver.get,withPreparedSource:bridge.withPreparedSource});
 const c=(operation)=>({version:'arch-app-adapters/1',ticket:{id:'color-'+ ++n,userId,projectId,revision:state.revision,generation:n},signal:new AbortController().signal,onProgress:()=>{},...(operation?{sourceContext:createSourceContext(operation,state.content.app.source)}:{})});
 async function adopt(reply,file,control){
  const r=reply.result??reply,raw=await writer.addAsset(file.bytes,'source',records),hashes=[raw.hash];
  for(const a of r.assets??[])hashes.push((await writer.addAsset(a.bytes,a.kind,records)).hash);
  const raster=r.raster?await writer.rasterDescriptor(r.raster,records):null,preview=r.preview?await writer.previewDescriptor(r.preview,records):null;
  if(raster)hashes.push(raster.rgba,raster.preview,raster.originalPreview);if(preview)hashes.push(preview.png);
  const source={id:control.sourceContext.id,revision:control.sourceContext.revision,kind:r.kind,name:file.name,mediaType:file.mediaType,raw,assetHashes:[...new Set(hashes)],metadata:{...structuredClone(r.metadata),sourceContext:structuredClone(control.sourceContext)},...(raster?{raster}:{}),...(preview?{preview}:{})};sync();
  const delta=await bridge.prepareAdoption({...control,purpose:'source',operation:control.sourceContext.operation,source,state:structuredClone(state),assets:assets(),materials:r.materials??state.content.app.materials,materialDefaults:r.materials??state.content.app.materialDefaults});
  source.metadata.productBindings=structuredClone(delta.productBindings);
  if(reply.confirmation){
   const receipt=await bridge.source.acceptProposal({...control,state:structuredClone(state),source,assets:assets(),confirmation:reply.confirmation,acceptedAtRevision:state.revision+1});
   source.metadata.confirmationReceipt=sourceReceipt(receipt,{control,confirmation:reply.confirmation,source,acceptedAtRevision:state.revision+1});
  }
  state=structuredClone(state);state.revision++;state.sourceKind=source.kind;state.content.app.source=source;state.content.app.materials=structuredClone(delta.materials);state.content.app.materialDefaults=structuredClone(delta.materialDefaults);state=validateState(state);sync();return source;
 }
 const trace=[];
 try{
  let control=c('import');const selected=await bridge.source.selectEmoji({...control,id:'😀',collectionId:'noto-color-emoji'}),file=selected.file;
  let src=await adopt(selected.result,file,control);must(src.metadata.productBindings.version==='arch-product-bindings-pending/1','Color original is retained, not faked numeric outlines');
  try{await product.engine.build({...c(),state,assets:assets()});throw Error('UNAPPROVED_BUILD');}catch(e){must(e.code==='PRODUCT_SOURCE_CONVERSION_REQUIRED','COLOR_CONVERSION_REQUIRED');}
  trace.push({stage:'original',rawHash:src.raw.hash,pending:true,originalAssets:src.assetHashes});
  control=c('convert');let reply=await bridge.source.convert({...control,target:'raster',source:src,state,assets:assets()});
  must(reply.status==='proposal'&&reply.confirmation.kind==='emoji','Explicit renderer consent');
  src=await adopt(reply,file,control);const renderReceipt=src.metadata.confirmationReceipt;
  must(src.metadata.productBindings.version==='arch-product-bindings-pending/1','Rendering is not segmentation approval');
  trace.push({stage:'render-approved',approvalHash:renderReceipt.approvalHash,pending:true});
  control=c('convert');reply=await bridge.source.convert({...control,target:'raster',source:src,state,assets:assets()});
  must(reply.status==='proposal'&&reply.confirmation.kind==='raster','Separate segmentation consent');
  src=await adopt(reply,file,control);
  must(src.metadata.productBindings.version==='arch-product-bindings/1','Actual graph has full bindings');
  must(src.metadata.rasterPreparation.input.origin.confirmationId===renderReceipt.approvalHash,'Original render authorization lineage');
  must(trace[0].originalAssets.every(h=>src.assetHashes.includes(h)),'Retained original font/selection/artwork references');
  trace.push({stage:'segmentation-approved',approvalHash:src.metadata.confirmationReceipt.approvalHash,regions:src.metadata.productBindings.regions.length,rawHash:src.raw.hash});
  const model=await product.engine.build({...c(),state,assets:assets()});
  try{await capture('emoji-color-default',{bytes:new Uint8Array(model.bytes()),semantics:model.product.semantics,bindings:src.metadata.productBindings,row:{id:'emoji-color-default'},state:structuredClone(state),assets:assets()});}
  finally{model.release();}
  return {status:'pass',trace,models:1};
 }finally{await product.reset();bridge.reset();}
}
