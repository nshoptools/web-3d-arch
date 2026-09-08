import assert from 'node:assert/strict';
import {readSnapshot,inspectMesh} from '../oracles/mesh-oracle.mjs';
import {inside,intersections,partMesh} from '../../src/kernel/source-assembly/tests/oracles/spatial-oracle.mjs';
export function inspectCapturedProduct(bytes,sem,id){
 const s=readSnapshot(bytes),meshes=s.parts.map(p=>partMesh(s,p)),oracles=meshes.map(inspectMesh);
 const evidence={parts:oracles,holeSamples:0,seamSamples:0,textIntervals:0,qualification:'fixture-only-not-product-independent-review'};
 if(id.startsWith('svg-')&&!id.includes('overlay')){
  const source=sem.provenance.regionSources.find(r=>r.sourceKey==='west');
  assert.ok(source);const slabs=new Set(sem.lineage.filter(l=>l.sourceId===source.semanticId).map(l=>l.slabId));
  const left=sem.parts.filter(p=>p.role===1&&slabs.has(p.sourceId)),scale=sem.sourceTransform[0],tx=sem.sourceTransform[4],ty=sem.sourceTransform[5];
  for(const p of left){const m=meshes[p.meshPart],z=m.vertices.map(v=>v[2]);
   assert.equal(inside(m,[7*scale+tx,8*scale+ty,(Math.min(...z)+Math.max(...z))/2]),false,'Source hole stays empty');evidence.holeSamples++;}
  assert.ok(evidence.holeSamples);
  const art=sem.parts.filter(p=>p.role===1);
  for(let i=0;i<art.length;i++)for(let j=i+1;j<art.length;j++){
   const a=meshes[art[i].meshPart],b=meshes[art[j].meshPart],za=a.vertices.map(v=>v[2]),zb=b.vertices.map(v=>v[2]);
   const lo=Math.max(Math.min(...za),Math.min(...zb)),hi=Math.min(Math.max(...za),Math.max(...zb));if(hi<=lo+1e-6)continue;
   for(const f of [.127,.381,.733,.917]){
    const aa=intersections(a,0,14.123*scale+ty,lo+f*(hi-lo)),bb=intersections(b,0,14.123*scale+ty,lo+f*(hi-lo));
    if(aa.some(x=>Math.abs(x-(20*scale+tx))<3e-6&&bb.some(y=>Math.abs(x-y)<1e-12)))evidence.seamSamples++;
   }
  }
  assert.ok(evidence.seamSamples,'Shared material edge must coincide in mesh reads');
 }
 if(id.endsWith('actual-overlay')){
  const text=sem.parts.filter(p=>p.role===7);assert.ok(text.length);
  const xs=text.flatMap(p=>meshes[p.meshPart].vertices.map(v=>v[0]));assert.ok(Math.min(...xs)>59,'Requested beside placement must survive SVG viewport restore');
  const intervals=sem.sourceIntervals.filter(r=>r.datum===133||r.datum===134);
  const h=intervals.find(r=>r.datum===133),b=intervals.find(r=>r.datum===134);
  assert.ok(h&&b);assert.equal(b.referenceLayer,0);assert.equal(h.referenceLayer,2);
  assert.ok(Math.abs(b.z0)<1e-12&&Math.abs(b.z1-.4)<1e-12&&Math.abs(h.z0-.4)<1e-12&&Math.abs(h.z1-1)<1e-12);
  const zs=text.flatMap(p=>meshes[p.meshPart].vertices.map(v=>v[2]));assert.ok(Math.abs(Math.min(...zs)-.4)<1e-10&&Math.abs(Math.max(...zs)-1)<1e-10);
  evidence.textIntervals=2;
 }
 return evidence;
}
