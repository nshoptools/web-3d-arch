import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const room=process.env.PROJECT_REVIEW_RUN,root=process.env.PROJECT_ROOT;
assert.equal(path.basename(room??''),'20260908-mechanics-wave2');
const candidate=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.equal(candidate,path.resolve(room,'work/mechanics'));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const catPath=path.join(root,'docs/specs/parameters-reference.json'),catalog=read(catPath),lock=read(path.join(candidate,'docs/catalog-lock.json'));
assert.equal(sha(catPath),lock.sha256,'Catalog changed: version and retest before handoff');assert.equal(catalog.fields.length,126);
const reports=['native','wasm'].map(t=>read(path.join(room,`reports/mechanics-${t}-tests.json`)));
for(const r of reports){assert.equal(r.counts.fail,0);assert.equal(r.counts.pass,19);}
const source=new Set(lock.fields.filter(f=>f.delegated).map(f=>f.id));
const heights=new Set('baseH plateT flatTop artH rimH bandCap ringH legoHoleH charmCoH charmVanhH charmChotH skirtH socketD postH collarH stemH hSocketD hRecess pinD hFloor hRingH'.split(' '));
const clearance={clr:'one-sided: crossL/W + 2*clr',gap:'strictly positive one-sided offset(P,gap)',legoHoDu:'one-sided for sparse masks: diameter + 2*value',charmClr:'diametral: socket diameter = pin diameter + value'};
const fields=catalog.fields.map((f,i)=>({id:f.id,abiId:i+1,catalogDefault:f.macDinh,catalogDomain:f.mien,catalogStep:f.buoc,products:f.apChoLoai,
  stage:['impVox','strapSeg'].includes(f.id)?'retired-provenance-requires-explicit-migration':f.id.startsWith('imp')?'parent-mesh-executor':source.has(f.id)?'source-context-dependency':['layerStep','assemble','charmRap'].includes(f.id)?'metadata-only':f.id==='layerH'?'schedule-alias':'mechanics',
  heightPolicy:heights.has(f.id)?'nominal-mm or explicit aligned feature-layer interval':null,clearanceConvention:clearance[f.id]??null,
  formula:['topBevel','topBevelR','topBevelShape','bevelGop','bevelChu','topBevelSeg','legoRanhOn','legoRanhR','legoRanhZ','strapCham','ringTren','travel'].includes(f.id)?'MECH-ADR-002-v2':'MECH-ADR-001-v1 (retained by ADR-002)',physicalQualification:'unqualified'}));
write(path.join(candidate,'docs/semantic-contract.json'),{schemaVersion:2,engineVersion:'arch-mechanics/0.2.0',mechanicsAbi:2,sourceAbi:2,adr:'MECH-ADR-002-v2',catalogSha256:lock.sha256,fieldCount:fields.length,
  note:'Field dispositions are not feature acceptance. Step metadata governs UI increments; continuous nominal values in range are not silently quantized. Parent supplies source geometry/style semantics.',
  zeroModes:{ringH:'explicit mode 3 auto body height; explicit mm zero invalid',legoRanhZ:'mode 4 auto body midpoint only for preset/auto zero; user scalar zero stays literal',skirtH:'literal zero disables'},
  sourceExtensions:{attachments:'explicit text/text-base footprint, Z extent, stable ID, provenance; eyelet selects exact ID',bevelOverrides:'user source-body/slab target, enabled/radius/shape/steps/provenance; orphan rejects'},
  conditionalCapabilities:{topBevel:'round/chamfer/actual schedule steps with common material cutter and positive support',ringTren:'body or explicit validated text host',strapCham:'axial capsule/oblique/piecewise planar mouths with exterior-domain and resource guards',autoSize:'proposal only, no input mutation'},fields});

