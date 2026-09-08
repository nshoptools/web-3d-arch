import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as domain from '../../src/domain/index.mjs';
import {appContent,validateState} from '../../src/app/documents.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {createProductAdapters,PRODUCT_ROLES,prepareBindings} from '../../src/integration/product-adapters.mjs';
import {createProductOperations} from '../../src/core/product-operations.mjs';
import {createRasterOperations,createRasterDispatcher,createRasterTransport} from '../../src/core/raster-operations.mjs';
import {createRasterAdapters,rasterOptionsForState} from '../../src/integration/raster-adapters.mjs';
import {bufferMap,validatePacket} from '../../src/core/raster-schema.mjs';
import {readSnapshot} from '../oracles/mesh-oracle.mjs';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
export const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN??'INVALID');
const repo=fs.realpathSync(process.env.PROJECT_ROOT??'INVALID');
assert.ok(run.startsWith(repo+path.sep));assert.match(run.replaceAll('\\','/'),/\/tmp\/reviews\/(codex|opus|grok)\/runs\/[A-Za-z0-9_-]+$/);
export const evidence=path.join(run,'evidence');fs.mkdirSync(evidence,{recursive:true});
export const products=['keychain','clicky','strap','lego','charm'],styles=['noi','chim','phang','phang2'];
export const svg='<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><path id="left" fill="#e04444" fill-rule="evenodd" d="M0 0H20V30H0Z M5 6H9V10H5Z"/><path id="right" fill="#3388ee" d="M20 0H40V30H20Z"/></svg>';
export const txtSVG='<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path id="text-A" fill="#ffffff" fill-rule="evenodd" d="M2 2H6V6H2Z M3 3H5V5H3Z"/></svg>';
const factory=(await import(pathToFileURL(path.resolve(process.env.PRODUCT_APP_MODULE??path.join(run,'work/module/arch-kernel.mjs'))))).default;
export const M=await factory({print:()=>{},printErr:()=>{}});
export const ops=createProductOperations(M),rasterOps=createRasterOperations(M),dispatcher=createRasterDispatcher(rasterOps);
const text=new TextDecoder(),enc=new TextEncoder();
const error=()=>text.decode(M.HEAPU8.slice(M._arch_error_ptr(),M._arch_error_ptr()+M._arch_error_len()));
function input(b){const id=M._arch_input_create(b.length);assert.ok(id,error());M.HEAPU8.set(b,M._arch_input_ptr(id));return id;}
let generation=0;
export const transportLog=[];
const nativeSources=new Map();let captureSerial=0;
export function recordFramedNativeSource(original,result,request){const before=nativeSources.get(original.id);assert.ok(before);nativeSources.set(result.id,{...before,sourceFrame:structuredClone(request)});}
export function forgetNativeSource(id){nativeSources.delete(id);}
function captureNative(recipe,source){
 if(process.env.ARCH_CAPTURE_NATIVE!=='1')return;
 const refs=source.kind==='contexts'?source.contexts:source.kind==='snapshot'?[source]:[];
 if(!refs.length||refs.some(r=>!nativeSources.has(r.id)))return;
 const name=String(++captureSerial).padStart(3,'0'),dir=path.join(run,'evidence/native-cases-'+(process.env.ARCH_ROOT_TAG??'untagged'));fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({version:1,wire:Array.from(recipe.packed),
  contexts:refs.map(ref=>({...nativeSources.get(ref.id),sourceHash:ref.sourceHash??nativeSources.get(ref.id).sourceHash,translationNm:ref.translationNm??['0','0']}))}));
}
function reset(g,method){assert.equal(M._arch_control_reset(g),1);transportLog.push({method,generation:g});}
export const client={
 epoch:1,roots:new Set(),
 async build(recipe,{generation:g}){
  reset(g,recipe.kind==='product'?'product':'svg');let id;
  if(recipe.kind==='svg')id=M._arch_build_svg(input(enc.encode(recipe.source)),recipe.thicknessMm??.2,recipe.longEdgeMm??0,recipe.toleranceMm??.001,g);
  else{
   const s=recipe.source;
   const prepare=source=>{captureNative(recipe,source);return ops.prepare({...recipe,source},g);};
   let request;
   // Test-only adapter for the frozen Module: execute the same synchronous
   // dispatcher token borrow as parent's Worker; no numeric app handles.
   if(s.kind==='raster-token')request=dispatcher.withSourceReference(s.token,ref=>prepare(ref));
   else if(s.kind==='contexts'){
    const collect=(i,refs)=>i===s.contexts.length?prepare({kind:'contexts',contexts:refs}):
     s.contexts[i].token?dispatcher.withSourceReference(s.contexts[i].token,ref=>{assert.equal(ref.kind,'snapshot');return collect(i+1,[...refs,{...ref,sourceHash:s.contexts[i].sourceHash,...(s.contexts[i].translationNm?{translationNm:s.contexts[i].translationNm}:{})}]);}):
     collect(i+1,[...refs,s.contexts[i]]);
    request=collect(0,[]);
   }else request=prepare(s);
   try{id=ops.buildRequest(request,g);}catch(e){if(e.proposal)e.proposal.epoch=this.epoch;throw e;}
  }
  assert.ok(id,error());let released=false;
  const metadata=recipe.kind==='product'?ops.metadata(id):JSON.parse(text.decode(M.HEAPU8.slice(M._arch_metadata_ptr(id),M._arch_metadata_ptr(id)+M._arch_metadata_len(id))));
  if(recipe.kind==='svg')nativeSources.set(id,{svg:recipe.source,thicknessMm:recipe.thicknessMm??.2,longEdgeMm:recipe.longEdgeMm??0,toleranceMm:recipe.toleranceMm??.001,sourceHash:metadata.sourceHash});
  const lease={id,generation:g,epoch:this.epoch,metadata,
   bytes:()=>{assert.ok(!released,'test root released');return new Uint8Array(M.HEAPU8.buffer,M._arch_snapshot_ptr(id),M._arch_snapshot_len(id));},
   release:()=>{if(!released){released=true;client.roots.delete(lease);nativeSources.delete(id);assert.equal(M._arch_snapshot_release(id),1);}}};
  this.roots.add(lease);return lease;
 },
 async probeProduct(recipe,{generation:g}){
  reset(g,'product-datum-probe');
   const s=recipe.source;
   const prepare=source=>{captureNative(recipe,source);return ops.prepare({...recipe,source},g);};
   let request;
   // Test-only adapter for the frozen Module: execute the same synchronous
   // dispatcher token borrow as parent's Worker; no numeric app handles.
   if(s.kind==='raster-token')request=dispatcher.withSourceReference(s.token,ref=>prepare(ref));
   else if(s.kind==='contexts'){
    const collect=(i,refs)=>i===s.contexts.length?prepare({kind:'contexts',contexts:refs}):
     s.contexts[i].token?dispatcher.withSourceReference(s.contexts[i].token,ref=>{assert.equal(ref.kind,'snapshot');return collect(i+1,[...refs,{...ref,sourceHash:s.contexts[i].sourceHash,...(s.contexts[i].translationNm?{translationNm:s.contexts[i].translationNm}:{})}]);}):
     collect(i+1,[...refs,s.contexts[i]]);
    request=collect(0,[]);
   }else request=prepare(s);
   const p=ops.probeRequest(request,g);return {...p,epoch:this.epoch};
 },
 releaseProductProposal(p){ops.releaseProposal(p.id);},
 async confirmProduct(p,current,{generation:g}){reset(g,'confirmProduct');return ops.confirm(p.id,p.descriptor,current,g);}
};
export async function operation(c,fn){assert.ok(!c.signal.aborted);const g=++generation;return fn(client,g);}
const facade=createRasterTransport({call(method,request,c){
 if(['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(method))
  return operation(c,(_,g)=>{reset(g,'raster.'+method);return dispatcher.dispatch(method,request,{...c,generation:g});});
 transportLog.push({registry:method});return dispatcher.dispatch(method,request);
}});
export const runtime=Object.freeze({...facade,productSource:lease=>({...facade.productSource(lease),epoch:client.epoch})});
export const raster=createRasterAdapters({runtime});
export let live={sessionKey:'test-session-1',userId:'user-a',projectId:'project-persistent',state:null};
export function setLive(value){live={sessionKey:'test-session-1',...value};}
export function controlFor(state=live.state,options={}){
 const abort=new AbortController();
 return {version:'arch-app-adapters/1',ticket:{id:'job-'+(++controlFor.serial),userId:live.userId,projectId:live.projectId,revision:state.revision,generation:controlFor.serial},signal:abort.signal,onProgress:()=>{},abort,...options};
}
controlFor.serial=0;
function base(product,style,kind){
 let state=domain.createProject({product,sourceKind:kind,content:{app:appContent('Product integration test')}});
 const changes=[{id:'artMode',value:style}];
 const preview=domain.previewCommand(state,{id:'parameters.set',args:{changes}});assert.ok(preview.ok,JSON.stringify(preview));
 return structuredClone(domain.commitPreview(state,preview).state);
}
function materials(){
 // Body/rim/skirt/fastener deliberately share a color and slot but keep IDs.
 const roles=PRODUCT_ROLES.map(role=>({id:'mat-'+role,label:role,color:'#30353b',slot:1,
  role:['body','text','textBase','stem','tray'].includes(role)?role:'other',overridden:false,excluded:false}));
 return [...roles,{id:'paint-west',label:'west',color:'#e04444',slot:2,role:'region',overridden:true,excluded:false},
  {id:'paint-east',label:'east',color:'#3388ee',slot:3,role:'region',overridden:true,excluded:false}];
}
function ledger(source,keys){
 return {version:'arch-product-bindings/1',projectId:live.projectId,sourceId:source.id,sourceRevision:source.revision,rawHash:source.raw.hash,
  contexts:[{key:'art',sha256:source.raw.hash,derivationHash:null}],
  regions:keys.map((nativeKey,i)=>({sourceKey:['authored-west','authored-east'][i],contextKey:'art',nativeKey,materialId:['paint-west','paint-east'][i],textKey:null,height:null})),
  roles:Object.fromEntries(PRODUCT_ROLES.map(role=>[role,'mat-'+role])),texts:[],eyeletTextKey:null,sourceToleranceMm:.001,textStateHash:null};
}
export async function svgState(product='keychain',style='noi',content=svg){
 const state=base(product,style,'svg'),bytes=enc.encode(content),h=await sha256(bytes),sourceContext={version:'arch-source-context/1',operation:'import',id:'source-durable-art',revision:0,predecessor:null};
 const source={id:sourceContext.id,revision:0,kind:'svg',name:'art.svg',mediaType:'image/svg+xml',raw:{hash:h,byteLength:bytes.length},assetHashes:[h],metadata:{sourceContext}};
 source.metadata.productBindings=ledger(source,['left','right']);
 state.content.app.source=source;state.content.app.materials=materials();state.revision++;
 return {state:validateState(state),assets:new Map([[h,bytes]])};
}
export async function rasterState(product='keychain',style='noi'){
 const state=base(product,style,'raster');live={...live,state};
 const rgba=new Uint8ClampedArray(64*48*4);
 for(let y=0;y<48;y++)for(let x=0;x<64;x++){if(x>=8&&x<14&&y>=9&&y<16)continue;rgba.set(x<32?[224,68,68,255]:[51,136,238,255],4*(y*64+x));}
 const bytes=await encodeRasterPNG({width:64,height:48,data:rgba}),rawHash=await sha256(bytes),c=controlFor(state);
 const sourceContext={version:'arch-source-context/1',operation:'import',id:'source-durable-art',revision:0,predecessor:null};
 const reply=await raster.source.ingest({...c,state,file:{name:'synthetic.png',mediaType:'image/png',bytes},purpose:'source',sourceContext});
 assert.equal(reply.status,'proposal');const result=reply.result,assets=new Map([[rawHash,bytes]]);
 for(const a of result.assets)assets.set(await sha256(a.bytes),a.bytes);
 const source={id:sourceContext.id,revision:0,kind:'raster',name:'synthetic.png',mediaType:'image/png',raw:{hash:rawHash,byteLength:bytes.length},
  assetHashes:[...assets.keys()],metadata:result.metadata,raster:{width:result.raster.width,height:result.raster.height,
   rgba:await sha256(result.raster.data),preview:await sha256(result.raster.preview),originalPreview:await sha256(result.raster.preview),pixelSizeMm:result.raster.pixelSizeMm}};
 const acceptance=await raster.source.acceptProposal({...c,state,sourceContext,source,assets,confirmation:reply.confirmation,acceptedAtRevision:state.revision+1});
 source.metadata.confirmationReceipt=acceptance.receipt;
 source.metadata.productBindings=ledger(source,['raster-region:0','raster-region:1']);
 // Tie derivation to existing verified preparation independently of raw hash.
 source.metadata.productBindings.contexts[0].derivationHash=result.metadata.rasterPreparation.approvalHash;
 state.content.app.source=source;state.content.app.materials=materials();state.revision++;
 return {state:validateState(state),assets};
}
export async function svgPreparation(args,consume){
 const {run,bindings,state,assets}=args,leases=[];
 try{
  for(const c of bindings.contexts){
   const bytes=assets.get(c.sha256);
   leases.push(await run((current,g)=>current.build({kind:'svg',source:text.decode(bytes),thicknessMm:.2,toleranceMm:bindings.sourceToleranceMm},{generation:g})));
  }
  const contexts=leases.map((lease,i)=>({key:bindings.contexts[i].key,sourceHash:lease.metadata.sourceHash,derivationHash:bindings.contexts[i].derivationHash,
   regions:lease.metadata.paints.map((p,sourceIndex)=>({nativeKey:p.sourceId??p.id,sourceIndex}))}));
  const references=leases.map(l=>()=>{l.bytes();return {kind:'snapshot',id:l.id,generation:l.generation,epoch:l.epoch};});
  const source=leases.length===1?references[0]():{kind:'contexts',contexts:references.map((ref,i)=>({...ref(),sourceHash:contexts[i].sourceHash}))};
  return await consume({version:'arch-product-contexts/1',owner:client,epoch:client.epoch,contexts,source,references,
   assertOwned:()=>leases.forEach(l=>l.bytes()),authorization:null,textStateHash:bindings.textStateHash});
 }finally{for(const l of leases)l.release();}
}
export async function rasterPreparation(args,consume){
 const c={...args.control,state:args.state,assets:args.assets};
 return raster.source.prepareRecipe(c,async ready=>{
  // Routing is read from actual verified loops, not from requested materials.
  const b=bufferMap(ready.packet),loops=new Uint32Array(b.get(13).buffer),pairs=new Map();
  for(let i=0;i<loops.length;i+=4)pairs.set(loops[i+2]+':'+loops[i+3],[loops[i+2],loops[i+3]]);
  const sorted=[...pairs.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const reference=()=>({...ready.nativeSource});
  return consume({version:'arch-product-contexts/1',owner:client,epoch:client.epoch,source:reference(),references:[reference],
   assertOwned:()=>{assert.equal(ready.nativeSource.epoch,client.epoch);},
   authorization:ready.receipt,textStateHash:null,
   contexts:[{key:'art',sourceHash:ready.preparation.input.originalHash,derivationHash:ready.preparation.approvalHash,
    regions:sorted.map((r,sourceIndex)=>({nativeKey:'raster-region:'+r[0],sourceIndex}))}],
   upstreamBindings:args.domainRecord.records.filter(r=>r.fieldId>=1&&r.fieldId<=7).sort((a,b)=>a.fieldId-b.fieldId)});
 });
}
export function adapters(options={}){
 const kernelLeases=new WeakMap();
 return {kernelLeases,...createProductAdapters({operation,kernelLeases,context:()=>live,
  withPreparedSource:async(args,consume)=>args.source.raster?rasterPreparation(args,consume):svgPreparation(args,consume),...options})};
}
export function ownTestState(f){live={sessionKey:'test-session-1',userId:'user-a',projectId:'project-persistent',state:f.state};return {...controlFor(f.state),...f};}
export function change(f,fn){const state=structuredClone(f.state);fn(state);return {...f,state};}
export function noOwned(){assert.equal(client.roots.size,0);assert.equal(M._arch_raster_owned_bytes(),0);}

/** Ordinary adoption test path: discard the legacy hand binding fixture. Read
 * actual native contours/31-buffer indexed regions, run the pure initializer,
 * and apply its returned delta as a simulated single parent history commit. */
export async function adoptState(f){
 const initial=structuredClone(f.state);
 delete initial.content.app.source.metadata.productBindings;
 initial.content.app.materials=[];initial.content.app.materialDefaults=[];
 const source=initial.content.app.source;initial.content.app.source=null;initial.revision--;initial.sourceKind='none';
 const c=ownTestState({...f,state:initial});
 let canonicalContexts;
 if(!source.raster){
  const lease=await operation(c,(client,g)=>client.build({kind:'svg',source:new TextDecoder().decode(f.assets.get(source.raw.hash)),thicknessMm:.2,toleranceMm:.001},{generation:g}));
  try{
   const s=readSnapshot(lease.bytes());
   const regions=await Promise.all(s.parts.map(async(p,sourceIndex)=>{
    const loops=s.contours.slice(p.contourStart,p.contourStart+p.contourCount).map(c=>c.ring.map(i=>s.points[i].map(String)));
    const nativeKey=lease.metadata.paints[sourceIndex].sourceId??lease.metadata.paints[sourceIndex].id;
    return {nativeKey,sourceIndex,geometryHash:await sha256(canonicalJSON({loops})),authoredKey:['left','right'].includes(nativeKey)?nativeKey:null,rgba:p.color};
   }));
   canonicalContexts=[{key:'art',sourceHash:lease.metadata.sourceHash,derivationHash:null,regions}];
  }finally{lease.release();}
 }else{
  const preparation=source.metadata.rasterPreparation,b=new Map();
  for(const row of preparation.buffers){const bytes=f.assets.get(row.hash);assert.equal(await sha256(bytes),row.hash);b.set(row.kind,bytes);}
  const loops=new Uint32Array(b.get(13).buffer),indices=new Uint32Array(b.get(14).buffer),xy=new BigInt64Array(b.get(28).buffer),palette=new Uint32Array(b.get(7).buffer),colors=new Map();
  for(let i=0;i<palette.length;i+=6){const v=palette[i+1];colors.set(palette[i],((v&255)*0x1000000+(v>>>8&255)*65536+(v>>>16&255)*256+(v>>>24))>>>0);}
  const byRegion=new Map();
  for(let i=0;i<loops.length;i+=4){
   const key=loops[i+2]+':'+loops[i+3];
   if(!byRegion.has(key))byRegion.set(key,{region:loops[i+2],label:loops[i+3],loops:[]});
   byRegion.get(key).loops.push([...indices.slice(loops[i],loops[i]+loops[i+1]-1)].map(n=>[String(xy[2*n]),String(xy[2*n+1])]));
  }
  const sorted=[...byRegion.values()].sort((a,b)=>a.region-b.region||a.label-b.label);
  const regions=await Promise.all(sorted.map(async(r,sourceIndex)=>({nativeKey:'raster-region:'+r.region,sourceIndex,geometryHash:await sha256(canonicalJSON({loops:r.loops})),authoredKey:null,rgba:colors.get(r.label)})));
  canonicalContexts=[{key:'art',sourceHash:source.raw.hash,derivationHash:preparation.approvalHash,regions}];
 }
 const result=await prepareBindings({projectId:live.projectId,state:initial,source,canonicalContexts});
 assert.equal(result.status,'ready',JSON.stringify(result.diagnostics));
 assert.equal(result.fitQualification,'unqualified');assert.equal(result.printerQualification,'unverified');
 const state=structuredClone(initial);state.content.app.source=structuredClone(result.source);
 state.content.app.materials=structuredClone(result.materials);state.content.app.materialDefaults=structuredClone(result.materialDefaults);state.sourceKind=source.kind;state.revision++;
 const assets=new Map(f.assets);
 return {state:validateState(state),assets,adoption:result,canonicalContexts};
}
