import {effectiveValues} from '../domain/index.mjs';
import {canonicalJSON,sha256} from '../storage/common.mjs';
import {validateState} from '../app/documents.mjs';
import {createRootMeshAdapter} from '../mesh-import/src/root-app-adapter.mjs';
import {createMeshCandidateQualification} from '../mesh-import/src/candidate-qualification.mjs';
import {createMeshReplayRecord,meshParameterBindings,prepareMeshHostTransaction,createMeshReplayPublication} from '../mesh-import/src/app-csg-transaction.mjs';
import {matrixBinary64LE} from '../mesh-import/src/root-runtime.mjs';
import {meshOperationForParameters} from '../mesh-import/src/operation.mjs';

const need=(v,code)=>{if(!v)throw Object.assign(new Error(code),{code});};
const copy=x=>structuredClone(x),same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const UNITS={millimeter:'mm',centimeter:'cm',meter:'m',inch:'inch',foot:'foot',micron:'µm'};
const FIELDS=['impOn','impOp','impScale','impX','impY','impZ','impRX','impRY','impRZ','meshJoinTolerance'];
function generatedShape(state){const s=copy(state);delete s.revision;delete s.content.app.mesh;delete s.content.app.name;delete s.content.app.editor;delete s.content.app.exportOptions;delete s.content.app.printerId;for(const rows of [s.parameters.common,...Object.values(s.parameters.byProduct)])for(const key of FIELDS)delete rows[key];return s;}
// source:body/source:slab:<u64> are native mechanics feature identities
// (ABI2/source semantics2); role0 alone also includes a mechanical keyring.
export function generatedMeshTargets(parts){return parts.map(p=>({id:p.id,label:String(p.name??p.id).slice(0,200),mainBody:p.role===0&&p.assemblyGroup===0&&(p.id==='source:body'||/^source:slab:[0-9]+$/.test(p.id))}));}
export function resolveMeshTarget(parts,targetId){
 const candidates=targetId==='@main-body'?generatedMeshTargets(parts).filter(p=>p.mainBody).map(p=>parts.find(x=>x.id===p.id)):parts.filter(p=>p.id===targetId);
 need(candidates.length===1,'MESH_TARGET_ORPHAN');return candidates[0];
}
export function meshTargetOptions(state,model){
 if(model?.product?.exportDescriptor?.parts)return generatedMeshTargets(model.product.exportDescriptor.parts);
 const recipe=state?.content?.app?.mesh?.metadata?.meshCsg,rows=recipe?.operation?.targetOptions;
 if(rows)return copy(rows);
 const id=recipe?.parameters?.resolved?.targetId;return id?[{id,label:'Đích đã chọn trong mô hình gốc',mainBody:false}]:[];
}
export function meshNeedsApply(state,assets){
 const m=state?.content?.app?.mesh,r=m?.metadata?.meshCsg;if(!m)return false;if(!m.applied||!r)return true;
 try{const bytes=assets.get(r.generatedBase.stateAssetHash);const base=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes?.bytes??bytes));return !same(generatedShape(state),generatedShape(base))||!same(meshParameterBindings(state,r.parameters),r.parameters);}catch{return true;}
}
/** Column-major affine millimetres: T · Rz · Ry · Rx · S, about source origin.
 * Unit conversion belongs to the importer. Translation is always literal mm. */
