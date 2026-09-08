# Backend tài khoản, cài đặt và AI

Node **24.19.0** đã chạy trên Windows x64; yêu cầu Node 24.19+ trong major 24.
ESM thuần, không npm dependency. Hình học chạy trong trình duyệt.
API version 1; SQLite schema version 3. Mã nguồn ở `src/server`, kiểm thử ở
`tests/server`. Trạng thái nghiệm thu toàn sản phẩm theo
[kế hoạch phát triển](../development/PLAN.md).

- [Hợp đồng HTTP](API.md): đường dẫn, method, JSON, lỗi, quyền và vòng đời.
- [Vận hành và cấu hình](OPERATIONS.md): bootstrap, OIDC, khóa ngoài DB, chạy,
  backup/restore, rotation, giới hạn triển khai.
- [Biên provider và ledger](PROVIDERS.md): adapter đã pin, consent, atomic
  reservation, unknown, settlement, kết quả và callback.
- [Adapter AI](AI-ADAPTERS.md): xAI Imagine, nguồn giá/capability, opt-in và giới hạn.
- [Phạm vi nghiệm thu còn mở](ISSUES.md): các cổng chưa được chứng minh.
- [Nguồn chính thức đã pin](sources.json): Node v24.19.0 và chuẩn OIDC/OAuth.

## Tích hợp

Dịch vụ chạy riêng, bind 127.0.0.1. Reverse proxy HTTPS cùng origin đưa
/api/v1/* tới dịch vụ, bảo toàn Host đã cấu hình. UI gọi fetch cùng origin
với credentials: 'same-origin'. Đọc /me để lấy user, sessionId và csrfToken;
token CSRF chỉ ở bộ nhớ phiên. Cookie phiên HttpOnly, không có JWT để UI giải mã.

OIDC dùng điều hướng cùng tab. Sau callback 303 về /, UI đọc /me rồi nạp đúng
partition user. Khi đổi user/logout, UI đóng Worker, hủy handle/poll, xóa bộ nhớ
và kiểm sessionId/userId trước áp phản hồi. Backend luôn trả ảnh vào khay kết quả;
controller chỉ áp khi đúng user, projectId và revision hoặc có lệnh chọn ảnh mới.
Cloud project backup hiện tắt, nên projectId/revision là tham chiếu local
namespaced theo user, không phải xác nhận có dự án cloud.

Bốn phạm vi được phân biệt: /owner/policy (system), /settings và /ai/budget
(user), project snapshot trong domain/controller, device handle/drawer/offline
cache ở client. resolveSettings là hàm thuần cho các giá trị mặc định dự án;
không dùng nó để nhập device state vào dữ liệu user hoặc tự áp profile.

## Kiểm thử

Từ gốc repo, PowerShell 7:

~~~powershell
& ./tests/server/run.ps1 -Seat codex -RunId backend-validation
~~~

Runner kiểm syntax, chạy các file *.test.mjs với node:test, HTTP loopback
port OS cấp, SQLite thật, IdP local ký RS256 và provider giả chỉ trong tests.
Runner lưu kết quả trong phòng phiên do người chạy chọn.
Test CLI gọi PowerShell và dot-source cùng môi trường trước từng Node child.
Không tải browser, không gọi AI thật, không mua/triển khai dịch vụ.

Các test khác biệt với nghiệm thu browser/host/slicer/mesh và review độc lập.
Các điểm chưa chạy giữ trạng thái unverified trong ISSUES.md.

