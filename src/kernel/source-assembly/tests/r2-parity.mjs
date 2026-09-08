import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {readSnapshot,partMesh,inspectMesh,bbox,intersections,close} from '../../mechanics/tests/oracles/mechanical-oracle.mjs';
const room=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),root=fs.realpathSync(process.env.PROJECT_ROOT);assert.ok(room.startsWith(root+path.sep));
const read=(t,file)=>JSON.parse(fs.readFileSync(path.join(room,'evidence/r2-'+t,file)));
const n=read('native','results.json'),w=read('wasm','results.json');assert.equal(n.total,n.passed);assert.equal(w.total,w.passed);
assert.deepEqual(n.results.map(r=>r.name),w.results.map(r=>r.name));
let exact=0,parts=0,maxVolumeDelta=0,maxBoxDelta=0,maxSectionDelta=0;
const records=[];
for(let i=0;i<n.results.length;i++){
 const a=n.results[i],b=w.results[i];assert.deepEqual(a.options,b.options);assert.equal(a.verdict,b.verdict);assert.equal(a.oldVerdict,b.oldVerdict);
 assert.deepEqual(a.intervals,b.intervals);if(a.sha256===b.sha256)exact++;
 const nm=read('native',a.name+'-new.json'),wm=read('wasm',a.name+'-new.json');
 assert.deepEqual(nm.parameters,wm.parameters);
 if(a.family==='source'){
  assert.deepEqual(nm.abiSizes,[184,320,48,104,120,32]);assert.deepEqual(wm.abiSizes,[160,272,32,104,120,32]);
  assert.deepEqual(nm.inputRegions,wm.inputRegions);assert.deepEqual(nm.inputTexts,wm.inputTexts);assert.deepEqual(nm.slabs,wm.slabs);
  assert.equal(nm.semanticsVersion,2);assert.equal(wm.semanticsVersion,2);
 }else{
  assert.equal(nm.layout.request,224);assert.equal(wm.layout.request,200);assert.equal(nm.layout.view,152);assert.equal(wm.layout.view,112);
 }
 const ns=readSnapshot(fs.readFileSync(path.join(room,'evidence/r2-native',a.name+'-new.bin'))),ws=readSnapshot(fs.readFileSync(path.join(room,'evidence/r2-wasm',a.name+'-new.bin')));
 assert.equal(ns.parts.length,ws.parts.length);
 for(let j=0;j<ns.parts.length;j++){
  const x=partMesh(ns,ns.parts[j]),y=partMesh(ws,ws.parts[j]),xx=bbox(x),yy=bbox(y);
  const xv=inspectMesh(x).volume,yv=inspectMesh(y).volume;maxVolumeDelta=Math.max(maxVolumeDelta,Math.abs(xv-yv));close(xv,yv,1e-5);
  for(const k of ['min','max'])for(let d=0;d<3;d++){maxBoxDelta=Math.max(maxBoxDelta,Math.abs(xx[k][d]-yy[k][d]));close(xx[k][d],yy[k][d],1e-7);}
  for(const f of [.173,.531,.837]){const z=xx.min[2]+f*xx.size[2],y0=xx.min[1]+.437*xx.size[1],nx=intersections(x,0,y0,z),wx=intersections(y,0,y0,z);assert.equal(nx.length,wx.length);nx.forEach((v,k)=>{maxSectionDelta=Math.max(maxSectionDelta,Math.abs(v-wx[k]));close(v,wx[k],1e-6);});}
  parts++;
 }
 records.push({name:a.name,verdict:a.verdict,oldVerdict:a.oldVerdict,exactBytes:a.sha256===b.sha256});
}
const result={total:records.length,passed:records.length,exactBytes:exact,parts,maxVolumeDelta,maxBoxDelta,maxSectionDelta,abiUnchanged:true,records};
fs.writeFileSync(path.join(room,'evidence/r2-parity.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,records:undefined}));