export function meshTransform(values){
 const a=['impRX','impRY','impRZ'].map(k=>values[k]*Math.PI/180),[x,y,z]=a,[cx,cy,cz]=a.map(Math.cos),[sx,sy,sz]=a.map(Math.sin),s=values.impScale/100;
 need(a.every(Number.isFinite)&&Number.isFinite(s)&&s>0,'MESH_TRANSFORM_PARAMETERS');
 return [cz*cy*s,sz*cy*s,-sy*s,(cz*sy*sx-sz*cx)*s,(sz*sy*sx+cz*cx)*s,cy*sx*s,(cz*sy*cx+sz*sx)*s,(sz*sy*cx-cz*sx)*s,cy*cx*s,values.impX,values.impY,values.impZ];
}
async function nativeId(namespace,key,seen){const digest=await sha256(canonicalJSON(['arch-mesh-app-id/1',namespace,key])),id=(BigInt('0x'+digest.slice(0,16))|0x8000000000000000n).toString();need(!seen.has(id)||seen.get(id)===key,'MESH_ID_COLLISION');seen.set(id,key);return id;}
export function createMeshApplicationServices({kernel,context,generatedBase,workerURL}){
 need(kernel?.kernelLeases&&typeof context==='function'&&generatedBase,'MESH_COMPOSITION_REQUIRED');
 const operations=new Map();let retirement=Promise.resolve(),retirementError=null;
 const retire=scope=>{const pending=scope.release();retirement=Promise.all([retirement,pending]).then(()=>{},error=>{retirementError=error;});};
 const settled=async()=>{await retirement;if(retirementError)throw retirementError;};
 const mesh=createRootMeshAdapter({operation:kernel.operation,kernelLeases:kernel.kernelLeases,context,
  verifyGeneratedBase:input=>generatedBase.verifyGeneratedBase(input),
  commitCandidate:args=>{const op=operations.get(args.control.ticket.id);need(op,'MESH_HOST_OPERATION_REQUIRED');return op.commitCandidate(args);},
  publishReplay:args=>{const op=operations.get(args.control.ticket.id);need(op,'MESH_REPLAY_OPERATION_REQUIRED');return op.publishReplay(args);}});
 const qualifyCandidate=createMeshCandidateQualification({mesh,kernelLeases:kernel.kernelLeases,operation:kernel.operation,workerURL});
 const hostBindings=host=>({...host,qualifyCandidate});
 async function prepare({control,state,assets,options,host,engine}){
  await settled();
  const current=context(),source=state.content.app.mesh,values=effectiveValues(state);
  need(source&&values.impOn===true,'MESH_ENABLE_REQUIRED');
  const {operation,materialPolicy,requiresTarget}=meshOperationForParameters(values.impOp),operationLabel=operation==='import-as-part'?'thêm rời':operation==='union'?'hàn':'trừ';
  need(values.meshJoinTolerance.mode==='unselected','MESH_SURFACE_BOUND_UNVERIFIED');
  need(options&&Object.hasOwn(UNITS,options.unit),'MESH_EXPLICIT_UNIT');if(requiresTarget)need(typeof options.targetId==='string'&&options.targetId,'MESH_TARGET_REQUIRED');else need(typeof options.materialId==='string'&&options.materialId,'MESH_MATERIAL_REQUIRED');
  const transform=meshTransform(values),bits=matrixBinary64LE(transform);
  const baseState=copy(state);baseState.content.app.mesh.applied=false;delete baseState.content.app.mesh.metadata.meshCsg;
  const operand=await generatedBase.prepare({control,mode:'prepare',savedBaseState:baseState,assets});
  let preview,prepared,proposal,transaction,closed=false,moved=false;
  const close=()=>{if(closed)return;closed=true;preview?.release();prepared?.release();proposal?.release();transaction?.release();retire(operand);};
  try{
   const inspection=operand.inspection,desc=inspection.exportDescriptor,seen=new Map(),namespace=current.projectId+':'+source.id;
   const selected=requiresTarget?resolveMeshTarget(desc.parts,options.targetId):null;
   const chosen=state.content.app.materials.find(m=>m.id===(options.materialId??selected?.materialId));need(chosen&&!chosen.excluded&&Number.isInteger(chosen.slot)&&chosen.slot>=1&&chosen.slot<=16,'MESH_MATERIAL_REQUIRED');
   const materialNames={},materials=[],materialIndex=new Map();
   for(const p of desc.parts){if(materialIndex.has(p.materialId))continue;const materialId=await nativeId(namespace,'material:'+p.materialId,seen);materialNames[materialId]=p.materialId;materialIndex.set(p.materialId,materials.length);materials.push({materialId,slot:p.slot,rgba:p.rgba});}
   const bindings=[];for(const p of desc.parts)bindings.push({semanticId:await nativeId(namespace,'part:'+p.id,seen),sourceId:p.sourceId,provenanceId:p.geometryProvenanceId,sourceIndex:p.sourceIndex,materialIndex:materialIndex.get(p.materialId)});
   const target=selected?bindings[desc.parts.indexOf(selected)].semanticId:null,importMaterial=await nativeId(namespace,'material:'+chosen.id,seen),sourceNumericId=await nativeId(namespace,'original',seen),provenanceNumericId=await nativeId(namespace,'interpretation',seen);
   materialNames[importMaterial]=chosen.id;
   const rgba=parseInt(chosen.color.slice(1)+'ff',16)>>>0,inv=source.metadata.meshImport.inventory;
   need(inv&&inv.parts.length>0,'MESH_IMPORT_INVENTORY');
   const parser={unit:options.unit,materials:[{id:importMaterial,name:chosen.label,rgba}],maxErrorMm:.001,
    ...(source.metadata.meshImport.format==='stl'?{partMaterialIds:inv.parts.map(()=>importMaterial)}:{sourceMaterialAssignments:inv.sourceMaterials.map(sourceName=>({sourceName,materialId:importMaterial}))})};
   const approval={unit:options.unit,transform,materials:[{sourceMaterialId:importMaterial,materialId:importMaterial,slot:chosen.slot,rgba}],sourceNumericId,provenanceNumericId,repair:'none',conditioning:'none'};
   const command={featureId:await nativeId(namespace,'feature',seen),operation,materialPolicy,transform,bindings,materials,targets:requiresTarget?[target]:[],queryToleranceCeilingMm:.002,limits:{vertices:1000000,triangles:400000,parts:128,operations:2000000},separateImportedAssemblyGroup:2};
   const nextState=copy(state);nextState.revision++;const parameters=meshParameterBindings(nextState,{resolved:{unit:options.unit,impZMm:values.impZ,queryToleranceCeilingMm:.002,targetId:selected?.id??null},transformConvention:'arch-affine-T-Rz-Ry-Rx-S/1',transformBinary64LE:bits});
   const sourceHashes=[...desc.sourceHashes.filter(s=>s.id!==source.id),{id:source.id,sha256:source.raw.hash}];
   const rr=await createMeshReplayRecord({original:source,baseState,assets,engine,parser,approval:{version:'arch-mesh-input-selection/1',...approval,transformBinary64LE:bits},command,materialNames,sourceHashes,parameters,targetOptions:generatedMeshTargets(desc.parts)});
   nextState.content.app.mesh={...copy(source),applied:true,assetHashes:rr.assetHashes,metadata:{...copy(source.metadata),meshCsg:rr.recipe}};validateState(nextState);
   const raw=assets.get(source.raw.hash);need(raw?.bytes instanceof Uint8Array,'MESH_ORIGINAL_ASSET');
   preview=await mesh.prepareInput({control,file:{name:source.name,bytes:raw.bytes},mesh:source,selection:{input:parser,approval}});
   const firstHash=preview.proposalHash;
   return {outputHash:firstHash,changes:[`Tệp ${source.name}: ${inv.parts.reduce((n,p)=>n+p.triangles,0)} tam giác; đơn vị ${UNITS[options.unit]}.`,`Giữ byte gốc; diễn giải toàn bộ khối nhập bằng vật liệu ${chosen.label}.`,`Tỉ lệ ${values.impScale}%; xoay X/Y/Z ${values.impRX}/${values.impRY}/${values.impRZ}°; tịnh tiến ${values.impX}/${values.impY}/${values.impZ} mm.`,requiresTarget?`Phép ${operationLabel}, đích ${selected.name??selected.id}; phần đích giữ vật liệu. Không tự sửa lưới.`:`Thêm thành phần riêng bằng vật liệu ${chosen.label}; giữ nguyên các khối đã dựng. Không tự hàn hoặc sửa lưới.`,`Kiểm tra lưới theo tọa độ biểu diễn; sai lệch bề mặt toàn cục và độ khít khi in chưa được chứng nhận.`],
    verify:async()=>{need(!closed,'MESH_PROPOSAL_RELEASED');operand.check(control);return firstHash;},
    async confirm(nextControl){
     need(!closed,'MESH_PROPOSAL_RELEASED');prepared=await mesh.approveInput(preview,{control:nextControl,proposalHash:firstHash});preview=null;
     transaction=await prepareMeshHostTransaction({...hostBindings(host),nextState,assets:rr.assets,engine});
     proposal=await mesh.prepareApply(prepared,{control:nextControl,model:operand.model,command,publication:transaction.publication,materialNames,sourceHashes});
     if(proposal.state!=='confirmation-required')throw Object.assign(new Error('MESH_POST_CSG_OR_TOPOLOGY_BLOCKED'),{code:'MESH_POST_CSG_OR_TOPOLOGY_BLOCKED',details:{version:'arch-mesh-blocked-detail/1',native:copy(proposal.proof.report.postCsgGates),representedMesh:copy(proposal.proof.qualification)}});const p=proposal;
     moved=true;return {outputHash:p.proposalHash,changes:[requiresTarget?`Áp dụng ${operationLabel} vào ${selected.name??selected.id}.`:`Thêm khối nhập thành phần riêng bằng vật liệu ${chosen.label}.`,`Lưu nguồn gốc, đơn vị, phép biến đổi và đích cùng một bước lịch sử.`,`Mô hình chỉ thay thế sau khi kiểm tra hình học cuối và lưu dự án thành công.`],
      verify:async()=>{await transaction.verify();return p.verify(nextControl);},
      async confirm(){operations.set(nextControl.ticket.id,transaction);try{return await mesh.confirmApply(p,{control:nextControl,proposalHash:p.proposalHash});}finally{operations.delete(nextControl.ticket.id);}},release:close};
    },release(){if(!moved)close();}};
  }catch(error){close();throw error;}
 }
 async function replay({control,host,engine}){
  await settled();
  const publication=await createMeshReplayPublication({...hostBindings(host),engine}),r=publication.replay;
  const operand=await generatedBase.prepare({control,mode:'replay',savedBaseState:r.baseState,assets:host.current().assets});let preview,prepared,proposal;
  try{preview=await mesh.prepareInput({control,file:r.file,mesh:r.source,selection:r.selection});prepared=await mesh.approveInput(preview,{control,proposalHash:preview.proposalHash});preview=null;
   proposal=await mesh.prepareApply(prepared,{control,model:operand.model,command:r.command,materialNames:r.materialNames,sourceHashes:r.sourceHashes,replayRecord:r.recipe});
   operations.set(control.ticket.id,publication);return await mesh.confirmApply(proposal,{control,proposalHash:proposal.proposalHash});
  }finally{operations.delete(control.ticket.id);proposal?.release();prepared?.release();preview?.release();operand.release();}
 }
 return Object.freeze({mesh,source:mesh.source,prepare,replay,needsApply:meshNeedsApply,targetOptions:meshTargetOptions,async reset(){operations.clear();mesh.reset();await generatedBase.reset();await settled();}});
}