// Per-feature acceptance references executed geometric groups, not field counts.
const definitions=[
 ['body','Body, holes and disconnected components','all five','20x10x2.4 volume 480; 4x4 hole volume 441.6; disconnected island retained',['body-hole-islands','five-products-three-sizes']],
 ['eyelet-body','Body/tray eyelets with open bore','keychain/clicky','8/4 mm annulus; positive contact, bore opening, explicit-zero rejection',['keychain-eyelet-openings','mx-tray-dimensions-nominal-and-tip']],
 ['eyelet-text','Explicit text footprint eyelet','keychain','Host 7001; center (33,6.5), open bore, positive annulus contact; missing host invalid',['v1-text-host-and-independent-text-bevel']],
 ['strap-bore','Circular and horizontal/vertical capsule bore','strap','4 mm diameter, independent axis/offset/rotation probes, positive floor/roof',['strap-horizontal-vertical-slot-and-rotation']],
 ['strap-mouth','Capsule, oblique and corner-mouth chamfer','strap','Axial lead .6; radius 2.3 at depth .3; angles 0/30/45/90/120; capsule extension retained',['v1-strap-capsule-oblique-and-corner-mouths','v1-concave-corners-and-tolerance-budgets']],
 ['lego-bores','Blind/sparse grid, bosses, hollow/cross slots/tabs','lego','40x30 grid 15/7/3 bores; diameter 4.9/5.5/5.5; depth 1.8; roof and openings',['lego-grid-mask-depth-hollow-and-tabs']],
 ['lego-groove','Default-on semicircular external border groove','lego','R=.8, auto center 2.8, numeric cross sections/analytic volume; literal user zero retained; holes/islands/colors/concave corner',['v1-groove-default-analytic-and-source','v1-concave-corners-and-tolerance-budgets']],
 ['cap','Hollow cap, skirt and ribs','clicky','Open underside, hollow interior, wall probes, three sizes 26/40/64; skirt zero disables',['mx-tray-dimensions-nominal-and-tip','five-products-three-sizes']],
 ['mx','MX post, collar and cross socket','clicky, trial family 1','5.5 mm socket/1.85 mm collar; open tip and positive roof; cross enlarges by 2*clr',['mx-tray-dimensions-nominal-and-tip','clearance-positive-sign-and-zero']],
 ['tray','Switch tray cavities, floor, wall, stop, eyelet and travel','clicky, trial family 2','1.7 mm pin pocket; positive floor; nested pocket probes; continuous printed-solid sweep plus independent sections at five travel states',['mx-tray-dimensions-nominal-and-tip','v1-combinations-cancellation-and-seeded-surfaces']],
 ['charm','Integral/separate flange, neck, pin, socket and chamfer','charm, trial family 4','14.5 mm flange; 6 mm pin; diametral clearance; integral/separate bounds and probes',['charm-integral-separate-fit-and-flange','clearance-positive-sign-and-zero']],
 ['top-surfaces','Round/chamfer/step exposed tops','all five','Independent round/chamfer volume and sections; true h0/h step intervals, positive floor, concave rolling corner',['v1-top-bevel-round-chamfer-steps-material','v1-concave-corners-and-tolerance-budgets']],
 ['text-surfaces','Text/base bevel independent of main body','all five with text context','Round/chamfer/steps; body volume unchanged; counter/dot and user colors remain',['v1-text-host-and-independent-text-bevel']],
 ['material-preservation','Material/Z preservation and shared boundaries','all five','Joined bevel across Z=1.4 material transition; seam x=0 within 1e-12; independent-valley option; disjoint Z kept; interior overlap invalid',['source-color-seams-styles-and-binding','v1-top-bevel-round-chamfer-steps-material']],
 ['overrides','Role and per-source bevel overrides','all five','User role/slab slot/color/u64 provenance retained; disabled bevel remains; orphan override invalid',['source-color-seams-styles-and-binding','v1-top-bevel-round-chamfer-steps-material','mx-tray-dimensions-nominal-and-tip']],
 ['nominal-schedule','Nominal mm and datum interval schedule','all five','h .16/.20/.25, h0 separate; 12 layers=.16+11*.20=2.36; nominal 2.4/1.7/5.5/1.85 retained; wrong datum invalid',['schedule-explicit-interval-and-no-snap']],
 ['clearance','Declared clearance signs and conventions','four trial families','Positive enlarges void; negative rejected; tray gap zero rejected; one-side versus diametral measured',['clearance-positive-sign-and-zero','lego-grid-mask-depth-hollow-and-tabs']],
 ['curves','Signed pin/hole/surface flattening','all applicable','Three sizes and .001/.0005/.0001 tolerances; actual radial/cross-section measurements, analytic bounds and source preservation',['mating-tolerance-signed-deviation-three-levels','v1-concave-corners-and-tolerance-budgets']],
 ['preview-proposal','Preview separate; proposals never mutate','clicky/charm and auto sizing','Assembly flag leaves binary mesh SHA identical; export gate separate; proposed values require accepted new request',['assembly-is-preview-only-and-proposals-immutable']],
 ['invalid-fuzz','Invalid input, resource guards and seeded combinations','all five','No mesh on invalid/proposal/cancel; finite/domain/source guards; seeds 0x6d656368 (24) and 0x6d656332 (12) with reproducers',['seeded-corners-and-fuzz-regressions','v1-combinations-cancellation-and-seeded-surfaces']],
 ['control','Generation-tagged single-use control','all five','Before/stale/wrong-generation tests on both; separate native in-flight observers; no partial mesh',['v1-combinations-cancellation-and-seeded-surfaces']],
];
const rows=definitions.map(([id,feature,products,oracle,groups])=>({id,feature,products,oracle,geometryVerdict:'pass',fit:'unqualified',
  executions:reports.map(r=>({target:r.target,groups:groups.map(id=>{const group=r.records.find(g=>g.id===id);assert.equal(group?.verdict,'pass');return {id,verdict:'pass',artifacts:group.artifacts.map(p=>p.replaceAll('\\','/'))};})}))}));
