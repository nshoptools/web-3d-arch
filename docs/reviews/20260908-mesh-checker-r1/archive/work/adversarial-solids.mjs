import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {qualifyMesh} from './review-source/src/core/mesh-qualification.mjs';
import {tetrahedron,encodeArch,invert} from './analytic-shapes.mjs';
// Exact integer convex SAT is an independent oracle for strict tetrahedron interior overlap.
const sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const determinant=p=>dot(sub(p[1],p[0]),cross(sub(p[2],p[0]),sub(p[3],p[0])));
const edges=p=>p.flatMap((a,i)=>p.slice(i+1).map(b=>sub(b,a)));
const normalAxes=p=>[[0,1,2],[0,1,3],[0,2,3],[1,2,3]].map(([a,b,c])=>cross(sub(p[b],p[a]),sub(p[c],p[a])));
function interiors(a,b){
 const axes=[...normalAxes(a),...normalAxes(b),...edges(a).flatMap(x=>edges(b).map(y=>cross(x,y)))];
 return axes.filter(n=>n.some(x=>x!==0)).every(n=>{const pa=a.map(p=>dot(p,n)),pb=b.map(p=>dot(p,n));return Math.min(...pa)<Math.max(...pb)&&Math.min(...pb)<Math.max(...pa);});
}
let seed=0x62dc1439;const rand=()=>{seed=(Math.imul(seed,1103515245)+12345)>>>0;return seed>>>16;};
const point=()=>Array.from({length:3},()=>rand()%5-2);
const make=()=>{for(;;){const p=Array.from({length:4},point),d=determinant(p);if(d===0)continue;return d>0?tetrahedron(p):invert(tetrahedron(p));}};
let intersecting=0,passed=0,failed=0,unknown=0;const unsafe=[],sample=[];
for(let i=0;i<5000;i++){
 const a=make(),b=make(),expected=interiors(a.vertices,b.vertices),r=qualifyMesh(encodeArch([a,b]));
 intersecting+=expected;passed+=r.verdict==='pass';failed+=r.verdict==='fail';unknown+=r.verdict==='unverified';
 if(i<10)sample.push({i,a,b,interiorOverlap:expected,verdict:r.verdict,code:r.code});
 if(expected&&r.verdict==='pass')unsafe.push({i,a,b,r});
}
const octa={vertices:[[2,2,-2],[0,0,-1],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]],faces:[]};
for(let i=0;i<4;i++){const a=2+i,b=2+(i+1)%4;octa.faces.push([0,a,b],[1,b,a]);}
const sharedVertex=qualifyMesh(encodeArch(octa));
const result={seed:'0x62dc1439',pairs:5000,intersecting,passed,failed,unknown,unsafe,sample,foldedOctahedron:{mesh:octa,report:sharedVertex},oracle:'integer convex SAT, coordinates -2..2: every operation exactly represented; strict positive overlap of all separating-axis intervals'};
fs.writeFileSync(path.join(process.env.PROJECT_REVIEW_RUN,'evidence/adversarial-solids.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({pairs:5000,intersecting,passed,failed,unknown,unsafe,foldedOctahedron:sharedVertex},null,2));assert.equal(unsafe.length,0);assert.equal(sharedVertex.code,'MESH_SELF_INTERSECTION');
