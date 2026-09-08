import * as domain from '../domain/index.mjs';
import {validateState,usedAssets} from '../app/documents.mjs';
import {domainStateFingerprint} from '../storage/history.mjs';
import {canonicalJSON,sha256,cloneJSON,keys} from '../storage/common.mjs';
import {createProductAdapters} from './product-adapters.mjs';
import {createProductSourceContexts} from './product-source-contexts.mjs';

export const MESH_GENERATED_BASE_VERSION='arch-mesh-generated-base/1';
export const MESH_GENERATED_BASE_LIMITS=Object.freeze({concurrent:1,stateBytes:2*1024*1024,assets:10000,assetBytes:128*1024*1024,oneAssetBytes:64*1024*1024});
const APP='arch-app-adapters/1',encode=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
const IMPORT_FIELDS=Object.freeze(['impOn','impOp','impScale','impX','impY','impZ','impRX','impRY','impRZ','impVox','meshJoinTolerance']);
const REQUIRED=Object.freeze({rootAbi:2,arch:1,mechanicsSemantics:3,sourceSemantics:2,meshRuntime:1});
export class MeshGeneratedBaseError extends Error {constructor(code,details={}){super(code);this.name='MeshGeneratedBaseError';this.code=code;this.details=details;}}
const need=(v,c,d)=>{if(!v)throw new MeshGeneratedBaseError(c,d);};
const copy=x=>cloneJSON(x),stamp=x=>canonicalJSON(x),same=(a,b)=>stamp(a)===stamp(b);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const hash=x=>need(typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),'GENERATED_BASE_HASH');
const bytesEqual=(a,b)=>a instanceof Uint8Array&&b instanceof Uint8Array&&a.length===b.length&&a.every((x,i)=>x===b[i]);
function control(c){
 need(c?.version===APP&&c.ticket&&c.signal&&typeof c.onProgress==='function','GENERATED_BASE_CONTROL');
 need(!c.signal.aborted,'GENERATED_BASE_CANCELLED');
 for(const k of ['id','userId','projectId'])need(typeof c.ticket[k]==='string'&&c.ticket[k].length>0&&c.ticket[k].length<=200,'GENERATED_BASE_CONTROL');
 need(Number.isSafeInteger(c.ticket.revision)&&c.ticket.revision>=0&&Number.isSafeInteger(c.ticket.generation)&&c.ticket.generation>0,'GENERATED_BASE_CONTROL');
}
function generatedRecipe(state,base){
 const parameters=copy(state.parameters),ids=new Set(base.content.app.materials.map(m=>m.id)),a=state.content.app;
 for(const f of IMPORT_FIELDS){delete parameters.common[f];for(const row of Object.values(parameters.byProduct))delete row[f];}
 return {product:state.product,sourceKind:state.sourceKind,schedule:state.schedule,parameters,source:a.source,text:a.text,
  fontAssets:a.fontAssets??[],materials:a.materials.filter(m=>ids.has(m.id)),materialDefaults:a.materialDefaults.filter(m=>ids.has(m.id))};
}
function projectExecution(saved,revision){
 const projected=copy(saved);projected.revision=revision;
 // Explicit generated stage projection only. The original fields are retained
 // in the binding/provenance and MUST be executed by the later CSG stage.
 const defaults=domain.createProject({product:saved.product,sourceKind:saved.sourceKind,schedule:saved.schedule});
 for(const f of IMPORT_FIELDS){
  if(Object.hasOwn(defaults.parameters.common,f))projected.parameters.common[f]=copy(defaults.parameters.common[f]);
  else delete projected.parameters.common[f];
  for(const [id,row]of Object.entries(projected.parameters.byProduct)){
   if(Object.hasOwn(defaults.parameters.byProduct[id],f))row[f]=copy(defaults.parameters.byProduct[id][f]);else delete row[f];
  }
 }
 projected.content.app.mesh=null;
 const result=validateState(projected);
 need(domain.effectiveValues(result).impOn===false,'GENERATED_BASE_PROJECTION');
 return result;
}

/** A private generated operand, never an applied CSG result or viewport model.
 * The supplied kernel/sources are the production composition, not factories.
 * No token, model handle, acceptance callback or context can come from project JSON. */
