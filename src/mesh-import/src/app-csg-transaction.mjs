import {validateState,verifyDocument,appendDocument,commitInventory,usedAssets} from '../../app/documents.mjs';
import {domainStateFingerprint} from '../../storage/history.mjs';
import {candidateHash} from '../../app/proposals.mjs';
import {effectiveEntries,effectiveValues} from '../../domain/index.mjs';
import {canonicalJSON,sha256} from '../../storage/common.mjs';

const encode=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
const copy=x=>structuredClone(x),same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const freeze=x=>{if(x&&typeof x==='object'&&!ArrayBuffer.isView(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const hash=x=>need(typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),'MESH_REPLAY_HASH');
const digest=x=>sha256(encode.encode(canonicalJSON(x)));
const fields=['impOn','impOp','impScale','impX','impY','impZ','impRX','impRY','impRZ','meshJoinTolerance'];
export function meshParameterBindings(state,{transformConvention,transformBinary64LE,resolved}){
 need(typeof transformConvention==='string'&&transformConvention.length>0&&transformConvention.length<=200,'MESH_TRANSFORM_CONVENTION');
 need(/^[0-9a-f]{192}$/.test(transformBinary64LE),'MESH_TRANSFORM_BITS');
 const entries=effectiveEntries(state),values=effectiveValues(state);
 return freeze({version:'arch-mesh-parameter-binding/1',entries:Object.fromEntries(fields.map(k=>[k,copy(entries[k])])),
  values:Object.fromEntries(fields.map(k=>[k,copy(values[k])])),resolved:copy(resolved),transformConvention,transformBinary64LE});
}
function selection(a){
 need(a?.version==='arch-mesh-input-selection/1'&&a.repair==='none'&&a.conditioning==='none','MESH_REPLAY_INTERPRETATION');
 need(['millimeter','centimeter','meter','inch','foot','micron'].includes(a.unit),'MESH_EXPLICIT_UNIT');
 need(Array.isArray(a.transform)&&a.transform.length===12&&a.transform.every(Number.isFinite)&&/^[a-f0-9]{192}$/.test(a.transformBinary64LE),'MESH_TRANSFORM_BITS');
 const bits=Uint8Array.from(a.transformBinary64LE.match(/../g),x=>parseInt(x,16)),d=new DataView(bits.buffer);
 // JSON's zero display cannot carry sign; LE bits remain authoritative.
 for(let i=0;i<12;i++)need(Number.isFinite(d.getFloat64(i*8,true))&&d.getFloat64(i*8,true)===a.transform[i],'MESH_TRANSFORM_BITS');
 need(Array.isArray(a.materials)&&a.materials.length>0&&a.materials.length<=16,'MESH_REPLAY_MATERIALS');
 for(const k of ['sourceNumericId','provenanceNumericId'])need(typeof a[k]==='string'&&/^[1-9][0-9]{0,19}$/.test(a[k]),'MESH_REPLAY_ID');
 for(const k of ['userId','projectId','revision','headHash','nativeReportHash','approved','sourceHash'])need(!Object.hasOwn(a,k),'MESH_REPLAY_AUTHORITY_FIELD');
 return a;
}
function recipeShape(r){
 need(r?.version==='arch-mesh-replay/1'&&r.status==='approved-recipe','MESH_REPLAY_VERSION');
 need(r.generatedBase?.version==='arch-generated-base-replay/1'&&same(r.generatedBase.required,{rootAbi:2,arch:1,mechanicsSemantics:3,sourceSemantics:2,meshRuntime:1}),'MESH_REPLAY_SEMANTICS');
 hash(r.generatedBase.stateAssetHash);hash(r.generatedBase.stateFingerprint);hash(r.original?.sha256);hash(r.input?.approvedInterpretationHash);
 need(['stl','obj'].includes(r.original.format)&&Number.isSafeInteger(r.original.byteLength)&&r.original.byteLength>0&&r.original.byteLength<=64000000,'MESH_REPLAY_ORIGINAL');
 selection(r.input.approval);need(r.input.parser?.unit===r.input.approval.unit,'MESH_REPLAY_UNIT');
 need(r.operation?.version==='arch-mesh-operation-replay/1'&&['union','difference','intersection','import-as-part'].includes(r.operation.command?.operation),'MESH_REPLAY_OPERATION');
 for(const k of ['publication','context','snapshotId','snapshotGeneration','generation','revision','headHash','userId','projectId'])need(!Object.hasOwn(r.operation.command,k),'MESH_REPLAY_RUNTIME_FIELD');
 if(r.operation.targetOptions!==undefined){const rows=r.operation.targetOptions;need(Array.isArray(rows)&&rows.length>0&&rows.length<=128&&new Set(rows.map(p=>p.id)).size===rows.length&&rows.every(p=>typeof p.id==='string'&&p.id.length>0&&p.id.length<=200&&typeof p.label==='string'&&p.label.length<=200&&typeof p.mainBody==='boolean'),'MESH_REPLAY_TARGET_CATALOG');}
 need(r.parameters?.version==='arch-mesh-parameter-binding/1'&&r.parameters.transformBinary64LE===r.input.approval.transformBinary64LE,'MESH_REPLAY_PARAMETERS');
 need(r.operation.command.transform?.length===12&&r.operation.command.transform.every((x,i)=>x===r.input.approval.transform[i]),'MESH_REPLAY_TRANSFORM');
 need(r.operation.sourceHashes?.some(s=>s.id===r.original.sourceId&&s.sha256===r.original.sha256),'MESH_REPLAY_LINEAGE');
 return r;
}
async function asset(map,h){
 hash(h);const a=map.get(h);need(a?.bytes instanceof Uint8Array&&a.byteLength===a.bytes.length,'MESH_REPLAY_ASSET');
 need(await sha256(a.bytes)===h,'MESH_REPLAY_ASSET_HASH');return a;
}
export async function createMeshReplayRecord({original,baseState,assets,engine,parser,approval,command,materialNames,sourceHashes,parameters,targetOptions}){
 need(assets instanceof Map,'MESH_REPLAY_ASSETS');baseState=validateState(copy(baseState));
 need(!baseState.content.app.mesh?.applied&&!baseState.content.app.mesh?.metadata?.meshCsg,'MESH_REPLAY_GENERATED_BASE_ONLY');
 const map=new Map(assets),bytes=encode.encode(canonicalJSON(baseState)),stateAssetHash=await sha256(bytes);
 need(bytes.length<=2*1024*1024,'MESH_REPLAY_STATE_BOUND');map.set(stateAssetHash,{hash:stateAssetHash,kind:'dependency',bytes,byteLength:bytes.length});
 const r={version:'arch-mesh-replay/1',status:'approved-recipe',
  original:{sourceId:original.id,sha256:original.raw.hash,byteLength:original.raw.byteLength,format:original.metadata.meshImport.format},
  generatedBase:{version:'arch-generated-base-replay/1',stateAssetHash,stateFingerprint:await domainStateFingerprint(baseState),engine:copy(engine),
   required:{rootAbi:2,arch:1,mechanicsSemantics:3,sourceSemantics:2,meshRuntime:1}},
  input:{parser:copy(parser),approval:copy(approval),approvedInterpretationHash:await digest({original:original.raw,parser,approval})},
  operation:{version:'arch-mesh-operation-replay/1',command:copy(command),materialNames:copy(materialNames),sourceHashes:copy(sourceHashes),...(targetOptions?{targetOptions:copy(targetOptions)}:{})},parameters:copy(parameters)};
 recipeShape(r);
 const assetHashes=[...new Set([...original.assetHashes,...usedAssets(baseState),stateAssetHash])].sort();
 for(const h of assetHashes)await asset(map,h);
 return {recipe:freeze(r),assetHashes,assets:map};
}
function generatedRecipe(state,base){
 const p=copy(state.parameters);
 for(const key of fields){delete p.common[key];for(const v of Object.values(p.byProduct))delete v[key];}
 const a=state.content.app,baseIds=new Set(base.content.app.materials.map(m=>m.id));
 return {product:state.product,sourceKind:state.sourceKind,schedule:state.schedule,parameters:p,
  source:a.source,text:a.text,fontAssets:a.fontAssets??[],materials:a.materials.filter(m=>baseIds.has(m.id))};
}
export async function replayMeshRequest({state,assets,engine}){
 state=validateState(copy(state));const desc=state.content.app.mesh,r=recipeShape(desc?.metadata?.meshCsg);
 need(desc.applied===true&&r.original.sourceId===desc.id&&r.original.sha256===desc.raw.hash&&r.original.byteLength===desc.raw.byteLength,'MESH_REPLAY_DESCRIPTOR');
 need(same(engine,r.generatedBase.engine),'MESH_REPLAY_ENGINE_CHANGED');
 const baseAsset=await asset(assets,r.generatedBase.stateAssetHash);
 const baseState=validateState(JSON.parse(decode.decode(baseAsset.bytes)));
 need(await domainStateFingerprint(baseState)===r.generatedBase.stateFingerprint,'MESH_REPLAY_BASE_CHANGED');
 need(!baseState.content.app.mesh?.applied&&!baseState.content.app.mesh?.metadata?.meshCsg,'MESH_REPLAY_GENERATED_BASE_ONLY');
 need(same(generatedRecipe(state,baseState),generatedRecipe(baseState,baseState)),'MESH_REPLAY_GENERATED_PARAMETERS_CHANGED');
 for(const h of [r.generatedBase.stateAssetHash,...usedAssets(baseState),desc.raw.hash]){
  need(desc.assetHashes.includes(h),'MESH_REPLAY_ASSET_REFERENCE');await asset(assets,h);
 }
 need(same(r.parameters,meshParameterBindings(state,r.parameters)),'MESH_REPLAY_PARAMETERS_CHANGED');
 need(r.input.approvedInterpretationHash===await digest({original:desc.raw,parser:r.input.parser,approval:r.input.approval}),'MESH_REPLAY_INTERPRETATION_CHANGED');
 const original=await asset(assets,desc.raw.hash),approval=copy(r.input.approval);
 const bits=Uint8Array.from(approval.transformBinary64LE.match(/../g),x=>parseInt(x,16)),d=new DataView(bits.buffer);
 approval.transform=Array.from({length:12},(_,i)=>d.getFloat64(i*8,true));delete approval.version;
 const command=copy(r.operation.command);command.transform=approval.transform.slice();
 return {version:'arch-mesh-replay-request/1',baseState,baseAssetHashes:usedAssets(baseState),source:copy(desc),file:{name:desc.name,bytes:original.bytes.slice()},
  selection:{input:copy(r.input.parser),approval},command,materialNames:copy(r.operation.materialNames),sourceHashes:copy(r.operation.sourceHashes),
  recipe:freeze(copy(r)),requiresFreshGeometryAndGates:true};
}

function validateMaterialRows(state,metadata){
 const names=state.content.app.mesh.metadata.meshCsg.operation.materialNames,table=state.content.app.materials;
 for(const row of metadata.materialLineage){
  const id=names[row.materialId],material=table.find(m=>m.id===id);
  need(material&&!material.excluded&&material.slot===row.slot&&(parseInt(material.color.slice(1)+'ff',16)>>>0)===row.rgba,'MESH_HOST_MATERIAL_CHANGED');
 }
}

/** Real appendDocument + ProjectStore CAS. The host supplies only its authority,
 * final-scene qualification and synchronous installation boundary. */
export async function prepareMeshHostTransaction({current,nextState,assets,engine,preflight,qualifyCandidate,adopt,acceptPruning=false}){
 need([current,preflight,qualifyCandidate,adopt].every(f=>typeof f==='function')&&assets instanceof Map,'MESH_HOST_BINDINGS');
 const c=current();need(c?.document&&c.assets instanceof Map&&c.store&&Number.isSafeInteger(c.headRevision),'MESH_HOST_CAPTURE');
 const captured={...c},before=c.document,baseHash=await domainStateFingerprint(before.state),expected=freeze({userId:c.userId,projectId:c.projectId,revision:String(before.state.revision),headHash:baseHash});
 const state=validateState(copy(nextState));need(state.revision===before.state.revision+1,'MESH_HOST_NEXT_REVISION');
 const ownedAssets=new Map();let total=0;
 for(const [h,a] of assets){need(a?.bytes instanceof Uint8Array,'MESH_HOST_ASSET');total+=a.bytes.length;need(total<=256*1024*1024,'MESH_HOST_ASSET_BUDGET');ownedAssets.set(h,{...a,bytes:a.bytes.slice()});}
 await replayMeshRequest({state,assets:ownedAssets,engine});
 const stateHash=await domainStateFingerprint(state),outputHash=await candidateHash(state,ownedAssets);
 need(stateHash!==baseHash,'MESH_HOST_NO_CONTENT_CHANGE');
 const transactionHash=await digest({version:'arch-mesh-host-intent/1',projectId:c.projectId,expected,nextState:state,assetHashes:[...ownedAssets.keys()].sort()});
 const publication=freeze({version:'arch-mesh-publication/1',revision:String(state.revision),headHash:stateHash,transactionHash});
 const transactionId=crypto.randomUUID();let phase='prepared';
 function live(){
  const n=current();need(n?.store===captured.store&&n.document===before&&n.model===captured.model&&n.assets===captured.assets&&n.userId===captured.userId&&n.projectId===captured.projectId&&n.sessionKey===captured.sessionKey&&n.headRevision===captured.headRevision,'MESH_HOST_STALE');
  return n;
 }
 async function verify(){need(phase==='prepared','MESH_HOST_CONSUMED');live();need(await domainStateFingerprint(before.state)===baseHash&&await candidateHash(state,ownedAssets)===outputHash,'MESH_HOST_OUTPUT_CHANGED');live();return outputHash;}
 async function commitCandidate({control,expected:actual,publication:pub,model,history}){
  need(phase==='prepared','MESH_HOST_CONSUMED');await verify();need(phase==='prepared','MESH_HOST_CONSUMED');phase='committing';
  let durable=false,candidate,input,ack;
  try{
   need(!control.signal?.aborted&&same(expected,actual)&&same(publication,pub),'MESH_HOST_BINDING');
   need(history?.publication?.transactionHash===transactionHash&&history.original?.raw?.hash===state.content.app.mesh.raw.hash,'MESH_HOST_RECEIPT');
   const metadata=model?.mesh;
   need(metadata?.kind==='mesh-scene'&&metadata.revision===publication.revision&&metadata.headHash===publication.headHash&&metadata.postCsgGates?.verdict===0&&!metadata.exportBlocked&&metadata.applied===true,'MESH_HOST_NATIVE_GATE');
   need(metadata.derivedSnapshotHash===await sha256(model.bytes().slice())&&metadata.proposalHash===history.proposalHash,'MESH_HOST_MODEL_HASH');
   validateMaterialRows(state,metadata);await preflight(control);live();
   const qualification=await qualifyCandidate({control,model,state:freeze(copy(state)),headHash:stateHash});
   need(qualification?.status==='ready'&&qualification.meshVerdict==='pass','MESH_HOST_FINAL_SCENE_BLOCKED');live();need(!control.signal?.aborted,'CANCELLED');
   candidate=await appendDocument(before,state,ownedAssets,{type:'mesh.apply',version:1,intentHash:transactionHash,receipt:copy(history)},{acceptPruning});
   await verifyDocument(candidate.document,candidate.assets);live();need(!control.signal?.aborted,'CANCELLED');
   input={projectId:captured.projectId,expectedRevision:captured.headRevision,transactionId,engine:copy(engine),domainSchemaVersion:1,
    document:candidate.document,assets:commitInventory(candidate.document,candidate.assets),provenance:{}};
   try{ack=await captured.store.commit(input,{signal:control.signal});}
   catch(error){
    let loaded;try{loaded=await captured.store.load(captured.projectId);}catch{}
    if(loaded?.status==='editable'&&loaded.head?.transactionId===transactionId&&same(loaded.manifest.document,input.document))ack={head:loaded.head,recovered:true};
    else throw error;
   }
   durable=true;phase='committed';need(ack?.head?.transactionId===transactionId,'MESH_HOST_ACK');
   try{live();}catch{return {committed:true,visible:false,model:null,diagnostic:{code:'COMMITTED_MODEL_UNAVAILABLE',reason:'MESH_HOST_SESSION_CHANGED_AFTER_COMMIT',storeCommitted:true},transactionId,head:ack.head};}
   // NO await after this point. Adopt must perform one synchronous nonthrowing
   // host swap, clear export receipts, and take the primary. It may not emit
   // before installing both document and model or release the new model.
   const adopted=adopt({expected:captured,candidate,model,head:ack.head,transactionId,qualification});
   need(adopted===true,'MESH_HOST_ADOPTION_CONTRACT');
   return {committed:true,visible:true,model,transactionId,head:ack.head};
  }catch(error){
   if(durable)return {committed:true,visible:false,model:null,diagnostic:{code:'COMMITTED_MODEL_UNAVAILABLE',reason:error.code??'MESH_HOST_ADOPTION_FAILED',storeCommitted:true},transactionId,head:ack?.head};
   phase='failed';throw error;
  }
 }
 return Object.freeze({version:'arch-mesh-host-transaction/1',expected,publication,outputHash,nextState:freeze(copy(state)),verify,commitCandidate,
  release(){if(phase==='prepared')phase='released';}});
}

/** Opening a document retains manifest dependencies outside the history. Compare
 * that same retention view on both sides, while preserving every other field. */
export function meshReplayDocumentMatches(stored,current,dependencies){
 need(Array.isArray(dependencies)&&dependencies.every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)),'MESH_REPLAY_DURABLE_DEPENDENCIES');
 const identity=document=>{const d=copy(document);d.retainedAssets=[...new Set([...(d.retainedAssets??[]),...dependencies.filter(h=>!Object.hasOwn(d.history.assets,h))])].sort();return d;};
 return same(identity(stored),identity(current));
}

