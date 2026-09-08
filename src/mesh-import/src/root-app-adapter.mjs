import {domainStateFingerprint} from '../../storage/history.mjs';
import {createMeshClient} from './root-client.mjs';
import {decodeSTL} from './stl.mjs';
import {decodeOBJ} from './obj.mjs';
import {readArchSnapshot} from '../../viewport/arch-view.mjs';
import {canonicalJSON,sha256} from '../../storage/common.mjs';
const APP='arch-app-adapters/1',VERSION='arch-root-mesh-adapter/1',encode=new TextEncoder();
const need=(v,code)=>{if(!v)throw Object.assign(new Error(code),{code});};
const freeze=x=>{if(x&&typeof x==='object'&&!ArrayBuffer.isView(x)){for(const y of Object.values(x))freeze(y);Object.freeze(x);}return x;};
const copy=x=>structuredClone(x),stamp=x=>canonicalJSON(x);
const hash=s=>need(typeof s==='string'&&/^[0-9a-f]{64}$/.test(s),'MESH_HASH');
function file(f){
 need(f?.bytes instanceof Uint8Array&&f.bytes.length>0&&f.bytes.length<=64000000,'MESH_SOURCE_BYTE_BOUND');
 need(typeof f.name==='string'&&f.name.length<=255&&!/[\\/\x00-\x1f]/.test(f.name),'MESH_FILENAME');
 const format=/\.(stl|obj)$/i.exec(f.name)?.[1].toLowerCase();need(format,'MESH_FORMAT_UNSUPPORTED');return {format,bytes:f.bytes.slice(),name:f.name};
}
function inventory(f){
 const p=f.format==='stl'?decodeSTL(f.bytes):decodeOBJ(f.bytes);
 return f.format==='stl'?{decoder:p.decoder,encoding:p.encoding,parts:p.groups.map((g,i)=>({index:i,name:g.name,triangles:g.count/3})),sourceMaterials:[],externalLibraries:[]}:
 {decoder:p.decoder,encoding:p.encoding,parts:p.parts.map((g,i)=>({index:i,name:g.name,triangles:g.triangles.length/3})),sourceMaterials:p.materialNames,externalLibraries:p.libraries};
}
/** Composition callbacks are trusted application bindings; file/project JSON
 * cannot provide functions, root handles, module instances or acceptance. */
