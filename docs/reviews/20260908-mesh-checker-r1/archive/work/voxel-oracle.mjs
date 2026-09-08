import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {qualifyMesh} from './review-source/src/core/mesh-qualification.mjs';import {encodeArch} from './analytic-shapes.mjs';
// Independent occupancy oracle for concave polycubes. Any shared unit cell is
// exactly 1 mm^3 of material interior overlap, irrespective of surface meshing.
const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const faces=[[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]];
function mesh(cells){const occupied=new Set(cells.map(p=>p.join(','))),vertices=[],triangles=[],index=new Map();
 const vertex=p=>{const k=p.join(',');if(!index.has(k)){index.set(k,vertices.length);vertices.push(p);}return index.get(k);};
 for(const c of cells)for(let d=0;d<6;d++){if(occupied.has(c.map((x,i)=>x+directions[d][i]).join(',')))continue;const q=faces[d].map(p=>vertex(c.map((x,i)=>x+p[i])));triangles.push([q[0],q[1],q[2]],[q[0],q[2],q[3]]);}return {vertices,faces:triangles};}
let seed=0xfe030407;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
const grow=()=>{const cells=[[rand()%4,rand()%4,rand()%4]],seen=new Set(cells.map(p=>p.join(',')));for(let i=0;i<12;i++){const base=cells[rand()%cells.length],d=directions[(rand()>>>8)%6],p=base.map((x,i)=>x+d[i]),k=p.join(',');if(!seen.has(k)){seen.add(k);cells.push(p);}}return cells;};
const rows=[],unsafe=[];for(let i=0;i<450;i++){
 const a=grow(),b=grow(),s=new Set(a.map(p=>p.join(','))),overlap=b.filter(p=>s.has(p.join(','))).length,r=qualifyMesh(encodeArch([mesh(a),mesh(b)]));
 const row={i,overlapVolumeMm3:overlap,verdict:r.verdict,code:r.code};rows.push(row);if(overlap&&r.verdict==='pass')unsafe.push({...row,a,b,report:r});
}
const result={seed:'0xfe030407',pairs:rows.length,interiorOverlapCases:rows.filter(r=>r.overlapVolumeMm3>0).length,unsafe,rows,limits:'Random surface nonmanifold cases are allowed to fail; only a positive verdict with nonzero occupancy intersection is counted unsafe.'};
fs.writeFileSync(path.join(process.env.PROJECT_REVIEW_RUN,'evidence/voxel-oracle.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({pairs:rows.length,interiorOverlapCases:result.interiorOverlapCases,unsafe},null,2));assert.equal(unsafe.length,0);
