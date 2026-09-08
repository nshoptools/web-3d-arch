import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {qualifyMesh} from './review-source/src/core/mesh-qualification.mjs';
import {triangleIntersection,pointInSolid,exactVertices} from './review-source/src/core/mesh-predicates.mjs';
import {encodeArch,scenarios,cuboid,tetrahedron,join,invert,prism} from './analytic-shapes.mjs';
const out=path.join(process.env.PROJECT_REVIEW_RUN,'evidence/independent-geometry-results.json');
const results=[];for(const [name,m,expected] of scenarios()){
 const r=qualifyMesh(encodeArch(m));results.push({name,expected,actual:r.verdict,code:r.code,checks:r.checks,stats:r.stats,diagnostics:r.diagnostics});
}
const original=encodeArch(cuboid()),owned=original.slice();
const checks=[['offset-aligned-view',new Uint8Array(original.length+8),8],['offset-unaligned-view',new Uint8Array(original.length+1),1]];
for(const [name,b,offset] of checks){b.set(original,offset);const r=qualifyMesh(b.subarray(offset));results.push({name,expected:offset===8?'pass':'fail',actual:r.verdict,code:r.code});}
const nan=original.slice();new DataView(nan.buffer).setFloat64(128,NaN,true);
for(const [name,bytes,opts,expected] of [['NaN',nan,{},'fail'],['plain-JSON',[...original],{},'unverified'],['truncated',original.slice(0,-1),{},'fail'],['pair-budget',original,{limits:{candidatePairs:1}},'unverified'],['byte-budget',original,{limits:{bytes:1}},'unverified'],['vertex-budget',original,{limits:{vertices:4}},'unverified']]){
 const r=qualifyMesh(bytes,opts);results.push({name,expected,actual:r.verdict,code:r.code});
}
const abort=new AbortController();abort.abort();const cancelled=qualifyMesh(original,{signal:abort.signal});results.push({name:'preaborted',expected:'unverified',actual:cancelled.verdict,code:cancelled.code});assert.deepEqual(original,owned);
// AABB material oracle: analytic intersection volume is product of positive interval overlaps.
let seed=0x91aa5eed;const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2**32;};
const differential=[];for(let i=0;i<300;i++){
 const lo=Array.from({length:3},()=>Math.floor(rand()*9)-3),hi=lo.map(x=>x+1+Math.floor(rand()*5));
 const a=cuboid([0,0,0],[3,3,3]),b=cuboid(lo,hi),vol=lo.reduce((p,x,k)=>p*Math.max(0,Math.min(3,hi[k])-Math.max(0,x)),1);
 const r=qualifyMesh(encodeArch([a,b]));differential.push({i,lo,hi,intersectionVolume:vol,verdict:r.verdict,code:r.code});
}
const failures=results.filter(r=>r.actual!==r.expected),unsafe=differential.filter(r=>r.intersectionVolume>0&&r.verdict==='pass');
fs.writeFileSync(out,JSON.stringify({seed:'0x91aa5eed',results,differential,failures,unsafe,sourceOwnershipUnchanged:true},null,2));
console.log(JSON.stringify({analytical:results.length,failures,finiteSeedBoxes:differential.length,unsafe},null,2));assert.equal(failures.length,0);assert.equal(unsafe.length,0);
