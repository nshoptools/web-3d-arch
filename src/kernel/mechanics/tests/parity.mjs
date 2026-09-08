import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readSnapshot,partMesh,bbox,inspectMesh,close,intersections} from './oracles/mechanical-oracle.mjs';
const room=process.env.PROJECT_REVIEW_RUN;assert.ok(room&&process.env.PROJECT_ROOT&&!path.relative(process.env.PROJECT_ROOT,room).startsWith('..'),'Project run required');
const read=relative=>JSON.parse(fs.readFileSync(path.join(room,relative)));
const native=read('reports/mechanics-native-tests.json'),wasm=read('reports/mechanics-wasm-tests.json');
assert.equal(native.counts.fail,0);assert.equal(wasm.counts.fail,0);assert.equal(native.artifacts.length,wasm.artifacts.length);
const result=[];
for(let i=0;i<native.artifacts.length;i++){
  const na=native.artifacts[i],wa=wasm.artifacts[i];assert.equal(na.name,wa.name);assert.deepEqual(na.options,wa.options);
  const nm=read(na.path.replace(/\.bin$/,'.json')),wm=read(wa.path.replace(/\.bin$/,'.json'));
  assert.equal(nm.verdict,wm.verdict);assert.equal(nm.layout.request,224);assert.equal(wm.layout.request,200);
  assert.equal(nm.layout.source,128);assert.equal(wm.layout.source,112);
  assert.equal(nm.mechanicsAbi,2);assert.equal(wm.mechanicsAbi,2);
  assert.deepEqual(nm.inputStrides,{slab:72,attachment:48,bevelOverride:40});assert.deepEqual(nm.inputStrides,wm.inputStrides);
  assert.equal(nm.layout.view,152);assert.equal(wm.layout.view,112);
  assert.deepEqual(nm.parameters,wm.parameters);
  assert.equal(nm.features.length,wm.features.length);
  nm.features.forEach((f,i)=>{const {dimensions,...identity}=f,{dimensions:other,...otherIdentity}=wm.features[i];
    assert.deepEqual(identity,otherIdentity);dimensions.forEach((v,j)=>close(v,other[j],1e-10,'semantic dimension parity'));});
  assert.deepEqual(nm.curves.map(c=>[c.feature,c.segments,c.side,c.frame]),wm.curves.map(c=>[c.feature,c.segments,c.side,c.frame]));
  const n=readSnapshot(fs.readFileSync(path.join(room,na.path))),w=readSnapshot(fs.readFileSync(path.join(room,wa.path)));
  assert.equal(n.parts.length,w.parts.length);
  let maxBoundDelta=0,maxVolumeDelta=0,maxSectionDelta=0;const measurements=[];
  for(let j=0;j<n.parts.length;j++){
    const a=partMesh(n,n.parts[j]),b=partMesh(w,w.parts[j]),aa=bbox(a),bb=bbox(b);
    assert.equal(n.parts[j].color,w.parts[j].color);assert.equal(nm.parts[j].role,wm.parts[j].role);assert.equal(nm.parts[j].slot,wm.parts[j].slot);
    for(const k of ['min','max'])for(let axis=0;axis<3;axis++){maxBoundDelta=Math.max(maxBoundDelta,Math.abs(aa[k][axis]-bb[k][axis]));close(aa[k][axis],bb[k][axis],1e-6,'native/wasm bounds');}
    const av=inspectMesh(a).volume,bv=inspectMesh(b).volume;maxVolumeDelta=Math.max(maxVolumeDelta,Math.abs(av-bv));close(av,bv,1e-4,'native/wasm independent volume');
    measurements.push({part:j,feature:nm.features[nm.parts[j].feature].id,role:nm.parts[j].role,native:{bounds:aa,volumeMm3:av},wasm:{bounds:bb,volumeMm3:bv}});
    for(const u of [.231,.571,.827])for(const v of [.193,.477,.739]){
      const y=aa.min[1]+u*aa.size[1],z=aa.min[2]+v*aa.size[2],hs=intersections(a,0,y,z),js=intersections(b,0,y,z);
      assert.equal(hs.length,js.length,'native/wasm section topology');hs.forEach((x,i)=>{maxSectionDelta=Math.max(maxSectionDelta,Math.abs(x-js[i]));close(x,js[i],1e-6,'native/wasm section coordinates');});
    }
  }
  result.push({name:na.name,verdict:'pass',maxBoundDelta,maxVolumeDelta,maxSectionDelta,measurements});
}
fs.writeFileSync(path.join(room,'reports/mechanics-parity.json'),JSON.stringify({version:2,at:new Date().toISOString(),runtimeIntegrationAbi:2,packedSnapshotAbi:1,mechanicsAbi:2,caseCount:result.length,
  checks:['effective parameter metadata','stable feature identity','actual non-pointer and pointer ABI sizes','independent bbox/volume/sections per labelled part'],records:result},null,2)+'\n');
console.log(`PASS native/WASM parity: ${result.length} fixture scenarios; no physical qualification`);
