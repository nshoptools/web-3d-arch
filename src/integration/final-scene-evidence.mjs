import {captureMeshSceneSemantics,verifyMeshSceneSemantics} from '../mesh-import/src/scene-evidence.mjs';
import {readArchSnapshot} from '../viewport/arch-view.mjs';
import {sha256 as hashText} from '../domain/hash.mjs';
import {canonicalJSON,sha256} from '../storage/common.mjs';
import {createMeshQualificationClient} from '../core/mesh-qualification-client.mjs';
import {MESH_QUALIFIER_VERSION,DEFAULT_MESH_LIMITS} from '../core/mesh-qualification.mjs';
export const FINAL_SCENE_VERSION='arch-final-scene-evidence/1';
const APP='arch-app-adapters/1',hashPattern=/^[a-f0-9]{64}$/;
export class FinalSceneError extends Error {constructor(code){super(code);this.name='FinalSceneError';this.code=code;}}
const need=(v,c)=>{if(!v)throw new FinalSceneError(c);};
const hash=(v)=>{need(typeof v==='string'&&hashPattern.test(v),'SCENE_HASH');return v;};
const text=(v)=>{need(typeof v==='string'&&v.length>0&&v.length<=240&&!/[\u0000-\u001f]/u.test(v),'SCENE_ID');return v;};
const integer=(v,min=0)=>{need(Number.isSafeInteger(v)&&v>=min&&v<=0xffffffff,'SCENE_INTEGER');return v;};
const json=v=>canonicalJSON(v);
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const unavailable=(code,verdict='unverified')=>freeze({status:'unverified',reasonCode:code,reason:code.replaceAll('_',' ').toLowerCase(),verdict});
const bytesEqual=(a,b)=>a instanceof Uint8Array&&b instanceof Uint8Array&&a.length===b.length&&a.every((v,i)=>v===b[i]);
function control(c){need(c?.version===APP&&c.ticket&&typeof c.signal?.addEventListener==='function'&&typeof c.onProgress==='function','SCENE_CONTROL');need(!c.signal.aborted,'CANCELLED');}
function authority(c){
 need(c&&c.state&&c.model&&c.sessionKey!==undefined&&c.sessionKey!==null,'SCENE_CONTEXT_UNAVAILABLE');
 return {userId:text(c.userId),projectId:text(c.projectId),revision:integer(c.state.revision,1),headHash:hash(c.headHash),sessionKey:c.sessionKey,model:c.model,stateStamp:json(c.state)};
}
function gatesFor(get,c,i){
 const g=get(c,i);need(g&&typeof g==='object'&&!Array.isArray(g)&&[Object.prototype,null].includes(Object.getPrototypeOf(g)),'SCENE_GATES_UNKNOWN');
 need(Object.keys(g).every(k=>['key','invalidInput','kernelFailure','assemblyView','unappliedMeshEdit','projectScheduleHash'].includes(k)),'SCENE_GATES_SCHEMA');
 const result={key:text(g.key)};
 for(const k of ['invalidInput','kernelFailure','assemblyView','unappliedMeshEdit']){need(Object.hasOwn(g,k)&&typeof g[k]==='boolean','SCENE_GATES_UNKNOWN');result[k]=g[k];}
 if(g.projectScheduleHash!==undefined){
  need(typeof g.projectScheduleHash==='string'&&/^sha256:[a-f0-9]{64}$/.test(g.projectScheduleHash),'SCENE_SCHEDULE_HASH');
  result.projectScheduleHash=g.projectScheduleHash;
 }
 return result;
}
function mappingFor(get,c,i){
 const rows=get(c,i);need(Array.isArray(rows)&&rows.length>0&&rows.length<=256,'SCENE_MATERIAL_BINDINGS');
 const ids=new Map(),numbers=new Set();
 for(const row of rows){
  need(row&&Object.keys(row).length===2&&Object.hasOwn(row,'materialId')&&Object.hasOwn(row,'materialSourceId'),'SCENE_MATERIAL_BINDINGS');
  const id=text(row.materialId),n=integer(row.materialSourceId,1);need(!ids.has(id)&&!numbers.has(n),'SCENE_MATERIAL_BINDINGS');ids.set(id,n);numbers.add(n);
 }
 const parts=i.exportDescriptor?.parts;need(Array.isArray(parts)&&parts.length>0&&parts.length<=128,'SCENE_PART_BUDGET');
 need(parts.every(p=>ids.has(p.materialId)),'SCENE_MATERIAL_BINDINGS');
 const tableBody={version:'arch-material-source-table/1',scope:'exact-project-head',projectId:c.projectId,headHash:c.headHash,revision:c.state.revision,
  bindings:[...ids].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([materialId,materialSourceId])=>({materialId,materialSourceId}))};
 const table={...tableBody,digest:hashText(json(tableBody))};
 const selected=parts.map((p,n)=>{
  need(p.partIndex===n&&Array.isArray(p.sourceSemanticIds)&&p.sourceSemanticIds.length>0&&p.sourceSemanticIds.length<=128,'SCENE_PART_MAPPING');
  need(p.slot<=64,'SCENE_MATERIAL_SLOT');
  return {partIndex:n,sourceIndex:integer(p.sourceIndex),slot:integer(p.slot,1),rgba:integer(p.rgba),materialSourceId:ids.get(p.materialId),
   semanticId:text(p.id),materialId:text(p.materialId),sourceSemanticIds:p.sourceSemanticIds.map(text),...(p.materialProvenanceId!==undefined?{materialProvenanceId:text(p.materialProvenanceId)}:{})};
 });
 return {parts:selected,table};
}
function materialReadbackMapping(bytes,metadata,inputParts){
 const arch=readArchSnapshot(bytes),rows=metadata.groups;
 need(metadata.grouping==='slot-rgba-materialSource/1'&&metadata.coordinateFrame==='source-manufacturing-mm'&&metadata.sourceUnchanged===true&&metadata.meshVerdict==='unverified','SCENE_GEOMETRY_MAPPING');
 need(arch.generation===metadata.sourceSnapshotGeneration,'SCENE_GEOMETRY_GENERATION');
 need(Array.isArray(rows)&&rows.length===arch.parts.length&&rows.length>0&&rows.length<=128,'SCENE_GEOMETRY_MAPPING');
 const covered=new Set(),keys=new Set();
 return rows.map((row,index)=>{
  need(row&&Object.keys(row).length===6&&['part','slot','rgba','materialSource','inputParts','sourceIndices'].every(k=>Object.hasOwn(row,k)),'SCENE_GEOMETRY_MAPPING');
  // AFGM/1 ARCH sourceIndex is a private output group ordinal. The actual
  // filament slot and full material-source identity come only from this row.
  need(row.part===index&&arch.parts[index].sourceIndex===index&&row.rgba===arch.parts[index].color,'SCENE_GEOMETRY_MAPPING');
  const key={slot:integer(row.slot,1),rgba:integer(row.rgba),materialSourceId:integer(row.materialSource)};
  need(key.slot<=64,'SCENE_GEOMETRY_MAPPING');
  const identity=key.slot+':'+key.rgba+':'+key.materialSourceId;need(!keys.has(identity),'SCENE_GEOMETRY_MAPPING');keys.add(identity);
  need(Array.isArray(row.inputParts)&&row.inputParts.length>0&&row.inputParts.length<=128&&Array.isArray(row.sourceIndices)&&row.sourceIndices.length===row.inputParts.length,'SCENE_GEOMETRY_MAPPING');
  for(const [j,n] of row.inputParts.entries()){
   need(Number.isInteger(n)&&n>=0&&n<inputParts.length&&!covered.has(n),'SCENE_GEOMETRY_MAPPING');covered.add(n);
   const p=inputParts[n];need(p.slot===key.slot&&p.rgba===key.rgba&&p.materialSourceId===key.materialSourceId&&row.sourceIndices[j]===p.sourceIndex,'SCENE_GEOMETRY_MAPPING');
  }
  if(index===rows.length-1)need(covered.size===inputParts.length,'SCENE_GEOMETRY_MAPPING');
  return {partIndex:index,archSourceIndex:index,materialKey:key,inputPartIndices:[...row.inputParts],inputSourceIndices:[...row.sourceIndices]};
 });
}
/** Production evidence sidecar. Inspector and callbacks are trusted composition
 * bindings. Imported documents cannot inject a ready evidence record. */
