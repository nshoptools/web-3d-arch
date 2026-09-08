import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const run=process.env.PROJECT_REVIEW_RUN;if(!run)throw Error('run environment required');
const read=f=>JSON.parse(fs.readFileSync(path.join(run,'evidence',f)));
const n=read('final-export-native-results.json'),w=read('final-export-wasm-results.json');assert.equal(n.passed,n.cases);assert.equal(w.passed,w.cases);assert.equal(n.cases,w.cases);
let maxVolume=0,maxBBox=0,maxSection=0,parts=0;
const rows=[];
for(let i=0;i<n.cases;i++){const a=n.results[i],b=w.results[i];assert.equal(a.id,b.id);if(a.metrics.rejected){assert.equal(a.metrics.rejected,b.metrics.rejected);rows.push({id:a.id,pass:true,rejected:true});continue;}
 const x=a.metrics,y=b.metrics;assert.equal(x.format,y.format);assert.equal(x.groups,y.groups);assert.equal(x.meshes.length,y.meshes.length);assert.equal(x.sections.length,y.sections.length);
 x.meshes.forEach((v,j)=>{const m=y.meshes[j],dv=Math.abs(v.volume-m.volume);maxVolume=Math.max(maxVolume,dv);assert.ok(dv<1e-5);assert.equal(v.euler,m.euler);v.bbox.forEach((p,k)=>{const d=Math.abs(p-m.bbox[k]);maxBBox=Math.max(maxBBox,d);assert.ok(d<1e-6)});parts+=2;});
 x.sections.forEach((a,j)=>{const d=Math.abs(a-y.sections[j]);maxSection=Math.max(maxSection,d);assert.ok(d<1e-7)});rows.push({id:a.id,pass:true});
}
const r={cases:rows.length,passed:rows.length,independentMeshOracleParts:parts,maxVolumeDeltaMm3:maxVolume,maxBBoxDeltaMm:maxBBox,maxSectionAreaDeltaMm2:maxSection,rows};fs.writeFileSync(path.join(run,'evidence/final-export-parity.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({...r,rows:undefined}));
