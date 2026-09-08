# Review: GEO-04 CSG / native geometry and application transactions (frozen candidate)

- Ghế / mã phiên: Grok / `20260908-csg-closure-review-r1` (session `01a08199-726b-7962-a6cb-8328b171318b`)
- Ngày/phiên bản [cấu hình ghế](../seat-config.json) đã áp dụng: 2026-09-08; Grok `grok-4.6` / effort `xhigh`; Opus không gọi
- Công cụ / phiên bản; cách gọi hoặc tiếp tục phiên: `tools/reviews/start-grok.ps1` Mode Print, `--no-subagents`; binary SHA-256 `bf43dc75f5478a106eab1e86d422c963e4dbe9666cf14dab363733d27bf1e672`; cwd `Z:\project`; `GROK_HOME` trong phòng phiên
- Model yêu cầu / model thực tế (model đích nếu dùng alias): yêu cầu `grok-4.6`; metadata phiên `current_model_id: grok-4.6` (`cache/grok/home/sessions/Z%3A%5Cproject/01a08199-726b-7962-a6cb-8328b171318b/summary.json`); launcher `reports/grok-launch.json` cùng model
- Effort / chế độ thực tế: `reasoning_effort: xhigh` trong `summary.json`; launcher `effort: xhigh`
- Fast mode thực tế: không có cờ fast riêng cho Grok; subagents tắt (`subagents: false`)
- Bằng chứng xác minh cấu hình: `reports/grok-launch.json`; `summary.json` (`current_model_id`, `reasoning_effort`); `inputs/config-check.json`
- Kiểm tra lựa chọn mới mạnh hơn: 2026-09-08; nguồn `https://docs.x.ai/build/cli/reference` và live Models list trong `inputs/config-check.json`; available `grok-4.6`, `grok-4.5`; `strongerVerifiedAvailable: false`
- Trạng thái cấu hình: đã xác minh (model/effort runtime khớp seat-config; không hạ cấu hình)
- Phạm vi và revision/hash đầu vào: chỉ `inputs/candidate/` + quy tắc dự án; `inputs/source-manifest.json` SHA-256 `436791c356002ec3693633799ab7a45f9f7cbfd5f1166ac6bbc7d178cb7006d4`; GEO-04 trong `docs/specs/03-ky-thuat.md` dòng 137–170
- Thời gian: 2026-09-08; suy luận nguồn, không chạy native/WASM/build
- Đọc kết luận ghế khác trước khi review: không

## Phạm vi đã đọc (độc lập)

Native guard/CSG: `src/kernel/mechanics/src/derived_guard.h`, `derived_guard.cpp.inc`, `derived_check.cpp.inc`, `mechanics.h`, `tunnel_guard.cpp.inc` (phần đầu); `src/mesh-import/src/native/imported_csg.h`, `imported_csg.cpp`, `root_gate.cpp`; Rust `src/mesh-import/rust/root_runtime.rs`, `wire.rs`.

JS: `operation.mjs`, `imported-csg.mjs`, `root-runtime.mjs`, `root-app-adapter.mjs`, `app-csg-transaction.mjs`, `candidate-qualification.mjs`; `src/integration/mesh-services.mjs`; `src/app/mesh-transactions.mjs`, `proposals.mjs`, `source-approval.mjs`, `controller.mjs` (snapshot/importedMesh), `jobs.mjs`, `sources.mjs` (mesh SourceContext); UI `src/ui/sections/ParametersSection.tsx`.

Tests đã đọc: `tests/csg-derived-guard/closure.cpp`, `closure.py`; `src/mesh-import/tests/import-as-part.test.mjs`. `tests/mesh-app` không đọc được (permission denied). `raster-adapters.mjs` chỉ đối chiếu qua grep: không nằm trên đường CSG mesh.

Không sửa mã. Không chạy kiểm tra. Không đọc kết luận ghế khác.

## Phát hiện

Không có khiếm khuyết triển khai nghiêm trọng đã xác nhận (sai hình học, invent target, bỏ collision new-vs-old, bỏ CAS/handoff, hoặc nhận overlap dương như tách rời) so với GEO-04 và hợp đồng `derived_guard.h` trên phần mã đã đọc. Các mục dưới đây là lệch nhẹ / hạn chế năng lực / đường chưa kiểm chứng — không phải chứng nhận phát hành.

### F1 — Low (hành vi UI sau khi mở lại, không invent target)

- Đường dẫn: `src/ui/sections/ParametersSection.tsx` dòng 27–31, 85, 100, 207–214; `src/integration/mesh-services.mjs` dòng 22–27, 78–80; `src/app/controller.mjs` dòng 165.
- Điều kiện: mở lại dự án đã áp dụng mesh (`project.id` đổi). `useEffect` xóa `meshUnit` / `meshTarget` / `meshMaterial`.
- Tác động: catalog đích gốc vẫn có trong `recipe.operation.targetOptions` (và replay dùng `command.targets` đã lưu). UI không gắn lại `resolved.targetId` / đơn vị / vật liệu. Nút Áp dụng bị khóa đến khi chọn lại — không tự chọn đích. Replay/CAS không dùng dropdown.
- Đối chiếu spec: “original target choices after reopening” được giữ ở recipe/replay; lựa chọn đang chọn trên UI thì không. Không invent target (`them` → `targets:[]`; `han`/`tru` bắt buộc `targetId`; `@main-body` chỉ khi đúng một `mainBody`).
- Hướng sửa (nếu muốn đủ tiêu chí UI): khởi tạo select từ `meshCsg.parameters.resolved.targetId`, `input.approval.unit` và vật liệu đã duyệt; vẫn bắt buộc xác nhận hai bước trước apply mới.

