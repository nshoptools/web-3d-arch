// Authored fixture/oracle code. No product/native geometry implementation import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readSnapshot,verticalIntersections,inspectMesh} from './support/mesh-oracle.mjs';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
const HASH=/^[a-f0-9]{64}$/;
export function geometryHash(mesh){
 const vertex=p=>p.map(x=>Object.is(x,-0)?0:x).join(',');
 const faces=mesh.faces.map(f=>{
  const v=f.map(i=>vertex(mesh.vertices[i])),rotations=[v,v.slice(1).concat(v[0]),v.slice(2).concat(v.slice(0,2))];
  return rotations.map(r=>r.join('|')).sort()[0];
 }).sort();
 return sha256(Buffer.from(faces.join('\n')));
}
export function readGenerated(bytes,checkpoint){
 const parsed=readSnapshot(bytes),descriptor=checkpoint.visible?.product?.exportDescriptor;
 assert.ok(descriptor?.parts?.length,'actual generated product descriptor required');
 const byID=new Map(descriptor.parts.map(p=>[p.id,p]));
 assert.equal(byID.size,descriptor.parts.length);
 const parts=checkpoint.visible.blocks.map(block=>{
  const d=byID.get(block.id);assert.ok(d,'exact block ID -> descriptor');
  assert.equal(d.materialId,block.materialId);assert.equal(d.partIndex,block.partIndex,'actual partIndex, never array-index guess');
  const p=parsed.parts[d.partIndex];assert.ok(p);
  const material=checkpoint.state.content.app.materials.find(m=>m.id===d.materialId);
  assert.ok(material&&!material.excluded);assert.equal(material.slot,d.slot);
  const vertices=parsed.vertices.slice(p.vertexStart,p.vertexStart+p.vertexCount);
  const faces=parsed.faces.slice(p.faceStart,p.faceStart+p.faceCount).map(f=>f.map(i=>i-p.vertexStart));
  const mesh={vertices,faces},bounds={min:[0,1,2].map(k=>Math.min(...vertices.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...vertices.map(v=>v[k])))};
  return {block,descriptor:d,mesh,bounds,oracle:inspectMesh(mesh)};
 });
 return {parsed,parts};
}
const separated=(a,b,eps=1e-8)=>[0,1,2].some(k=>a.max[k]<=b.min[k]+eps||b.max[k]<=a.min[k]+eps);
const overlapsXY=(a,b,eps=1e-8)=>![0,1].some(k=>a.max[k]<b.min[k]-eps||b.max[k]<a.min[k]-eps);
function planarPrism(part){
 const {min,max}=part.bounds,eps=1e-8;
 if(max[2]-min[2]<.1||!part.mesh.vertices.every(v=>Math.abs(v[2]-min[2])<eps||Math.abs(v[2]-max[2])<eps))return false;
 for(const f of part.mesh.faces){
  const [a,b,c]=f.map(i=>part.mesh.vertices[i]);
  if(Math.max(a[2],b[2],c[2])-Math.min(a[2],b[2],c[2])<eps)continue;
  const nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  if(Math.abs(nz)>eps)return false; // every non-cap triangle is vertical
 }
 return true;
}
function footprintInside(part,box){
 const eps=1e-8;
 // A non-cap face projects to a boundary segment. Reject even a segment's
 // bounding-box overlap: conservative; never accept merely on sparse samples.
 for(const f of part.mesh.faces){
  const vs=f.map(i=>part.mesh.vertices[i]);
  if(Math.max(...vs.map(p=>p[2]))-Math.min(...vs.map(p=>p[2]))<eps)continue;
  const bounds={min:[0,1].map(k=>Math.min(...vs.map(p=>p[k]))),max:[0,1].map(k=>Math.max(...vs.map(p=>p[k])))};
  if(overlapsXY(bounds,box))return false;
 }
 for(const x of [box.min[0],(box.min[0]+box.max[0])/2,box.max[0]])
 for(const y of [box.min[1],(box.min[1]+box.max[1])/2,box.max[1]]){
  const hits=verticalIntersections(part.mesh,x,y);
  if(hits.length!==2||Math.abs(hits[0]-part.bounds.min[2])>1e-7||Math.abs(hits[1]-part.bounds.max[2])>1e-7)return false;
 }
 return true;
}
export function chooseCuboid(generated,{operation,target='exact-region'}){
 if(operation==='import-as-part'){
  const part=generated.parts.find(p=>p.block.kind==='region')??generated.parts[0];
  const x=Number((Math.max(...generated.parts.map(p=>p.bounds.max[0]))+3).toFixed(6));
  return {version:'arch-authored-csg-cuboid/1',targetId:null,resolvedTargetId:null,materialId:part.block.materialId,
   operation,unit:'millimeter',bounds:{min:[x,0,0],max:[x+1,1,1]},expectedVolumeDelta:1,
   evidence:{selection:'explicit source-region material; no target',separationFromEveryGeneratedPartMm:3}};
 }
 assert.ok(['union','difference'].includes(operation));
 const eligible=generated.parts.filter(p=>['main-body','exact-body'].includes(target)?p.descriptor.role===0&&p.descriptor.assemblyGroup===0:p.block.kind==='region')
  .sort((a,b)=>b.oracle.volume-a.oracle.volume||a.block.id.localeCompare(b.block.id));
 if(target==='main-body')assert.ok(eligible.length>0,'fixture chooses largest eligible body independently; controller must resolve the alias to this exact original ID');
 const fractions=[.0371,.0837,.1763,.2931,.4137,.5683,.7193,.8367,.9271,.9661];
 for(const part of eligible){
  if(!planarPrism(part))continue;
  const {min,max}=part.bounds,h=max[2]-min[2],half=Math.min(.2,(max[0]-min[0])/50,(max[1]-min[1])/50);
  if(half<.03)continue;
  for(const fx of fractions)for(const fy of fractions){
   const x=min[0]+(max[0]-min[0])*fx,y=min[1]+(max[1]-min[1])*fy;
   const box={min:[x-half,y-half,operation==='difference'?min[2]-.25:max[2]-h/2],
    max:[x+half,y+half,operation==='difference'?max[2]+.25:max[2]+h/2]};
   // Authored numeric input is explicitly on a 1 nanometre decimal grid;
   // test the quantized cuboid itself. No generated model coordinates change.
   for(const key of ['min','max'])box[key]=box[key].map(v=>Number(v.toFixed(6)));
   if(!footprintInside(part,box))continue;
   // Any other-part bbox overlap rejects placement, even if actual solids might
   // be disjoint. This proves the expected volume delta against final union.
   const effect=operation==='difference'?{min:[box.min[0],box.min[1],min[2]],max:[box.max[0],box.max[1],max[2]]}:box;
   if(generated.parts.some(p=>p!==part&&!separated(p.bounds,effect)))continue;
   const area=(box.max[0]-box.min[0])*(box.max[1]-box.min[1]);
   return {version:'arch-authored-csg-cuboid/1',targetId:target==='main-body'?'@main-body':part.block.id,
    resolvedTargetId:part.block.id,materialId:part.block.materialId,partIndex:part.descriptor.partIndex,
    operation,unit:'millimeter',bounds:box,expectedVolumeDelta:operation==='difference'?-area*h:area*(box.max[2]-max[2]),
    evidence:{flatPrism:true,capLevels:[min[2],max[2]],noProjectedBoundaryIntersectsRectangle:true,
     noOtherPartBoundingBoxOverlapsAffectedVolume:true,authoredDecimalPlaces:6,selection:'actual descriptor/full material ID',halfWidthMm:half}};
  }
 }
 throw Error('FIXTURE_NO_PROVEN_RECTANGULAR_PLACEMENT');
}
export function cuboidMesh(bounds){
 const [a,b]=[bounds.min,bounds.max],vertices=[
  [a[0],a[1],a[2]],[b[0],a[1],a[2]],[b[0],b[1],a[2]],[a[0],b[1],a[2]],
  [a[0],a[1],b[2]],[b[0],a[1],b[2]],[b[0],b[1],b[2]],[a[0],b[1],b[2]]
 ];
 const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
 return {vertices,faces};
}
export function authoredFile(fixture,format){
 const mesh=cuboidMesh(fixture.bounds);inspectMesh(mesh);
 if(format==='stl'){
  // ASCII STL keeps decimal authoring exact; binary STL readback is independent.
  const facets=mesh.faces.map(f=>'facet normal 0 0 0\nouter loop\n'+f.map(i=>'vertex '+mesh.vertices[i].map(x=>x.toFixed(6)).join(' ')).join('\n')+'\nendloop\nendfacet');
  return {name:'authored-mm-cut.stl',mediaType:'model/stl',bytes:Buffer.from('solid authored_box\n'+facets.join('\n')+'\nendsolid authored_box\n')};
 }
 assert.equal(format,'obj');
 return {name:'authored-mm-union.obj',mediaType:'model/obj',bytes:Buffer.from('# Authored closed cuboid; unit selected explicitly in controller\no authored_box\n'+mesh.vertices.map(v=>'v '+v.join(' ')).join('\n')+'\nusemtl authored_named_material\n'+mesh.faces.map(f=>'f '+f.map(i=>i+1).join(' ')).join('\n')+'\n')};
}
export function assertOriginal(checkpoint,file){
 const desc=checkpoint.state.content.app.mesh;
 assert.equal(desc.raw.hash,sha256(file.bytes));assert.equal(desc.raw.byteLength,file.bytes.length);
 assert.ok(desc.assetHashes.includes(desc.raw.hash));
 const stored=checkpoint.durable.assets.find(a=>a.hash===desc.raw.hash);
 assert.ok(stored);assert.equal(stored.actualSHA256,desc.raw.hash);assert.equal(stored.byteLength,file.bytes.length);
}
export function verifyReplayBindings(checkpoint,fixture,file){
 assertOriginal(checkpoint,file);
 const desc=checkpoint.state.content.app.mesh,r=desc.metadata.meshCsg;
 assert.equal(desc.applied,true);assert.equal(r.version,'arch-mesh-replay/1');assert.equal(r.status,'approved-recipe');
 assert.equal(r.original.sha256,sha256(file.bytes));assert.equal(r.input.parser.unit,'millimeter');
 assert.equal(r.input.approval.unit,'millimeter');assert.equal(r.operation.command.operation,fixture.operation);
 assert.match(r.generatedBase.stateAssetHash,HASH);assert.ok(desc.assetHashes.includes(r.generatedBase.stateAssetHash));
 assert.ok(checkpoint.durable.assets.some(a=>a.hash===r.generatedBase.stateAssetHash&&a.actualSHA256===a.hash));
 const separate=fixture.operation==='import-as-part';
 assert.equal(r.operation.command.materialPolicy,separate?'requireDisjointMaterials':'keepSelectedTargetMaterial');
 assert.deepEqual(r.input.approval.transform.map(x=>x===0?0:x),[1,0,0,0,1,0,0,0,1,0,0,0]);
 assert.equal(r.parameters.resolved.targetId,fixture.resolvedTargetId);
 assert.equal(r.operation.command.targets.length,separate?0:1);if(!separate)assert.ok(r.operation.command.bindings.some(b=>b.semanticId===r.operation.command.targets[0]));
 assert.ok(Object.values(r.operation.materialNames).includes(fixture.materialId));
 assert.equal(r.input.approval.repair,'none');assert.equal(r.input.approval.conditioning,'none');
 return {recipe:r,originalHash:desc.raw.hash};
}

