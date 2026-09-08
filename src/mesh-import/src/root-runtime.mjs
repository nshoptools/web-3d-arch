import {createMeshImporter,sha256} from './importer.mjs';
import {qualifyMesh} from '../../core/mesh-qualification.mjs';
const encode=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
const json=x=>encode.encode(JSON.stringify(x));
const clone=x=>structuredClone(x);
export class MeshRootError extends Error{constructor(code,details=null){super(code);this.name='MeshRootError';this.code=code;this.details=details;}}
const need=(v,code)=>{if(!v)throw new MeshRootError(code);};
export function matrixBinary64LE(matrix){
 need(Array.isArray(matrix)&&matrix.length===12&&matrix.every(Number.isFinite),'MESH_EXPLICIT_TRANSFORM_REQUIRED');
 const b=new Uint8Array(96),d=new DataView(b.buffer);matrix.forEach((v,i)=>d.setFloat64(i*8,v,true));
 return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
}
const contextKeys=['userId','projectId','revision','headHash'];
function checkContext(a,b){need(a&&b&&contextKeys.every(k=>String(a[k])===String(b[k])),'MESH_STALE_CONTEXT');}
/** Worker-local dispatcher in the INJECTED root Module. Opaque tokens never
 * encode pointers and are invalid in another Worker/epoch. No second factory. */
