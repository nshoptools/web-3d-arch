import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
import{createMeshRootOperations}from'../src/root-runtime.mjs';
import{createProductOperations,readProductSemantics}from'../../core/product-operations.mjs';
import{source,productFixture,inputFixture,bindingInventory,affine,selectionFor,commandFor,extendedCases,triangle,obj}from'./root-fixtures.mjs';
const run=path.resolve(process.env.PROJECT_REVIEW_RUN),out=path.join(run,'evidence/root-extended-'+(process.env.PROOF_TAG??'r1'));if(fs.existsSync(out))throw Error('fresh output');fs.mkdirSync(out);
const M=await(await import(pathToFileURL(path.join(run,'work/module/arch-kernel.mjs')))).default({print(){},printErr(){}});
const ops=createMeshRootOperations(M),productOps=createProductOperations(M),sha=b=>createHash('sha256').update(b).digest('hex'),headHash=sha('root-product-fixture');let generation=0;
const reset=()=>{assert.equal(M._arch_control_reset(++generation),1);return generation;};
const snap=id=>M.HEAPU8.slice(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id));
const owned=()=>M._arch_raster_owned_bytes(),records=[];
function build(product='keychain'){const g=reset(),f=productFixture({sourceHash:sha(source),headHash,product});
 const id=productOps.buildRequest(productOps.prepare({kind:'product',source:{kind:'svg',source},packed:f.packed},g),g),bytes=snap(id),sem=readProductSemantics(productOps.metadata(id).semanticBytes);
 return {id,bytes,sem,inventory:bindingInventory(bytes,sem),context:{userId:'test-author',projectId:'test-project',revision:sem.revision,headHash},generation:g};
}
let base=build();fs.writeFileSync(path.join(out,'parent.arch'),base.bytes);
async function prepared(input,transform,selection=selectionFor(transform)){
 const a=await ops.dispatch('previewImport',{context:base.context,input,selection},{generation:reset()});
 assert.equal(a.state,'approval-required',JSON.stringify(a));try{return await ops.dispatch('approveImport',{token:a.token,context:base.context,approved:true,approvalHash:a.approvalHash},{generation:reset()});}finally{ops.release(a.token);}
}
async function apply(name,input,transform,operation,{selection,change,expected='published'}={}){
 let p,q,root;const before=owned();
 try{
  p=await prepared(input,transform,selection);const cmd=commandFor(base.inventory,transform,operation);cmd.snapshotGeneration=base.generation;change?.(cmd);
  q=await ops.dispatch('prepare',{snapshotId:base.id,token:p.token,context:base.context,command:cmd},{generation:reset()});
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(q,null,2));
  fs.writeFileSync(path.join(out,name+'.arch'),M.HEAPU8.slice(q.preview.byteOffset,q.preview.byteOffset+q.preview.byteLength));
  assert.equal(q.state,expected==='published'?'confirmation-required':'blocked',JSON.stringify(q.report.postCsgGates));
  if(expected==='published'){
   root=await ops.dispatch('confirm',{token:q.token,context:base.context,approved:true,proposalHash:q.confirmation.proposalHash},{generation:reset()});q=null;
   fs.writeFileSync(path.join(out,name+'.published.arch'),snap(root.snapshotId));
   const n=M._arch_mesh_buffer_len(root.snapshotId,4),p=M._arch_mesh_buffer_ptr(root.snapshotId,4);assert.equal(sha(M.HEAPU8.slice(p,p+n)),sha(input.bytes));
   const lineageN=M._arch_mesh_buffer_len(root.snapshotId,5);assert.equal(lineageN,new DataView(snap(root.snapshotId).buffer).getUint32(24,true)*16);
  }else await assert.rejects(()=>ops.dispatch('confirm',{token:q.token,context:base.context,approved:true,proposalHash:q.confirmation.proposalHash},{generation:reset()}),e=>e.code==='MESH_POST_CSG_OR_TOPOLOGY_BLOCKED');
  assert.equal(sha(snap(base.id)),sha(base.bytes));records.push({name,state:expected,originalExact:true,parentUnchanged:true});
 }finally{if(root)M._arch_snapshot_release(root.snapshotId);if(q)ops.release(q.token);if(p)ops.release(p.token);assert.equal(owned(),before);}
}
try{
 for(const c of extendedCases())await apply(c.name,c.input,c.transform,c.operation);
 // Two disjoint nonbox OBJ objects keep distinct imported material identities.
 const a=triangle(),b=triangle();b.vertices=b.vertices.map(v=>[v[0],v[1]+5,v[2]]);
 const off=a.vertices.length,joined=new TextEncoder().encode(new TextDecoder().decode(obj(a,{name:'one',material:'tool'}))+'\n'+
 'o two\n'+b.vertices.map(v=>'v '+v.join(' ')).join('\n')+'\nusemtl second\n'+b.triangles.map(t=>'f '+t.map(i=>i+1+off).join(' ')).join('\n')+'\n');
 const input={...inputFixture('obj'),bytes:joined,materials:[{id:'800',name:'one',rgba:0x30353bff},{id:'801',name:'two',rgba:0x11cc33ff}],
 sourceMaterialAssignments:[{sourceName:'tool',materialId:'800'},{sourceName:'second',materialId:'801'}]};
 const transform=affine(29,30,-2,0),sel=selectionFor(transform);sel.materials.push({sourceMaterialId:'801',materialId:'801',slot:9,rgba:0x11cc33ff});
 await apply('disconnected-multimaterial-obj',input,transform,'union',{selection:sel,change:c=>c.materialPolicy='requireDisjointMaterials'});
 const p=await prepared(inputFixture(),affine(31,3,-2,1)),retained=owned();
 try{
  const invalids=[
   ['resource-budget',c=>c.limits.operations=1,/RESOURCE|WORK|BUDGET/i],
   ['wrong-generated-binding',c=>c.bindings[0].sourceId='123',/MESH_GENERATED_LINEAGE_MISMATCH/],
   ['orphan-target',c=>c.targets=['9999'],/MESH_TARGET_ORPHAN/],
   ['stale-parent-generation',c=>c.snapshotGeneration=99999,/MESH_GENERATED_GENERATION/],
   ['unapproved-transform',c=>c.transform[9]+=1,/MESH_TRANSFORM_APPROVAL_MISMATCH/],
   ['same-head-next-revision',c=>c.publication={version:'arch-mesh-publication/1',revision:String(Number(base.sem.revision)+1),headHash,transactionHash:'b'.repeat(64)},/MESH_PUBLICATION_HEAD/],
  ];
  for(const[name,change,expected]of invalids){
   const cmd=commandFor(base.inventory,affine(31,3,-2,1),'difference');cmd.snapshotGeneration=base.generation;change(cmd);
   await assert.rejects(()=>ops.dispatch('prepare',{snapshotId:base.id,token:p.token,context:base.context,command:cmd},{generation:reset()}),e=>expected.test(e.code??e.message));
   assert.equal(owned(),retained);assert.deepEqual(snap(base.id),base.bytes);records.push({name,state:'rejected',noPartial:true});
  }
  const g=reset(),c=new Int32Array(M.HEAPU8.buffer,M._arch_control_ptr(),4);Atomics.store(c,3,g);
  await assert.rejects(()=>ops.dispatch('prepare',{snapshotId:base.id,token:p.token,context:base.context,command:{}},{generation:g}),e=>e.code==='CANCELLED');
  assert.equal(owned(),retained);records.push({name:'cancel-before-native',state:'rejected',noPartial:true});
  for(let i=0;i<63;i++)assert(M._arch_snapshot_acquire(base.id));assert.equal(M._arch_snapshot_acquire(base.id),0);
  try{const cmd=commandFor(base.inventory,affine(31,3,-2,1),'difference');cmd.snapshotGeneration=base.generation;
   await assert.rejects(()=>ops.dispatch('prepare',{snapshotId:base.id,token:p.token,context:base.context,command:cmd},{generation:reset()}),e=>e.code==='MESH_GENERATED_GENERATION');
  }finally{for(let i=0;i<63;i++)M._arch_snapshot_release(base.id);}
  assert.equal(owned(),retained);records.push({name:'root-reader-lease-limit',state:'rejected',noPartial:true});
 }finally{ops.release(p.token);}
 const broken=inputFixture();broken.bytes=new TextEncoder().encode(new TextDecoder().decode(broken.bytes).replace(/facet normal[\s\S]*?endfacet\n/,''));
 const preview=await ops.dispatch('previewImport',{context:base.context,input:broken,selection:selectionFor(affine(31,3,-2,1))},{generation:reset()});
 assert.equal(preview.state,'repair-proposal');assert(!preview.token);records.push({name:'nonmanifold-no-silent-repair',state:preview.state});
 const collisionSelection=selectionFor(transform);collisionSelection.materials[0].slot=1;
 await assert.rejects(()=>apply('imported-slot-collision',inputFixture(),transform,'union',{selection:collisionSelection,change:c=>c.materialPolicy='requireDisjointMaterials'}),e=>/MESH_FINAL_SLOT_COLLISION/.test(e.code));records.push({name:'imported-slot-collision',state:'rejected',noPartial:true});
 M._arch_snapshot_release(base.id);base=build('strap');fs.writeFileSync(path.join(out,'strap-parent.arch'),base.bytes);
 await apply('strap-cut-away-from-tunnel',inputFixture(),affine(21,3,7,1),'difference');
 await apply('strap-roof-breakout',inputFixture(),affine(21,3,-1,4),'difference',{expected:'blocked'});
}finally{M._arch_snapshot_release(base.id);ops.reset();}
assert.equal(owned(),0);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({records,rootOwnedBytes:owned()},null,2));console.log(JSON.stringify(records));