### F2 — Limitation (không phải defect): OBJ nhiều vật liệu ở lớp ứng dụng

- Đường dẫn: `src/integration/mesh-services.mjs` dòng 74–76; UI dòng 215–221.
- Trigger: apply STL/OBJ qua `prepare()`; mọi `partMaterialIds` / `sourceMaterialAssignments` trỏ một `importMaterial`.
- Consequence: giản lược tường minh một vật liệu (GEO-04 cho phép). Native vẫn giữ nhiều vật liệu nếu selection đủ (`import-as-part.test.mjs` case `obj-two-materials`). App không mở capability đó.
- Không im lặng thay glyph/placeholder; không phải lỗi hình học của nhân.

### F3 — Limitation: không có chế độ “hàn khối chạm nhiều nhất”

- GEO-04 mô tả chọn thể tích giao dương lớn nhất khi user chọn mode đó. `meshOperationForParameters` / UI / `resolveMeshTarget` chỉ nhận đích tường minh hoặc `@main-body` đúng một thân. Không suy đích từ overlap.
- Đây là capability chưa làm, đúng hướng “no invented target”, không phải implement sai mode đã có.

### F4 — Limitation (chứng chỉ bảo thủ, không phải nhận lưới sai): tunnel / mechanical / remesh CSG

- `derived_check.cpp.inc` 190–207: tunnel đổi nhóm 0 đòi `unchanged_domain` trên toàn opening; không có nhánh raw chứng opening còn rỗng nếu boundary đổi.
- `derived_check.cpp.inc` 242–246: mechanical faces kiểm `std::set` membership, không phải multiset (khác exact-part append ở 112). Trùng tam giác cơ học giống hệt có thể còn một bản mà vẫn qua. Append import-as-part thì so multiset (`faces==g->exact_part_faces[pi]`).
- Union/subtract qua Manifold thường đổi triangulation; `DERIVED_MECHANICAL_FEATURE_CHANGED` từ chối. Đúng “giữ facet cơ học tuyệt đối”; không phải bằng chứng fit. Không phải numeric bound toàn cục (đúng tuyên bố).

### F5 — Limitation đã ghi trong ABI: AABB mở vs overlap dương

- `derived_check.cpp.inc` 136–169 và `imported_csg.cpp` 66–73: `max<=min` trên một trục → bỏ Boolean (tiếp xúc mặt/cạnh/điểm của AABB, không interior 3D). AABB giao dương → `Intersect` / `empty(...)`.
- Test ý đồ: `tests/csg-derived-guard/closure.py` dòng 38–39, 84–89: `contact-plane|edge|point` accept; `contact-overlap` (dịch −1e-5) expect `DERIVED_MANUFACTURING_COLLISION_UNVERIFIED`.
- Append (`102–115`, `167`): chỉ bỏ cặp original–original sau khi mỗi part gốc khớp oriented-facet/material/multiplicity; new-vs-old vẫn qua AABB rồi Boolean (`imported_csg.cpp` 276–284 `disjoint(..., true)`).
- Không xác nhận overlap nhỏ hơn dung sai thư viện; spec/ABI không đòi global error bound.

## Kiểm chứng

| Lệnh | Exit code | Bằng chứng | Kết quả |
| --- | --- | --- | --- |
| Không chạy native/WASM/test (nguồn + test đã chụp) | n/a | Đọc `derived_check.cpp.inc`, `imported_csg.cpp`, `root_runtime.rs`, `mesh-services.mjs`, `mesh-transactions.mjs`, `app-csg-transaction.mjs`, `ParametersSection.tsx`, `closure.py`, `import-as-part.test.mjs` | Suy luận nguồn; test không được thực thi trong phiên này |

`tests/mesh-app` không đọc được. `raster-adapters.mjs` không điều khiển CSG; mesh dùng `createSourceContext` trong `src/app/sources.mjs` dòng 76–104.

## Kết luận

**Chưa đủ bằng chứng để đạt hoặc để kết án defect hình học nghiêm trọng.** Không phê duyệt phát hành.

Đã đối chiếu trên mã đóng băng:

- Tách AABB interior vs overlap dương; append chỉ tái sử dụng collision cặp gốc sau exact per-part match; new-vs-old và bed vẫn bắt buộc.
- Source datum: owner / material (rgba) / mặt phẳng Z / orientation / ancestry operand0 + `reversed==0` + diện tích dương (interval); mechanical facets exact; cavity/tunnel full khi nhóm đổi, bỏ khi facet multiset nhóm không đổi.
- import-as-part: `target_count==0`, copy exact vertices/triangles, affine 12 hệ số + unit user, không remap vật liệu đích; root `arch_mesh_check_final` gọi `arch_mech_guard_check_append`.
- Không invent target; orphan target native `CSG_ORPHAN_TARGET_OR_PART` / `MESH_TARGET_ORPHAN`.
- Hai bước xác nhận (`mesh-transactions.mjs` 37–51, `handoff:true`); hủy/release; một `appendDocument` + `store.commit` CAS (`app-csg-transaction.mjs` 107–161); replay không ghi journal (`164–179`).

Đường chưa xác lập:

- Không chạy test/binary; không đo Manifold `Transform(mat3x4)` cùng 12 double với affine thủ công của import-as-part (union/difference).
- Thân `useAsyncAction` (stale closure unit/target) chưa đọc hết.
- `tests/mesh-app`, toàn bộ `tests/csg-controller`, `root-history-browser.mjs` chỉ thấy qua grep.
- Backend/auth/network và font ngoài phạm vi.
- Fit vật lý / sai số toàn cục: không được tuyên bố và không được review như đã chứng minh.
