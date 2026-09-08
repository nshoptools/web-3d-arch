import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {createMeshRootOperations} from '../src/root-runtime.mjs';
import {createProductOperations,readProductSemantics} from '../../core/product-operations.mjs';
import {source,productFixture,inputFixture,selectionFor,tilted,triangle,squareTube,affine,obj} from './root-fixtures.mjs';
import {makeRequest} from '../../../tests/product-runtime/fixtures.mjs';
import {readSnapshot,inspectMesh,verticalIntersections} from '../../../tests/oracles/mesh-oracle.mjs';
import {meshOperationForParameters} from '../src/operation.mjs';
import {apartProduct} from './import-as-part-fixtures.mjs';
import {bindingInventory} from './root-fixtures.mjs';
const run=path.resolve(process.env.PROJECT_REVIEW_RUN),out=path.join(run,'evidence/import-as-part-wasm-'+(process.env.PROOF_TAG??'r1'));
assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});const sha=b=>createHash('sha256').update(b).digest('hex');
const modulePath=path.resolve(process.env.ARCH_CSG_MODULE??path.join(run,'work/module/arch-kernel.mjs'));
const M=await(await import(pathToFileURL(modulePath))).default({print:()=>{},printErr:()=>{}}),ops=createMeshRootOperations(M),productOps=createProductOperations(M);
assert.equal(M._arch_mesh_operation_mask(),15);assert.equal(M._archcsg_operation_mask(),15);assert.deepEqual(meshOperationForParameters('them'),{operation:'import-as-part',materialPolicy:'requireDisjointMaterials',requiresTarget:false});
assert.equal(meshOperationForParameters('han').operation,'union');assert.equal(meshOperationForParameters('tru').operation,'difference');assert.throws(()=>meshOperationForParameters('other'));
let generation=0;const reset=()=>{const g=++generation;assert.equal(M._arch_control_reset(g),1);return g;};
const snap=id=>M.HEAPU8.slice(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id));
const records=[];
function preserved(before,after){const a=readSnapshot(before),b=readSnapshot(after);assert.deepEqual(b.vertices.slice(0,a.vertices.length),a.vertices);assert.deepEqual(b.faces.slice(0,a.faces.length),a.faces);for(let i=0;i<a.parts.length;i++){assert.equal(b.parts[i].reportedVolume,a.parts[i].reportedVolume);assert.equal(b.parts[i].color,a.parts[i].color);}return a.parts.length;}
const command=(inventory,transform)=>({...structuredClone(inventory),featureId:'7001',...meshOperationForParameters('them'),transform,targets:[],queryToleranceCeilingMm:.002,limits:{vertices:1000000,triangles:400000,parts:128,operations:2000000},separateImportedAssemblyGroup:2});
function partMesh(s,p){return{vertices:s.vertices.slice(p.vertexStart,p.vertexStart+p.vertexCount),faces:s.faces.slice(p.faceStart,p.faceStart+p.faceCount).map(t=>t.map(i=>i-p.vertexStart))};}
function analyticVolume(s,p,expected){const mesh=partMesh(s,p),v=inspectMesh(mesh).volume,max=Math.max(1,...mesh.vertices.flat().map(Math.abs));
 // Conservative arithmetic comparison for this determinant SUM only. This is
 // not a kernel surface, Boolean, printer fit, or total numerical certificate.
 const arithmeticBound=512*mesh.faces.length*Number.EPSILON*max**3;assert(Math.abs(v-expected)<=arithmeticBound,`${v} != ${expected}, arithmetic ${arithmeticBound}`);return{volume:v,expected,arithmeticBound};}
