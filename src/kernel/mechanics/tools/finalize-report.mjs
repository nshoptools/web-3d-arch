import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const room=process.env.PROJECT_REVIEW_RUN;
assert.equal(path.basename(room??''),'20260908-mechanics-wave2');
const read=p=>JSON.parse(fs.readFileSync(path.join(room,p)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const native=read('reports/mechanics-native-tests.json'),wasm=read('reports/mechanics-wasm-tests.json'),parity=read('reports/mechanics-parity.json'),cancel=read('reports/mechanics-cancellation.json');
const matrix=read('work/mechanics/docs/v1-acceptance.json');
assert.equal(native.counts.fail,0);assert.equal(wasm.counts.fail,0);assert.equal(native.counts.pass,19);assert.equal(wasm.counts.pass,19);
assert.equal(native.artifacts.length,wasm.artifacts.length);assert.equal(native.artifacts.length,parity.caseCount);
assert.ok(cancel.cases.every(r=>r.verdict==='pass'));assert.ok(matrix.rows.every(r=>r.geometryVerdict==='pass'));
assert.match(fs.readFileSync(path.join(room,'evidence/domain-adapter-tests.log'),'utf8'),/PASS domain adapter/);
const distribution=r=>Object.fromEntries([0,1,2,3,4,5].map(v=>[v,r.artifacts.filter(a=>a.verdict===v).length]));
const maxima=Object.fromEntries(['maxBoundDelta','maxVolumeDelta','maxSectionDelta'].map(k=>[k,Math.max(...parity.records.map(r=>r[k]))]));
const machine={schemaVersion:2,at:new Date().toISOString(),engine:'arch-mechanics/0.2.0',scope:'mechanical v1 implementation from typed source context',configuredReview:false,
 inheritedConfiguration:{model:'gpt-6-astra',effort:'max',evidence:'caller-reported inherited configuration',fast:'unavailable/unverified; no configured review performed'},
 native:{groups:native.counts,scenarios:native.artifacts.length,verdictDistribution:distribution(native)},
 wasm:{groups:wasm.counts,scenarios:wasm.artifacts.length,verdictDistribution:distribution(wasm)},
 parity:{scenarios:parity.caseCount,...maxima},cancellation:{nativeConcurrentCases:cancel.cases.length,scope:cancel.scope},domainAdapter:'pass; evidence/domain-adapter-tests.log',
 abi:{mechanics:2,source:2,runtime:2,rootGeometry:1,packedSnapshot:1},candidate:'work/mechanics',checkedManifest:'reports/checked-manifest.json',
 mechanicalAcceptanceRows:matrix.rows.length,fullApplicationAcceptance:false,fit:'unqualified',physicalActions:[],otherAgentsLaunched:0,
 v1Wave2Geometry:['default semicircular lego perimeter groove','round/chamfer/step top and text surfaces with material preservation','per-source user bevel override','explicit text footprint eyelet','capsule/oblique/corner strap mouth chamfers','beveled cap continuous printed-solid travel sweep'],
 parentDependencies:matrix.parentDependencies,limits:'work/mechanics/docs/ADR-002-v2.md',
 writes:'Only this run room. Main, wave1, other rooms, assets, .toolchain, machine/SSH configuration are read-only.',
 preservation:read('reports/wave1-preservation.json'),
 qualification:'No physical fit, force, fatigue, slicer, printer or configured independent review claim'};
fs.writeFileSync(path.join(room,'reports/handoff.json'),JSON.stringify(machine,null,2)+'\n');
const d=distribution(native);
fs.writeFileSync(path.join(room,'reports/HANDOFF.md'),`# Mechanics wave2 handoff — 20260908-mechanics-wave2

Candidate [work/mechanics](../work/mechanics/README.md) chứa generator C++ static thực thi, flat C ABI, adapter domain, nguồn/pins/licenses, recipe build và oracle độc lập. Chỉ copy theo [checked-manifest.json](checked-manifest.json); không sửa main hoặc wave1.

## Kết quả đã chạy

- Native và WASM đều ${native.counts.pass}/19 nhóm đạt, 0 lỗi, ${native.artifacts.length} scenario mỗi target: ${d[0]} geometry thành công, ${d[1]} invalid, ${d[2]} dependency unsupported có tên, ${d[3]} proposal và ${d[5]} cancelled. Không gọi số scenario hay số field là số feature đạt nghiệm thu.
- Parity ${parity.caseCount} scenario: tham số, ID/provenance/role, layout ABI, bbox/volume/giao tuyến độc lập từng part. Sai khác lớn nhất: bbox ${maxima.maxBoundDelta} mm; volume ${maxima.maxVolumeDelta} mm³; giao tuyến ${maxima.maxSectionDelta} mm. [parity](mechanics-parity.json) lưu cả số đo bbox/volume thực từ mesh, không lấy reportedVolume làm expected.
- [Cancellation native](mechanics-cancellation.json): ${cancel.cases.length} observer hủy khi job đang chạy, không partial mesh. Current/stale/wrong generation và single-use control cũng kiểm trên cả hai target. Không khẳng định mọi query thư viện ngắt được hoặc một SLA thời gian cứng.
- [Adapter domain](../evidence/domain-adapter-tests.log): năm loại, ABI2 packing, u64 provenance, mm danh nghĩa, datum, auto groove/literal user zero, proposal transaction và chặn đổi convention tolerance ngầm.
- [Native](mechanics-native-tests.json), [WASM](mechanics-wasm-tests.json): topology/vertex-link/orientation/degenerate/volume, lỗ, bbox, cross-sections, material seam và collision probes. Selected per-part STL được đọc lại độc lập. Ba size 26/40/64; tolerance .001/.0005/.0001; h .16/.20/.25 với h0 riêng; giữ 1.7/5.5/1.85 mm. Seed 0x6d656368 có 24 ca; 0x6d656332 có 12 ca, mỗi ca giữ reproducer.

## Những khoảng trống wave1 đã được triển khai

Rãnh lego mặc định bật có tiết diện bán nguyệt thật, cả góc lõm, holes/islands/colors; mặc định Z là explicit auto midpoint, user Z=0 vẫn literal. Bevel top/text tròn, vát và bậc theo schedule có geometry, giữ các slab vật liệu và shared seam, đồng thời nhận override theo source ID. Eyelet-on-text nhận footprint attachment cụ thể và kiểm annulus tiếp xúc sau bevel. Strap có chamfer capsule, miệng xiên và miệng qua góc khung theo convention axial lead-in. Cap có bevel được kiểm continuous sweep với tray, thêm oracle số tại nhiều trạng thái travel.

Body/eyelet, blind/sparse/hollow lego bores/cross slots/tabs, hollow keycap/skirt/ribs/MX socket/collar, tray/floor/stop/eyelet, charm integral/separate flange/neck/pin/socket/chamfer đều có đường geometry và phép đo. Xem [ma trận ${matrix.rows.length} mục cơ khí](../work/mechanics/docs/v1-acceptance.md) và [JSON](../work/mechanics/docs/v1-acceptance.json) để biết input/oracle/evidence từng phần. Ma trận không cấp pass toàn bộ chiến dịch ứng dụng AT hoặc fit vật lý.

## Hợp đồng tích hợp

Input là footprint rings + các material slab XY/Z đã resolve, params với ID/mode/origin/provenance, h0/h/datum và role palette. Thêm source attachment cho text và per-source bevel override. Output là labelled parts, semantic feature IDs, effective parameters, interval/curve ledger, diagnostics, unqualified fit và proposal/diff. Không serialize mesh bulk thành JSON.

Mechanics/source ABI **2**; runtime root **2**; geometry C++ **1**, packed **ARCH/1**. Request size native/WASM là **224/200**, source **128/112**; slab **72**, attachment **48**, bevel override **40**. [API](../work/mechanics/docs/API.md) mô tả pointer layout, stride, ownership, single-use generation control, datum và curve frame. Không đưa struct ABI1 vào executor ABI2.

Parent thêm mechanics job vào **cùng** runtime lease manager: tăng generation, hủy đúng generation, gate publish, chuyển chính xác một primary lease; giữ binary semantic sidecar cùng snapshot lease. Preview transform chỉ cho lắp ráp, manufacturing vertices không đổi. Tránh suy ra tiếp xúc 3D từ root planar shared-edge ledger. Parent liên kết static arch_mechanics vào cùng module Rust/Emscripten, với ARCH_MECHANICS_FIXTURES=OFF; không cần NODERAWFS trong sản phẩm.

[ADR-002-v2](../work/mechanics/docs/ADR-002-v2.md) thay các giới hạn wave1 về groove/bevel/text/chamfer, đồng thời chốt clearances, auto zero, schedule, datum và formula. Các phép cut dùng Manifold/Clipper2; không có parser/shaper/triangulator/voxel/boolean tự viết. Fix suy biến dùng profile datum cục bộ và cutter đi xuyên mặt biên; không nới oracle, không Simplify sửa gần đúng, không đẩy seam bằng epsilon.

## Dependency và giới hạn cụ thể

Parent cung cấp source style noi/chim/phang/phang2, rim/bands/core và material slabs; synthetic prepared slabs kiểm interface, không thay thuật toán style. Missing prepared context bị từ chối có tên. Direct arbitrary mesh/CSG, full-pipeline signed error, general self-intersection corpus, runtime/browser final link, UI, storage và exporters còn thuộc phần tích hợp parent/worker khác. Giới hạn hình học và resource được ghi trong ADR; invalid/proposal/cancel không xuất partial mesh. Những phụ thuộc này không được che bằng một mesh gần giống.

Manifold 3.5.3 @ 0edd9d54876f3135e431575214dd6d8a72866fee; Clipper2 @ 46f639177fe418f9689e8ddb74f08a870c71f5b4. Original archive, derived tree và carry patch kiểm SHA; .toolchain chỉ đọc, CMake downloads OFF. CMake4.4.3/Ninja1.13.2/Emscripten6.0.9, static native và WASM artifacts trong work/build-mechanics-{native,wasm}; [pins](../work/mechanics/pins.json), licenses và log build kèm theo. Không chạy Cargo trong candidate này.

[Wave1 preservation](wave1-preservation.json) xác nhận ${machine.preservation.checkedFileCount} checked files vẫn cùng SHA. [Input manifest](../inputs/manifest.json) là mốc đọc; main đang được parent phát triển nên không khẳng định main còn cùng hash. Báo cáo và artifacts hiện hành nằm trong [evidence-manifest.json](evidence-manifest.json), không tính loose outputs lần thử trước.

Implementation-only: inherited Astra/max theo caller; fast unavailable/unverified, không configured independent review, không agent con/ghế khác. **Không có tuyên bố fit vật lý**, force/fatigue, slicer hoặc printer qualification; không gửi lệnh in.
`);
const evidence=new Set(['inputs/manifest.json','inputs/wave1-checked-manifest.json','reports/wave1-preservation.json',
 'reports/mechanics-native-tests.json','reports/mechanics-wasm-tests.json','reports/mechanics-parity.json','reports/mechanics-cancellation.json','reports/checked-manifest.json','reports/handoff.json','reports/HANDOFF.md',
 'evidence/domain-adapter-tests.log','evidence/mechanics-native-configure.log','evidence/mechanics-native-build.log','evidence/mechanics-wasm-configure.log','evidence/mechanics-wasm-build.log',
 'work/build-mechanics-native/Release/arch_mechanics.lib','work/build-mechanics-native/Release/mechanics_fixture.exe','work/build-mechanics-native/manifold/lib/Release/manifold.lib','work/build-mechanics-native/_deps/clipper2-build/Release/Clipper2.lib',
 'work/build-mechanics-wasm/libarch_mechanics.a','work/build-mechanics-wasm/mechanics_fixture.js','work/build-mechanics-wasm/mechanics_fixture.wasm','work/build-mechanics-wasm/manifold/src/libmanifold.a','work/build-mechanics-wasm/_deps/clipper2-build/libClipper2.a']);
for(const report of [native,wasm])for(const a of report.artifacts){
 const stem=a.path.replaceAll('\\','/').replace(/\.bin$/,'');
 assert.equal(sha(fs.readFileSync(path.join(room,stem+'.bin'))),a.sha256,'Stale mesh artifact');
 assert.equal(sha(fs.readFileSync(path.join(room,stem+'.json'))),a.metadataSha256,'Stale metadata artifact');
 for(const ext of ['.bin','.json','.log','.reproducer.json'])evidence.add(stem+ext);
 if(a.options.stl)for(const file of fs.readdirSync(path.join(room,path.dirname(stem))))if(file.startsWith(path.basename(stem)+'.p')&&file.endsWith('.stl'))evidence.add(path.posix.join(path.dirname(stem),file));
}
for(const c of cancel.cases){const stem=c.artifact.replaceAll('\\','/').replace(/\.bin$/,'');for(const ext of ['.bin','.json','.log','.reproducer.json'])evidence.add(stem+ext);}
for(const entry of read('reports/checked-manifest.json').files){
 const name=path.join(room,'work/mechanics',entry.path);assert.equal(sha(fs.readFileSync(name)),entry.sha256,`Candidate changed: ${entry.path}`);
}
const files=[...evidence].sort().map(relative=>{
 const absolute=fs.realpathSync(path.join(room,relative)),within=path.relative(fs.realpathSync(room),absolute);
 assert.ok(!within.startsWith('..')&&!path.isAbsolute(within),'Evidence outside own run');
 const bytes=fs.readFileSync(absolute);return {path:relative,bytes:bytes.length,sha256:sha(bytes)};
});
fs.writeFileSync(path.join(room,'reports/evidence-manifest.json'),JSON.stringify({schemaVersion:2,at:new Date().toISOString(),files},null,2)+'\n');
console.log(JSON.stringify({native:machine.native,wasm:machine.wasm,parity:machine.parity,checkedEvidence:files.length}));
