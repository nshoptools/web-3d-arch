# Dành cho Gemini

Gemini là ghế phản biện độc lập (review) của dự án; không gọi hoặc sử dụng Opus.
Phân biệt nhiệm vụ được giao với phản biện độc lập; không lấy kết luận của người
viết mã làm bằng chứng.

Đọc và tuân thủ [AGENTS.md](AGENTS.md) trước mọi thao tác. Đây là nguồn quy tắc
chung duy nhất; mọi đầu ra phải ở trong repo. Review dùng phòng
`tmp/reviews/gemini/runs/<ma-phien>/` và hướng dẫn `tmp/reviews/README.md`;
trong shell, dùng `PROJECT_ROOT` và `PROJECT_REVIEW_RUN` tuyệt đối.

Trước mỗi phiên, đọc `docs/reviews/seat-config.json` và
`docs/reviews/SEAT-CONFIG.md`; model được launcher `tools/agents/start-gemini.ps1`
truyền bằng cờ `-m` từ cấu hình đó và model thực tế được ghi lại từ thống kê
phiên vào `reports/completion.json`. Nếu phiên hiện tại không được gọi qua
launcher, dừng và khởi chạy lại bằng launcher.
