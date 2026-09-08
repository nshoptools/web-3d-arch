# Kiểm ngữ cảnh và xác nhận của giao diện xuất

Bộ này giữ ca tái hiện của phản biện UI-R1 và các ca bổ sung của Codex. Dùng React,
AppShell và handler thực với DeferredBridge có điều khiển; không kiểm backend,
hình học hoặc slicer. Các chuỗi PRIVATE trong test là dữ liệu tổng hợp.

Chạy PowerShell từ gốc repo, mỗi lần dùng mã phiên mới:

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId YOUR-NEW-RUN
$env:REVIEW_ONLY='lifecycle'
$env:REVIEW_ENGINES='chromium,firefox,webkit'
$env:REVIEW_PHASE='current'
& ./.toolchain/emsdk/node/24.19.0_64bit/node.exe tests/ui/export-consent/run.mjs
```

Bỏ REVIEW_ONLY để chạy lifecycle, receipts và các ca giao diện bổ sung; chọn
followup, keyboard hoặc readability để kiểm đúng nhóm. Runner chụp mã UI,
hợp đồng và test vào phòng riêng, kiểm lại hash khi kết thúc. Profile, log,
screenshot và cache ở cùng phòng; dependency chỉ đọc từ .toolchain.

L01–L14 giữ assertion của reviewer. L11 đã chỉnh phạm vi đếm: truy vấn danh mục
font/emoji được phép khi đổi ngữ cảnh; dispatch/export phải bằng không, mọi call
không được chứa bản nháp riêng cũ. Trước sửa sản phẩm, giá trị hiển thị và lệnh
đều sai; sau sửa, phát hiện đếm truy vấn không phải là lỗi gửi nhầm dữ liệu.
L15 kiểm bản nháp qua ABA trong một React batch; L16 bấm xác nhận cũ trong chính
batch đó, trước khi React kịp cập nhật cây DOM. Không tự chấp nhận proposal.

Kết quả là bằng chứng triển khai/kiểm lại, không phải một vòng phản biện độc lập
mới. Các test chưa chạy hoặc nhóm đang có lỗi phải được ghi đúng trạng thái.