const acceptance=[
 ['AT-001.1','unverified','Five-product typed geometry passes; source parsing/UI source routes remain parent integration.'],
 ['AT-008.2','unverified','Role/slab/bevel user overrides survive generation; UI reset/transaction scope belongs to parent.'],
 ['AT-008.3','unverified','Orphan/slot diagnostics exist; general source split/merge provenance remains parent.'],
 ['AT-009.1','unverified','126 field contract mapped; UI control accessibility/apply command is outside this library.'],
 ['AT-009.2','unverified','Finite/domain/disabled values and no-publish controls tested; whole UI/schema campaign not asserted.'],
 ['AT-009.3','unverified','Legacy values require explicit migration; parent owns imported-mesh migration transactions.'],
 ['AT-019.1','unverified','Component native/WASM static builds and numeric parity pass; final Rust/source/browser integration belongs to parent.'],
 ['AT-020.1','unverified','Same analytic rectangle-hole shape passes from typed context, not from the corpus SVG parser.'],
 ['AT-020.2','unverified','Same analytic seam passes from typed slabs, not the full shared-seam SVG route.'],
 ['AT-020.3','unverified','Holes/islands/concave cuts tested; general source self-intersection corpus remains parent.'],
 ['AT-021.1','unverified','Local signed curve budgets measured; entire source/transform/boolean budget remains unverified.'],
 ['AT-021.2','pass','Mechanical interval component: independent 12-layer 2.36 mm result and feature-datum interval checks.'],
 ['AT-021.3','unverified','Both schedules measured; printer-profile change/confirmation/undo belongs to parent domain/UI.'],
 ['AT-021.4','pass','Mechanical interval component: nominal 2.40 mm with floor -.04/ceil +.16, no automatic snapping.'],
 ['AT-022.1','unverified','No physical coupons or printer actions.'],
 ['AT-022.2','unverified','No physical force/fit/fatigue qualification.'],
].map(([id,verdict,scope])=>({id,verdict,scope}));
const matrix={schemaVersion:2,at:new Date().toISOString(),engineVersion:'arch-mechanics/0.2.0',scope:'mechanical v1 from validated typed source context',
  fullApplicationAcceptance:false,configuredReview:false,physicalFit:'unqualified',products:['keychain','clicky','strap','lego','charm'],trialFamilies:['MX post/socket','switch tray','lego bores','charm fastener'],
  rows,applicationChecks:acceptance,parentDependencies:['source parser/shaper/raster and actual style/rim/band/core slab formulas','arbitrary imported-mesh CSG','full-pipeline signed error and general self-intersection corpus','runtime ABI-2 job/lease/watchdog, Rust final link, browsers and exporters','UI, source split/merge history, storage, 3MF and physical qualification']};
write(path.join(candidate,'docs/v1-acceptance.json'),matrix);
fs.writeFileSync(path.join(candidate,'docs/v1-acceptance.md'),`# Mechanical v1 acceptance — wave2\n\nEngine 0.2.0 / mechanics and source ABI 2. This matrix is for the typed-source mechanical component. It does not award a whole application AT campaign or physical fit. Each feature below has real normal/default geometry; invalid guards are separate test controls. The third trial family is lego bores; four families and five products are covered.\n\n| Feature | Scope / independent target | Native | WASM |\n| --- | --- | --- | --- |\n${rows.map(r=>`| ${r.feature} (${r.products}) | ${r.oracle} | pass | pass |`).join('\n')}\n\nMeasurements and exact artifacts are recorded in [JSON matrix](v1-acceptance.json), [native](../../../reports/mechanics-native-tests.json), [WASM](../../../reports/mechanics-wasm-tests.json), [parity with independent per-part bounds/volumes](../../../reports/mechanics-parity.json), and [native cancellation](../../../reports/mechanics-cancellation.json). The test readers import neither Manifold nor generator formulas. Selected per-part STL is independently read; production exporters are parent integration.\n\n| Application check | Verdict in this handoff | Scope |\n| --- | --- | --- |\n${acceptance.map(a=>`| ${a.id} | ${a.verdict} | ${a.scope} |`).join('\n')}\n\nSource modes noi/chim/phang/phang2, rim and bands/core require parent-generated material slabs and exact recipe bindings. Synthetic prepared slabs test that interface, not the style algorithm. Source/boolean whole-pipeline deviation and arbitrary triangle self-intersection remain unverified; topology flags and sparse collision probes cannot certify all arbitrary meshes. Resource/cancellation limits are explicit in [ADR-002](ADR-002-v2.md). No main edits, independent review seat, printers, slicers or physical tests were used.\n`);

