# Proposal cho parent (không ghi main)

Package checked tại work/printing; parent dự kiến đặt dưới src/printing.
Hai patch đã áp và build trên private main copy:

1. kernel-native-CMakeLists.txt.patch: optional add_subdirectory, cùng runtime.h.
2. kernel-build.rs.patch: bundle native/WASM printing archives vào Rust staticlib.

kernel-build.ps1.patch và bản đọc kernel-build.ps1.proposed là proposal cụ thể
cho launcher main. Chúng bổ sung own Cargo cache/offline mode, optional explicit
prepared source paths, C pthread flags và exact printing exports. Proposal được
kiểm cú pháp; build thực dùng tools/build-unified.ps1 với cùng configure/compiler/
link settings. Không đánh dấu proposal launcher đã chạy nguyên văn trên main.

main-preimage.json ghi hash từng source/support file đã dùng. Main có thể đã
tiến tiếp trong lúc parent tích hợp; áp có kiểm context và đọc khác biệt trước
khi nhận patch. Không copy private-main toàn bộ hoặc ghi đè file main bằng
candidate frozen copy. Current toolchain snapshot và source tree pins nằm ở
docs/unified-pins.json.

Đường host sau khi parent áp patch:

```js
import {createUnifiedPrinting} from './printing/src/index.mjs';
// existingModule là Module ABI 2 đã được kernel Worker khởi tạo một lần.
const printing = createUnifiedPrinting(existingModule);
// Khi parent chuyển hẳn primary lease đã nhận từ một build thành công:
const lease = printing.adoptPrimaryLease(snapshotId, generation);
const result = await printing.exportSnapshot3MF(lease, request, {format:'project'});
// exporter đã release đúng một lần; result.bytes thuộc JS và có thể transfer.
```

Nếu UI giữ primary để render, dùng acquireReaderLease thay adoptPrimaryLease.
Chuẩn bị metadata request trước bước acquire/adopt, kiểm job/revision/ACL và
quyền export tại host. Request shape/limits ở docs/API.md. Optional
installPrintingWorker nằm ở src/printing-worker.mjs, cài bên trong **Worker
kernel hiện có**; nó không tự enforce policy và không tạo Module.
Host chỉ đăng ký listener một lần và tháo listener lúc dispose.
Bằng chứng browser dùng trực tiếp binding trong Worker; listener tiện ích
không được tính là phép thử UI/backend hoàn chỉnh.

Main release build bỏ test-fixtures và _arch_test_fixture; pin toolchain/
license và dữ liệu profile quyền user cung cấp. Không bundle ownrun/inputs,
node_modules tests, font thử, slicer executable hay archive dependency lên web.
Core C ABI header/kernel_bridge.h và cmake/unified-exports.json là contract
máy đọc được; không đổi main runtime.h để ghép exporter.

Launcher proposal đã được refresh theo launcher-preimage.json để giữ cả exports
STL/output handles và ARCH_FONT_PROBE mới của parent. CMake/build.rs patches
vẫn là delta đã build trên main-preimage.json. So sánh đọc-only thấy thay đổi
runtime.h là comment và STL/output API bổ sung; packed ARCH/1 và các lease
functions không đổi trong diff quan sát. Main mới chưa được build/test ở wave2;
parent giữ các bổ sung đó khi tích hợp, không thay toàn file bằng bản frozen.
