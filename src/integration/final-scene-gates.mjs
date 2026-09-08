import {validateProject,effectiveValues,PRODUCT_IDS} from '../domain/index.mjs';
import {sha256 as hashText} from '../domain/hash.mjs';
import {canonicalJSON} from '../storage/common.mjs';
export const FINAL_SCENE_GATES_VERSION='arch-final-scene-gates/1';
export class FinalSceneGateError extends Error {constructor(code){super(code);this.name='FinalSceneGateError';this.code=code;}}
const need=(v,c)=>{if(!v)throw new FinalSceneGateError(c);};
/** Pure parent callback for the current APMS3/source2 product build.
 * Call only with the private product.inspectModel result. No imported gate
 * flags, model.stats or last-job success can replace that inspector authority. */
export function finalSceneGateState(context,inspection){
 const state=validateProject(context?.state),head=context?.headHash,sem=inspection?.semantics,g=inspection?.gates;
 const {revision,...headState}=state;
 need(inspection?.version==='arch-product-model-state/1'&&typeof head==='string'&&/^[a-f0-9]{64}$/.test(head)&&hashText(canonicalJSON(headState))===head&&inspection.head?.headHash===head&&inspection.head.revision===String(revision),'SCENE_GATE_HEAD');
 need(context.model&&inspection.modelLeaseId===context.model.leaseId&&context.model.ticket?.userId===context.userId&&context.model.ticket.projectId===context.projectId&&context.model.ticket.revision===revision,'SCENE_GATE_MODEL');
 need(sem?.schema==='APMS/1'&&sem.mechanicsSemantics===3&&sem.sourceSemantics===2&&sem.revision===String(revision)&&sem.product===PRODUCT_IDS.indexOf(state.product),'SCENE_GATE_NATIVE_VERSION');
 // These false gate conclusions require an explicit accepted current native
 // build. They say nothing about mesh topology, fit or a previous failed job.
 need(g?.matchingHead===true&&g.nativeBuildAccepted===true&&g.sourceVerdict===0&&g.mechanicsVerdict===0&&g.exportBlocked===false,'SCENE_GATE_NATIVE_BLOCKED');
 const app=state.content?.app,source=app?.source;
 need(app&&Object.hasOwn(app,'mesh')&&source&&inspection.source?.id===source.id&&inspection.source.revision===source.revision&&inspection.source.rawHash===source.raw?.hash,'SCENE_GATE_SOURCE');
 const values=effectiveValues(state),rows=sem.parameters;
 need(Array.isArray(rows)&&rows.length>0&&rows.length<=512,'SCENE_GATE_PARAMETERS');
 const actual=field=>{
  const found=rows.filter(p=>p.field===field);need(found.length===1&&found[0].mode===0&&Number.isFinite(found[0].value),'SCENE_GATE_PARAMETERS');
  return found[0].value;
 };
 const assemblyField=state.product==='clicky'?'assemble':state.product==='charm'?'charmRap':null;
 let assemblyView=false;
 if(assemblyField){need(typeof values[assemblyField]==='boolean'&&actual(assemblyField)===(values[assemblyField]?1:0),'SCENE_GATE_ASSEMBLY');assemblyView=values[assemblyField];}
 need(typeof values.impOn==='boolean'&&actual('impOn')===(values.impOn?1:0),'SCENE_GATE_MESH_STATE');
 let unappliedMeshEdit=false;
 if(app.mesh!==null){
  need(app.mesh&&typeof app.mesh==='object'&&typeof app.mesh.applied==='boolean','SCENE_GATE_MESH_STATE');
  unappliedMeshEdit=!app.mesh.applied;
  // Current product/APMS3 declares imported mesh execution unsupported. A mere
  // app.mesh.applied flag cannot certify a future CSG composition.
  if(app.mesh.applied&&values.impOn)throw new FinalSceneGateError('SCENE_GATE_APPLIED_MESH_BINDING_REQUIRED');
 }
 // The exact native head binds the complete schedule (including origin/profile).
 // Additionally compare actual APMS regular-height input and first boundary.
 const schedule=state.schedule,bounds=sem.layerBoundaries;
 need(actual('layerH')===schedule.layerHeight&&Array.isArray(bounds)&&bounds.length>=2&&bounds.length<=1000001&&bounds[0]===0&&bounds[1]===schedule.firstLayerHeight,'SCENE_GATE_BUILD_SCHEDULE');
 const evidence={version:FINAL_SCENE_GATES_VERSION,projectId:context.projectId,revision,headHash:head,snapshot:inspection.snapshot,
  nativeContextHash:inspection.contextHash,source:inspection.source,assemblyField,assemblyView,
  mesh:app.mesh===null?null:{id:app.mesh.id,revision:app.mesh.revision,rawHash:app.mesh.raw?.hash,applied:app.mesh.applied,enabled:values.impOn},
  projectScheduleHash:schedule.hash};
 return Object.freeze({key:FINAL_SCENE_GATES_VERSION+':'+hashText(canonicalJSON(evidence)),
  invalidInput:false,kernelFailure:false,assemblyView,unappliedMeshEdit,projectScheduleHash:schedule.hash});
}
