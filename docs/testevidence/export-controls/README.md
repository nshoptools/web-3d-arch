# Kiểm chứng cấu hình, hồ sơ xuất và ảnh khung xem

[Kết quả và hash đầu vào](verification.json) ghi phạm vi tại mốc 2026-09-08.
Đây là kiểm triển khai/tích hợp của Codex, chưa phải phản biện độc lập.

Bảy nhóm Node dùng controller, validation và lịch sử thật với kho CAS cùng
exporter giả lập có nhãn. Chúng kiểm thập phân không cắt đuôi, trường/chế độ
hợp lệ, revision, undo/mở lại, mô hình cũ, byte/hash/cảnh báo hồ sơ, tải thất bại,
đề nghị chưa có tệp trước xác nhận và chuyển dự án A→B→A. Cả bảy đạt. Lần đầu
bốn nhóm lỗi vì schema bắt có cấu hình của mọi định dạng; đã sửa thành danh
sách định dạng tùy chọn và chạy lại. Không đổi kỳ vọng để hợp thức hóa lỗi.

Ba engine chạy SVG thật qua Worker/WASM và Three. Ngoài 18 kiểm khung xem sẵn
có, mỗi engine đạt chín kiểm PNG: ảnh có hình học màu, đúng số pixel, không đổi
khóa khi chỉ có rAF rảnh, từ chối khung đã đổi/hủy/ngữ cảnh cũ, không chụp khi
ẩn và ghi đúng trạng thái lắp ráp. Bản chạy đầu thiếu dependency của Worker
trong harness; harness nay bundle cả Worker cùng các import, rồi cả ba đạt.
Không đổi parser hoặc CSP sản phẩm để sửa harness.

Chạy lại nhóm controller từ gốc repo sau khi chuẩn bị môi trường:

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId export-controls-check
node --test tests/app/export-controls.node.test.mjs
```

Nhóm viewport cần một cặp Module đã build bằng `tools/kernel/build.ps1`, bật
Printing và TestFixtures. Đặt `ARCH_WASM_MODULE` vào đường tuyệt đối của
`arch-kernel.mjs` trong phòng phiên rồi chạy `node --test tests/viewport/browser.test.mjs`.
Runner ghi log/ảnh/kết quả trong phòng hiện hành; không lấy runtime từ phiên cũ.

Chưa chứng minh toàn bộ bảy exporter trong giao diện sản phẩm, lưu trữ trình
duyệt cho lệnh cấu hình mới, sai số toàn chuỗi hoặc lắp vừa. Các giới hạn này
không được chuyển thành nhãn sẵn sàng in.
