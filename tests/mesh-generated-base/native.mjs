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
import {applySourceFrame} from '../../src/core/source-frame.mjs';
import {previewPlanarSnapshot} from '../../src/core/source-preview.mjs';
export const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN??'INVALID');
const repo=fs.realpathSync(process.env.PROJECT_ROOT??'INVALID');
assert.ok(run.startsWith(repo+path.sep));assert.match(run.replaceAll('\\','/'),/\/tmp\/reviews\/(codex|opus|grok)\/runs\/[A-Za-z0-9_-]+$/);
export const evidence=path.join(run,'evidence');fs.mkdirSync(evidence,{recursive:true});
export const products=['keychain','clicky','strap','lego','charm'],styles=['noi','chim','phang','phang2'];
export const svg='<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><path id="left" fill="#e04444" fill-rule="evenodd" d="M0 0H20V30H0Z M5 6H9V10H5Z"/><path id="right" fill="#3388ee" d="M20 0H40V30H20Z"/></svg>';
export const txtSVG='<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path id="text-A" fill="#ffffff" fill-rule="evenodd" d="M2 2H6V6H2Z M3 3H5V5H3Z"/></svg>';
const factory=(await import(pathToFileURL(path.resolve(process.env.PRODUCT_APP_MODULE??path.join(run,'work/module/arch-kernel.mjs'))))).default;
export const M=await factory({wasmBinary:fs.readFileSync(path.resolve(process.env.PRODUCT_APP_MODULE).replace(/\.mjs$/,'.wasm')),print:()=>{},printErr:()=>{}});
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
 /** Real ASFR/1 frame on this Module: an owned SVG lease, or a registered raster
  * source context addressed by its dispatcher token, as the Worker resolves it. */
 async sourceFrame(original,request,{generation:g}){
  reset(g,'sourceFrame');
  const apply=(id,sg)=>applySourceFrame(M,id,sg,request,g);
  let id;
  if(original?.kind==='raster-token'){assert.equal(original.epoch,this.epoch);id=dispatcher.withSourceReference(original.token,ref=>{assert.equal(ref.kind,'snapshot','a registered context, not an accepted raster');return apply(ref.id,ref.generation);});}
  else{assert.ok(this.roots.has(original),'framed lease must be owned');id=apply(original.id,original.generation);}
  const metadata=JSON.parse(text.decode(M.HEAPU8.slice(M._arch_metadata_ptr(id),M._arch_metadata_ptr(id)+M._arch_metadata_len(id))));
  let released=false;
  const lease={id,generation:g,epoch:this.epoch,metadata,
   bytes:()=>{assert.ok(!released,'test root released');return new Uint8Array(M.HEAPU8.buffer,M._arch_snapshot_ptr(id),M._arch_snapshot_len(id));},
   release:()=>{if(!released){released=true;client.roots.delete(lease);nativeSources.delete(id);assert.equal(M._arch_snapshot_release(id),1);}}};
  if(nativeSources.has(original?.id))recordFramedNativeSource(original,lease,request);
  this.roots.add(lease);return lease;
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

export function noOwned(){assert.equal(client.roots.size,0);assert.equal(M._arch_raster_owned_bytes(),0);}
/** The adapter's preview of a parsed SVG file (kernel-adapters/engine-worker):
 * the viewport is X right/Y down, the picture shows the manufacturing frame. */
export function manufacturingPreview(lease,{resolution=64,includeRGBA=false}={}){
 return previewPlanarSnapshot(lease.bytes(),{resolution,includeRGBA,sourceAxis:'x-right-y-down',sourceHeightMm:lease.metadata.heightMm});
}
