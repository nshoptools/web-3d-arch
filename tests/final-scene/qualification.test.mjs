import test from 'node:test';import assert from 'node:assert/strict';
import {qualifyMesh} from '../../src/core/mesh-qualification.mjs';
import {triangleIntersection,exactVertices} from '../../src/core/mesh-predicates.mjs';
import {box,tetra,arch,reverse,stl,prism,join} from './fixtures.mjs';
const q=(m,opts)=>qualifyMesh(arch(m,opts)),fail=(r,code)=>{assert.equal(r.verdict,'fail',JSON.stringify(r));if(code)assert.equal(r.code,code);};
test('analytic cube and tetra certify represented geometry, not physical fit',()=>{
 for(const m of [box(),tetra()]){const r=q(m);assert.equal(r.verdict,'pass',JSON.stringify(r));assert.equal(r.scope.physicalFit,'unqualified');assert.equal(r.scope.globalPipelineError,'unverified');}
});
test('open edge, reversed face and inverted closed shell are rejected',()=>{
 const b=box();fail(q({...b,faces:b.faces.slice(1)}),'MESH_EDGE_INCIDENCE');
 fail(q({...b,faces:b.faces.map((f,i)=>i===0?[f[0],f[2],f[1]]:f)}),'MESH_EDGE_WINDING');fail(q(reverse(b)),'MESH_COMPONENT_WINDING');
});
test('exact nonzero triangles are not snapped; exact collinearity rejects',()=>{
 const b=tetra();fail(q({...b,vertices:b.vertices.map((p,i)=>i===3?[.5,0,0]:p)}),'MESH_DEGENERATE');
 const thin=box([0,0,0],[1,1,1e-13]);assert.equal(q(thin).verdict,'pass');
 for(const scale of [1e-110,1e-200,Number.MIN_VALUE]){
  const tiny=box([0,0,0],[scale,scale,scale]);assert.equal(q(tiny).verdict,'pass',String(scale));
 }
});
test('two closed fans pinched at one vertex fail vertex link despite edge incidence two',()=>{
 const a=tetra(),b=tetra(),vertices=[...a.vertices,...b.vertices.slice(1).map(p=>p.map(v=>-v))];
 const faces=[...a.faces,...reverse(b).faces.map(f=>f.map(i=>i?i+3:0))];
 fail(q({vertices,faces}),'MESH_VERTEX_LINK');
});
test('self-intersection across disconnected shells cannot borrow topology pass',()=>{
 fail(q([box(),box([.5,.4,.3],[1.5,1.4,1.3])],{separateParts:false}),'MESH_SELF_INTERSECTION');
});
test('material proper intersection and contained interior are rejected',()=>{
 fail(q([box(),box([.5,.4,.3],[1.5,1.4,1.3])]));
 fail(q([box([0,0,0],[3,3,3]),box([1,1,1],[2,2,2])]),'MESH_MATERIAL_CONTAINMENT');
});
// The discrimination is what matters: same outward direction is a rejection, an opposite
// shared face is not. The accepting half stops at unverified rather than pass because the
// interior claim is no longer certified by a vertex sample; that ceiling is asserted here so
// a future predicate has to move it deliberately.
test('material coincident faces with same outward direction reject, an opposite shared face does not',()=>{
 fail(q([box(),box()]),'MESH_MATERIAL_COINCIDENT_INTERIOR');
 const r=q([box(),box([1,0,0],[2,1,1])]);
 assert.equal(r.verdict,'pass',JSON.stringify(r));
 assert.equal(r.checks.materialInteriors,'requires-interior-proof');
 assert.equal(r.checks.unionTopology,'requires-union-readback');
});
test('edge-only and point-only material contacts are not advertised manifold unions',()=>{
 for(const b of [box([1,1,0],[2,2,1]),box([1,1,1],[2,2,2])])assert.notEqual(q([box(),b]).verdict,'pass');
});
// Rejecting this is not enough: silence would satisfy notEqual(pass) while saying nothing.
// The filler has four vertices genuinely inside the shell, so the answer owed here is fail.
// It used to be unverified, because the walk threw on the cavity component and never reached
// the filler's own component at all.
test('a filler reaching past the cavity into material is rejected, not merely unresolved',()=>{
 const shell=join(box([0,0,0],[3,3,3]),reverse(box([1,1,1],[2,2,2])));
 const r=q([shell,box([1,1,1],[2,2,2.5])]);
 assert.equal(r.verdict,'fail');
 assert.equal(r.code,'MESH_MATERIAL_CONTAINMENT');
});
// Every vertex of the filler sits on the shell's boundary and the walls only
// ever meet edge on, yet the filler takes 1 mm3 of the shell's material at the
// notch. Neither a shared face nor a vertex sample may certify this.
test('a filler bulging into material across a concave corner is not certified',()=>{
 const cavity=[[1,1],[3,1],[3,2],[2,2],[2,3],[1,3]],hull=[[1,1],[3,1],[3,2],[2,3],[1,3]];
 const shell=join(box([0,0,0],[4,4,4]),reverse(prism(cavity,1,3)));
 assert.notEqual(q([shell,prism(hull,1,3)]).verdict,'pass');
});
test('hollow shell cavity orientation is checked by containment depth',()=>{
 const outer=box([0,0,0],[3,3,3]),inner=box([1,1,1],[2,2,2]);
 assert.equal(q([outer,reverse(inner)],{separateParts:false}).verdict,'pass');
 fail(q([outer,inner],{separateParts:false}),'MESH_COMPONENT_WINDING');
});
test('near but separated material faces do not become overlap by epsilon',()=>{
 const r=q([box(),box([1+1e-12,0,0],[2,1,1])]);
 assert.equal(r.verdict,'pass',JSON.stringify(r));
 assert.equal(r.checks.materialInteriors,'requires-interior-proof');
});
test('hard admission/cancel budgets cannot return pass',()=>{
 const bytes=arch(box());assert.equal(qualifyMesh(bytes,{limits:{candidatePairs:1}}).verdict,'unverified');
 const abort=new AbortController();abort.abort();assert.equal(qualifyMesh(bytes,{signal:abort.signal}).code,'CANCELLED');
 const bad=bytes.slice();new DataView(bad.buffer).setFloat64(128,NaN,true);fail(qualifyMesh(bad));
});
test('binary STL readback welds only exact represented coordinates and rejects truncation',()=>{
 assert.equal(qualifyMesh(stl(box()),{format:'STL/binary'}).verdict,'pass');
 fail(qualifyMesh(stl(box()).slice(0,-1),{format:'STL/binary'}));
});
test('exact triangle predicates catch sub-ulp-distance plane ambiguity and coplanar overlap',()=>{
 const a=[[0,0,0],[1,0,0],[0,1,0]],b=[[.25,.25,0],[.75,.25,0],[.25,.75,0]];
 const v=exactVertices([...a,...b].flat()).vertices;assert.equal(triangleIntersection(v.slice(0,3),v.slice(3)).dimension,2);
 const w=exactVertices([...a,...b.map(p=>[p[0],p[1],Number.MIN_VALUE])].flat()).vertices;
 assert.equal(triangleIntersection(w.slice(0,3),w.slice(3)).dimension,-1);
});

