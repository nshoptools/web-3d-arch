import {createFinalSceneEvidence} from '../../integration/final-scene-evidence.mjs';
import {effectiveValues} from '../../domain/index.mjs';
import {sha256 as syncHash} from '../../domain/hash.mjs';
import {canonicalJSON} from '../../storage/common.mjs';
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
/** Deterministic local serialization ordinals; full logical material IDs remain
 * in the table. These are neither filament slots nor native u64 IDs. */
export function meshSceneMaterialBindings(context,inspection){
 const rows=context.state.content.app.materials,names=rows.map(m=>m.id);
 need(names.length<=4096&&new Set(names).size===names.length,'SCENE_MATERIAL_BINDINGS');
 need(inspection.exportDescriptor.parts.every(p=>names.includes(p.materialId)),'SCENE_MATERIAL_UNMAPPED');
 return Object.freeze([...names].sort().map((materialId,index)=>Object.freeze({materialId,materialSourceId:index+1})));
}
export function meshFinalSceneGateState(context,inspection){
 const {state,headHash,model}=context,m=model?.mesh,r=state.content?.app?.mesh?.metadata?.meshCsg,values=effectiveValues(state);
 const {revision,...content}=state;
 need(inspection.version==='arch-mesh-model-state/1'&&inspection.head.headHash===headHash&&syncHash(canonicalJSON(content))===headHash&&inspection.head.revision===String(revision)&&inspection.modelLeaseId===model.leaseId,'SCENE_MESH_GATE_HEAD');
 need(m.kind==='mesh-scene'&&m.applied===true&&!m.exportBlocked&&m.postCsgGates?.verdict===0&&m.postCsgGates.exportBlocked===false&&m.postCsgGates.version==='arch-mesh-post-csg-gates/1','SCENE_MESH_GATE_NATIVE');
 need(m.mechanicsSemantics===3&&m.sourceSemantics===2&&r?.version==='arch-mesh-replay/1'&&state.content.app.mesh.applied===true&&r.original.sha256===m.importedSourceHash,'SCENE_MESH_GATE_RECIPE');
 need(values.impOn===true&&({them:'import-as-part',han:'union',tru:'difference'})[values.impOp]===m.command.operation,'SCENE_MESH_GATE_OPERATION');
 need(canonicalJSON(inspection.exportDescriptor.sourceHashes)===canonicalJSON(r.operation.sourceHashes),'SCENE_MESH_GATE_SOURCES');
 const assemblyView=state.product==='clicky'?values.assemble:state.product==='charm'?values.charmRap:false;
 need(typeof assemblyView==='boolean','SCENE_MESH_GATE_ASSEMBLY');
 return Object.freeze({key:'arch-mesh-scene-gates/1:'+syncHash(canonicalJSON({headHash,revision,snapshotHash:m.derivedSnapshotHash,recipe:r,native:m.postCsgGates})),
  invalidInput:false,kernelFailure:false,assemblyView,unappliedMeshEdit:false,projectScheduleHash:state.schedule.hash});
}
/** Explicit candidate scope. The live controller context is NEVER replaced.
 * The adapter mints the inspector after comparing its actual registered native
 * candidate with the target domain fingerprint and captured live authority. */
export function createMeshCandidateQualification({mesh,kernelLeases,operation,workerURL}){
 need(typeof mesh?.createCandidateInspection==='function'&&kernelLeases instanceof WeakMap&&typeof operation==='function','MESH_CANDIDATE_QUALIFICATION_BINDINGS');
 return async function qualifyCandidate({control,model,state,headHash}){
  const scope=await mesh.createCandidateInspection({control,model,state,headHash});
  const provider=createFinalSceneEvidence({kernelLeases,operation:(_targetControl,invoke)=>{scope.check();return operation(control,invoke);},context:scope.context,inspectModel:scope.inspectModel,
   gateState:meshFinalSceneGateState,materialSourceIds:meshSceneMaterialBindings,workerURL});
  try{
   const result=await provider.qualify({model,control:{...control,ticket:{...control.ticket,revision:state.revision}}});
   scope.check();return result.evidence;
  }finally{scope.release();await provider.dispose();}
 };
}
