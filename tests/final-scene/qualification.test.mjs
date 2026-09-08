import test from 'node:test';import assert from 'node:assert/strict';
import {qualifyMesh} from '../../src/core/mesh-qualification.mjs';
import {triangleIntersection,exactVertices} from '../../src/core/mesh-predicates.mjs';
import {box,tetra,arch,reverse,stl} from './fixtures.mjs';
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
test('material coincident faces with same outward direction reject, opposite shared face passes',()=>{
 fail(q([box(),box()]),'MESH_MATERIAL_COINCIDENT_INTERIOR');
 const r=q([box(),box([1,0,0],[2,1,1])]);assert.equal(r.verdict,'pass',JSON.stringify(r));assert.equal(r.checks.unionTopology,'requires-union-readback');
});
test('edge-only and point-only material contacts are not advertised manifold unions',()=>{
 for(const b of [box([1,1,0],[2,2,1]),box([1,1,1],[2,2,2])])assert.notEqual(q([box(),b]).verdict,'pass');
});
test('hollow shell cavity orientation is checked by containment depth',()=>{
 const outer=box([0,0,0],[3,3,3]),inner=box([1,1,1],[2,2,2]);
 assert.equal(q([outer,reverse(inner)],{separateParts:false}).verdict,'pass');
 fail(q([outer,inner],{separateParts:false}),'MESH_COMPONENT_WINDING');
});
test('near but separated material faces do not become overlap by epsilon',()=>{
 assert.equal(q([box(),box([1+1e-12,0,0],[2,1,1])]).verdict,'pass');
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