export function createFinalSceneEvidence({kernelLeases,inspectModel,operation,context,gateState,materialSourceIds,workerURL,onChange=()=>{},validationClient=null}={}){
 need(kernelLeases instanceof WeakMap&&[inspectModel,operation,context,gateState,materialSourceIds,onChange].every(f=>typeof f==='function'),'SCENE_BINDINGS');
 let client=validationClient,epoch=0,cache=new WeakMap();const jobs=new Set();
 // validationClient is an explicit test/deployment transport injection. Default
 // always runs the actual validator Worker; no pass-producing fallback exists.
 const checker=()=>client??=createMeshQualificationClient({workerURL});
 function stateFor(model){
  const c=context(),a=authority(c);need(a.model===model,'SCENE_MODEL_NOT_VISIBLE');
  const r=kernelLeases.get(model);need(r?.root&&r.client&&!r.client.disposed,'SCENE_MODEL_UNOWNED');
  need(model.generation===r.root.generation&&r.root.epoch===r.client.epoch,'SCENE_MODEL_RETIRED');
  need(model.ticket?.userId===a.userId&&model.ticket?.projectId===a.projectId&&model.ticket?.revision===a.revision,'SCENE_MODEL_STALE');
  need(bytesEqual(model.bytes(),r.root.bytes()),'SCENE_MODEL_BYTES');return {c,a,r};
 }
 function check(s,{bytes=true}={}){
  need(s.epoch===epoch&&!s.abort.signal.aborted,'SCENE_RETIRED');
  const now=stateFor(s.model);
  need(now.r===s.r&&Object.keys(s.a).every(k=>now.a[k]===s.a[k]),'SCENE_CONTEXT_CHANGED');
  if(s.inspection){
   need(json(gatesFor(gateState,now.c,s.inspection))===s.gateStamp,'SCENE_GATES_CHANGED');
   need(json(mappingFor(materialSourceIds,now.c,s.inspection))===s.mappingStamp,'SCENE_MATERIALS_CHANGED');
  }
  if(bytes&&s.bytes)need(bytesEqual(now.r.root.bytes(),s.bytes),'SCENE_BYTES_CHANGED');
  if(s.meshStamp)verifyMeshSceneSemantics(s.r.root,s.meshStamp);
  if(s.semanticBytes)need(bytesEqual(s.r.root.metadata?.semanticBytes,s.semanticBytes)&&bytesEqual(s.r.root.metadata?.descriptor,s.descriptorBytes),'SCENE_METADATA_CHANGED');
  return now;
 }
 const notify=()=>{try{onChange();}catch{/* notifications do not create evidence */}};
 function describe(record,c){
  try{
   const a=authority(c),s=cache.get(a.model);need(s&&s.r===record,'SCENE_NOT_QUALIFIED');
   const live=check(s);need(c.model===live.c.model&&Object.keys(s.a).every(k=>a[k]===s.a[k]),'SCENE_CONTEXT_CHANGED');
   return s.evidence;
  }catch(e){if(c?.model)cache.delete(c.model);return unavailable(e.code??'SCENE_EVIDENCE_UNAVAILABLE');}
 }
 async function qualify({model,control:incoming}){
  control(incoming);need(jobs.size===0,'SCENE_QUALIFICATION_BUSY');const inputSignal=incoming.signal,onProgress=incoming.onProgress;
  const initial=stateFor(model),ticket=freeze(structuredClone(incoming.ticket));
  need(ticket.userId===initial.a.userId&&ticket.projectId===initial.a.projectId&&ticket.revision===initial.a.revision,'SCENE_TICKET');
  const abort=new AbortController(),cancel=()=>abort.abort(),s={...initial,model,abort,epoch,ticket};
  s.finished=new Promise(resolve=>{s.finish=resolve;});
  inputSignal.addEventListener('abort',cancel,{once:true});jobs.add(s);cache.delete(model);
  const c={version:APP,ticket,signal:abort.signal,onProgress};
  const jobCheck=()=>{control(c);need(json(incoming.ticket)===json(ticket),'SCENE_TICKET_CHANGED');return check(s);};
  try{
   const inspected=await inspectModel({model,control:c});jobCheck();s.inspection=freeze(structuredClone(inspected));
   const i=s.inspection;need(['arch-product-model-state/1','arch-mesh-model-state/1'].includes(i.version)&&i.modelLeaseId===model.leaseId,'SCENE_INSPECTION');
   need(i.head?.headHash===s.a.headHash&&i.head.revision===String(s.a.revision),'SCENE_NATIVE_HEAD');
   need(i.snapshot?.id===s.r.root.id&&i.snapshot.epoch===s.r.root.epoch&&i.snapshot.generation===s.r.root.generation,'SCENE_NATIVE_SNAPSHOT');
   need(i.semantics?.mechanicsSemantics===3&&i.semantics?.sourceSemantics===2,'SCENE_SEMANTICS_UNQUALIFIED');
   need(i.gates?.matchingHead===true&&i.gates.nativeBuildAccepted===true&&i.gates.sourceVerdict===0&&i.gates.mechanicsVerdict===0&&i.gates.exportBlocked===false,'SCENE_UPSTREAM_BLOCKED');
   const g=gatesFor(gateState,s.c,i),materialBinding=mappingFor(materialSourceIds,s.c,i),parts=materialBinding.parts;s.gateStamp=json(g);s.mappingStamp=json(materialBinding);
   need(!g.invalidInput&&!g.kernelFailure&&!g.assemblyView&&!g.unappliedMeshEdit,'SCENE_UPSTREAM_BLOCKED');
   const raw=s.r.root.bytes();need(raw.length<=DEFAULT_MESH_LIMITS.bytes,'MESH_BYTE_BUDGET');need(raw.length>=128&&new DataView(raw.buffer,raw.byteOffset,raw.byteLength).getUint32(16,true)===s.r.root.generation,'SCENE_ARCH_GENERATION');s.bytes=raw.slice();
   if(i.version==='arch-mesh-model-state/1')s.meshStamp=captureMeshSceneSemantics(s.r.root,i);
   else{
    need(s.r.root.metadata?.semanticBytes instanceof Uint8Array&&s.r.root.metadata?.descriptor instanceof Uint8Array,'SCENE_METADATA_BYTES');
    s.semanticBytes=s.r.root.metadata.semanticBytes.slice();s.descriptorBytes=s.r.root.metadata.descriptor.slice();
   }
   s.snapshotSha256=await sha256(s.bytes);jobCheck();
   c.onProgress({stage:'qualify-snapshot',progress:null});
   const snapshot=await checker().check(s.bytes,{signal:c.signal});jobCheck();
   need(snapshot?.version===MESH_QUALIFIER_VERSION&&['pass','fail','unverified'].includes(snapshot.verdict),'SCENE_CHECKER_PROTOCOL');
   let union=null,unionSha256=null,unionFormat=null,unionMethod=null,unionAnalysisParts=null,materialReadback=null,materialReadbackSha256=null,materialReadbackParts=null,meshVerdict=snapshot.verdict;
   if(meshVerdict==='pass'){
    if(s.r.client.serviceCapabilities?.finalSceneGeometry!==true&&s.r.client.serviceCapabilities?.finalExport!==true)meshVerdict='unverified';
    else{
     c.onProgress({stage:'qualify-union',progress:null});
     const artifact=await operation(c,(current,generation)=>{
      jobCheck();need(current===s.r.client,'SCENE_RUNTIME_CHANGED');
      const mapping=parts.map(p=>({part:p.partIndex,slot:p.slot,rgba:p.rgba,source:p.sourceIndex,materialSource:p.materialSourceId}));
      if(current.serviceCapabilities?.finalSceneGeometry===true){
       need(typeof current.finalSceneGeometry==='function','SCENE_UNION_CAPABILITY');unionFormat='ARCH/1';
       return current.finalSceneGeometry(s.r.root,{revision:String(s.a.revision),expectedRevision:String(s.a.revision),mapping},{generation});
      }
      need(typeof current.finalExport==='function','SCENE_RUNTIME_CHANGED');unionFormat='STL/binary';
      return current.finalExport(s.r.root,{format:1,gates:0,verdict:0,inspection:1,revision:String(s.a.revision),expectedRevision:String(s.a.revision),
       filename:'internal-qualification.stl',mapping:parts.map(p=>({part:p.partIndex,slot:p.slot,rgba:p.rgba,source:p.sourceIndex,materialSource:p.materialSourceId})),
       orientation:0,rest:0,error:.004},{generation});
     });jobCheck();
     need(artifact?.bytes instanceof Uint8Array&&artifact.bytes.length<=DEFAULT_MESH_LIMITS.bytes,'SCENE_UNION_BYTES');
     const bytes=artifact.bytes.slice(),metadata=structuredClone(artifact.metadata);need(json(metadata).length<=1024*1024,'SCENE_UNION_METADATA_BUDGET');
     let wholeBytes=null;
     if(unionFormat==='ARCH/1'){
      need(metadata?.version==='arch-final-scene-geometry/1'&&metadata.format==='ARCH/1'&&metadata.geometry==='material-union','SCENE_UNION_METADATA');
      need(metadata.sourceSnapshotSha256===s.snapshotSha256&&metadata.sourceSnapshotId===s.r.root.id&&metadata.sourceSnapshotGeneration===s.r.root.generation&&metadata.revision===String(s.a.revision),'SCENE_UNION_BINDING');
      materialReadbackParts=materialReadbackMapping(bytes,metadata,parts);
      materialReadbackSha256=await sha256(bytes);jobCheck();
      materialReadback=await checker().check(bytes,{format:'ARCH/1',signal:c.signal});jobCheck();
      need(materialReadback?.version===MESH_QUALIFIER_VERSION&&['pass','fail','unverified'].includes(materialReadback.verdict),'SCENE_CHECKER_PROTOCOL');
      meshVerdict=materialReadback.verdict==='pass'?'unverified':materialReadback.verdict;
      if(materialReadback.verdict==='pass'){
       if(materialReadbackParts.length===1){
        // The single material group already covers every original part.
        wholeBytes=bytes;union=materialReadback;unionSha256=materialReadbackSha256;unionMethod='afgm-single-material-group/1';
       }else{
        c.onProgress({stage:'qualify-whole-union',progress:null});jobCheck();
        // This key is confined to a second ANALYSIS readback. It is never a
        // filament assignment and cannot replace the inspected real mappings.
        const analysisParts=parts.map(p=>({...p,slot:1,rgba:0xffffffff,materialSourceId:0xffffffff}));
        const analysis=await operation(c,(current,generation)=>{
         jobCheck();need(current===s.r.client&&current.serviceCapabilities?.finalSceneGeometry===true&&typeof current.finalSceneGeometry==='function','SCENE_RUNTIME_CHANGED');
         return current.finalSceneGeometry(s.r.root,{revision:String(s.a.revision),expectedRevision:String(s.a.revision),
          mapping:analysisParts.map(p=>({part:p.partIndex,slot:p.slot,rgba:p.rgba,source:p.sourceIndex,materialSource:p.materialSourceId}))},{generation});
        });jobCheck();
        need(analysis?.bytes instanceof Uint8Array&&analysis.bytes.length<=DEFAULT_MESH_LIMITS.bytes,'SCENE_UNION_BYTES');
        wholeBytes=analysis.bytes.slice();const wholeMetadata=structuredClone(analysis.metadata);
        need(json(wholeMetadata).length<=1024*1024,'SCENE_UNION_METADATA_BUDGET');
        need(wholeMetadata?.version==='arch-final-scene-geometry/1'&&wholeMetadata.format==='ARCH/1'&&wholeMetadata.geometry==='material-union','SCENE_UNION_METADATA');
        need(wholeMetadata.sourceSnapshotSha256===s.snapshotSha256&&wholeMetadata.sourceSnapshotId===s.r.root.id&&wholeMetadata.sourceSnapshotGeneration===s.r.root.generation&&wholeMetadata.revision===String(s.a.revision),'SCENE_UNION_BINDING');
        unionAnalysisParts=materialReadbackMapping(wholeBytes,wholeMetadata,analysisParts);
        need(unionAnalysisParts.length===1,'SCENE_UNION_LAYOUT');
        unionMethod='afgm-neutral-analysis-group/1';
       }
      }
     }else{
      wholeBytes=bytes;unionMethod='legacy-stl-inspection/1';unionSha256=await sha256(bytes);jobCheck();
      need(metadata?.sourceSnapshotSha256===s.snapshotSha256&&metadata.sourceSnapshotGeneration===s.r.root.generation&&metadata.sourceProjectRevision===String(s.a.revision),'SCENE_UNION_BINDING');
      need(metadata.download?.sha256===unionSha256&&metadata.download.bytes===bytes.length&&metadata.format==='stl-union','SCENE_UNION_METADATA');
     }
     if(wholeBytes&&(!materialReadback||materialReadback.verdict==='pass')){
      unionSha256??=await sha256(wholeBytes);jobCheck();
      union??=await checker().check(wholeBytes,{format:unionFormat,signal:c.signal});jobCheck();
      need(union?.version===MESH_QUALIFIER_VERSION&&['pass','fail','unverified'].includes(union.verdict),'SCENE_CHECKER_PROTOCOL');meshVerdict=union.verdict;
      if(meshVerdict==='pass'&&union.checks?.unionTopology!=='pass')meshVerdict='unverified';
     }
    }
   }
   const sourceHashes=i.exportDescriptor.sourceHashes;need(Array.isArray(sourceHashes)&&sourceHashes.length>0&&sourceHashes.length<=128,'SCENE_SOURCE_HASHES');
   const {key:gateKey,projectScheduleHash,...gates}=g;
   const provenance={version:FINAL_SCENE_VERSION,checker:MESH_QUALIFIER_VERSION,snapshot,materialReadback,materialReadbackSha256,materialReadbackParts,union,unionSha256,unionMethod,unionAnalysisParts,
    unionScope:unionFormat==='ARCH/1'?'independent-binary64-union-readback':'independent-binary32-union-readback',unionGeometryEquivalence:'unverified',globalPipelineErrorMm:null,physicalFit:'unqualified',printerQualification:'unverified',
    sceneKind:i.version==='arch-mesh-model-state/1'?'mesh-scene':'product',postCsgGates:i.semantics?.postCsgGates??null,productContextHash:hash(i.contextHash),gateKey,materialSourceTable:materialBinding.table,mechanicsSemantics:3,sourceSemantics:2};
   const evidence={status:'ready',projectId:s.a.projectId,revision:s.a.revision,headHash:s.a.headHash,
    snapshotId:s.r.root.id,snapshotGeneration:s.r.root.generation,epoch:s.r.root.epoch,snapshotSha256:s.snapshotSha256,gates,meshVerdict,
    sourceHashes:sourceHashes.map(v=>({id:text(v.id),sha256:hash(v.sha256)})),parts,provenance,...(projectScheduleHash?{projectScheduleHash}:{})};
   evidence.key=await sha256(json(evidence));jobCheck();
   s.evidence=freeze(evidence);cache.set(model,s);notify();
   return freeze({version:APP,ticket,evidence:s.evidence});
  }catch(e){cache.delete(model);notify();throw e;}
  finally{inputSignal.removeEventListener('abort',cancel);jobs.delete(s);s.finish();}
 }
 async function reset(){epoch++;cache=new WeakMap();const pending=[...jobs];for(const s of pending)s.abort.abort();await client?.reset();await Promise.all(pending.map(s=>s.finished));notify();}
 return Object.freeze({version:FINAL_SCENE_VERSION,qualify,refresh:qualify,describe,reset,dispose:reset});
}
