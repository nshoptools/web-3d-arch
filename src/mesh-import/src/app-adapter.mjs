import {decodeSTL,UNITS} from './stl.mjs';
import {decodeOBJ} from './obj.mjs';

export const MESH_ADAPTER_VERSION='arch-imported-mesh-adapter/1';
const APP='arch-app-adapters/1',encode=new TextEncoder();
const need=(v,code,details)=>{if(!v)throw Object.assign(new Error(code),{code,details});};
const ownKeys=(o,ks)=>need(o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).every(k=>ks.includes(k)),'MESH_RECORD_KEYS');
const hash=x=>need(typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),'MESH_HASH');
const id=x=>{need(typeof x==='string'&&x.length>0&&encode.encode(x).length<=256&&x.isWellFormed()&&!/[\x00-\x1f\x7f]/.test(x),'MESH_ID');return x;};
const int=(x,min,max)=>need(Number.isSafeInteger(x)&&x>=min&&x<=max,'MESH_INTEGER');
const u64=x=>{need(typeof x==='string'&&/^[1-9][0-9]*$/.test(x)&&BigInt(x)<=0xffffffffffffffffn,'MESH_EXACT_ID');return x;};
function canonical(value){
 if(value===null)return 'null';
 if(typeof value==='number'){need(Number.isFinite(value),'MESH_JSON_NUMBER');return Object.is(value,-0)?'-0':String(value);}
 if(typeof value==='string'){need(value.isWellFormed(),'MESH_JSON_STRING');return JSON.stringify(value);}
 if(typeof value==='boolean')return String(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 need(value&&Object.getPrototypeOf(value)===Object.prototype,'MESH_JSON_OBJECT');
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
const clone=x=>structuredClone(x);
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const fingerprint=x=>digest(encode.encode(canonical(x)));
function bounded(x,limit=65536){const s=canonical(x);need(encode.encode(s).length<=limit,'MESH_METADATA_BUDGET');return JSON.parse(s);}
function bits(a){const b=new ArrayBuffer(8),d=new DataView(b);return a.map(x=>{d.setFloat64(0,x,false);return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');});}
function file(input){
 need(input?.bytes instanceof Uint8Array&&input.bytes.length>0&&input.bytes.length<=64000000,'MESH_SOURCE_BYTE_BOUND');
 need(typeof input.name==='string'&&input.name.length<=255&&!/[\/\\\x00-\x1f]/.test(input.name),'MESH_FILENAME');
 const match=/\.(stl|obj)$/i.exec(input.name);need(match,'MESH_FORMAT_UNSUPPORTED');
 // Filename selects a strict decoder, never substitutes for its content checks.
 return {format:match[1].toLowerCase(),bytes:input.bytes,name:input.name};
}
function inventory(format,bytes){
 const p=format==='stl'?decodeSTL(bytes):decodeOBJ(bytes);
 return bounded(format==='stl'?{
  decoder:p.decoder,encoding:p.encoding,parts:p.groups.map((g,i)=>({index:i,name:g.name,triangles:g.count/3})),
  sourceMaterials:[],externalLibraries:[],polygons:'triangles-only'
 }:{
  decoder:p.decoder,encoding:p.encoding,parts:p.parts.map((g,i)=>({index:i,name:g.name,triangles:g.triangles.length/3})),
  sourceMaterials:p.materialNames,externalLibraries:p.libraries,polygons:'triangles-only; unsupported polygons/holes are rejected before library fan triangulation'
 });
}
function selected(x,inv,format){
 x=bounded(x);ownKeys(x,['version','unit','transform','materials','partMaterialIds','sourceMaterialAssignments','operation','targets','materialPolicy','featureId','sourceId','provenanceId','conditioning','toleranceCeilingMm','limits']);
 need(x.version==='arch-mesh-csg-selection/1'&&Object.hasOwn(UNITS,x.unit),'MESH_UNIT_CHOICE_REQUIRED');
 ownKeys(x.transform,['version','matrix']);need(x.transform.version==='arch-affine-mm/1'&&Array.isArray(x.transform.matrix)&&x.transform.matrix.length===12&&x.transform.matrix.every(Number.isFinite),'MESH_EXPLICIT_TRANSFORM_REQUIRED');
 // Preserve coefficients (including signed zero); no recenter, angle or unit guess.
 need(x.conditioning==='none','MESH_CONDITIONING_UNSUPPORTED');
 need(['union','difference','intersection'].includes(x.operation),'MESH_OPERATION_UNSUPPORTED');
 need(['requireDisjointMaterials','keepSelectedTargetMaterial'].includes(x.materialPolicy),'MESH_EXPLICIT_MATERIAL_POLICY');
 for(const k of ['featureId','sourceId','provenanceId'])u64(x[k]);
 need(Array.isArray(x.targets)&&x.targets.length>0&&x.targets.length<=128,'MESH_TARGETS_REQUIRED');
 x.targets.forEach(u64);need(new Set(x.targets).size===x.targets.length,'MESH_TARGET_COLLISION');
 need(Number.isFinite(x.toleranceCeilingMm)&&x.toleranceCeilingMm>0&&x.toleranceCeilingMm<=.002,'MESH_TOLERANCE_CEILING');
 ownKeys(x.limits,['vertices','triangles','parts','work']);
 for(const [k,n]of Object.entries({vertices:1000000,triangles:400000,parts:128,work:2000000}))int(x.limits[k],1,n);
 need(Array.isArray(x.materials)&&x.materials.length>0&&x.materials.length<=16,'MESH_MATERIAL_TABLE');
 const mids=new Set(),nativeIds=new Set(),slots=new Map();
 for(const m of x.materials){
  ownKeys(m,['id','nativeId','name','rgba','slot']);id(m.id);id(m.name);u64(m.nativeId);int(m.rgba,0,0xffffffff);int(m.slot,1,16);
  need((m.rgba&255)===255&&!mids.has(m.id)&&!nativeIds.has(m.nativeId),'MESH_MATERIAL_COLLISION');mids.add(m.id);nativeIds.add(m.nativeId);
  need(!slots.has(m.slot)||slots.get(m.slot)===m.rgba,'MESH_MATERIAL_SLOT_COLLISION');slots.set(m.slot,m.rgba);
 }
 const used=new Set();
 if(format==='stl'){
  need(x.sourceMaterialAssignments===undefined,'MESH_MAPPING_FORMAT');
  need(Array.isArray(x.partMaterialIds)&&x.partMaterialIds.length===inv.parts.length,'MESH_ALL_PART_MAPPINGS_REQUIRED');
  x.partMaterialIds.forEach(v=>{need(mids.has(v),'MESH_MATERIAL_REFERENCE');used.add(v);});
 }else{
  need(x.partMaterialIds===undefined,'MESH_OBJ_SOURCE_MAPPING_REQUIRED');
  need(Array.isArray(x.sourceMaterialAssignments)&&x.sourceMaterialAssignments.length===inv.sourceMaterials.length,'MESH_ALL_SOURCE_MAPPINGS_REQUIRED');
  const names=new Set();
  for(const m of x.sourceMaterialAssignments){
   ownKeys(m,['sourceName','materialId']);
   need(inv.sourceMaterials.includes(m.sourceName)&&!names.has(m.sourceName)&&mids.has(m.materialId),'MESH_SOURCE_MATERIAL_MAPPING');names.add(m.sourceName);used.add(m.materialId);
  }
 }
 need(used.size===mids.size,'MESH_UNUSED_MATERIAL_DECLARATION');
 return freeze(x);
}

/** Package-only trusted serial Worker adapter. Never publishes/edits app state.
 * Inject the checked importer and triangle-CSG instances from the SAME Module.
 * context/acquireGenerated are parent authority callbacks, not UI data.
 */
export function createImportedMeshAdapter({importer,csg,context,acquireGenerated}){
 need(typeof context==='function'&&typeof importer?.importBytes==='function'&&typeof csg?.preview==='function','MESH_COMPONENT_REQUIRED');
 const owners=new WeakMap(),live=new Set();let epoch=0,preparing=false,borrowing=false;
 function capture(c){
  need(c?.version===APP&&c.signal&&typeof c.signal.aborted==='boolean'&&typeof c.onProgress==='function','MESH_CONTROL');
  const t=bounded(c.ticket);for(const k of ['id','userId','projectId'])id(t[k]);int(t.revision,0,Number.MAX_SAFE_INTEGER-1);int(t.generation,1,0xffffffff);
  const h=bounded(context());hash(h.headHash);id(h.moduleSessionId);need(h.moduleSessionId.length>=16&&h.moduleSessionId.length<=128,'MESH_MODULE_SESSION');
  for(const k of ['userId','projectId','revision','generation'])need(h[k]===t[k],'MESH_STALE_CONTEXT');
  need(!c.signal.aborted,'MESH_CANCELLED');return {ticket:t,context:h,epoch};
 }
 function current(r,c){
  need(!r.closed,'MESH_OWNER_RELEASED_OR_CONSUMED');need(r.epoch===epoch,'MESH_CONTEXT_RETIRED');need(!c.signal.aborted,'MESH_CANCELLED');
  need(c.version===APP&&canonical(c.ticket)===canonical(r.ticket),'MESH_TICKET_CHANGED');
  need(canonical(context())===canonical(r.context),'MESH_STALE_CONTEXT');
 }
 function cleanup(r){
  if(r.busy)return;
  const {importHandle,csgHandle,root}=r;
  const resources=[importHandle&&(()=>importer.release(importHandle)),csgHandle&&(()=>csg.release(csgHandle)),root&&(()=>root.release())];
  r.importHandle=null;r.csgHandle=null;r.root=null;let first;
  for(const release of resources)if(release)try{release();}catch(e){first??=e;}
  if(first)throw first;
 }
 function close(r){r.closed=true;live.delete(r);cleanup(r);}
 function record(token,phase){
  const r=owners.get(token);need(r&&r.owner===token&&!r.closed&&(!phase||r.phase===phase),'MESH_OWNER_RELEASED_OR_CONSUMED');return r;
 }
 function owner(r,phase,object={kind:phase,version:MESH_ADAPTER_VERSION}){
  r.phase=phase;r.owner=object;owners.set(object,r);return Object.freeze(object);
 }
 function release(token){
  need(!borrowing,'MESH_BORROW_ACTIVE');const r=owners.get(token);need(r,'MESH_OWNER_UNKNOWN');
  if(r.owner===token&&!r.closed)close(r);
 }
 const header=r=>({version:APP,ticket:freeze(clone(r.ticket)),requiresFinalGates:true,exportable:false,committed:false});
 async function verify(r,c){
  current(r,c);need(!r.closed,'MESH_OWNER_RELEASED_OR_CONSUMED');
  if(r.phase==='mesh-csg'){
   need(csg.matches(r.csgHandle,r.descriptor,{generation:r.ticket.generation,revision:String(r.ticket.revision)}),'MESH_CSG_DESCRIPTOR_CHANGED');
   need(await digest(csg.copyConfirmation(r.csgHandle))===r.proof.nativeDescriptorHash,'MESH_CSG_DESCRIPTOR_CHANGED');
  }
  need(await fingerprint(r.proof)===r.proposalHash,'MESH_PROPOSAL_CHANGED');current(r,c);return r.proposalHash;
 }
 function proposal(r,phase){
  const p={...header(r),status:'prepared-proposal',stage:phase,proposalHash:r.proposalHash,
   proof:freeze(clone(r.proof)),
   changes:phase==='mesh-input'?[
    'Interpret original mesh units, transform, complete material mapping and recorded parser conversion exactly as shown.',
    'Keep original source immutable; do not repair or apply generated parameters.']:
    ['Use the prepared final triangle CSG geometry with the explicit target/material policy.',
     'Root final topology, material, roof/floor and datum gates plus atomic publication are still required.'],
   async verify(c){record(p,phase);return verify(r,c);},
   async confirm(c,approval){
    record(p,phase);need(!r.busy,'MESH_BUSY');r.busy=true;
    try{
     need(approval?.confirmed===true&&approval.proposalHash===r.proposalHash,'MESH_EXACT_APPROVAL_REQUIRED');
     await verify(r,c);
     // Process-local acceptance record only. Parent must persist its user action,
     // source selection, exact proof and final transaction receipt in history.
     r.approvals.push(freeze({stage:phase,proposalHash:r.proposalHash,proof:r.proof}));
     return owner(r,phase==='mesh-input'?'approved-input':'confirmed-candidate');
    }catch(e){close(r);throw e;}finally{r.busy=false;if(r.closed)cleanup(r);}
   },
   release(){release(p);}
  };
  return owner(r,phase,p);
 }
 async function ingest(input){
  const h=capture(input);need(input.purpose==='mesh','MESH_SOURCE_PURPOSE');
  need(input.state?.revision===h.ticket.revision,'MESH_STATE_REVISION');
  const sc=bounded(input.sourceContext);need(sc.version==='arch-source-context/1'&&sc.operation==='import','MESH_SOURCE_CONTEXT');id(sc.id);int(sc.revision,0,Number.MAX_SAFE_INTEGER-1);
  const f=file(input.file),bytes=f.bytes.slice(),parsed=inventory(f.format,bytes),sha=await digest(bytes);current(h,input);
  return {...header(h),kind:'mesh',metadata:{meshImport:{
   version:'arch-mesh-ingest/1',format:f.format,original:{sha256:sha,byteLength:bytes.length},
   sourceId:sc.id,sourceRevision:sc.revision,inventory:parsed,
   unit:null,stage:'unconfigured',sourceOriginal:'read-only',generatedParameters:'unapplied',exportable:false,
   validation:'bounded-parse-only; native topology requires explicit input proposal',externalLibraries:'references-only; never fetched'
  }}};
 }
 async function prepareApply(input){
  need(!preparing&&!borrowing,'MESH_BUSY');preparing=true;let r;
  try{
   if(input.approvedInput){
    r=record(input.approvedInput,'approved-input');current(r,input);need(!r.busy,'MESH_BUSY');r.busy=true;
    need(typeof acquireGenerated==='function','MESH_ROOT_CSG_PREPARATION_UNBOUND');
    r.root=await acquireGenerated({...input,selection:r.selection,source:r.source});current(r,input);
    need(r.root&&typeof r.root.release==='function','MESH_ROOT_PRIMARY_LEASE_REQUIRED');
    importer.withNativeHandle(r.importHandle,module=>need(module===r.root.module,'MESH_GENERATED_MODULE_MISMATCH'));
    const g=bounded({snapshotId:r.root.snapshotId,bindings:r.root.bindings,materials:r.root.materials,generatedSource:r.root.generatedSource});int(g.snapshotId,1,0xffffffff);
    // Same identities may share only exactly the same color/slot semantics.
    for(const m of r.selection.materials)for(const n of g.materials??[])if(m.nativeId===String(n.materialId))
     need(m.rgba===n.rgba&&m.slot===n.slot,'MESH_NATIVE_MATERIAL_COLLISION');
    const reply=await csg.preview({
     snapshotId:g.snapshotId,importer,importHandle:r.importHandle,
     bindings:g.bindings,materials:g.materials,generatedSource:g.generatedSource,
     targets:r.selection.targets,transform:r.selection.transform.matrix,operation:r.selection.operation,
     materialPolicy:r.selection.materialPolicy,featureId:r.selection.featureId,
     generation:r.ticket.generation,revision:String(r.ticket.revision),moduleSessionId:r.context.moduleSessionId,
     getHead:()=>{const h=context();return {generation:h.generation,revision:String(h.revision)};},
     cancelled:()=>input.signal.aborted||r.epoch!==epoch||r.closed||canonical(context())!==canonical(r.context),
     queryToleranceCeilingMm:r.selection.toleranceCeilingMm,limits:r.selection.limits,
     provenance:{adapter:MESH_ADAPTER_VERSION,context:r.context,inputApproval:r.approvals[0],stageHandoff:r.handoff??null,source:r.source}
    });
    r.csgHandle=reply.handle;current(r,input);
    need(reply.verdict===0&&reply.requiresFinalGates===true&&reply.report.exportable===false,'MESH_CSG_BLOCKED',{verdict:reply.verdict,report:reply.report});
    r.descriptor=csg.copyConfirmation(r.csgHandle);
    r.proof=freeze({version:'arch-mesh-csg-proof/1',context:r.context,source:r.source,selection:r.selection,
     inputApprovalHash:r.approvals[0].proposalHash,stageHandoff:r.handoff??null,nativeDescriptorHash:await digest(r.descriptor),
     nativeReport:bounded(reply.report,2097152),requiresFinalGates:true,committed:false});
    r.proposalHash=await fingerprint(r.proof);current(r,input);
    importer.release(r.importHandle);r.importHandle=null; // CSG now owns the original context.
    return proposal(r,'mesh-csg');
   }
   const h=capture(input);need(live.size<4,'MESH_ADAPTER_OWNER_LIMIT');
   need(input.state?.revision===h.ticket.revision,'MESH_STATE_REVISION');
   need(canonical(input.state.content?.app?.mesh)===canonical(input.mesh),'MESH_STATE_SOURCE_MISMATCH');
   const mesh=bounded(input.mesh,131072);need(mesh.kind==='mesh'&&mesh.applied===false,'MESH_UNAPPLIED_DESCRIPTOR_REQUIRED');
   hash(mesh.raw?.hash);int(mesh.raw.byteLength,1,64000000);id(mesh.id);int(mesh.revision,0,Number.MAX_SAFE_INTEGER-1);
   need(mesh.assetHashes?.includes(mesh.raw.hash),'MESH_SOURCE_ASSET_REFERENCE');
   const f=file({name:mesh.name,bytes:input.assets?.get(mesh.raw.hash)});
   need(f.bytes.length===mesh.raw.byteLength,'MESH_SOURCE_LENGTH');
   const raw=f.bytes.slice(),rawHash=await digest(raw);current(h,input);need(rawHash===mesh.raw.hash,'MESH_SOURCE_HASH_MISMATCH');
   const inv=inventory(f.format,raw),im=mesh.metadata?.meshImport;
   need(im?.version==='arch-mesh-ingest/1'&&im.unit===null&&im.stage==='unconfigured'&&im.sourceOriginal==='read-only'&&im.generatedParameters==='unapplied'&&im.exportable===false&&im.format===f.format&&im.original.sha256===rawHash&&im.original.byteLength===raw.length&&
    im.sourceId===mesh.id&&im.sourceRevision===mesh.revision&&canonical(im.inventory)===canonical(inv),'MESH_SOURCE_DESCRIPTOR_CHANGED');
   const s=selected(input.selection,inv,f.format);
   const imported=await importer.importBytes({format:f.format,bytes:raw,sourceId:mesh.id,name:mesh.name,unit:s.unit,
    materials:s.materials.map(({id,name,rgba})=>({id,name,rgba})),partMaterialIds:s.partMaterialIds,
    sourceMaterialAssignments:s.sourceMaterialAssignments,maxErrorMm:s.toleranceCeilingMm});
   r={...h,closed:false,busy:true,phase:null,owner:null,importHandle:imported.handle,csgHandle:null,root:null,approvals:[],selection:s,
    source:freeze({id:mesh.id,revision:mesh.revision,name:mesh.name,raw:{hash:rawHash,byteLength:raw.length},format:f.format})};live.add(r);
   current(r,input);
   need(imported.handle&&imported.state==='ready','MESH_INPUT_BLOCKED',{state:imported.state,report:imported.report});
   r.proof=freeze({version:'arch-mesh-input-proof/1',context:r.context,source:r.source,selection:s,
    transformIEEE754:bits(s.transform.matrix),unitScaleMm:UNITS[s.unit][1],inventory:inv,
    nativeReport:bounded(imported.report,2097152),sourceOriginal:'read-only',generatedParameters:'unapplied',
    repair:'none',conditioning:'none; decoder numeric conversion recorded in native report',committed:false});
   r.proposalHash=await fingerprint(r.proof);current(r,input);return proposal(r,'mesh-input');
  }catch(e){if(r)close(r);throw e;}
  finally{if(r){r.busy=false;if(r.closed)cleanup(r);}preparing=false;}
 }
 function rebindApprovedInput(token,c){
  need(!preparing&&!borrowing,'MESH_BUSY');const r=record(token,'approved-input');need(!r.busy&&!r.handoff,'MESH_STAGE_HANDOFF_ONCE');
  const h=capture(c);need(r.epoch===epoch,'MESH_CONTEXT_RETIRED');
  const stable=x=>{const copy=clone(x);delete copy.generation;return canonical(copy);};
  need(stable(h.context)===stable(r.context)&&h.ticket.id!==r.ticket.id&&h.ticket.generation>r.ticket.generation,'MESH_STAGE_HANDOFF_HEAD');
  // The first proposeOperation has finished and aborted its old job signal.
  // This transfers the accepted INPUT interpretation to one new job only.
  // The original proof/approval is immutable and keeps its original context.
  r.handoff=freeze({version:'arch-mesh-stage-handoff/1',from:r.ticket,to:h.ticket,inputApprovalHash:r.approvals[0].proposalHash});
  r.context=h.context;r.ticket=h.ticket;
  return owner(r,'approved-input');
 }
 function withNativeCandidate(token,c,callback){
  const r=record(token,'confirmed-candidate');current(r,c);need(!preparing&&!borrowing&&typeof callback==='function'&&callback.constructor.name!=='AsyncFunction','MESH_BORROW_ACTIVE');
  need(typeof csg.withNativeHandle==='function','MESH_NATIVE_BORROW_UNBOUND');borrowing=true;
  try{
   const result=csg.withNativeHandle(r.csgHandle,(module,handle)=>callback({
    module,handle,requiresFinalGates:true,exportable:false,committed:false,
    proof:r.proof,approvals:freeze(clone(r.approvals))
   }));
   current(r,c);return result;
  }finally{borrowing=false;}
 }
 function copyCandidate(token,c){
  const r=record(token,'confirmed-candidate');current(r,c);
  return {...header(r),mesh:csg.copyMesh(r.csgHandle),confirmation:csg.copyConfirmation(r.csgHandle),
   original:csg.copyOriginal(r.csgHandle),objSourceFaceMap:csg.copyOBJFaceMap(r.csgHandle),proof:clone(r.proof),approvals:clone(r.approvals)};
 }
 function reset(){need(!borrowing,'MESH_BORROW_ACTIVE');epoch++;let error;for(const r of [...live])try{close(r);}catch(e){error??=e;}if(error)throw error;}
 return Object.freeze({
  version:MESH_ADAPTER_VERSION,
  source:Object.freeze({version:APP,capabilities:Object.freeze([{id:'source.import-mesh',available:true}]),ingest}),
  capabilities:freeze([{id:'mesh.prepare-csg',available:typeof acquireGenerated==='function'},
   {id:'mesh.apply',available:false,reason:'Parent final-scene gates and atomic root/document publication are not implemented by this package.'}]),
  prepareApply,rebindApprovedInput,withNativeCandidate,copyCandidate,release,reset,clearPrivateState:reset,dispose:reset
 });
}
