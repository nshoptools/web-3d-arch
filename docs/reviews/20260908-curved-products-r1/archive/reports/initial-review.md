Review độc lập hình học/cơ khí — 20260908-curved-products-review-r1

Phát hiện **1 P1 và 1 P2**, đều tái hiện qua API child thật trên native và WASM, với mesh xuất ra được đọc độc lập. Đây là kết luận cục bộ cho snapshot đóng băng và dependency variant đã ghi hash; parent tự phân xử. Không kết luận release-ready.

Snapshot: 218 tệp, manifest SHA-256 `0b0a12030d0c9dede1ceacc80f2721ec43bc31d7078b1c0831779f9ce7f50cf9`. Kiểm trước/sau khớp toàn bộ byte, không tệp dư. Ba tệp production trong phạm vi không sửa. Chưa đọc handoff, kết luận tác giả hay review khác; không dùng agent con.

Actual session whitelist xác nhận `gpt-6-astra`, `max`, CLI `0.153.4`; CLI SHA-256 `444a3f0008050605cae73cd9b7a2dcac61294062dfaab56dd20430fd6498518b`. Effective feature `fast_mode=false`. Đã đối chiếu parent recheck cùng ngày và [model chính thức](https://learn.chatgpt.com/docs/models), [speed chính thức](https://learn.chatgpt.com/docs/agent-configuration/speed). **Server service tier chưa được attested**; requested `default` không chứng minh tier phía server. Chỉ đọc metadata SQLite với SELECT whitelist, không credential, raw events, messages, rollout hoặc debug.

**F1 — P1: guard xác nhận roof dương sau khi xóa residual có thể tích dương.**

ReqID: GEO-01, GEO-02, GEO-03; yêu cầu bảo toàn lỗ/vùng nhỏ, tính ngân sách sai số và kiểm vật liệu trên toàn miền roof/floor.

Vị trí: `src/kernel/mechanics/src/tunnel_guard.cpp.inc:37–45` (cùng cơ chế tại 69–90), SHA-256 `3307c7711b918162ce6db161e8082d7ceb38316a9930a1266d2eca67900de36d`; `src/kernel/mechanics/src/mechanics.cpp:967–982`, SHA-256 `5e18bdea26f33e7f513a79095a1f032029fa84682d2738c43b749b3a9a912787`. `Simplify(1e-7)` trên residual rồi xét empty/zero volume không bảo toàn sự tồn tại của lỗ xuyên mảnh. Trừ 1e-7 mm khỏi clearance Z không bù được chiều cao mất vật liệu.

Trigger strap: product 2, size 40, baseH 6, strapZ 3, strapD 4, strapCham 0, artMode 0, rimOn 0. Footprint 40×30 mm; slab dưới Z=[0,4.9], slab trên Z=[4.9,6]. Slab trên chứa lỗ CW có tọa độ nguyên `(-2000000,-50000), (2000000,50000), (2000002,50000), (-1999998,-50000)` trên grid 10^6 unit/mm. Hai cạnh ngắn dài 2 unit; bề rộng vuông góc ≈4.998438232e-8 mm, diện tích dương 2e-7 mm². Đây là lỗ hữu hạn, không phải mặt tiếp xúc có thể tích bằng không.

Observed: native và WASM trả AM_OK, exportBlocked=0, guard roof=floor=0.9999999 mm. Tại XY hữu tỉ `(680001/1000000,17/1000)`, xét **mọi tam giác bằng số hữu tỉ của byte IEEE thực** chỉ có giao Z=[0,1], không có roof. Đối chứng cạnh đó `(681/1000,17/1000)` có Z=[0,1,5,6]. Bbox toàn bộ [-20,-15,0]..[20,15,6]; tổng thể tích mesh 6697.265411245797 mm³. Part roof giữ lỗ thật, Euler=0. Tăng axial shift lên 4 nm vẫn nhận sai; 8/40 nm bị từ chối.

Trigger LEGO: cùng lỗ 2 nm, product 3, baseH 6, legoHoleH 3, legoRong=0, rãnh/xẻ/tai tắt; slab tách tại Z=3. Guard bore trung tâm báo roof=3 mm; ray tại cùng XY không có giao Z nào, đối chứng có Z=[3,6]. Tổng thể tích 6351.301818994563 mm³. Bản 8 nm bị từ chối đúng. Các param và byte request được giữ nguyên.

Expected: từ chối/unverified và không xuất mesh nếu không chứng minh được roof dương trên toàn miền, hoặc dùng chứng chỉ bảo thủ thực sự giữ lỗ. Phản ví dụ bác bỏ lời bảo đảm full-volume; không suy rằng mọi input đều lỗi hay khe này in vật lý được. Reachability đã chứng minh ở public prepared-source ABI; chưa chứng minh producer/app tạo chính xác hai slab này.

Reproducer chính: `inputs/independent/roof-oblique-slit-2nm.txt`, SHA-256 `f6530a24b75cc18c8fafccd9a41346786227eb93a7b3c74d52027d7f0d0fbeaa`; `inputs/independent/lego-roof-oblique-slit-2nm.txt`, SHA-256 `b86eb3113088dd908216776f8bf628302fb79f806bd3bf6b157a99c71cecdbf5`. Chạy script bên dưới với mỗi target. Mesh, bbox, volume, toàn bộ topology và ray nằm trong `guard-independent-native.json`, `guard-independent-wasm.json`, `cavity-independent.json`; JSON finding pin cả controls và artifact quan trọng.

**F2 — P2: extrema ngang toàn footprint bỏ sót breakout bên hông ở đế lõm.**

ReqID: GEO-01, GEO-03; lateral containment trong ADR-002-v2.md:122. Vị trí `src/kernel/mechanics/src/mechanics.cpp:678–701`, SHA-256 `5e18bdea26f33e7f513a79095a1f032029fa84682d2738c43b749b3a9a912787`; cạnh có `hi-lo=0` bị bỏ tại 685, kiểm cuối chỉ dùng `min_u/max_u` toàn footprint.

Trigger: product 2, size 40, baseH 10, strapZ 5, strapD 4, strapCham 0.6, artMode 0, rimOn 0; ring mm `(-20,-15),(20,-15),(20,15),(5,15),(5,1),(-5,1),(-5,15),(-20,15)`. Trên -5<x<5, host chỉ có y∈[-15,1], trong khi bore tại Z=5 cần y∈[-2,2]. Cạnh lõm y=1 song song trục bore bị bỏ; extrema xa y=±15 vẫn làm predicate nhận.

Observed: cả hai target trả AM_OK, exportBlocked=0; scanned=8, active=4. Ray ngang tại x=0.123,z=5 có y=[-15,-2], mất hẳn thành phía trên; tại x=10.123,z=5 có y=[-15,-2,2,15]. Mesh gồm 2074 vertex, 4152 face, 6228 edge, một component, Euler=-2, không lỗi oriented edge incidence; bbox [-20,-15,0]..[20,15,10], volume 10115.122735923536 mm³. Guard roof/floor vẫn dương ≈2.3999999 mm. Đây là breakout ngang tại cạnh song song bên trong notch, không phải miệng mở dọc trục chủ ý.

Expected: từ chối `STRAP_CHAMFER_LATERAL_BREAKOUT` hoặc báo chưa hỗ trợ chứng minh containment này. Đây là lỗi functional với kích thước mm thông thường, không phải refusal do cap tài nguyên.

Reproducer: `inputs/independent/strap-notch-1.txt`, SHA-256 `dab1b2ea3650d6f2dec74b02d95a72d7afd084ae098019e44c61142bc852ad5e`. Chi tiết mesh và số hữu tỉ trong `lateral-independent.json`; cả hai lượt tái hiện cuối có mesh gốc và summary.

**Lệnh tái hiện và hash harness.**

Từ repo root, dùng một tag mới cho mỗi lần; script tự resolve repo từ own run, dot-source env và chỉ tạo thư mục output mới trong phòng này:

```powershell
pwsh -NoProfile -File ./tmp/reviews/codex/runs/20260908-curved-products-review-r1/work/harness/reproduce-findings.ps1 -Target native -Tag parent-native-01
pwsh -NoProfile -File ./tmp/reviews/codex/runs/20260908-curved-products-review-r1/work/harness/reproduce-findings.ps1 -Target wasm -Tag parent-wasm-01
```

Script PS1 SHA-256 `83a0b26303b3c8406151336bb5696a2d4e9aa0dd21ead968f0e9e16f3e39ce00`; driver Python SHA-256 `3703853faac97ff249d40e954370a1a5df7c022348032cad75435e500afaa0ce`. Hai lệnh đã chạy thành công với tag `reviewer-final-check`; script kiểm hash input/binary trước khi gọi API và kiểm cả controls từ chối. Exit code tiến trình 0 riêng không phải geometry pass; verifier đọc verdict và mọi face cần cho chứng cứ.

**Phạm vi đã kiểm.**

| Kiểm | Native | WASM | Ý nghĩa |
|---|---:|---:|---|
| 40 captured models: 5 sản phẩm × 4 style × 2 nguồn | 40 | 40 | Actual child; chain nguyên cho mỗi Z, nguồn gốc, param, mesh face/edge/part/material |
| Surface source/prism độc lập | 12 | 12 | 4 mode, rim, lỗ lõm, island, strip xiên 2 nm; mọi patch/plane, không chỉ vertex |
| Công thức/contact hữu tỉ độc lập | 8 | 8 | Toàn arrangement trực giao, P/A/P−A và diện tích tiếp xúc ngang/dọc |
| Resource/corner controls | 16 | 16 | 14 nominal sinh mesh; 2 refusal chủ ý; nguyên kích thước/tolerance |
| R2 guard controls | 22 | 22 | Detached roof/floor, bevel, skin, vật liệu/lỗ/island |
| Frozen source suite | 140 | 140 | Producer regression, gồm binding/Z negatives |
| Frozen mechanics suite | 19 campaign | 19 campaign | 199 serialized inputs mỗi target; không suy full feature acceptance |
| Native in-flight cancellation | 3 | không chạy | Stage≥3 rồi cancel, không publish mesh dở |

Cross-target parity: 32/40 byte-identical, 8 LEGO thay triangulation; 88 patch qua bound full-surface, max≈5.08844698e-11 mm trong budget giữ nguyên 1e-8 mm. Đã xem lập luận: directed projected boundary bằng nhau và normal cùng hướng bảo đảm cùng miền chiếu; plane slab cùng vertex displacement chặn mọi điểm tam giác. Số học double thường vẫn không là formal interval proof. Bảy controls của oracle đều qua.

Không tìm được phản ví dụ mới cho shared-boundary conservation/material partition trong tập hữu hạn. Đã thử nghi vấn nhánh roundbox tall capsule và width sweep; chưa xác lập lỗi. Rãnh LEGO/min-three/rolling sectors/partial revolve và cap streaming được đọc mã, chạy các controls 513 cạnh, seed và 9 shallow notch; các kiểm section/radial của phần này dùng frozen producer oracle, không coi đó là chứng minh tổng quát độc lập. Các test tách rõ normal feature pass và intentional refusal.

**Giới hạn và xuất xứ build.**

Manifold 3.5.3 và hai child được rebuild thật bằng CMake 4.4.3/MSVC 19.51.36256; WASM bằng Emscripten 6.0.9/Clang 24.0.0/Node v24.19.0. Native child `/fp:strict`, WASM child `-fno-fast-math -ffp-contract=off`, parallel nội bộ Manifold tắt, downloads tắt. Sysroot Emscripten được copy/hash từ toolchain có sẵn, không rebuild. Không mượn prebuilt child/dependency library.

**Clipper2 không khớp derived-tree pin khai báo.** Bản `.toolchain/clipper2-derived` thực tế khớp byte archive upstream pin `46f639177fe418f9689e8ddb74f08a870c71f5b4`. Sau khi áp đúng carry patch của snapshot vào bản copy riêng, tree hash là `fcefb0a6d112a2f44feccc3a2a86411171c0a1666fb3a3fb549d6b432448a8fe`, khác declared `6316dc4c346683b329f362b78d9d2c324ad628175716f1ccd280c12d305a62cb`. Patch chỉ thay I/O guards và CMake; không sửa code hình học hay oracle. Kết quả native/WASM ở đây dành cho upstream+patch variant đã pin đầy đủ, không giả là cây declared đã được attested. Chi tiết nguồn/bản copy trong evidence dependency inventories.

Full-pipeline signed error, arbitrary self-intersection, mọi trường hợp tangent/near-collinear, tính hữu hạn của mọi query và WASM Worker cancellation còn unverified. Full-surface source checker dùng embedding chỉ để so sánh ≤1e-8 mm rồi chứng minh integer chain; không sửa manufacturing bytes. Chứng cứ hữu hạn không thành formal proof cho mọi input.

Không chạy 12 derive variants hoặc runner/oracle phụ thuộc root JS thiếu trong snapshot; đọc ARCH/APMS độc lập, không fallback main. Không dựng current root/Rust/Worker, không chạy new parent ASTF/probe/CSG, font parser recapture, backend/auth, printer/slicer, paid API hay deployment. Frozen root bridge chỉ là build input. Handoff và ý kiến ghế khác vẫn chưa đọc. Danh sách hypotheses/coverage/refused/notrun chi tiết nằm trong `initial-findings.json`; reproduction và manifest hoàn chỉnh được lập sau seal.
