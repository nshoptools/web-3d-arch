import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {readSnapshot,inspectMesh} from '../../../tests/oracles/mesh-oracle.mjs';
const run=path.resolve(process.env.PROJECT_REVIEW_RUN),native=path.join(run,process.env.APART_NATIVE_EVIDENCE??'evidence/import-as-part-native-r3'),wasm=path.join(run,process.env.APART_WASM_EVIDENCE??'evidence/import-as-part-wasm-r2');
const read=p=>readSnapshot(new Uint8Array(fs.readFileSync(p))),last=s=>{const p=s.parts.at(-1);return {vertices:s.vertices.slice(p.vertexStart,p.vertexStart+p.vertexCount),faces:s.faces.slice(p.faceStart,p.faceStart+p.faceCount).map(t=>t.map(i=>i-p.vertexStart))};};
const records=[];
for(const product of ['keychain','clicky','strap','lego','charm']){
 const ns=JSON.parse(fs.readFileSync(path.join(native,product,'summary.json'),'utf8'));assert.equal(ns.records.length,2);assert.equal(ns.ownedBefore,ns.ownedAfter);
 for(const [name,expected]of[['stl-mm',6],['stl-cm-hole',12000]]){
  const s=read(path.join(native,product,name+'.published.arch')),m=last(s),q=inspectMesh(m),radius=Math.max(1,...m.vertices.flat().map(Math.abs)),arithmeticBound=512*m.faces.length*Number.EPSILON*radius**3;
  assert(Math.abs(q.volume-expected)<=arithmeticBound);records.push({product,name,volume:q.volume,expected,arithmeticBound,euler:q.euler});
 }
 const n=last(read(path.join(native,product,'stl-mm.published.arch'))),w=last(read(path.join(wasm,product+'-stl-mm.published.arch'))),o=last(read(path.join(wasm,product+'-obj-mm.published.arch')));
 assert.deepEqual(n,w,'native/WASM imported indexed triangles and binary64 positions');
 const oriented=m=>m.faces.map(f=>f.map(i=>m.vertices[i]).map(v=>v.join(',')).join('|')).sort();assert.deepEqual(oriented(n),oriented(o),'STL/OBJ independent source encodings retain the same oriented triangles');
 records.push({product,nativeWasmImportedTriangleBuffers:'exact',stlObjOrientedTriangles:'exact'});
 const bad=JSON.parse(fs.readFileSync(path.join(native,product,'changed-generated-guard.json'),'utf8'));assert(bad.exportBlocked&&bad.checks.some(c=>c.message==='APPEND_GUARD_ORIGINAL_PART_CHANGED'));
}
const result={scope:'authored triangle prism and holed extrusion; five real generated products',records,globalNumericBound:null,printingFit:'unqualified',comparison:'arithmetic determinant sum bounds only; exact imported indexed-buffer native/WASM comparison'};
const out=path.join(run,'evidence/import-as-part-oracles.json');assert(!fs.existsSync(out));fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({nativeAnalyticChecks:10,nativeWasmExactBufferComparisons:5,stlObjTriangleComparisons:5,changedOriginalNativeGuardRejections:5}));
