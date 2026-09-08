> Hồ sơ giao việc lịch sử. Chỉ đạo mới nhất ngày 2026-09-08 đã ngừng Opus; không dùng tài liệu này để gọi lại. Phân công hiện hành ở [README](README.md).

# Giao việc Opus: tích hợp hợp đồng 0.2 và kiểm trải nghiệm

Đây là nhiệm vụ triển khai tiếp phần UI đã bàn giao, theo phân công chủ dự án.
Đọc AGENTS.md, docs/development/README.md, docs/reviews/seat-config.json và
SEAT-CONFIG.md trước khi làm. Dùng opus/max, fast off thật qua launcher;
kiểm model/runtime/effort/Fast mode và ghi phần nào chưa quan sát được. Không tự mở
ghế khác hoặc agent con trong đợt này; phần phản biện độc lập do Codex điều phối.

Phòng duy nhất được ghi: tmp/reviews/opus/runs/20260908-ui-wave2. Trước mỗi shell
ghi dot-source tools/project-env.ps1 -Seat opus -RunId 20260908-ui-wave2. Code
đã được chép vào work/ui, có hợp đồng 0.2 mới. Chỉ sửa candidate trong phòng này,
không sửa root src/docs/tools, phòng UI trước hoặc dependency dùng chung.
Không tải/cài gì bên ngoài repo. Các cấu hình/profile/browser output riêng
phải ở phòng này; .toolchain chỉ đọc. Không dùng credential để gọi AI thật.

Thực hiện các quyết định trong docs/development/contracts-v0.2.md và dùng đúng
src/contracts/app-bridge.ts 0.2 đã chép. Đặc tả 01/02/06/07 có hiệu lực.

1. Thay form mật khẩu bằng OIDC cùng tab, gọi signIn(options), nhận lời mời
   qua inviteToken. Reauth có đường rõ ràng. Không còn signIn(email,password)
   hay acceptInvite. Owner mời bằng issuer+subject; không coi email là identity.
   Đổi vai trò/suspend/delete/revoke session có xác nhận và giữ lỗi REAUTH.
2. Đọc settings/editor/history/selection/XY/sizeDisplay/excludedReason/importedMesh
   từ snapshot. Áp mesh và giữa bàn gửi lệnh mới. Không giữ dirty nghiệp vụ
   bằng bộ đếm UI. Bỏ các khóa settings giả dùng để luồn lệnh qua hợp đồng cũ.
3. AI: prepareImage không billable, hiển thị quote đầy đủ rồi consent tường minh
   mới submitImage. Đổi prompt/provider/model/reference làm vô hiệu quote trong
   form. Giữ operation/jobId khi double-click hoặc retry; không tự tạo lượt mới.
   Có form ngân sách ba kỳ bằng decimal string, query sổ chi phí, khay kết quả
   và chọn áp ảnh mới tường minh. Không biến unknown thành 0. API key form tạm
   xóa sau thao tác; không cache key. Capability reference chỉ bật khi công bố.
4. Cập nhật mock/demo/tests cùng 0.2. Mock vẫn có nhãn mô phỏng, không nằm trong
   src/ui và không báo mesh/fit thực đạt. Giữ mountApp(element,bridge) cleanup.
5. Chạy strict typecheck/build và browser thật. Playwright 1.63 có sẵn tại
   .toolchain/app-runtime/node_modules, Chromium/Firefox/WebKit tại
   .toolchain/playwright. Dùng Node/Playwright, browser profile/TEMP/screenshot
   trong phòng. Chỉ bind 127.0.0.1, port riêng hoặc OS cấp. Vite fs.allow chỉ
   candidate, dependency đã pin và src/assets cần dùng; không phục vụ toàn repo,
   thư mục cache/credential hoặc phòng khác. Browser screenshots ghi evidence/.

Nghiệm thu: 320/720/1023/1180/1400px, font 200%, không cuộn ngang ngoài canvas;
dialog/focus trap/restore/Escape/bàn phím/skip link; shortcut không cướp input
hoặc composition; sáu khu/hai bước; bận/hủy/lỗi/expired/member/owner; OIDC không
password; AI quote/consent/double click; không console errors. Đo tương phản
control token hiện hành, reduced motion/forced colors. Không tuyên bố kiểm
screen reader/IME/thiết bị thật nếu chỉ dùng automation.

Tự sửa lỗi tìm được và kiểm lại. Bàn giao reports/HANDOVER.md, file manifest
SHA256, lệnh/exit/browser version/kết quả và giới hạn. Không dừng ở đề xuất.
Nếu gặp điểm hợp đồng thiếu, triển khai phần độc lập trước, ghi đề xuất cụ thể
và không giả thành công. Codex sẽ kiểm lại và ghép bridge thật.
