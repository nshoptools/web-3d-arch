import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import cases from '../tests/cases.mjs';
const run=process.env.PROJECT_REVIEW_RUN,root=process.env.PROJECT_ROOT;
if(!run||!root)throw Error('Dot-source development/env.ps1 first');
if(fs.existsSync(path.join(run,'reports/FROZEN.json')))throw Error('Select a fresh unfrozen output run');
const component=fileURLToPath(new URL('../',import.meta.url));
const read=(p)=>JSON.parse(fs.readFileSync(path.join(run,p)));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const n=read('evidence/final-export-native-results.json'),w=read('evidence/final-export-wasm-results.json');
for(const report of [n,w]){
 assert.equal(report.cases,cases.length);assert.equal(report.passed,cases.length);
 assert.deepEqual(report.results.map(t=>t.id),cases.map(t=>t.id));
 for(const r of report.results)assert.equal(r.pass,true,r.id);
}
assert.deepEqual(n.oracleSources,w.oracleSources);
for(const r of n.oracleSources)assert.equal(sha(path.join(root,r.path)),r.sha256,'Oracle changed since these suites');
const b=read('evidence/final-export-browser-results.json');assert.equal(b.passed,3);assert.deepEqual(n.oracleSources,b.oracleSources);
const normalCases=cases.filter(c=>!c.id.startsWith('fuzz-'));
assert.deepEqual(b.results.map(r=>r.engine),['chromium','firefox','webkit']);
for(const r of b.results){
 assert.equal(r.passed,normalCases.length);assert.deepEqual(r.records.map(t=>t.id),normalCases.map(t=>t.id));
 assert.ok(r.records.every(t=>t.pass));assert.equal(r.ownership.passed,25);
 assert.deepEqual(r.ready,{abi:2,exportABI:1,isolated:true,shared:true});
 assert.equal(r.cancellation.error,'CANCELLED');assert.equal(r.cancellation.sourceUnchanged,true);
 assert.ok(r.cancellation.cancelledAt>=30);assert.deepEqual(r.cancellation.stats,[0,0,0,0,0]);
}
const runtime=read('evidence/final-export-native-runtime.json');assert.equal(runtime.ownership.passed,23);assert.equal(runtime.cancellation.passed,5);
assert.equal(w.ownership.passed,25);assert.equal(w.helper.passed,2);
const helper=fs.readFileSync(path.join(run,'evidence/runtime-helper-test.log'),'utf8');
assert.match(helper,/tests 4/);assert.match(helper,/pass 4/);assert.match(helper,/fail 0/);
const parity=read('evidence/final-export-parity.json');assert.equal(parity.cases,cases.length);assert.equal(parity.passed,cases.length);
const pins=read('reports/dependency-verification.json');assert.equal(pins.checked,true);assert.equal(pins.manifestSha256,sha(path.join(component,'pins/dependency-sources.json')));
const matrix=JSON.parse(fs.readFileSync(path.join(component,'docs/acceptance.json')));
const acceptance=matrix.rows.map(row=>{
 assert.ok(row.tests.length);for(const id of row.tests){assert.ok(cases.some(c=>c.id===id),`Unknown case ${id}`);assert.ok(n.results.find(t=>t.id===id)?.pass);assert.ok(w.results.find(t=>t.id===id)?.pass);}
 return {...row,status:'implemented-tested-in-component-scope'};
});
// Compiled implementation inputs must still match the private build overlay.
const compiled=['CMakeLists.txt','native/final_scene_export.h','native/final_scene_export.cpp','native/final-export-runtime.h','native/exports.json','rust/mod.rs','rust/wire.rs','rust/encode.rs','rust/test_fixture.rs','tests/fixture.cpp','tests/native_probe.rs'];
const compiledInputs=compiled.map(p=>{const h=sha(path.join(component,p));assert.equal(h,sha(path.join(run,'work/kernel-overlay/final-scene-export',p)),`Build overlay mismatch ${p}`);return {path:p,sha256:h};});
const artifacts=['work/rust-target/release/examples/final-export-probe.exe','work/module/arch-kernel.mjs','work/module/arch-kernel.wasm','work/native-build/final-scene-export/Release/arch_final_scene_export.lib','work/wasm-build/final-scene-export/libarch_final_scene_export.a'].map(p=>({path:p,bytes:fs.statSync(path.join(run,p)).size,sha256:sha(path.join(run,p))}));
const rejected=cases.filter(c=>c.expect.error).length,inspectionTopologyFiles=2*cases.filter(c=>c.expect.topologyFail).length;
const result={schema:'arch-final-export-checks/1',scope:matrix.scope,checked:true,
 native:{cases:n.cases,expectedRejections:rejected,passed:n.passed,ownership:23,cancellation:5},
 wasm:{cases:w.cases,expectedRejections:rejected,passed:w.passed,ownership:25,helperCalls:2},
 browsers:b.results.map(r=>({engine:r.engine,version:r.version,cases:r.cases,passed:r.passed,ownership:r.ownership.passed,cancelledAt:r.cancellation.cancelledAt,sameRootAbi:r.ready.abi,childAbi:r.ready.exportABI})),
 helperUnitChecks:4,seededNumericCases:cases.length-normalCases.length,
 parity:{cases:parity.cases,inspectedStlFileInstances:parity.independentMeshOracleParts,expectedTopologyFailureFileInstances:inspectionTopologyFiles,topologyPassingFileInstances:parity.independentMeshOracleParts-inspectionTopologyFiles,maxVolumeDeltaMm3:parity.maxVolumeDeltaMm3,maxBBoxDeltaMm:parity.maxBBoxDeltaMm,maxSectionAreaDeltaMm2:parity.maxSectionAreaDeltaMm2},
 compiledInputs,artifacts,oracleSources:n.oracleSources,acceptance,supplemental:matrix.supplemental,limits:matrix.limits,parentOwned:matrix.parentOwned};
fs.writeFileSync(path.join(run,'reports/checks.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({checked:true,native:n.passed,wasm:w.passed,browsers:result.browsers.map(r=>({engine:r.engine,cases:r.cases})),acceptanceRows:acceptance.length,artifacts:artifacts.length}));
