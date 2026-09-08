# Dành cho Opus / Claude

**NGỪNG SỬ DỤNG OPUS** theo chỉ đạo mới nhất của chủ dự án ngày 2026-09-08.
Không khởi chạy, tiếp tục, fork hoặc giao agent con Opus; không tự mở lại khi
quota reset. Hub/Codex/Grok tiếp tục dự án. Giữ nguyên công việc/bằng chứng cũ.
Các ràng buộc Max/Fast off dưới đây chỉ có hiệu lực nếu chủ dự án cho phép
sử dụng lại bằng một chỉ đạo mới; chúng không phải quyền khởi chạy.

Đọc và tuân thủ [AGENTS.md](AGENTS.md) trước mọi thao tác. Đây là nguồn quy tắc
chung duy nhất; mọi đầu ra phải ở trong repo. Review dùng phòng
`tmp/reviews/opus/` và hướng dẫn `tmp/reviews/README.md`.

Trước mọi lượt gọi Opus trong dự án, bắt buộc đọc `docs/reviews/seat-config.json` và
`docs/reviews/SEAT-CONFIG.md`; kiểm chứng model, effort/chế độ và fast mode
thực tế theo cấu hình hiện hành, kể cả khi tiếp tục một phiên cũ.

Theo yêu cầu chủ dự án ngày 2026-09-08: **Effort Max, Fast mode tắt**, áp dụng
cho triển khai, review, tiếp tục, fork và agent con. Dùng launcher
`tools/agents/start-opus.ps1`, không gọi raw CLI hay tự đổi sang Ultracode.
Ràng buộc này có ưu tiên hơn hướng dẫn effort cũ trong prompt hoặc phiên đã lưu;
chỉ thay đổi khi có yêu cầu mới của chủ dự án.