const toolchain=read(path.join(root,'docs/development/toolchain-lock.json'));
const pins={schemaVersion:2,libraries:[
 {name:'Manifold',...toolchain.manifold,sourcePath:'.toolchain/manifold',link:'static',license:'Apache-2.0',licenseFile:'licenses/Manifold-Apache-2.0.txt',licenseSha256:sha(path.join(candidate,'licenses/Manifold-Apache-2.0.txt'))},
 {name:'Clipper2',...toolchain.clipper2,originalPath:'.toolchain/clipper2-original',derivedPath:'.toolchain/clipper2-derived',link:'static',license:'BSL-1.0',licenseFile:'licenses/Clipper2-Boost-1.0.txt',licenseSha256:sha(path.join(candidate,'licenses/Clipper2-Boost-1.0.txt')),patch:'licenses/clipper2-no-iostream.patch',patchSha256:sha(path.join(candidate,'licenses/clipper2-no-iostream.patch'))}],
 tools:{CMake:'4.4.3',Ninja:'1.13.2.git.kitware.jobserver-pipe-1',Emscripten:'6.0.9',emsdkReleaseHash:toolchain.emsdkReleaseHash,MSVC:'19.51.36256.0',Node:process.version,Rust:'Not invoked; parent pins 1.98.1/nightly-2026-09-07'},
 integratedInputs:{domain:'src/domain/index.mjs',catalogSha256:lock.sha256,rootRuntimeAbi:2,rootCppGeometryAbi:1,packedMeshAbi:1,mechanicsAbi:2},
 oracle:{path:'tests/oracles/indexed-oracle.mjs',sha256:sha(path.join(candidate,'tests/oracles/indexed-oracle.mjs')),origin:'Wave1 frozen main mesh oracle; separate mechanical-oracle.mjs supplies independent numeric sections/volumes/probes'}};
write(path.join(candidate,'pins.json'),pins);
// Verify the read-only checked wave1 source, not loose output or another seat.
const original=read(path.join(room,'inputs/wave1-checked-manifest.json'));
const previous=path.join(root,original.candidate);
assert.equal(path.resolve(previous),path.resolve(root,'tmp/reviews/codex/runs/20260908-mechanics-wave1/work/mechanics'));
for(const entry of original.files)assert.equal(sha(path.join(previous,entry.path)),entry.sha256,`Wave1 changed: ${entry.path}`);
write(path.join(room,'reports/wave1-preservation.json'),{at:new Date().toISOString(),verdict:'pass',checkedFileCount:original.files.length,source:original.candidate,manifest:'inputs/wave1-checked-manifest.json'});
const paths=[];
function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);assert.ok(!d.isSymbolicLink());if(d.isDirectory())walk(p);else paths.push(p);}}
walk(candidate);paths.sort();
write(path.join(room,'reports/checked-manifest.json'),{schemaVersion:2,at:new Date().toISOString(),candidate:path.relative(root,candidate).replaceAll('\\','/'),scope:'implementation-only',configuredReview:false,mechanicsAbi:2,sourceAbi:2,rootRuntimeAbi:2,
 files:paths.map(p=>({path:path.relative(candidate,p).replaceAll('\\','/'),bytes:fs.statSync(p).size,sha256:sha(p)})),
 recommendedCopy:{target:'src/kernel/mechanics',include:'src/, CMakeLists.txt, docs/, licenses/, pins.json, tests/, README.md',note:'Adapt room-bound runners; keep fixture filesystem I/O outside production; reuse parent manifold target; do not overwrite root runtime/geometry headers.'}});
console.log(`Checked wave2 manifest: ${paths.length} files; ${rows.length} mechanical acceptance rows; ${original.files.length} wave1 files unchanged`);