async function execute(parent,before,context,inventory,{name,input=inputFixture(),transform=tilted(100,20,40),selection,expected=6,extraParts=1,blocked=false,mutate,invalid,check}){
 let a,p,q,pub;const charge=M._arch_raster_owned_bytes(),rawHash=sha(input.bytes);
 try{
  const choice=selection??{...selectionFor(transform),unit:input.unit};
  a=await ops.dispatch('previewImport',{context,input,selection:choice},{generation:reset()});
  if(invalid){assert.notEqual(a.state,'approval-required');records.push({name,state:a.state,typedInvalid:true,rawHash});return;}
  assert.equal(a.state,'approval-required',JSON.stringify(a));const originalPreview=structuredClone(a.preview);
  p=await ops.dispatch('approveImport',{token:a.token,context,approved:true,approvalHash:a.approvalHash},{generation:reset()});a=null;
  const cmd=command(inventory,transform);cmd.snapshotGeneration=new DataView(before.buffer,before.byteOffset).getUint32(16,true);if(mutate)mutate(cmd);
  if(typeof blocked==='string'){
   await assert.rejects(()=>ops.dispatch('prepare',{snapshotId:parent,token:p.token,context,command:cmd},{generation:reset()}),e=>String(e.code??e.message).includes(blocked));records.push({name,state:'typed-rejection',code:blocked,rawHash});return;
  }
  if(name==='keychain-stl-mm'){
   const ptr=M._arch_snapshot_ptr(parent),d=new DataView(M.HEAPU8.buffer),vo=new DataView(before.buffer,before.byteOffset).getUint32(48,true),nv=new DataView(before.buffer,before.byteOffset).getUint32(20,true);
   for(let v=0;v<nv;v++){const at=ptr+vo+24*v;d.setFloat64(at,d.getFloat64(at,true)+1,true);}
   let bad;try{bad=await ops.dispatch('prepare',{snapshotId:parent,token:p.token,context,command:cmd},{generation:reset()});}
   finally{M.HEAPU8.set(before,M._arch_snapshot_ptr(parent));}
   try{assert.equal(bad.state,'blocked');assert(bad.report.postCsgGates.checks.some(c=>c.message==='APPEND_GUARD_ORIGINAL_PART_CHANGED'));
    await assert.rejects(()=>ops.dispatch('confirm',{token:bad.token,context,approved:true,proposalHash:bad.confirmation.proposalHash},{generation:reset()}),e=>e.code==='MESH_POST_CSG_OR_TOPOLOGY_BLOCKED');}
   finally{if(bad)ops.release(bad.token);}
  }
  const retained=M._arch_raster_owned_bytes();
  q=await ops.dispatch('prepare',{snapshotId:parent,token:p.token,context,command:cmd},{generation:reset()});
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(q,null,2));
  const bytes=M.HEAPU8.slice(q.preview.byteOffset,q.preview.byteOffset+q.preview.byteLength);fs.writeFileSync(path.join(out,name+'.arch'),bytes);
  const n=preserved(before,bytes),s=readSnapshot(bytes);assert.equal(s.parts.length,n+extraParts);
  // Byte-for-byte source triangle order after the explicitly approved affine.
  // The import preview is already in user-selected millimetres; no unit guess.
  const previewVertices=Array.from(originalPreview.vertices),expectedVertices=[];
  for(let i=0;i<previewVertices.length;i+=3){const [x,y,z]=previewVertices.slice(i,i+3);for(let k=0;k<3;k++)expectedVertices.push(((transform[k]*x+transform[k+3]*y)+transform[k+6]*z)+transform[k+9]);}
  assert.deepEqual(s.vertices.slice(readSnapshot(before).vertices.length).flat(),expectedVertices);
  const tri=Array.from(originalPreview.triangles),det=transform[0]*(transform[4]*transform[8]-transform[5]*transform[7])-transform[1]*(transform[3]*transform[8]-transform[5]*transform[6])+transform[2]*(transform[3]*transform[7]-transform[4]*transform[6]);
  if(det<0)for(let i=0;i<tri.length;i+=3)[tri[i+1],tri[i+2]]=[tri[i+2],tri[i+1]];
  const offset=readSnapshot(before).vertices.length;assert.deepEqual(s.faces.slice(readSnapshot(before).faces.length).flat().map(i=>i-offset),tri);
  assert.equal(q.report.generatedGeometryPreserved,true);assert.equal(q.report.nativeCsg.explicitMaterialRemap,false);assert.deepEqual(q.report.nativeCsg.removedSelectedSemanticIds,[]);
  assert.equal(new Set(q.report.materialLineage.map(p=>p.partIdentity)).size,s.parts.length);
  assert.equal(q.report.importedSourceHash,rawHash);assert.equal(q.report.command.operation,'import-as-part');assert.deepEqual(q.report.command.targets,[]);
  for(const part of q.report.materialLineage.slice(n))assert.equal(part.assemblyGroup,2);
  await assert.rejects(()=>ops.dispatch('confirm',{token:q.token,context:{...context,headHash:sha('stale')},approved:true,proposalHash:q.confirmation.proposalHash},{generation:reset()}),e=>e.code==='MESH_STALE_CONTEXT');
  if(blocked){assert.equal(q.state,'blocked');await assert.rejects(()=>ops.dispatch('confirm',{token:q.token,context,approved:true,proposalHash:q.confirmation.proposalHash},{generation:reset()}),e=>e.code==='MESH_POST_CSG_OR_TOPOLOGY_BLOCKED');records.push({name,state:'gates-blocked',gates:q.report.postCsgGates,rawHash});return;}
  assert.equal(q.state,'confirmation-required',JSON.stringify({gates:q.report.postCsgGates,qualification:q.qualification}));
  const volumes=s.parts.slice(n).map((part,i)=>analyticVolume(s,part,Array.isArray(expected)?expected[i]:expected));
  if(check)check({s,n,report:q.report,originalPreview});
  await assert.rejects(()=>ops.dispatch('confirm',{token:q.token,context,approved:true,proposalHash:sha('wrong')},{generation:reset()}),e=>e.code==='MESH_EXACT_CONFIRMATION_MISMATCH');
  const cancelGeneration=reset();Atomics.store(new Int32Array(M.HEAPU8.buffer,M._arch_control_ptr(),4),3,cancelGeneration);
  await assert.rejects(()=>ops.dispatch('confirm',{token:q.token,context,approved:true,proposalHash:q.confirmation.proposalHash},{generation:cancelGeneration}),e=>e.code==='CANCELLED');
  const consumed=q.token;pub=await ops.dispatch('confirm',{token:q.token,context,approved:true,proposalHash:q.confirmation.proposalHash},{generation:reset()});q=null;
  assert.equal(ops.release(consumed),false);const published=snap(pub.snapshotId);assert.deepEqual(published.slice(20),bytes.slice(20));
  assert.equal(pub.metadata.applied,true);assert.equal(pub.metadata.exportBlocked,false);
  fs.writeFileSync(path.join(out,name+'.published.arch'),published);
  assert.equal(M._arch_snapshot_release(pub.snapshotId),1);assert.equal(M._arch_snapshot_release(pub.snapshotId),0);pub=null;
  assert.equal(M._arch_raster_owned_bytes(),retained);records.push({name,state:'published',volumes,parts:s.parts.length,generatedParts:n,rawHash,sourceUnit:input.unit,exactGeneratedGeometry:true,singlePrimaryRelease:true});
 }finally{if(pub)M._arch_snapshot_release(pub.snapshotId);if(q)ops.release(q.token);if(p)ops.release(p.token);if(a?.token)ops.release(a.token);assert.deepEqual(snap(parent),before);assert.equal(sha(input.bytes),rawHash);assert.equal(M._arch_raster_owned_bytes(),charge);fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(records,null,2));}
}
try{
 for(const product of ['keychain','clicky','strap','lego','charm']){
  const headHash=sha('apart:'+product),args={sourceHash:sha(source),headHash,product};
  const fixture=apartProduct(product,args);
  const g=reset(),parent=productOps.buildRequest(productOps.prepare({kind:'product',source:{kind:'svg',source},packed:fixture.packed},g),g),before=snap(parent);
  const sem=readProductSemantics(productOps.metadata(parent).semanticBytes),inventory=bindingInventory(before,sem),context={userId:'test-author',projectId:'test-project',revision:sem.revision,headHash};
  fs.writeFileSync(path.join(out,product+'-parent.arch'),before);
  try{
   await execute(parent,before,context,inventory,{name:product+'-stl-mm',input:inputFixture('stl','binary')});
   await execute(parent,before,context,inventory,{name:product+'-obj-mm',input:inputFixture('obj')});
   if(product==='keychain'){
    await execute(parent,before,context,inventory,{name:'cm-hole',input:{...inputFixture('stl','binary',squareTube()),unit:'centimeter'},expected:12000});
    await execute(parent,before,context,inventory,{name:'hole-section',input:inputFixture('obj','ascii',squareTube()),transform:affine(0,100,20,0),expected:12,check:({s,n})=>{const m=partMesh(s,s.parts[n]);assert.deepEqual(verticalIntersections(m,102,22),[]);assert.deepEqual(verticalIntersections(m,100.5,20.5),[0,1]);}});
    const second=triangle();second.vertices=second.vertices.map(p=>[p[0]+6,p[1],p[2]]);
    const raw=new TextEncoder().encode(new TextDecoder().decode(obj(triangle())).replace('usemtl tool','usemtl red')+new TextDecoder().decode(obj(second,{name:'second',material:'blue'})).replace(/^f (.*)$/gm,(_,line)=>'f '+line.split(' ').map(n=>Number(n)+6).join(' ')));
    const transform=tilted(100,20,40),input={...inputFixture('obj'),bytes:raw,materials:[{id:'800',name:'red',rgba:0xff0000ff},{id:'801',name:'blue',rgba:0x0000ffff}],sourceMaterialAssignments:[{sourceName:'red',materialId:'800'},{sourceName:'blue',materialId:'801'}]};
    await execute(parent,before,context,inventory,{name:'obj-two-materials',input,transform,extraParts:2,expected:[6,6],selection:{...selectionFor(transform),materials:[{sourceMaterialId:'800',materialId:'800',slot:8,rgba:0xff0000ff},{sourceMaterialId:'801',materialId:'801',slot:9,rgba:0x0000ffff}]},check:({s,n,report})=>{assert.deepEqual(s.parts.slice(n).map(p=>p.color),[0xff0000ff,0x0000ffff]);assert.deepEqual(report.materialLineage.slice(n).map(p=>p.materialId),['800','801']);}});
    const reflected=tilted(100,20,40);for(let k=0;k<3;k++)reflected[k]*=-1;
    await execute(parent,before,context,inventory,{name:'reflected-affine',transform:reflected,check:({report})=>assert.equal(report.nativeCsg.parts.at(-1).reflectionWinding,true)});
    await execute(parent,before,context,inventory,{name:'overlap-is-not-weld',transform:affine(0,3,-2,1),blocked:'CSG_IMPORT_AS_PART_COLLISION'});
    await execute(parent,before,context,inventory,{name:'target-must-be-empty',mutate:c=>{c.targets=[inventory.bindings[0].semanticId];},blocked:'MESH_IMPORT_AS_PART_HAS_NO_TARGET'});
    await execute(parent,before,context,inventory,{name:'no-target-material-remap',mutate:c=>{c.materialPolicy='keepSelectedTargetMaterial';},blocked:'MESH_IMPORT_AS_PART_PRESERVES_MATERIALS'});
    await execute(parent,before,context,inventory,{name:'output-budget',mutate:c=>{c.limits.parts=readSnapshot(before).parts.length;},blocked:'CSG_PART_BUDGET'});
    await execute(parent,before,context,inventory,{name:'below-bed-gate',transform:affine(0,100,20,-1),blocked:true});
    const open=triangle();open.triangles.pop();await execute(parent,before,context,inventory,{name:'open-input',input:inputFixture('stl','ascii',open),invalid:true});
    const noUnit=inputFixture();delete noUnit.unit;await execute(parent,before,context,inventory,{name:'unit-required',input:noUnit,invalid:true});
   }
  }finally{assert.equal(M._arch_snapshot_release(parent),1);}
 }
}finally{ops.reset();}
assert.equal(M._arch_raster_owned_bytes(),0);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({records,rootOwnedBytes:0,moduleSHA256:sha(fs.readFileSync(modulePath)),wasmSHA256:sha(fs.readFileSync(modulePath.replace(/mjs$/,'wasm'))),implementationOnly:true},null,2));console.log(JSON.stringify(records.map(r=>({name:r.name,state:r.state}))));