export function createMeshRootOperations(Module){
 need(Module?._arch_abi_version?.()===2&&Module._arch_mesh_runtime_version?.()===1,'MESH_ROOT_RUNTIME_UNAVAILABLE');
 const importer=createMeshImporter(Module),owners=new Map();
 let serial=0,busy=false,retired=false;
 const namespace=crypto.randomUUID();
 const error=()=>decode.decode(new Uint8Array(Module.HEAPU8.subarray(Module._arch_error_ptr(),Module._arch_error_ptr()+Module._arch_error_len())))||'MESH_ROOT_FAILED';
 const input=bytes=>{
  need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=2*1024*1024,'MESH_COMMAND_SIZE');
  const id=Module._arch_input_create(bytes.length);need(id,'MESH_ROOT_INPUT_ALLOCATION');
  Module.HEAPU8.set(bytes,Module._arch_input_ptr(id));return id;
 };
 const native=(fn,bytes)=>{
  let i=0;try{i=input(bytes);const id=fn(i)>>>0;need(id,error());return id;}
  finally{if(i)Module._arch_input_release(i);}
 };
 function span(id,kind){
  const n=Module._arch_mesh_buffer_len(id,kind)>>>0,p=Module._arch_mesh_buffer_ptr(id,kind)>>>0;
  need(n<=64_000_000&&(!n||p&&p+n<=Module.HEAPU8.length),'MESH_BUFFER_ABI');
  return {byteOffset:p,byteLength:n};
 }
 const bytes=(id,kind)=>{const s=span(id,kind);return new Uint8Array(Module.HEAPU8.subarray(s.byteOffset,s.byteOffset+s.byteLength));};
 const metadata=id=>JSON.parse(decode.decode(bytes(id,2)));
 function own(value){
  need(owners.size<8&&!retired,'MESH_OWNER_LIMIT');
  const token=namespace+':'+(++serial);owners.set(token,value);return token;
 }
 function get(token,kind,current){
  const o=owners.get(token);need(o&&o.kind===kind&&!retired,'MESH_TOKEN_RETIRED_OR_WRONG_KIND');
  if(current)checkContext(o.context,current);return o;
 }
 function dispose(o){
  if(o.kind==='import-preview')importer.release(o.handle);
  else if(o.kind==='prepared-import')Module._arch_mesh_prepared_release(o.id);
  else if(o.kind==='csg-proposal')Module._arch_mesh_proposal_release(o.id);
 }
 function release(token){const o=owners.get(token);if(!o)return false;owners.delete(token);dispose(o);return true;}
 function check(g){
  need(!retired,'MESH_RUNTIME_RETIRED');
  const c=new Int32Array(Module.HEAPU8.buffer,Module._arch_control_ptr(),4);
  need((Atomics.load(c,0)>>>0)===g,'STALE_GENERATION');need((Atomics.load(c,3)>>>0)!==g,'CANCELLED');
 }
 async function previewImport(request,g){
  const req=clone(request);need(req.context&&req.selection,'MESH_INPUT_PROPOSAL_REQUIRED');
  const source=await importer.importBytes(req.input);let token;
  try{
   check(g);
   if(!source.handle)return {version:'arch-mesh-input-preview/1',state:source.state,source:source.source,proposal:source.proposal,applied:false};
   if(source.state!=='ready')return {version:'arch-mesh-input-preview/1',state:source.state,source:source.source,report:source.report,applied:false};
   const nativeReport=importer.withNativeHandle(source.handle,(_module,handle)=>{
    const n=Module._archmi_report_len(handle),p=Module._archmi_report(handle);
    return new Uint8Array(Module.HEAPU8.subarray(p,p+n));
   });
   const report=JSON.parse(decode.decode(nativeReport));
   const s=req.selection;
   const approval={version:'arch-mesh-stage/1',...req.context,revision:String(req.context.revision),
    approved:true,repair:s.repair,conditioning:s.conditioning,unit:report.unit,
    transform:s.transform,transformBinary64LE:matrixBinary64LE(s.transform),materials:s.materials,
    sourceNumericId:s.sourceNumericId,provenanceNumericId:s.provenanceNumericId,
    sourceHash:source.source.sha256,nativeReportHash:await sha256(nativeReport)};
   need(s.unit===report.unit,'MESH_UNIT_SELECTION_MISMATCH');
   const wire=json(approval),approvalHash=await sha256(wire);check(g);
   const preview=importer.copyMesh(source.handle);
   token=own({kind:'import-preview',handle:source.handle,context:req.context,approval,wire,approvalHash});
   return {version:'arch-mesh-input-preview/1',state:'approval-required',token,source:source.source,report:source.report,
    approval:clone(approval),approvalHash,preview,applied:false};
  }finally{if(source.handle&&!token)importer.release(source.handle);}
 }
 function approveImport(request,g){
  const o=get(request.token,'import-preview',request.context);
  need(request.approved===true&&request.approvalHash===o.approvalHash,'MESH_EXACT_INPUT_APPROVAL_REQUIRED');check(g);
  let id=0,token;
  try{
   id=importer.withNativeHandle(o.handle,(_module,handle)=>native(i=>Module._arch_mesh_stage(handle,i,g),o.wire));
   check(g);token=own({kind:'prepared-import',id,context:o.context,approval:o.approval});
   release(request.token);
   return {version:'arch-mesh-prepared-import/1',token,context:clone(o.context),approval:clone(o.approval),preview:span(id,1),applied:false};
  }finally{if(id&&!token)Module._arch_mesh_prepared_release(id);}
 }
 function prepare(request,g){
  const o=get(request.token,'prepared-import',request.context);check(g);
  if(request.command?.operation==='import-as-part')need((Module._arch_mesh_operation_mask?.()&8)!==0,'MESH_IMPORT_AS_PART_UNAVAILABLE');
  const command={...clone(request.command),version:'arch-mesh-csg-request/1',...clone(request.context),revision:String(request.context.revision)};
  command.transformBinary64LE=matrixBinary64LE(command.transform);
  let id=0,token;
  try{
   id=native(i=>Module._arch_mesh_prepare(request.snapshotId,o.id,i,g),json(command));
   check(g);const report=metadata(id),raw=bytes(id,1);
   // Independent exact represented-triangle checker; this is additional to
   // pinned native validation and the real post-CSG mechanical/source gates.
   const qualification=qualifyMesh(raw,{format:'ARCH/1'});
   token=own({kind:'csg-proposal',id,context:clone(request.context),confirmation:bytes(id,3),
    passed:!report.exportBlocked&&qualification.verdict==='pass',qualification});
   return {version:'arch-root-csg-proposal/1',token,context:clone(request.context),report,qualification,
    confirmation:JSON.parse(decode.decode(bytes(id,3))),preview:span(id,1),
    state:!report.exportBlocked&&qualification.verdict==='pass'?'confirmation-required':'blocked',applied:false};
  }finally{if(id&&!token)Module._arch_mesh_proposal_release(id);}
 }
 function confirm(request,g){
  const o=get(request.token,'csg-proposal',request.context);check(g);
  need(o.passed,'MESH_POST_CSG_OR_TOPOLOGY_BLOCKED');
  need(request.approved===true,'MESH_FINAL_APPROVAL_REQUIRED');
  const expected=JSON.parse(decode.decode(o.confirmation));
  need(request.proposalHash===expected.proposalHash,'MESH_EXACT_CONFIRMATION_MISMATCH');
  let id=0;
  try{
   id=native(i=>Module._arch_mesh_confirm(o.id,i,g),o.confirmation);check(g);
   const result={snapshotId:id,metadata:metadata(id),generation:g};
   owners.delete(request.token); // native confirmation consumed this proposal
   id=0;return result;
  }finally{if(id)Module._arch_snapshot_release(id);}
 }
 return Object.freeze({
  async dispatch(method,request,{generation}={}){
   need(!busy&&!retired,'MESH_RUNTIME_BUSY_OR_RETIRED');
   if(method==='release')return {released:release(request.token)};
   need(['previewImport','approveImport','prepare','confirm'].includes(method),'MESH_RPC_METHOD');
   need(Number.isInteger(generation)&&generation>0&&generation<0xffffffff,'GENERATION_RANGE');
   busy=true;try{
    check(generation);
    return method==='previewImport'?await previewImport(request,generation):method==='approveImport'?approveImport(request,generation):method==='prepare'?prepare(request,generation):confirm(request,generation);
   }finally{busy=false;}
  },
  release,
  reset(){need(!busy,'MESH_RUNTIME_BUSY');retired=true;for(const o of owners.values())dispose(o);owners.clear();}
 });
}