export function createRootMeshAdapter({operation,kernelLeases,context,commitCandidate,publishReplay=null,verifyGeneratedBase=null}={}){
 need(typeof operation==='function'&&kernelLeases instanceof WeakMap&&typeof context==='function'&&typeof commitCandidate==='function','MESH_APP_BINDINGS');
 const owners=new WeakMap(),live=new Set(),models=new WeakMap();let epoch=0;
 function authority(control,expected=null){
  need(control?.version===APP&&control.ticket&&!control.signal?.aborted&&typeof control.onProgress==='function','MESH_CONTROL');
  const c=context();need(c?.state&&c.sessionKey!==undefined,'MESH_APP_CONTEXT');
  const a={userId:c.userId,projectId:c.projectId,revision:String(c.state.revision),headHash:c.headHash};
  hash(a.headHash);need(a.userId===control.ticket.userId&&a.projectId===control.ticket.projectId&&a.revision===String(control.ticket.revision),'MESH_STALE_CONTEXT');
  if(expected)need(expected.epoch===epoch&&expected.session===c.sessionKey&&stamp(expected.a)===stamp(a)&&expected.state===stamp(c.state)&&expected.model===c.model,'MESH_STALE_CONTEXT');
  return {a,session:c.sessionKey,state:stamp(c.state),model:c.model,epoch};
 }
 function own(r,value){const owned=Object.freeze({...value,release(){if(r.owner===owned)close(r);}});r.owner=owned;owners.set(owned,r);live.add(r);return owned;}
 function get(value,kind,c){const r=owners.get(value);need(r&&r.owner===value&&!r.closed&&r.kind===kind,'MESH_OWNER_RELEASED');authority(c,r);return r;}
 function close(r){if(!r||r.closed)return;r.closed=true;live.delete(r);r.value?.release();r.value=null;}
 async function sourceIngest(input){
  const a=authority(input);need(input.purpose==='mesh'&&input.state?.revision===Number(a.a.revision),'MESH_SOURCE_PURPOSE');
  const sc=input.sourceContext;need(sc?.version==='arch-source-context/1'&&sc.operation==='import'&&typeof sc.id==='string'&&Number.isSafeInteger(sc.revision),'MESH_SOURCE_CONTEXT');
  const f=file(input.file),inv=inventory(f),digest=await sha256(f.bytes);authority(input,a);
  return freeze({version:APP,ticket:copy(input.ticket),kind:'mesh',metadata:{meshImport:{version:'arch-mesh-ingest/1',format:f.format,
   sourceId:sc.id,sourceRevision:sc.revision,original:{sha256:digest,byteLength:f.bytes.length},inventory:inv,
   unit:null,stage:'unconfigured',sourceOriginal:'read-only',generatedParameters:'unapplied',exportable:false,
   validation:'bounded-parse-only; explicit native input approval required',externalLibraries:'references-only; never fetched'}}});
 }
 async function prepareInput({control,file:inputFile,mesh,selection}){
  const r={...authority(control),kind:'input',closed:false,value:null},f=file(inputFile);
  need(mesh?.raw?.byteLength===f.bytes.length&&mesh.kind==='mesh'&&mesh.name===f.name,'MESH_SOURCE_DESCRIPTOR');
  need(await sha256(f.bytes)===mesh.raw.hash&&mesh.metadata?.meshImport?.original?.sha256===mesh.raw.hash,'MESH_SOURCE_DESCRIPTOR_HASH');authority(control,r);
  need(selection?.input&&Object.keys(selection.input).every(k=>['unit','materials','partMaterialIds','sourceMaterialAssignments','maxErrorMm'].includes(k)),'MESH_INPUT_SELECTION_KEYS');
  r.source=freeze(copy(mesh));
  r.value=await operation(control,async(client,generation)=>{
   r.client=client;r.nativeEpoch=client.epoch;r.mesh=createMeshClient(client);
   return r.mesh.previewImport({context:r.a,input:{...f,sourceId:mesh.id,...copy(selection.input)},selection:copy(selection.approval)},{generation});
  });
  try{
   authority(control,r);need(r.value.state==='approval-required','MESH_INPUT_NOT_READY');
   return own(r,{version:VERSION,stage:'mesh-input',status:'prepared-proposal',proposalHash:r.value.approvalHash,
    proof:freeze({source:r.source,approval:copy(r.value.approval),report:copy(r.value.report)}),preview:r.value.preview,applied:false,
    release:()=>close(r)});
  }catch(e){close(r);throw e;}
 }
 async function approveInput(preview,{control,proposalHash}){
  const r=get(preview,'input',control);need(proposalHash===r.value.approvalHash,'MESH_EXACT_INPUT_APPROVAL_REQUIRED');
  const accepted=await operation(control,(client,generation)=>{need(client===r.client&&client.epoch===r.nativeEpoch,'MESH_RUNTIME_RETIRED');return r.mesh.approveImport(r.value,{context:r.a,approved:true,approvalHash:proposalHash},{generation});});
  r.value=accepted;
  try{authority(control,r);r.kind='prepared';return own(r,{version:VERSION,stage:'approved-input',applied:false,release:()=>close(r)});}catch(e){close(r);throw e;}
 }
 async function prepareApply(prepared,{control,model,command,publication,materialNames,sourceHashes,replayRecord=null}){
  const p=get(prepared,'prepared',control),r={...authority(control),kind:'csg',closed:false,value:null,client:p.client,nativeEpoch:p.nativeEpoch,mesh:p.mesh};
  r.replay=replayRecord!==null;
  if(r.replay){
   const stored=context().state.content?.app?.mesh;
   need(stored?.applied===true&&stamp(stored.metadata?.meshCsg)===stamp(replayRecord),'MESH_REPLAY_RECIPE_CHANGED');
   need(stamp(replayRecord.operation.command)===stamp(command)&&stamp(replayRecord.operation.materialNames)===stamp(materialNames)&&stamp(replayRecord.operation.sourceHashes)===stamp(sourceHashes),'MESH_REPLAY_OPERATION_CHANGED');
   r.recipeHash=await sha256(stamp(replayRecord));r.replayRecord=freeze(copy(replayRecord));
   publication={version:'arch-mesh-publication/1',revision:r.a.revision,headHash:r.a.headHash,transactionHash:r.recipeHash};
  }else if(model!==r.model){need(typeof verifyGeneratedBase==='function','MESH_MODEL_NOT_VISIBLE');await verifyGeneratedBase({model,control});authority(control,r);}
  const generated=kernelLeases.get(model);need(generated?.root&&generated.client===p.client,'MESH_GENERATED_ROOT_OWNER');
  need(publication?.version==='arch-mesh-publication/1'&&publication.revision===String(Number(r.a.revision)+(r.replay?0:1)),'MESH_PUBLICATION_REVISION');hash(publication.headHash);hash(publication.transactionHash);
  need(Array.isArray(sourceHashes)&&sourceHashes.length>0&&sourceHashes.length<=128,'MESH_SOURCE_HASHES');
  sourceHashes.forEach(s=>{need(typeof s.id==='string'&&s.id.length>0,'MESH_SOURCE_ID');hash(s.sha256);});
  need(sourceHashes.some(s=>s.id===p.source.id&&s.sha256===p.source.raw.hash),'MESH_ORIGINAL_SOURCE_LINEAGE');
  need(materialNames&&new Set(Object.values(materialNames)).size===Object.keys(materialNames).length,'MESH_MATERIAL_NAME_COLLISION');
  r.materialNames=freeze(copy(materialNames));r.sourceHashes=freeze(copy(sourceHashes));r.source=p.source;r.publication=freeze(copy(publication));
  r.value=await operation(control,(client,generation)=>{need(client===p.client&&client.epoch===p.nativeEpoch,'MESH_RUNTIME_RETIRED');
   return p.mesh.prepare(generated.root,p.value,{context:r.a,command:{...copy(command),...(r.replay?{}:{publication:r.publication})}},{generation});});
  try{
   authority(control,r);const report=r.value.report;
   need(report.importedSourceHash===p.source.raw.hash&&(r.replay?report.command.publication==null:report.command.publication.transactionHash===publication.transactionHash),'MESH_RESULT_BINDING');
   for(const row of report.materialLineage)need(typeof r.materialNames?.[row.materialId]==='string'&&r.materialNames[row.materialId].length>0,'MESH_EXPLICIT_MATERIAL_NAMES');
   if(r.replay){
    const a=replayRecord.input.approval,b=report.inputApproval;
    for(const key of ['unit','transformBinary64LE','materials','sourceNumericId','provenanceNumericId','repair','conditioning'])need(stamp(a[key])===stamp(b[key]),'MESH_REPLAY_INTERPRETATION_CHANGED');
   }
   r.report=freeze(copy(report));r.hash=r.value.confirmation.proposalHash;
   const proposal=own(r,{version:VERSION,stage:'mesh-csg',status:'prepared-proposal',state:r.value.state,proposalHash:r.hash,
    proof:freeze({report:r.report,qualification:copy(r.value.qualification),publication:r.publication,sourceHashes:r.sourceHashes}),applied:false,
    previewBytes:()=>{need(!r.closed,'MESH_OWNER_RELEASED');return r.value.previewBytes();},
    verify:async c=>{get(proposal,'csg',c);return r.hash;},release:()=>close(r)});return proposal;
  }catch(e){close(r);throw e;}
 }
 function wrap(root,r,control){
  const arch=readArchSnapshot(root.bytes()),metadata=freeze(copy(root.metadata));
  need(metadata.kind==='mesh-scene'&&metadata.applied===true&&!metadata.exportBlocked&&metadata.postCsgGates?.verdict===0,'MESH_NATIVE_PUBLICATION_BLOCKED');
  need(metadata.headHash===r.publication.headHash&&metadata.revision===r.publication.revision,'MESH_PUBLICATION_HEAD');
  const blocks=metadata.materialLineage.map(p=>({id:p.partIdentity??('mesh:'+metadata.proposalHash+':'+p.part),label:(metadata.command.operation==='import-as-part'?'Mesh part ':'CSG part ')+p.part,kind:'other',materialId:r.materialNames[p.materialId]}));
  let released=false;
  const model=Object.freeze({version:APP,ticket:freeze({...copy(control.ticket),revision:Number(metadata.revision),generation:root.generation}),
   generation:root.generation,leaseId:root.epoch+':'+root.id,kind:'mesh-scene',mesh:metadata,blocks:freeze(blocks),
   stats:freeze({widthMm:arch.bounds.size[0],depthMm:arch.bounds.size[1],heightMm:arch.bounds.size[2],triangles:arch.triangles.length/3,materialCount:new Set(blocks.map(b=>b.materialId)).size,verdict:'unverified'}),
   bytes(){need(!released&&r.client.epoch===root.epoch,'MESH_MODEL_RETIRED');return root.bytes();},
   release(){if(!released){released=true;kernelLeases.delete(model);models.delete(model);root.release();}}
  });
  const record={r,root,metadata,stamp:stamp(root.metadata)};models.set(model,record);kernelLeases.set(model,{root,client:r.client});return model;
 }
 async function confirmApply(proposal,{control,proposalHash}){
  const r=get(proposal,'csg',control);need(proposalHash===r.hash,'MESH_EXACT_CONFIRMATION_MISMATCH');let root,model,accepted=false;
  try{
   root=await operation(control,(client,generation)=>{need(client===r.client&&client.epoch===r.nativeEpoch,'MESH_RUNTIME_RETIRED');return r.mesh.confirm(r.value,{context:r.a,approved:true,proposalHash},{generation});});
   r.value=null;authority(control,r);model=wrap(root,r,control);root=null;
   const history=freeze({version:'arch-mesh-transaction/1',expected:r.a,publication:r.publication,proposalHash:r.hash,
    original:r.source,sourceHashes:r.sourceHashes,inputApproval:r.report.inputApproval,command:r.report.command,
    parentSnapshotHash:r.report.parentSnapshotHash,derivedSnapshotHash:model.mesh.derivedSnapshotHash,postCsgGates:r.report.postCsgGates});
   // The host CAS callback persists its already prepared domain/history and
   // adopts this ONE primary lease. Rejecting must leave document/visible unchanged.
   need(!r.replay||typeof publishReplay==='function','MESH_REPLAY_HOST_REQUIRED');
   const result=r.replay?await publishReplay({control,expected:freeze(copy(r.a)),model,recipeHash:r.recipeHash,history}):
    await commitCandidate({control,expected:freeze(copy(r.a)),publication:r.publication,model,history});
   if(result?.committed===true&&result.visible===false&&result.model===null){model.release();model=null;accepted=true;close(r);return {version:APP,ticket:copy(control.ticket),model:null,history,committed:true,visible:false,diagnostic:result.diagnostic,transactionId:result.transactionId};}
   need(result?.committed===true&&result.model===model,'MESH_TRANSACTION_NOT_COMMITTED');accepted=true;close(r);
   return {version:APP,ticket:copy(control.ticket),model,history,committed:true,visible:true};
  }finally{root?.release();if(!accepted){model?.release();if(r.value===null)close(r);}}
 }
 function recordFor(model){const record=models.get(model);need(record&&kernelLeases.get(model)?.root===record.root,'MESH_MODEL_UNREGISTERED');return record;}
 async function inspectRecord(model,record,checked){
  checked();const {r,root,metadata}=record;
  need(stamp(root.metadata)===record.stamp&&await sha256(model.bytes().slice())===metadata.derivedSnapshotHash,'MESH_MODEL_CHANGED');
  const arch=readArchSnapshot(model.bytes());
  const parts=metadata.materialLineage.map((p,i)=>({id:model.blocks[i].id,partIndex:i,sourceIndex:arch.parts[i].sourceIndex,slot:p.slot,rgba:p.rgba,
   materialId:r.materialNames[p.materialId],sourceSemanticIds:metadata.command.operation==='import-as-part'?[p.partIdentity]:metadata.nativeCsg.sourceRows.map(s=>'operand:'+s.operand+':row:'+s.row),
   // Material identity is shared by all of its parts. p.provenanceId is a
   // geometry/source-row identity and must not split one material into several
   // incompatible export bindings; the full per-part lineage stays in metadata.
   materialProvenanceId:p.materialId}));
  checked();
  return freeze({version:'arch-mesh-model-state/1',modelLeaseId:model.leaseId,head:{headHash:metadata.headHash,revision:metadata.revision},
   snapshot:{id:root.id,generation:root.generation,epoch:root.epoch},contextHash:metadata.proposalHash,
   semantics:{mechanicsSemantics:3,sourceSemantics:2,kind:'mesh-scene',postCsgGates:metadata.postCsgGates,parameterBindings:'preserved-no-rewrite'},
   gates:{matchingHead:true,nativeBuildAccepted:true,sourceVerdict:0,mechanicsVerdict:0,exportBlocked:false},
   exportDescriptor:{parts,sourceHashes:r.sourceHashes},lineageScope:'full recipe contributors; per-face native ancestry retained separately'});

 }
 async function inspectModel({model,control}){
  const record=recordFor(model),a=authority(control),{r,metadata}=record;
  need(a.model===model&&a.a.headHash===metadata.headHash&&a.a.revision===metadata.revision&&r.session===a.session,'MESH_MODEL_STALE');
  return inspectRecord(model,record,()=>authority(control,a));
 }
 async function createCandidateInspection({model,control,state,headHash}){
  const record=recordFor(model),{r,metadata}=record;
  authority(control,r);const saved=freeze(copy(state)),recipe=saved.content?.app?.mesh?.metadata?.meshCsg;
  need(recipe?.version==='arch-mesh-replay/1'&&saved.content.app.mesh.applied===true,'MESH_CANDIDATE_RECIPE');
  need(await domainStateFingerprint(saved)===headHash&&metadata.headHash===headHash&&metadata.revision===String(saved.revision),'MESH_CANDIDATE_TARGET_HEAD');
  need(recipe.original.sha256===metadata.importedSourceHash&&stamp(recipe.operation.materialNames)===stamp(r.materialNames)&&stamp(recipe.operation.sourceHashes)===stamp(r.sourceHashes),'MESH_CANDIDATE_LINEAGE');
  for(const [key,value]of Object.entries(recipe.operation.command))need(stamp(value)===stamp(metadata.command[key]),'MESH_CANDIDATE_COMMAND');
  for(const key of ['unit','transformBinary64LE','materials','sourceNumericId','provenanceNumericId','repair','conditioning'])need(stamp(recipe.input.approval[key])===stamp(metadata.inputApproval[key]),'MESH_CANDIDATE_INTERPRETATION');
  const target=Object.freeze({state:saved,headHash,model,userId:r.a.userId,projectId:r.a.projectId,sessionKey:r.session});
  let released=false;
  const checked=()=>{need(!released,'MESH_CANDIDATE_INSPECTOR_RELEASED');recordFor(model);authority(control,r);};
  checked();
  return Object.freeze({version:'arch-mesh-candidate-inspector/1',
   context(){checked();return target;},
   async inspectModel(input){checked();need(input.model===model&&input.control?.ticket?.userId===target.userId&&input.control.ticket.projectId===target.projectId&&input.control.ticket.revision===saved.revision,'MESH_CANDIDATE_INSPECTION_TARGET');return inspectRecord(model,record,checked);},
   check:checked,release(){released=true;}
  });
 }
 function reset(){epoch++;for(const r of [...live])close(r);}
 return Object.freeze({version:VERSION,source:Object.freeze({version:APP,capabilities:[{id:'source.import-mesh',available:true}],ingest:sourceIngest}),
  prepareInput,approveInput,prepareApply,confirmApply,inspectModel,createCandidateInspection,reset,dispose:reset});
}
