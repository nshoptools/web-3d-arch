# Dành cho Grok

Theo phân công mới ngày 2026-09-08, Grok tiếp nhận phần giao diện còn dở của Opus;
Hub điều phối, Codex phụ trách backend/nhân/thuật toán phức tạp, tích hợp và QA.
Không gọi hoặc sử dụng Opus. Phân biệt nhiệm vụ triển khai với phản biện độc lập;
không tự dùng kết luận của người viết mã làm review độc lập.

Đọc và tuân thủ [AGENTS.md](AGENTS.md) trước mọi thao tác. Đây là nguồn quy tắc
chung duy nhất; mọi đầu ra phải ở trong repo. Review dùng phòng
`tmp/reviews/grok/` và hướng dẫn `tmp/reviews/README.md`.

Trước mỗi phiên review, bắt buộc đọc `docs/reviews/seat-config.json` và
`docs/reviews/SEAT-CONFIG.md`; truyền và kiểm chứng model/effort thực tế theo
cấu hình hiện hành, kể cả khi tiếp tục một phiên cũ.

Trên Windows, bắt buộc khởi chạy qua `tools/reviews/start-grok.ps1` theo
[quy trình cô lập Grok](docs/reviews/GROK-WINDOWS-ISOLATION.md). Launcher tự đặt
môi trường, model/effort và chuyển `/tmp` về phòng phiên. Không tự gọi raw
`grok.exe`, bật native subagents/worktree hoặc đổi cwd tiến trình Grok về ổ thật.
Trong shell, dùng `PROJECT_ROOT` và `PROJECT_REVIEW_RUN` tuyệt đối. Nếu phiên
hiện tại được gọi trực tiếp, dừng và khởi chạy lại bằng launcher.
