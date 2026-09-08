import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {readSnapshot,partMesh} from '../../src/kernel/mechanics/tests/oracles/mechanical-oracle.mjs';
import {compareSurface} from './surface-parity.mjs';
const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),repo=fs.realpathSync(process.env.PROJECT_ROOT),borrow=process.env.CURVED_BORROW_ROOT??(fs.existsSync(path.join(run,'work/root-borrow'))?path.join(run,'work/root-borrow'):repo);
const {readProductSemantics}=await import(pathToFileURL(path.join(borrow,'src/core/product-operations.mjs')));
const sha=b=>createHash('sha256').update(b).digest('hex'),results=[];
let maxVolumeDelta=0,maxBboxDelta=0,maxVertexDelta=0,maxGrooveDelta=0,maxMouthDelta=0,maxSurfaceBound=0;
const prefix=process.argv[2]??'release';assert.match(prefix,/^[\w.-]+$/);
for(const [family,count]of [[prefix,40],[prefix+'-variants',12]]){
 const a=JSON.parse(fs.readFileSync(path.join(run,'reports',family+'-native-oracles.json'))),b=JSON.parse(fs.readFileSync(path.join(run,'reports',family+'-wasm-oracles.json')));
 assert.equal(a.version,2);assert.equal(b.version,2);assert.equal(a.results.length,count);assert.equal(b.results.length,count);
 for(let i=0;i<count;i++){
  const x=a.results[i],y=b.results[i];assert.ok(x.pass&&y.pass);assert.equal(x.id,y.id);
  const ba=fs.readFileSync(path.join(run,'evidence',family+'-native',x.id+'.arch')),bb=fs.readFileSync(path.join(run,'evidence',family+'-wasm',x.id+'.arch'));
  const sa=readSnapshot(ba),sb=readSnapshot(bb);assert.equal(sa.parts.length,sb.parts.length,x.id+' part count');
  const surfaces=sa.parts.map((p,j)=>{try{return compareSurface(partMesh(sa,p),partMesh(sb,sb.parts[j]));}catch(e){throw Error(x.id+' part '+j+': '+e.message);}});
  const vd=Math.max(...surfaces.map(s=>s.maxVertexDelta)),surfaceBound=Math.max(...surfaces.map(s=>s.maxSurfaceBound));maxVertexDelta=Math.max(maxVertexDelta,vd);maxSurfaceBound=Math.max(maxSurfaceBound,surfaceBound);
  const volumeDelta=Math.abs(x.volume-y.volume),bboxDelta=Math.max(...x.bounds.min.map((v,i)=>Math.abs(v-y.bounds.min[i])),...x.bounds.max.map((v,i)=>Math.abs(v-y.bounds.max[i])));
  assert.ok(volumeDelta<=1e-6&&bboxDelta<=1e-8);maxVolumeDelta=Math.max(maxVolumeDelta,volumeDelta);maxBboxDelta=Math.max(maxBboxDelta,bboxDelta);
  const ma=readProductSemantics(new Uint8Array(fs.readFileSync(path.join(run,'evidence',family+'-native',x.id+'.apms')))),mb=readProductSemantics(new Uint8Array(fs.readFileSync(path.join(run,'evidence',family+'-wasm',x.id+'.apms'))));
  assert.deepEqual(ma.parameters,mb.parameters);assert.deepEqual(ma.parts,mb.parts);assert.deepEqual(ma.lineage,mb.lineage);
  assert.deepEqual(ma.features.map(f=>[f.id,f.kind,f.parameterId,f.role,f.group,f.sourceId,f.provenanceId]),mb.features.map(f=>[f.id,f.kind,f.parameterId,f.role,f.group,f.sourceId,f.provenanceId]));
  for(let j=0;j<ma.features.length;j++)for(let k=0;k<6;k++)assert.ok(Math.abs(ma.features[j].dimensions[k]-mb.features[j].dimensions[k])<=1e-8,x.id+' feature dimensions');
  for(const key of ['groove','cornerGroove','mouth']){assert.equal(x[key].length,y[key].length);const delta=Math.max(0,...x[key].map((v,i)=>Math.abs(v-y[key][i])));assert.ok(delta<=1e-8);if(key!=='mouth')maxGrooveDelta=Math.max(maxGrooveDelta,delta);else maxMouthDelta=Math.max(maxMouthDelta,delta);}
  results.push({id:x.id,pass:true,exactMeshBytes:ba.equals(bb),nativeSha256:sha(ba),wasmSha256:sha(bb),volumeDelta,bboxDelta,vertexDelta:vd,surfaceBound,surfaces});
 }
}
const report={version:2,scope:'same child C ABI pipeline; independent indexed topology on each target, bijective vertex correspondence and complete oriented patch-boundary/plane-slab proof for alternate diagonals. No manufacturing mesh mutation. Root Rust registry/browser RPC are parent integration.',maxVolumeDelta,maxBboxDelta,maxVertexDelta,maxSurfaceBound,maxGrooveDelta,maxMouthDelta,results};
fs.writeFileSync(path.join(run,'reports/curved-parity.json'),JSON.stringify(report,null,2)+'\n');console.log({cases:results.length,maxVolumeDelta,maxBboxDelta,maxVertexDelta,maxSurfaceBound,maxGrooveDelta,maxMouthDelta});
