import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {qualifyMesh} from './review-source/src/core/mesh-qualification.mjs';
import {exactVertices,pointInSolid} from './review-source/src/core/mesh-predicates.mjs';import {encodeArch,cuboid,invert,join} from './analytic-shapes.mjs';
const octa=top=>{const m={vertices:[top,[0,0,-1],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]],faces:[]};for(let i=0;i<4;i++){const a=2+i,b=2+(i+1)%4;m.faces.push([0,a,b],[1,b,a]);}return m;};
const folded=octa([2,2,0]),foldedReport=qualifyMesh(encodeArch(folded));
const shell=join([cuboid([0,0,0],[10,10,10]),invert(cuboid([2,2,2],[8,8,8]))]);
const rows=[];for(let x=-1;x<=11;x++)for(let y=-1;y<=11;y++)for(let z=-1;z<=11;z++){
 const p=[x,y,z],v=exactVertices([...shell.vertices,p].flat()).vertices,tri=shell.faces.map(f=>f.map(i=>v[i]));
 const onBox=(lo,hi)=>p.every(x=>x>=lo&&x<=hi)&&p.some(x=>x===lo||x===hi),inBox=(lo,hi)=>p.every(x=>x>lo&&x<hi);
 const expected=onBox(0,10)||onBox(2,8)?'boundary':inBox(0,10)&&!inBox(2,8)?'inside':'outside';
 const actual=pointInSolid(v.at(-1),tri);rows.push({p,expected,actual});
}
const mismatch=rows.filter(r=>r.actual!==r.expected);const result={foldedCoplanarOctahedron:{mesh:folded,report:foldedReport},points:rows.length,mismatch,oracle:'Coordinate interval tests on a 10 mm box minus concentric 6 mm cavity; shell boundaries are closed',rows};
fs.writeFileSync(path.join(process.env.PROJECT_REVIEW_RUN,'evidence/contact-and-containment.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({folded:foldedReport,points:rows.length,mismatch},null,2));assert.equal(foldedReport.verdict,'fail');assert.equal(mismatch.length,0);
