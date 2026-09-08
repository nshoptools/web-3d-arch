import * as domain from '../../src/domain/index.mjs';
import {appContent,validateState,setParameter} from '../../src/app/documents.mjs';
import {SourceOperations} from '../../src/app/sources.mjs';
import {createSourceContext,sourceReceipt} from '../../src/app/source-approval.mjs';
import {createProductSourceContexts} from '../../src/integration/product-source-contexts.mjs';
import {createProductAdapters,validateProductMaterialExtension} from '../../src/integration/product-adapters.mjs';
import {canonicalJSON,sha256} from '../../src/storage/common.mjs';
import {readArchSnapshot} from '../../src/viewport/arch-view.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';

const must=(ok,message)=>{if(!ok)throw Error(message);},clone=structuredClone;
export const SVG='<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><path id="west" fill="#e04444" fill-rule="evenodd" d="M0 0H20V30H0Z M5 6H9V10H5Z"/><path id="east" fill="#3388ee" d="M20 0H40V30H20Z"/></svg>';
export const products=['keychain','clicky','strap','lego','charm'],styles=['noi','chim','phang','phang2'];
export async function runBridgeCases({kernel,sources,driver,capture=async()=>{},families=['svg','raster','text','emoji'],matrix=true,discoverNativeBlocks=false,productFilter=products,supplemental=true}){
 let state,n=0;const records=new Map(),writer=new SourceOperations(),trace=[],negatives=[];
 const userId='source-bridge-user',projectId='source-bridge-project';
 const assets=()=>new Map([...records].map(([h,a])=>[h,new Uint8Array(a.bytes)]));
 function sync(){driver.set({sessionKey:'test-session-1',state,userId,projectId,assetsMap:assets()});}
 const control=(op)=>({version:'arch-app-adapters/1',ticket:{id:'bridge-'+ ++n,userId,projectId,revision:state.revision,generation:n},signal:new AbortController().signal,onProgress:()=>{},...(op?{sourceContext:createSourceContext(op,state.content.app.source)}:{})});
 const bridge=createProductSourceContexts({frameTransport:'product-context-bundle/2',kernel,sources,context:driver.get});
 const product=createProductAdapters({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context:driver.get,withPreparedSource:bridge.withPreparedSource});
 async function descriptor(result,file,c){
  const raw=await writer.addAsset(file.bytes,'source',records),hashes=[raw.hash];
  for(const a of result.assets??[])hashes.push((await writer.addAsset(a.bytes,a.kind,records)).hash);
  const raster=result.raster?await writer.rasterDescriptor(result.raster,records):null;
  const preview=result.preview?await writer.previewDescriptor(result.preview,records):null;
  if(raster)hashes.push(raster.rgba,raster.preview,raster.originalPreview);if(preview)hashes.push(preview.png);
  return {id:c.sourceContext.id,revision:c.sourceContext.revision,name:file.name,mediaType:file.mediaType,kind:result.kind,raw,assetHashes:[...new Set(hashes)],
   metadata:{...clone(result.metadata),sourceContext:clone(c.sourceContext)},...(raster?{raster}:{}),...(preview?{preview}:{})};
 }
 async function adopt(reply,file,c){
  const result=reply.result??reply,desc=await descriptor(result,file,c);sync();
  const before=canonicalJSON({state,desc});
  const delta=await bridge.prepareAdoption({...c,purpose:'source',operation:c.sourceContext.operation,state:clone(state),source:clone(desc),assets:assets(),
   materials:result.materials??state.content.app.materials,materialDefaults:result.materials??state.content.app.materialDefaults});
  must(canonicalJSON({state,desc})===before,'PURE_ADOPTION_MUTATED');
  must(Object.keys(delta).sort().join(',')==='materialDefaults,materials,productBindings,ticket,version','EXACT_ADOPTION_ENVELOPE');
  must(delta.materials.length===delta.materialDefaults.length&&delta.materialDefaults.every(d=>delta.materials.some(m=>m.id===d.id)),'DEFAULT_COVERAGE');
  for(const m of [...delta.materials,...delta.materialDefaults]){must(typeof m.backgroundEligible==='boolean','MATERIAL_REQUIRED_FIELD');if(m.product)validateProductMaterialExtension(m.product);}
  // Fixture driver models explicit user consent ONLY for source conversion.
  // Production bridge never invokes acceptance; geometry proposals are not accepted.
  if(reply.confirmation){
   const a=await bridge.source.acceptProposal({...c,state:clone(state),source:desc,assets:assets(),confirmation:reply.confirmation,acceptedAtRevision:state.revision+1});
   desc.metadata.confirmationReceipt=sourceReceipt(a,{control:c,confirmation:reply.confirmation,source:desc,acceptedAtRevision:state.revision+1});
  }
  desc.metadata.productBindings=clone(delta.productBindings);
  state=clone(state);state.revision++;state.sourceKind=desc.kind;state.content.app.source=desc;
  state.content.app.materials=clone(delta.materials);state.content.app.materialDefaults=clone(delta.materialDefaults);state=validateState(state);sync();
  return desc;
 }
 function fresh(p,a,overlay=false){
  records.clear();state=domain.createProject({product:p,content:{app:appContent('Root source bridge')}});
  state=setParameter(state,'artMode',a);
  if(overlay){
   state=clone(state);Object.assign(state.content.app.text,{text:'O',placement:'beside',xMm:'60',yMm:'2',baseEnabled:true,baseThicknessLayers:'2',heightLayers:'3'});state.revision++;
  }
  sync();
 }
 async function ingest(family){
  const c=control('import');let file,reply;
  if(family==='emoji'||family==='emoji-color'){
   const selected=await bridge.source.selectEmoji({...c,id:'😀',collectionId:family==='emoji'?'noto-emoji-monochrome':'noto-color-emoji'});file=selected.file;reply=selected.result;
  }else{
   const rgba=new Uint8ClampedArray(64*48*4);
   if(family==='raster')for(let y=0;y<48;y++)for(let x=0;x<64;x++){if(x>=8&&x<14&&y>=9&&y<16)continue;rgba.set(x<32?[224,68,68,255]:[51,136,238,255],4*(y*64+x));}
   file={name:family==='svg'?'actual.svg':family==='text'?'actual.txt':'actual.png',mediaType:family==='svg'?'image/svg+xml':family==='text'?'text/plain':'image/png',
    bytes:family==='raster'?await encodeRasterPNG({width:64,height:48,data:rgba}):new TextEncoder().encode(family==='svg'?SVG:'O')};
   reply=await bridge.source.ingest({...c,state:clone(state),purpose:'source',file});
  }
  return {file,source:await adopt(reply,file,c)};
 }
 async function build(id){
  const c=control();let model;try{model=await product.engine.build({...c,state:clone(state),assets:assets()});}catch(e){console.log(JSON.stringify({id,error:e.code,details:e.details}));
   await capture(id,{failure:{id,code:e.code,details:e.details??null},state:clone(state),assets:assets()});throw e;}
  const bytes=new Uint8Array(model.bytes()),s=readArchSnapshot(bytes),sem=model.product.semantics;
  must(sem.mechanicsSemantics===3&&sem.sourceSemantics===2,'STRICT_SEMANTICS');
  must(sem.provenance.sourceRawHash===undefined||sem.provenance.sourceRawHash===state.content.app.source.raw.hash,'SOURCE_HASH');
  must(s.parts.length>0&&model.blocks.length===s.parts.length,'MODEL_PART_COVERAGE');
  const inspection=await product.inspectModel({model,control:c});
  must(inspection.exportDescriptor.parts.every(p=>Number.isInteger(p.sourceIndex)),'EXPORT_SOURCE_ROUTING');
  must(inspection.gates.independentMeshVerdict===0&&inspection.gates.fitQualification==='unqualified','NO_TEST_ORACLE_PROMOTION');
  const row={id,sourceKind:state.sourceKind,sourceHash:state.content.app.source.raw.hash,contexts:state.content.app.source.metadata.productBindings.contexts.length,
   parts:s.parts.length,regions:state.content.app.source.metadata.productBindings.regions.length,mechanicsSemantics:3,sourceSemantics:2,meshOracle:'host-verification-pending',meshHash:await sha256(bytes)};
  await capture(id,{bytes,semantics:clone(sem),bindings:clone(state.content.app.source.metadata.productBindings),row,state:clone(state),assets:assets()});
  model.release();trace.push(row);
 }
 try{
  for(const family of families)for(const p of matrix?productFilter:['keychain'])for(const a of matrix?styles:['noi']){
   fresh(p,a);await ingest(family);const id=family+'-'+p+'-'+a;
   try{await build(id);}catch(e){
    if(!discoverNativeBlocks||!['text','emoji'].includes(family)||e.code!=='PRODUCT_NATIVE_BLOCKED'||e.details?.nativeCode!=='PRODUCT_BLOCKED'||!Array.isArray(e.details.diagnostics))throw e;
    negatives.push({id,code:e.code,details:e.details,acceptance:'blocked-root-dependency'});
   }
  }
  if(supplemental){
  for(const family of ['text','emoji'].filter(f=>!families.includes(f))){fresh('keychain','noi');await ingest(family);await build(family+'-keychain-noi');}
  for(const family of ['svg','raster']){
   fresh('keychain','noi',true);await ingest(family);
   try{await build(family+'-actual-overlay');}
   catch(e){if(family!=='raster'||e.code!=='PRODUCT_SOURCE_HASH_MISSING')throw e;
    negatives.push({id:'raster-overlay-root-context-gap',code:e.code,acceptance:'blocked-root-dependency'});}

  }
  fresh('keychain','noi',true);state=clone(state);state.content.app.text.placement='on-model';sync();
  try{await ingest('svg');throw Error('MISSING_DATUM_ACCEPTED');}catch(e){must(e.code==='PRODUCT_ADOPTION_BLOCKED','DATUM_REJECTION '+(e.code??e.message));negatives.push({id:'on-model-datum-explicit',code:e.code});}
  }
  return {status:'pass',qualification:negatives.some(r=>r.acceptance==='blocked-root-dependency')?'partial-native-blockers':'complete-fixtures',trace,negatives};
 }finally{await product.reset();bridge.reset();}
}