// Splitting one coplanar triangle changes no solid, no surface and no material, so it must
// not change the verdict. It did: the containment scan stopped at the first vertex it could
// prove outside, and a split that put such a vertex first hid 2 mm3 of real overlap behind
// it, turning MESH_MATERIAL_CONTAINMENT into MESH_QUALIFIED. An outside vertex proves the
// component is not contained; it never proves the interiors are disjoint.
test('refining a coplanar face cannot turn a material intersection into a pass',()=>{
 const cavity=[[.5,1],[3,1],[3,2],[2,2],[2,3],[.5,3]];
 const shell=join(box([0,0,0],[4,4,4]),reverse(prism(cavity,1,3)));
 const build=split=>{
  const filler=prism([[1,1],[3,1],[3,3],[1,3]],1,3);
  if(split){
   const f=filler.faces[7],n=filler.vertices.length;
   filler.vertices.push([0,1,2].map(k=>filler.vertices[f[0]][k]/4+filler.vertices[f[1]][k]/4+filler.vertices[f[2]][k]/2));
   filler.faces.splice(7,1,[n,f[0],f[1]],[n,f[1],f[2]],[n,f[2],f[0]]);
   if(split==='first')filler.faces.unshift(filler.faces.splice(7,1)[0]);
  }
  return q([shell,filler]);
 };
 // The overlap is exactly (2,3)x(2,3)x(1,3): the L-shaped cavity leaves that column solid.
 for(const split of [false,true,'first']){
  const r=build(split);
  assert.equal(r.verdict,'fail',String(split));
  assert.equal(r.code,'MESH_MATERIAL_CONTAINMENT',String(split));
 }
});