/** Rebuild an already committed recipe: no history append and no store write. */
export async function createMeshReplayPublication({current,engine,preflight,qualifyCandidate,adopt}){
 const c=current(),state=copy(c.document.state),headHash=await domainStateFingerprint(state);
 const replay=await replayMeshRequest({state,assets:c.assets,engine}),recipeHash=await digest(replay.recipe);
 const expected={userId:c.userId,projectId:c.projectId,revision:String(state.revision),headHash};let used=false;
 function live(){const n=current();need(n?.document===c.document&&n.assets===c.assets&&n.store===c.store&&n.sessionKey===c.sessionKey&&n.headRevision===c.headRevision&&n.model===c.model&&n.userId===c.userId&&n.projectId===c.projectId,'MESH_HOST_STALE');}
 const publishReplay=async({control,expected:a,model,recipeHash:rh})=>{
  need(!used,'MESH_HOST_CONSUMED');used=true;live();need(same(a,expected)&&rh===recipeHash&&!control.signal?.aborted,'MESH_REPLAY_BINDING');
  await preflight(control);live();const loaded=await c.store.load(c.projectId);
  need(loaded.status==='editable'&&loaded.headRevision===c.headRevision&&meshReplayDocumentMatches(loaded.manifest.document,c.document,loaded.manifest.dependencies),'MESH_REPLAY_STALE_DURABLE_HEAD');
  const m=model?.mesh;need(m?.kind==='mesh-scene'&&m.headHash===headHash&&m.revision===String(state.revision)&&m.applied&&!m.exportBlocked&&m.postCsgGates?.verdict===0&&m.derivedSnapshotHash===await sha256(model.bytes().slice()),'MESH_REPLAY_NATIVE_GATE');
  validateMaterialRows(state,m);const qualification=await qualifyCandidate({control,model,state,headHash});live();
  need(qualification?.status==='ready'&&qualification.meshVerdict==='pass'&&!control.signal?.aborted,'MESH_HOST_FINAL_SCENE_BLOCKED');
  need(adopt({expected:c,model,qualification})===true,'MESH_HOST_ADOPTION_CONTRACT');return {committed:true,visible:true,model};
 };
 return {replay,publishReplay,recipeHash};
}
