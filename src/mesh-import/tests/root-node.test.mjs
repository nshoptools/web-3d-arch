import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {createMeshRootOperations} from '../src/root-runtime.mjs';
import {createProductOperations,readProductSemantics} from '../../core/product-operations.mjs';
import {readSnapshot,inspectMesh} from '../../../tests/oracles/mesh-oracle.mjs';
import {source,productFixture,inputFixture,bindingInventory,affine,selectionFor,commandFor} from './root-fixtures.mjs';
const run=path.resolve(process.env.PROJECT_REVIEW_RUN),out=path.join(run,'evidence/root-node-'+(process.env.PROOF_TAG??'r2'));fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const M=await (await import(pathToFileURL(path.resolve(process.env.ARCH_CSG_MODULE??path.join(run,'work/module/arch-kernel.mjs'))))).default({print:()=>{},printErr:()=>{}});
const ops=createMeshRootOperations(M),productOps=createProductOperations(M);let generation=0;
const reset=()=>{const g=++generation;assert.equal(M._arch_control_reset(g),1);return g;};
const snapshot=id=>new Uint8Array(M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id)));
const prefix='root-product-fixture',headHash=sha(prefix),sourceHash=sha(source),product=productFixture({sourceHash,headHash});
let g=reset();const parent=productOps.buildRequest(productOps.prepare({kind:'product',source:{kind:'svg',source},packed:product.packed},g),g);
const before=snapshot(parent),sem=readProductSemantics(productOps.metadata(parent).semanticBytes),inventory=bindingInventory(before,sem);
const context={userId:'test-author',projectId:'test-project',revision:sem.revision,headHash};
fs.writeFileSync(path.join(out,'parent.arch'),before);fs.writeFileSync(path.join(out,'parent.apms'),productOps.metadata(parent).semanticBytes);
fs.writeFileSync(path.join(out,'parent.json'),JSON.stringify({context,inventory,parts:readSnapshot(before).parts,intervals:sem.sourceIntervals},null,2));
const records=[];
try{
 for(const [name,format,encoding,operation,transform] of [
  ['internal-rotated-difference','stl','ascii','difference',affine(31,3,-2,1)],
  ['rotated-obj-difference','obj','ascii','difference',affine(-23,3,-2,1)],
  ['far-union-rejected','stl','binary','union',affine(0,100,-2,1)],
  ['side-union','stl','binary','union',affine(35,19,-2,1)],
  ['internal-intersection-blocked-datum','stl','ascii','intersection',affine(17,3,-2,1)],
 ]){
  let a,p,q,published;
  try{
   a=await ops.dispatch('previewImport',{context,input:inputFixture(format,encoding),selection:selectionFor(transform)},{generation:reset()});
   assert.equal(a.state,'approval-required',JSON.stringify(a));
   p=await ops.dispatch('approveImport',{token:a.token,context,approved:true,approvalHash:a.approvalHash},{generation:reset()});a=null;
   const command=commandFor(inventory,transform,operation);command.snapshotGeneration=1;
   if(name==='far-union-rejected'){
    await assert.rejects(()=>ops.dispatch('prepare',{snapshotId:parent,token:p.token,context,command},{generation:reset()}),e=>String(e.code??e.message).includes('CSG_WELD_REQUIRES_CONNECTED_TARGET'));
    assert.equal(sha(snapshot(parent)),sha(before));records.push({name,state:'rejected-before-proposal',unchangedParent:true});continue;
   }
   q=await ops.dispatch('prepare',{snapshotId:parent,token:p.token,context,command},{generation:reset()});
   fs.writeFileSync(path.join(out,name+'.proposal.json'),JSON.stringify(q,null,2));
   const b=new Uint8Array(M.HEAPU8.subarray(q.preview.byteOffset,q.preview.byteOffset+q.preview.byteLength));
   fs.writeFileSync(path.join(out,name+'.arch'),b);assert.equal(sha(snapshot(parent)),sha(before));
   if(name.endsWith('blocked-datum')){
    assert.equal(q.state,'blocked');await assert.rejects(()=>ops.dispatch('confirm',{token:q.token,context,approved:true,proposalHash:q.confirmation.proposalHash},{generation:reset()}),e=>e.code==='MESH_POST_CSG_OR_TOPOLOGY_BLOCKED');
   }else{
    assert.equal(q.state,'confirmation-required',JSON.stringify({gate:q.report.postCsgGates,qualification:q.qualification}));
    published=await ops.dispatch('confirm',{token:q.token,context,approved:true,proposalHash:q.confirmation.proposalHash},{generation:reset()});q=null;
    assert(published.snapshotId);const bytes=snapshot(published.snapshotId),s=readSnapshot(bytes);
    for(const part of s.parts)inspectMesh({vertices:s.vertices,faces:s.faces.slice(part.faceStart,part.faceStart+part.faceCount)});
    fs.writeFileSync(path.join(out,name+'.published.arch'),bytes);
    fs.writeFileSync(path.join(out,name+'.published.json'),JSON.stringify(published.metadata,null,2));
    assert.equal(new DataView(bytes.buffer).getUint32(16,true),generation);assert.equal(published.metadata.applied,true);
   }
   records.push({name,state:published?'published':q.state,unchangedParent:true});
  }finally{if(published)M._arch_snapshot_release(published.snapshotId);if(q?.token)ops.release(q.token);if(p?.token)ops.release(p.token);if(a?.token)ops.release(a.token);}
 }
}finally{M._arch_snapshot_release(parent);ops.reset();}
assert.equal(M._arch_raster_owned_bytes(),0);
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({records,rootOwnedBytes:String(M._arch_raster_owned_bytes())},null,2));console.log(JSON.stringify(records));
