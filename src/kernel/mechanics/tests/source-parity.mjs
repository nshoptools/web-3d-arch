// Same frozen source oracle; room and import locations rebound.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {readSnapshot,partMesh,inspectMesh,bbox,intersections,close} from './oracles/mechanical-oracle.mjs';
const room=process.env.PROJECT_REVIEW_RUN;assert.ok(room&&process.env.PROJECT_ROOT&&!path.isAbsolute(path.relative(process.env.PROJECT_ROOT,room))&&!path.relative(process.env.PROJECT_ROOT,room).startsWith('..'),'Project run required');
const read=p=>JSON.parse(fs.readFileSync(path.join(room,p))),a=read('evidence/source-native-results.json'),b=read('evidence/source-wasm-results.json');
assert.equal(a.passed,a.total);assert.equal(b.passed,b.total);assert.deepEqual(a.cases.map(c=>c.id),b.cases.map(c=>c.id));
const mainFile=path.join(process.env.PROJECT_ROOT,'tests/oracles/mesh-oracle.mjs'),mainOracle=await import(pathToFileURL(mainFile));
const records=[];let meshParts=0,maxVolumeDelta=0,maxBBoxDelta=0,maxSectionDelta=0;
for(const row of a.cases){const id=row.id,n=read(`evidence/tests-native/${id}.json`),w=read(`evidence/tests-wasm/${id}.json`);
  assert.equal(n.verdict,w.verdict);assert.equal(n.mechanicsVerdict,w.mechanicsVerdict);assert.deepEqual(n.parameters,w.parameters);assert.deepEqual(n.slabs,w.slabs);assert.deepEqual(n.intervals,w.intervals);assert.deepEqual(n.inputRegions,w.inputRegions);assert.deepEqual(n.inputTexts,w.inputTexts);
  assert.equal(n.contacts.length,w.contacts.length);n.contacts.forEach((c,i)=>{assert.deepEqual(c.slice(0,3),w.contacts[i].slice(0,3));for(let j=3;j<c.length;j++)close(c[j],w.contacts[i][j],1e-8);});
  assert.equal(n.errors.length,w.errors.length);n.errors.forEach((c,i)=>{assert.deepEqual(c.slice(0,2),w.errors[i].slice(0,2));for(let j=2;j<c.length;j++)close(c[j],w.errors[i][j],1e-12);});
  assert.deepEqual(n.abiSizes,[184,320,48,104,120,32]);assert.deepEqual(w.abiSizes,[160,272,32,104,120,32]);
  const ns=readSnapshot(fs.readFileSync(path.join(room,`evidence/tests-native/${id}.bin`))),ws=readSnapshot(fs.readFileSync(path.join(room,`evidence/tests-wasm/${id}.bin`)));assert.equal(ns.parts.length,ws.parts.length);
  for(let i=0;i<ns.parts.length;i++){const x=partMesh(ns,ns.parts[i]),y=partMesh(ws,ws.parts[i]),xb=bbox(x),yb=bbox(y);assert.equal(ns.parts[i].color,ws.parts[i].color);assert.deepEqual(n.parts[i],w.parts[i]);
    const xv=inspectMesh(x).volume,yv=inspectMesh(y).volume,vd=Math.abs(xv-yv);maxVolumeDelta=Math.max(maxVolumeDelta,vd);close(xv,yv,1e-5);
    for(const k of ['min','max'])for(let d=0;d<3;d++){maxBBoxDelta=Math.max(maxBBoxDelta,Math.abs(xb[k][d]-yb[k][d]));close(xb[k][d],yb[k][d],1e-7);}
    for(const f of [.173,.531,.837]){const z=xb.min[2]+xb.size[2]*f,ys=xb.min[1]+xb.size[1]*.437,xx=intersections(x,0,ys,z),yy=intersections(y,0,ys,z);assert.equal(xx.length,yy.length);for(let j=0;j<xx.length;j++){maxSectionDelta=Math.max(maxSectionDelta,Math.abs(xx[j]-yy[j]));close(xx[j],yy[j],1e-6);}}
    mainOracle.inspectMesh(x);mainOracle.inspectMesh(y);meshParts+=2;
  }records.push({id,verdict:n.verdict,mechanicsVerdict:n.mechanicsVerdict,parts:ns.parts.length});
}
const result={cases:records.length,passed:records.length,maxVolumeDelta,maxBBoxDelta,maxSectionDelta,mainOracle:{path:'tests/oracles/mesh-oracle.mjs',sha256:createHash('sha256').update(fs.readFileSync(mainFile)).digest('hex'),meshPartsChecked:meshParts},records};
fs.writeFileSync(path.join(room,'evidence/source-native-wasm-parity.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,records:undefined}));
