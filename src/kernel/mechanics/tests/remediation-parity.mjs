import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {readSnapshot,partMesh,inspectMesh,bbox,intersections,close} from './oracles/mechanical-oracle.mjs';
const room=process.env.PROJECT_REVIEW_RUN;assert.ok(room&&process.env.PROJECT_ROOT&&!path.isAbsolute(path.relative(process.env.PROJECT_ROOT,room))&&!path.relative(process.env.PROJECT_ROOT,room).startsWith('..'),'Project run required');
const read=p=>JSON.parse(fs.readFileSync(path.join(room,p))),n=read('evidence/remediation-native-results.json'),w=read('evidence/remediation-wasm-results.json');
assert.equal(n.passed,n.total);assert.equal(w.passed,w.total);assert.deepEqual(n.cases.map(c=>c.id),w.cases.map(c=>c.id));
const file=path.join(process.env.PROJECT_ROOT,'tests/oracles/mesh-oracle.mjs'),main=await import(pathToFileURL(file));
const records=[];let checkedParts=0,maxBBoxDelta=0,maxVolumeDelta=0,maxSectionDelta=0;
for(const c of n.cases){
  const np=`evidence/remediation-native/${c.id}`,wp=`evidence/remediation-wasm/${c.id}`,a=read(np+'.json'),b=read(wp+'.json');
  assert.equal(a.verdict,b.verdict);assert.equal(a.exportBlocked,b.exportBlocked);assert.deepEqual(a.parameters,b.parameters);assert.deepEqual(a.intervals,b.intervals);assert.deepEqual(a.parts,b.parts);
  assert.equal(a.features.length,b.features.length);a.features.forEach((f,i)=>{const {dimensions,...identity}=f,{dimensions:d,...other}=b.features[i];assert.deepEqual(identity,other);dimensions.forEach((v,j)=>close(v,d[j],1e-10));});
  const x=readSnapshot(fs.readFileSync(path.join(room,np+'.bin'))),y=readSnapshot(fs.readFileSync(path.join(room,wp+'.bin')));assert.equal(x.parts.length,y.parts.length);
  for(let i=0;i<x.parts.length;i++){
    const xm=partMesh(x,x.parts[i]),ym=partMesh(y,y.parts[i]),xb=bbox(xm),yb=bbox(ym),xv=inspectMesh(xm).volume,yv=inspectMesh(ym).volume;
    main.inspectMesh(xm);main.inspectMesh(ym);checkedParts+=2;maxVolumeDelta=Math.max(maxVolumeDelta,Math.abs(xv-yv));close(xv,yv,1e-5);
    for(const k of ['min','max'])for(let d=0;d<3;d++){maxBBoxDelta=Math.max(maxBBoxDelta,Math.abs(xb[k][d]-yb[k][d]));close(xb[k][d],yb[k][d],1e-7);}
    for(const t of [.193,.517,.829]){const yy=xb.min[1]+xb.size[1]*.431,z=xb.min[2]+xb.size[2]*t,xh=intersections(xm,0,yy,z),yh=intersections(ym,0,yy,z);assert.equal(xh.length,yh.length);xh.forEach((v,j)=>{maxSectionDelta=Math.max(maxSectionDelta,Math.abs(v-yh[j]));close(v,yh[j],1e-6);});}
  }
  records.push({id:c.id,pass:true,verdict:a.verdict,parts:x.parts.length});
}
let legacyParts=0;const legacy=read('reports/mechanics-native-tests.json');for(const item of legacy.artifacts)for(const target of ['native','wasm']){
  const p=item.path.replace('fixtures-native','fixtures-'+target),scene=readSnapshot(fs.readFileSync(path.join(room,p)));for(const part of scene.parts){main.inspectMesh(partMesh(scene,part));legacyParts++;}
}
const result={cases:records.length,passed:records.length,maxBBoxDelta,maxVolumeDelta,maxSectionDelta,mainOracle:{path:'tests/oracles/mesh-oracle.mjs',sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),remediationParts:checkedParts,legacyParts},records};
fs.writeFileSync(path.join(room,'evidence/remediation-parity.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,records:undefined}));
