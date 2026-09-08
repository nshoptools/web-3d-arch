# web-3d-arch

Ứng dụng nội bộ để xử lý nguồn ảnh/vector/chữ, dựng mô hình và tạo tệp phục vụ
in 3D. Chủ dự án quản lý thành viên; mỗi người giữ cài đặt và kết nối AI riêng.
Nhân hình học chạy trong trình duyệt qua Worker/WASM.

Mã nguồn gồm giao diện, nhân xử lý, backend và công cụ đóng gói. Xem
[hướng dẫn mở website và trạng thái bàn giao](docs/HANDOVER.md)
trước khi mở cho nhóm sử dụng.

- [Đặc tả chính thức: chức năng, UI, kỹ thuật, tài khoản/AI và mở rộng](docs/specs/README.md)
- [Phân công Hub/Codex/Grok và phạm vi phát triển](docs/development/README.md)
- [Thẩm định nguồn, phản biện và quyết định hiệu đính](docs/reviews/20260907-specification/README.md)
- [Font, emoji, opentype: nguồn, danh mục và kiểm chứng](docs/assets/README.md)
- [Noto Emoji màu: đầy đủ font, SVG và hướng dựng nhiều vật liệu](docs/assets/COLOR-EMOJI.md)
- [Hợp đồng đầu vào dựng/in 3D](docs/assets/INPUT-CONTRACT.md)
- [Rà soát đầy đủ và những điểm đã sửa](docs/assets/READINESS-AUDIT.md)
- [Ba phòng review Grok / Opus / Codex](tmp/reviews/README.md)
- [Cấu hình bắt buộc và quy tắc nâng cấp các ghế review](docs/reviews/SEAT-CONFIG.md)
- [Khởi chạy Grok trên Windows, giữ dữ liệu tạm trong repo](docs/reviews/GROK-WINDOWS-ISOLATION.md)
- [Giấy phép dự án và thành phần bên thứ ba](LICENSE)

Đọc [AGENTS.md](AGENTS.md) trước khi phát triển. Mọi đầu ra phải nằm trong repo,
kể cả cache, công cụ, tệp tạm và review. Opus đã ngừng theo chỉ đạo của chủ dự án.

