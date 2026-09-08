// Publish only the checked candidate inside this selected run. Never seal main.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import cases from '../tests/cases.mjs';
const root=fs.realpathSync(process.env.PROJECT_ROOT??'.');
if(!process.env.PROJECT_REVIEW_RUN)throw Error('Dot-source development/env.ps1 first');
const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN);
const candidate=fs.realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const below=(base,p)=>{const r=path.relative(base,fs.realpathSync(p));assert.ok(r&&!r.startsWith('..')&&!path.isAbsolute(r),`Path escaped ${base}: ${p}`);};
below(root,run);below(run,candidate);assert.ok(fs.existsSync(path.join(root,'AGENTS.md')));
const reportDir=path.join(run,'reports');
if(fs.existsSync(path.join(reportDir,'FROZEN.json')))throw Error('This run is already immutable');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const slash=p=>p.replaceAll('\\','/');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 if(e.name==='.git'||e.name==='target')return [];const p=path.join(dir,e.name);below(run,p);
 if(e.isSymbolicLink())throw Error(`Unexpected link ${p}`);return e.isDirectory()?walk(p):[p];
}).sort();
const file=(p,base=run)=>({path:slash(path.relative(base,p)),bytes:fs.statSync(p).size,sha256:hash(p)});
const read=p=>JSON.parse(fs.readFileSync(path.join(run,p)));
const write=(p,v)=>fs.writeFileSync(path.join(run,p),JSON.stringify(v,null,2)+'\n');
const checks=read('reports/checks.json');assert.equal(checks.checked,true);assert.equal(checks.native.passed,cases.length);assert.equal(checks.wasm.passed,cases.length);
for(const f of checks.compiledInputs)assert.equal(hash(path.join(candidate,f.path)),f.sha256,'Compiled input changed');
for(const f of checks.artifacts)assert.equal(hash(path.join(run,f.path)),f.sha256,'Artifact changed after checks');
const requiredReports=['reports/dependency-verification.json','reports/toolchain-versions.json','reports/predecessor-verification.json','reports/prepare-idempotence.json'];
for(const p of requiredReports)assert.equal(read(p).checked,true,p);
const sourceFiles=walk(candidate).map(p=>file(p,candidate));
const manifest={schemaVersion:1,component:'arch-final-scene-export/0.1.0',scope:'implementation-only',configuredReview:false,rootRuntimeAbi:2,snapshotFormat:'ARCH/1',rootGeometryAbi:1,childRuntimeAbi:1,childNativeAbi:1,destination:'src/kernel/final-scene-export',files:sourceFiles};
write('reports/checked-manifest.json',manifest);
const manifestSha256=hash(path.join(run,'reports/checked-manifest.json'));
const release='final-scene-export-'+manifestSha256.slice(0,16);
const overlay=path.join(run,'work/kernel-overlay');
write('reports/private-kernel-manifest.json',{note:'Exact private host build input capture; not a replacement root patch. Child files have their own checked manifest.',files:walk(overlay).filter(p=>!slash(path.relative(overlay,p)).startsWith('final-scene-export/')).map(p=>file(p,overlay))});
const selected=new Set([
 ...walk(path.join(run,'inputs')).map(p=>slash(path.relative(run,p))),
 'evidence/final-export-native-results.json','evidence/final-export-native-runtime.json','evidence/final-export-wasm-results.json','evidence/final-export-wasm-ownership.json','evidence/final-export-browser-results.json','evidence/final-export-parity.json',
 'evidence/runtime-helper-test.log','evidence/native-test.log','evidence/native-runtime-test.log','evidence/wasm-test.log','evidence/browser-test.log',
 'evidence/native-configure.log','evidence/native-build.log','evidence/native-rust.log','evidence/wasm-configure.log','evidence/wasm-build.log','evidence/wasm-rust.log','evidence/wasm-link.log',
 'reports/checks.json',...requiredReports,'reports/private-kernel-manifest.json',...checks.artifacts.map(f=>f.path),
 ...walk(path.join(run,'evidence/final-export-native-runtime')).map(p=>slash(path.relative(run,p)))
]);
for(const c of cases){
 for(const target of ['native','wasm']){
  const stem=`evidence/final-export-${target}/${c.id}`;
  for(const ext of ['.json','.repro.json',...(target==='native'?['.options.bin','.log']:[]),...(!c.expect.error?['.bin']:[])])selected.add(stem+ext);
 }
 if(!c.id.startsWith('fuzz-'))for(const browser of ['chromium','firefox','webkit']){
  selected.add(`evidence/final-export-browser/${browser}-${c.id}.json`);
  if(!c.expect.error)selected.add(`evidence/final-export-browser/${browser}-${c.id}.bin`);
 }
}
for(const browser of ['chromium','firefox','webkit'])for(const ext of ['-summary.json','-console.log'])selected.add(`evidence/final-export-browser/${browser}${ext}`);
const evidenceFiles=[...selected].sort().map(p=>file(path.join(run,p)));
write('reports/evidence-manifest.json',{schemaVersion:1,note:'Selected final results, current reproducers and built artifacts only; stale unselected intermediate files are not release evidence.',files:evidenceFiles});
const matrix=JSON.parse(fs.readFileSync(path.join(candidate,'docs/acceptance.json')));
const handoff={schemaVersion:1,state:'checked-for-handoff',release,manifestSha256,candidate:slash(path.relative(root,candidate)),destination:manifest.destination,candidateFiles:sourceFiles.length,
 ownership:{worker:'final-scene-export child only',rootWrites:false,earlierRoomWrites:false,dependencyWrites:false,mechanicsSourceR2:'Not changed; parent supplies trusted invalid-upstream gate'},
 hooks:{file:'work/final-scene-export/hooks/root-hooks.json',preimages:'work/final-scene-export/hooks/preimages.json',symbols:'work/final-scene-export/native/exports.json',note:'Parent applies focused hooks; no whole-root or engine-worker/client replacement'},
 api:'work/final-scene-export/docs/API.md',acceptance:'reports/checks.json',evidenceManifestSha256:hash(path.join(run,'reports/evidence-manifest.json')),
 tests:{native:checks.native,wasm:checks.wasm,browsers:checks.browsers,parity:checks.parity,helperUnitChecks:checks.helperUnitChecks},limits:matrix.limits,parentOwned:matrix.parentOwned,
 qualification:{implementationTests:true,configuredIndependentReview:false,wholePipelineErrorBound:'unverified',physicalFit:'unqualified',slicer:'unverified'}};
