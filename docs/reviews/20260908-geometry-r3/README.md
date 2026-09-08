# Phản biện hình học và xuất tệp — vòng 3

Ngày 2026-09-08. **Chưa nghiệm thu phát hành.** Reviewer độc lập đã kiểm nhân
native và WASM, tìm ba vấn đề tích hợp xuất; Codex điều phối chấp nhận cả ba
dựa trên trigger tái hiện được và đã sửa, kiểm lại trên mã chính.

## Nguồn chứng cứ bền

[Phát hiện độc lập](independent-findings.json) giữ trigger, tác động, phép đo,
vị trí và giới hạn của từng ý kiến; kèm cấu hình thực gpt-6-astra/max, Fast off,
CLI 0.153.4 và SHA của báo cáo gốc. Reviewer khóa kết luận trước khi đọc phân
xử R2. Không có telemetry service tier từ server; kiểm Fast dựa trên feature
hiệu lực và cờ tiến trình, không suy từ tên ghế.

[Danh sách đầu vào](source-manifest.json) giữ 469 hash tệp của bản được review.
[Bằng chứng sửa trên mã chính](parent-verification.json) giữ hash mã, hai
nhóm kiểm WASM và kết quả thật qua Worker trên ba trình duyệt. Hồ sơ này tự
chứa các kết luận và phép đo cần đọc; đầu ra phiên chạy không phải dependency.

## Phân xử

| ID | Quyết định | Sửa và kiểm lại |
| --- | --- | --- |
| R3-F1, high | Accepted | Snapshot charm/clicky ở chế độ ráp từng xuất được khi caller gửi gates=0. Payload bất biến gắn với handle hiện kiểm assembly trước khi xuất cả ba format, kể cả inspection; đường STL cũ cũng kiểm. Mọi ca âm bị ASSEMBLY_VIEW, mô hình nguồn giữ nguyên. |
| R3-F2, medium | Accepted | Hai revision tự khai giống nhau từng gắn nhãn sai cho artifact. Hiện so revision request với head, APRQ và APMS của chính snapshot. Giá trị 9007199254741235 bị STALE_REVISION; revision thật xuất được và metadata đúng. Application vẫn phải đối chiếu dự án hiện hành. |
| R3-F3, low | Accepted | Khai báo TypeScript đổi mechanicsSemantics thành 3 và khai sourceSemantics=2, khớp getter và metadata thật. |

Sau sửa, build native/WASM đạt; hai nhóm WASM trực tiếp và sáu nhóm RPC đạt
trên Chromium, Firefox, WebKit, gồm đối chứng union STL, ZIP theo vật liệu,
lát cắt SVG, lease/hủy và quyền sở hữu snapshot. Mapping/vận hành tài khoản
của các phép thử này là fixture rõ ràng, chưa phải nghiệm thu toàn ứng dụng.

## Kết luận về hai lỗi R2

- **CDX-MECH-R2-001:** reviewer độc lập tái hiện đúng trigger thân 40×30 mm,
  H6/Z3/D4/cham0/bevel R2: native và WASM từ chối do mất mái; không bevel và
  bevel nhỏ là đối chứng hợp lệ. Với root artwork nổi, lỗi có thể bị chặn sớm
  bởi BEVEL_RADIUS_ERASES_COMPONENT; không dùng lỗi sớm đó để chứng nhận guard
  mái. Parent bổ sung ca artwork phẳng để đi đúng guard cuối.
- **CDX-MECH-R2-002:** base 12 lớp từ bed, h0=.16/h=.20 tạo mặt 2.36 mm;
  artwork 4 lớp/ref0 bị từ chối, ref12 tạo [2.36,3.16]. Reviewer còn kiểm mm
  khai sai reference, lịch h0=.25, recess và nhiều datum. Không tự đổi datum
  hoặc chế độ chiều cao để nhận đầu vào sai.

Hai lỗi gốc được đóng trong phạm vi trigger/đối chứng đã kiểm. Các phép đo hữu
hạn và kiểm native không chứng nhận mọi tổ hợp hình học hoặc khả năng lắp vừa.

## Vấn đề còn mở

Default clicky/noi có 224 cặp đỉnh double khác nhau trùng sau chuyển float32;
STL union bị STL_FLOAT_COLLISION. Chặn serialization là đúng, nhưng đường dùng
mặc định chưa hoàn tất. Phải xử lý nguyên nhân hoặc có quy trình hiệu chỉnh
được xác nhận và kiểm chứng; không bỏ guard hoặc âm thầm gộp/cắt mặt để báo đạt.

Sai số toàn chuỗi Boolean vẫn chưa được chứng minh. Vòng này không nghiệm thu
UI hoàn chỉnh, CSG nhập mesh, PNG/3MF theo máy, slicer hay thử in vật lý.

## Chạy lại

Sau khi chuẩn bị toolchain đã pin và build Module chung bằng
[build.ps1](../../../tools/kernel/build.ps1), đặt PRODUCT_RUNTIME_MODULE và
ARCH_WASM_MODULE tới cùng tệp arch-kernel.mjs trong phòng phiên riêng.
Chạy [export-authority.test.mjs](../../../tests/product-runtime/export-authority.test.mjs)
và [final-export-rpc.test.mjs](../../../tests/kernel/final-export-rpc.test.mjs)
bằng Node test runner. Ca mái/mặt/lớp bền ở
[r2-root.test.mjs](../../../tests/product-runtime/r2-root.test.mjs).
