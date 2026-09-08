import {test} from 'node:test';import assert from 'node:assert/strict';import {compareSurface} from './surface-parity.mjs';
const a={vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],faces:[[0,1,2],[0,2,3]]};
const flip={...a,faces:[[0,1,3],[1,2,3]]};
test('coplanar alternate diagonals have the same complete directed boundary',()=>{const r=compareSurface(a,flip);assert.equal(r.maxSurfaceBound,0);assert.equal(r.patches,1);});
test('cyclic face order and vertex permutations preserve orientation',()=>{const b={vertices:[a.vertices[2],a.vertices[0],a.vertices[3],a.vertices[1]],faces:[[3,0,1],[2,1,0]]};assert.ok(compareSurface(a,b).orientedTrianglesIdentical);});
test('bounded coordinate correspondence is measured, not a mesh mutation',()=>{const b={vertices:a.vertices.map(p=>[p[0],p[1],p[2]+2e-10]),faces:a.faces},before=structuredClone(b);assert.ok(compareSurface(a,b).maxSurfaceBound>=2e-10);assert.deepEqual(b,before);});
test('same boundary on a folded quad does not imply surface parity',()=>{const v=a.vertices.map(p=>[...p]);v[2][2]=.01;assert.throws(()=>compareSurface({...a,vertices:v},{...flip,vertices:v}),/non-coplanar/);});
test('reversed normals fail',()=>assert.throws(()=>compareSurface(a,{...a,faces:a.faces.map(f=>[...f].reverse())}),/boundary differs|reverses orientation/));
test('large displacement fails and source is unchanged',()=>{const before=structuredClone(a);assert.throws(()=>compareSurface(a,{...a,vertices:a.vertices.map(p=>[p[0],p[1],p[2]+.001])}),/unmatched/);assert.deepEqual(a,before);});
test('common crease separates two independently retriangulated planar patches',()=>{
 const vertices=[...a.vertices,[2,0,1],[2,1,1]],x={vertices,faces:[...a.faces,[1,4,5],[1,5,2]]},y={vertices,faces:[...flip.faces,[1,4,2],[4,5,2]]};
 const r=compareSurface(x,y);assert.equal(r.patches,2);assert.ok(r.maxSurfaceBound<1e-14);
});