write('reports/handoff.json',handoff);
const text=`# Immutable final-scene-export handoff\n\nRelease: **${release}**. Candidate SHA-256 manifest: \`${manifestSha256}\`.\n\nInstall the **${sourceFiles.length} checked files** under [work/final-scene-export](../work/final-scene-export/README.md) into \`src/kernel/final-scene-export\`. This is the worker's entire source delta. Apply the focused [hooks](../work/final-scene-export/hooks/README.md) using recorded original/sequential preimages; merge the ten additive symbols into the existing full Module export list. Parent retains root Rust/CMake/build scripts, text/product dispatcher and client ownership. No root replacement or engine-worker/client file is supplied.\n\n[API and descriptor tables](../work/final-scene-export/docs/API.md) define AFEX/1, the borrowed native view and final-output leases. Root runtime ABI2, ARCH/1 and geometry ABI1 stay intact. STL unions actual final meshes; material ZIP unions each explicit slot/color pair with common coordinates and a manifest; SVG slices the final post-CSG scene at explicit manufacturing Z. Export poses never modify the source or use camera transforms.\n\nParent must bind the completed final snapshot, trusted semantic gates, independent mesh verdict, generation/revision and stable material map. INVALID_INPUT blocks all formats even during inspection. Mechanics/source R2 is outside this delta; no previous frozen input or its semantics were changed.\n\n## Checked results\n\n* Native ${checks.native.passed}/${checks.native.cases}, WASM ${checks.wasm.passed}/${checks.wasm.cases}; each includes ${checks.native.expectedRejections} expected rejections and ${checks.seededNumericCases} seeded analytic unions.\n* Chromium, Firefox and WebKit: ${checks.browsers[0].passed} cases each in an actual same-Module Worker; old root snapshot/legacy STL and new child functions coexist. This does not qualify the evolving parent product/text dispatcher or UI.\n* Ownership: ${checks.native.ownership} native, ${checks.wasm.ownership} WASM and 25 per browser. Five native cancellation checkpoints and three browser in-flight cancellations retain source/old readers, with final byte charges released.\n* Four helper contract checks and two actual WASM helper execution/gate checks.\n* Native/WASM maximum observed deltas: volume ${checks.parity.maxVolumeDeltaMm3} mm3, bbox ${checks.parity.maxBBoxDeltaMm} mm, section area ${checks.parity.maxSectionAreaDeltaMm2} mm2. ${checks.parity.inspectedStlFileInstances} written STL instances inspected across both targets, including ${checks.parity.expectedTopologyFailureFileInstances} intentionally failing-topology inspection files; this is not a count of independent geometries.\n\nThe [acceptance matrix](../work/final-scene-export/docs/ACCEPTANCE.md), [checks.json](checks.json) and [evidence manifest](evidence-manifest.json) connect exact cases, analytic volume/bbox/section/opening probes, file readers and artifact hashes. Native/WASM source inputs match the candidate; all reused source/library/notice hashes are recorded. [README](../work/final-scene-export/README.md) contains the fresh-run build/test recipe.\n\n## Limits and integration ownership\n\nA single Manifold operation may only observe cancellation after return; keep the root Worker watchdog. Admission counters are not an RSS/intercepted-allocation guarantee. Whole arbitrary-CSG numerical error/self-intersection qualification remains unverified. SVG range means labelled sample planes (first visible), not projected coverage or CNC toolpaths. Normal topology/material failures block; explicit inspection retains warnings and cannot bypass upstream invalid gates. For SVG the native structural flag covers ingested part meshes; it is not a general proof of 3D union topology.\n\nParent owns source SVG, PNG viewport, 3MF, persistent pose/UI/layer tables, upstream semantics and full product integration. No physical-fit, slicer or configured independent-review qualification is claimed. No printers, other agents, external machines or paid calls were used.\n\nFreeze is content-addressed with read-only candidate/evidence/report files. \`FROZEN.json\` records this handoff and manifest hashes; make subsequent changes in a fresh room.\n`;
fs.writeFileSync(path.join(run,'reports/HANDOFF.md'),text);
const reportFiles=walk(reportDir).filter(p=>!p.endsWith('FROZEN.json'));
const frozen={schemaVersion:1,state:'FROZEN',release,at:new Date().toISOString(),candidateFiles:sourceFiles.length,evidenceFiles:evidenceFiles.length,manifestSha256,files:reportFiles.map(p=>file(p))};
write('reports/FROZEN.json',frozen);
const sealed=[...new Set([...walk(candidate),...evidenceFiles.map(f=>path.join(run,f.path)),...reportFiles,path.join(run,'reports/FROZEN.json')])];
for(const p of sealed){below(run,p);fs.chmodSync(p,0o444);}
for(const f of sourceFiles)assert.equal(hash(path.join(candidate,f.path)),f.sha256);
for(const f of evidenceFiles)assert.equal(hash(path.join(run,f.path)),f.sha256);
for(const f of frozen.files)assert.equal(hash(path.join(run,f.path)),f.sha256);
console.log(JSON.stringify({state:'FROZEN',release,manifestSha256,candidateFiles:sourceFiles.length,evidenceFiles:evidenceFiles.length,frozenSha256:hash(path.join(run,'reports/FROZEN.json')),rootWrites:false,earlierRoomWrites:false}));