export function createMeshGeneratedBase({kernel,sources,context,engineIdentity}={}){
 need(typeof kernel?.operation==='function'&&typeof kernel.ensureRuntime==='function'&&kernel.kernelLeases instanceof WeakMap&&
  typeof sources?.raster?.prepareRecipe==='function'&&typeof sources?.source?.ingest==='function'&&typeof context==='function','GENERATED_BASE_BINDINGS');
 keys(engineIdentity,['id','version']);need(typeof engineIdentity.id==='string'&&typeof engineIdentity.version==='string','GENERATED_BASE_ENGINE');
 engineIdentity=freeze(copy(engineIdentity));
 let epoch=0,disposed=false;const active=new Set(),scopes=new WeakMap(),modelScopes=new WeakMap();

 async function open(input){
  need(!disposed,'GENERATED_BASE_DISPOSED');need(active.size===0,'GENERATED_BASE_BUSY');
  keys(input,['control','mode','base','assets']);control(input.control);
  need(['prepare','replay'].includes(input.mode),'GENERATED_BASE_MODE');
  const c={...input.control,ticket:freeze(copy(input.control.ticket))},originalTicket=stamp(c.ticket),e=epoch;
  const live=context();need(live?.state&&typeof live.sessionKey==='string'&&live.assetsMap instanceof Map,'GENERATED_BASE_CONTEXT');
  const currentState=freeze(validateState(copy(live.state))),stateStamp=stamp(currentState),sessionKey=live.sessionKey,currentModel=live.model??null;
  hash(live.headHash);
  const expected=freeze({userId:live.userId,projectId:live.projectId,revision:currentState.revision,headHash:live.headHash,sessionKey});
  need(expected.userId===c.ticket.userId&&expected.projectId===c.ticket.projectId&&expected.revision===c.ticket.revision,'GENERATED_BASE_AUTHORITY');
  const descriptor=freeze(copy(input.base));keys(descriptor,['version','stateAssetHash','stateFingerprint','engine','required']);
  need(descriptor.version==='arch-generated-base-replay/1'&&same(descriptor.required,REQUIRED),'GENERATED_BASE_SEMANTICS');
  need(same(descriptor.engine,engineIdentity),'GENERATED_BASE_ENGINE');hash(descriptor.stateAssetHash);hash(descriptor.stateFingerprint);
  const r={closed:false,scope:null,product:null,contexts:null,model:null,wrapped:null,owner:null,ownerEpoch:null,retirement:null,pending:null};
  active.add(r);
  const assetChecks=new Map();
  function check(nextControl){
   if(nextControl!==undefined){control(nextControl);need(stamp(nextControl.ticket)===originalTicket&&nextControl.signal===c.signal,'GENERATED_BASE_SCOPE_TARGET');}
   control(c);need(stamp(input.control.ticket)===originalTicket,'GENERATED_BASE_TICKET_CHANGED');
   need(!disposed&&!r.closed&&epoch===e,'GENERATED_BASE_RETIRED');
   const now=context();
   need(now?.userId===expected.userId&&now.projectId===expected.projectId&&now.sessionKey===sessionKey&&now.headHash===expected.headHash&&
    now.state?.revision===expected.revision&&stamp(now.state)===stateStamp&&(now.model??null)===currentModel,'GENERATED_BASE_CURRENT_CHANGED');
   need(now.assetsMap instanceof Map,'GENERATED_BASE_ASSET_RETIRED');
   for(const [h,b]of assetChecks)need(bytesEqual(now.assetsMap.get(h),b),'GENERATED_BASE_CURRENT_ASSET_CHANGED',{hash:h});
   if(r.owner)need(r.owner.epoch===r.ownerEpoch,'GENERATED_BASE_RUNTIME_RETIRED');
   if(r.wrapped)need(kernel.kernelLeases.get(r.wrapped)===r.registration,'GENERATED_BASE_MODEL_RETIRED');
  }
  async function close(){
   r.closed=true;if(r.scope)scopes.delete(r.scope);
   if(r.wrapped){kernel.kernelLeases.delete(r.wrapped);modelScopes.delete(r.wrapped);}
   r.retirement?.();r.retirement=null;
   // Retire before any await; a saved bytes()/operation() closure fails at once.
   r.model?.release();r.model=null;
   if(r.pending)return r.pending;
   r.pending=(async()=>{
    try{
     const settled=await Promise.allSettled([r.contexts?.reset(),r.product?.reset()]);
     need(settled.every(x=>x.status==='fulfilled'),'GENERATED_BASE_RELEASE_FAILED');
    }finally{active.delete(r);}
   })();return r.pending;
  }
  r.close=close;
  try{
   need(await domainStateFingerprint(currentState)===expected.headHash,'GENERATED_BASE_CURRENT_HASH');check();
   need(input.assets instanceof Map&&input.assets.size<=MESH_GENERATED_BASE_LIMITS.assets,'GENERATED_BASE_ASSETS');
   const supplied=input.assets,baseAsset=supplied.get(descriptor.stateAssetHash);
   need(baseAsset?.bytes instanceof Uint8Array&&baseAsset.bytes.buffer instanceof ArrayBuffer&&baseAsset.hash===descriptor.stateAssetHash&&
    baseAsset.byteLength===baseAsset.bytes.length&&baseAsset.bytes.length<=MESH_GENERATED_BASE_LIMITS.stateBytes,'GENERATED_BASE_STATE_ASSET');
   const stateBytes=baseAsset.bytes.slice();
   need(await sha256(stateBytes)===descriptor.stateAssetHash,'GENERATED_BASE_STATE_ASSET_HASH');check();
   const saved=validateState(JSON.parse(decode.decode(stateBytes)));
   need(stamp(saved)===decode.decode(stateBytes),'GENERATED_BASE_STATE_ENCODING');
   need(await domainStateFingerprint(saved)===descriptor.stateFingerprint,'GENERATED_BASE_STATE_FINGERPRINT');check();
   need(!saved.content.app.mesh?.applied&&!saved.content.app.mesh?.metadata?.meshCsg,'GENERATED_BASE_DERIVED_FORBIDDEN');
   need(saved.content.app.source&&['svg','raster','text','emoji'].includes(saved.content.app.source.kind),'GENERATED_BASE_SOURCE_REQUIRED');
   need(same(generatedRecipe(currentState,saved),generatedRecipe(saved,saved)),'GENERATED_BASE_RECIPE_CHANGED');
   const mesh=currentState.content.app.mesh,recipe=mesh?.metadata?.meshCsg;
   if(input.mode==='replay'){
    need(mesh?.applied===true&&recipe?.version==='arch-mesh-replay/1'&&recipe.status==='approved-recipe'&&same(recipe.generatedBase,descriptor),'GENERATED_BASE_REPLAY_BINDING');
    need(mesh.assetHashes.includes(descriptor.stateAssetHash),'GENERATED_BASE_STATE_UNREFERENCED');
    need(bytesEqual(live.assetsMap.get(descriptor.stateAssetHash),stateBytes),'GENERATED_BASE_CURRENT_ASSET_CHANGED');
    assetChecks.set(descriptor.stateAssetHash,stateBytes);
   }else need(!mesh?.applied&&!recipe||mesh?.applied===true&&recipe?.version==='arch-mesh-replay/1'&&recipe.status==='approved-recipe','GENERATED_BASE_PREPARE_REQUIRES_UNAPPLIED_OR_REAPPLY');
   const refs=usedAssets(saved),currentRefs=new Set(usedAssets(currentState)),assets=new Map();
   need(refs.length<=MESH_GENERATED_BASE_LIMITS.assets,'GENERATED_BASE_ASSET_LIMIT');let total=stateBytes.length;
   for(const h of refs){
    hash(h);need(currentRefs.has(h),'GENERATED_BASE_ASSET_UNREFERENCED',{hash:h});
    const a=supplied.get(h);
    need(a?.hash===h&&a.bytes instanceof Uint8Array&&a.bytes.buffer instanceof ArrayBuffer&&a.byteLength===a.bytes.length&&a.byteLength<=MESH_GENERATED_BASE_LIMITS.oneAssetBytes,'GENERATED_BASE_ASSET',{hash:h});
    total+=a.byteLength;need(total<=MESH_GENERATED_BASE_LIMITS.assetBytes,'GENERATED_BASE_ASSET_BUDGET');
    const b=a.bytes.slice();need(bytesEqual(context()?.assetsMap?.get(h),b),'GENERATED_BASE_CURRENT_ASSET_CHANGED',{hash:h});
    assetChecks.set(h,b);need(await sha256(b)===h,'GENERATED_BASE_ASSET_HASH',{hash:h});check();assets.set(h,b);
    if(input.mode==='replay')need(mesh.assetHashes.includes(h),'GENERATED_BASE_REPLAY_ASSET_REFERENCE');
   }
   const state=freeze(projectExecution(saved,currentState.revision)),projectedFingerprint=await domainStateFingerprint(state);check();
   const entries=domain.effectiveEntries(saved),currentEntries=domain.effectiveEntries(currentState);
   const replacedRecipeHash=input.mode==='prepare'&&recipe?await sha256(stamp(recipe)):null;check();
   const provenance=freeze({version:MESH_GENERATED_BASE_VERSION,purpose:'generated-operand-only',mode:input.mode,replacedRecipeHash,base:descriptor,savedRevision:saved.revision,
    current:{userId:expected.userId,projectId:expected.projectId,revision:expected.revision,headHash:expected.headHash},projectedFingerprint,
    delegatedImportFields:IMPORT_FIELDS.map(id=>({id,saved:entries[id]===undefined?null:copy(entries[id]),current:currentEntries[id]===undefined?null:copy(currentEntries[id])})),
    projection:{revision:'current-authority',mesh:'omitted-generated-stage',importParameters:'catalog-defaults-generated-stage-only'},
    source:{id:saved.content.app.source.id,revision:saved.content.app.source.revision,rawHash:saved.content.app.source.raw.hash},
    sourceAssetHashes:[...refs].sort(),geometryChanges:[],requiresImportedCSG:true,qualifiedCSG:false});
   const token=Object.freeze({}),delegation=Object.freeze({state,currentState,headHash:expected.headHash,provenance,assertCurrent:check});
   const authority=value=>{need(value===token,'GENERATED_BASE_TOKEN');check();return delegation;};
   r.owner=await kernel.ensureRuntime(c);r.ownerEpoch=r.owner.epoch;check();
   const versions=r.owner.serviceCapabilities?.geometryVersions;
   need(versions?.mechanicsAbi===2&&versions.mechanicsSemantics===3&&versions.sourceAbi===1&&versions.sourceSemantics===2&&
    versions.datumExtension===1&&r.owner.serviceCapabilities?.sourceFrameVersion===1,'GENERATED_BASE_RUNTIME_VERSIONS');
   need(Number.isSafeInteger(r.ownerEpoch),'GENERATED_BASE_RUNTIME_EPOCH');
   if(typeof r.owner.onRetirement==='function')r.retirement=r.owner.onRetirement(()=>{void close().catch(()=>{});});
   async function operation(invoke){
    check();need(typeof invoke==='function','GENERATED_BASE_OPERATION');
    return kernel.operation(c,async(client,generation)=>{check();need(client===r.owner&&client.epoch===r.ownerEpoch,'GENERATED_BASE_RUNTIME_RETIRED');return invoke(client,generation);});
   }
   const scopedKernel={operation:(_c,invoke)=>operation(invoke),ensureRuntime:async()=>{check();return r.owner;}};
   r.contexts=createProductSourceContexts({kernel:scopedKernel,sources,context,generatedBaseAuthority:authority});
   r.product=createProductAdapters({operation:(_c,invoke)=>operation(invoke),kernelLeases:kernel.kernelLeases,context,
    withPreparedSource:r.contexts.withPreparedSource,generatedBaseAuthority:authority});
   r.model=await r.product.engine.build({...c,state,assets,generatedBase:token});check();
   const native=kernel.kernelLeases.get(r.model);
   need(native?.client===r.owner&&native.root.epoch===r.ownerEpoch,'GENERATED_BASE_MODEL_OWNER');
   const inspection=await r.product.inspectModel({model:r.model,control:c});check();
   need(inspection.head.headHash===expected.headHash&&inspection.head.revision===String(expected.revision)&&inspection.gates.nativeBuildAccepted&&
    !inspection.gates.exportBlocked&&same(inspection.semantics.provenance.generatedBase,provenance),'GENERATED_BASE_NATIVE_BINDING');
   const internal=r.model;
   r.wrapped=Object.freeze({...internal,kind:'generated-base',generatedBaseOnly:true,
    bytes(){check();return internal.bytes();},release(){return close();}});
   r.registration=native;kernel.kernelLeases.set(r.wrapped,native);
   const binding=freeze({...provenance,runtime:{mechanicsAbi:2,mechanicsSemantics:3,sourceAbi:1,sourceSemantics:2,datumExtension:1,sourceFrame:1},
    nativeHead:copy(inspection.head),contextHash:inspection.contextHash,modelLeaseId:r.wrapped.leaseId});
   r.scope=Object.freeze({version:MESH_GENERATED_BASE_VERSION,model:r.wrapped,inspection,binding,exportDescriptor:inspection.exportDescriptor,check,assertCurrent:check,operation,release:close});
   scopes.set(r.scope,{r,control:c,check});modelScopes.set(r.wrapped,r.scope);
   check();
   return r.scope;
  }catch(error){await close();throw error;}
 }
 async function withBase(input,consume){
  need(typeof consume==='function','GENERATED_BASE_CONSUMER');
  const scope=await open(input);
  // The consumer owns durable acknowledgement semantics. Its successful CSG
  // adoption can intentionally change the live head; cleanup is not publication.
  try{return await consume(scope);}finally{await scope.release();}
 }
 async function prepare(input){
  keys(input,['control','savedBaseState','currentState','assets','mode'],['control','savedBaseState','assets']);
  control(input.control);need(input.assets instanceof Map,'GENERATED_BASE_ASSETS');
  if(input.currentState!==undefined)need(same(input.currentState,context()?.state),'GENERATED_BASE_CURRENT_CHANGED');
  const saved=validateState(copy(input.savedBaseState)),bytes=encode.encode(stamp(saved));
  need(bytes.length<=MESH_GENERATED_BASE_LIMITS.stateBytes,'GENERATED_BASE_STATE_ASSET');
  const stateAssetHash=await sha256(bytes),stateFingerprint=await domainStateFingerprint(saved);
  const base={version:'arch-generated-base-replay/1',stateAssetHash,stateFingerprint,engine:engineIdentity,required:REQUIRED};
  const assets=new Map(input.assets);const existing=assets.get(stateAssetHash);
  if(existing)need(existing.hash===stateAssetHash&&existing.byteLength===bytes.length&&bytesEqual(existing.bytes,bytes),'GENERATED_BASE_STATE_ASSET_HASH');
  else assets.set(stateAssetHash,{hash:stateAssetHash,bytes,byteLength:bytes.length,kind:'dependency'});
  const mode=input.mode??(context()?.state?.content.app.mesh?.applied?'replay':'prepare');
  return open({control:input.control,mode,base,assets});
 }
 function verifyGeneratedBase({model,control:c}){
  const scope=modelScopes.get(model);need(scope,'GENERATED_BASE_MODEL_UNREGISTERED');
  return assertScope(scope,{model,control:c});
 }

 function assertScope(scope,{control:c,model}){
  const record=scopes.get(scope);need(record&&record.r.scope===scope,'GENERATED_BASE_SCOPE');
  control(c);need(same(c.ticket,record.control.ticket)&&c.signal===record.control.signal&&model===scope.model,'GENERATED_BASE_SCOPE_TARGET');
  record.check();return scope.binding;
 }
 async function reset(){epoch++;const settled=await Promise.allSettled([...active].map(r=>r.close()));need(settled.every(r=>r.status==='fulfilled'),'GENERATED_BASE_RELEASE_FAILED');}
 async function dispose(){disposed=true;await reset();}
 return Object.freeze({version:MESH_GENERATED_BASE_VERSION,prepare,withBase,verifyGeneratedBase,assertScope,reset,dispose});
}
