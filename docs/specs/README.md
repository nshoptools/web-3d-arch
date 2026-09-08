# Đặc tả chính thức web-3d-arch

Phiên bản **1.0.1**, ngày **2026-09-08**. Đây là đường cơ sở yêu cầu của dự án.
Các yêu cầu, quyết định, danh mục và bằng chứng cần đọc đều được lưu bền trong
bộ tài liệu này cùng các fixture đi kèm trong repository.
“Chính thức” xác định nơi quản lý yêu cầu; không có nghĩa ứng dụng đã được xây,
mọi phương án đã chứng minh khả thi hoặc sản phẩm đã được chứng nhận in chính xác.
Các quyết định còn mở có mã và cổng chặn cụ thể, không bị đổi thành lời bảo đảm.

Bộ hiện hành có **55 điều khoản**, **40 chiến dịch/113 phép kiểm nghiệm thu**,
truy vết từ từng điều khoản tới quyết định thiết kế và phép kiểm tương ứng.
Trạng thái triển khai và kiểm sản phẩm được cập nhật trong [ma trận bằng chứng](../development/RELEASE-COVERAGE.md) và [biên bản bàn giao](../HANDOVER.md); phiên bản đặc tả không tự xác nhận nghiệm thu.

| Tài liệu | Nội dung quản lý |
| --- | --- |
| [Chức năng](01-chuc-nang.md) | Phạm vi, nguồn, sản phẩm, chỉnh sửa, xuất, thư viện và giới hạn |
| [Giao diện](02-giao-dien.md) | Bố cục, token, tương tác, phím tắt, trạng thái và trợ năng |
| [Kỹ thuật](03-ky-thuat.md) | Nhân, hợp đồng dữ liệu, sai số, Worker, lưu bền, xuất và dịch vụ |
| [Nghiệm thu](04-nghiem-thu.md) | Tiêu chí quan sát được, corpus, trạng thái và cổng phát hành |
| [Quyết định và truy vết](05-quyet-dinh-va-truy-vet.md) | Lý do thiết kế, điểm chưa chốt và quan hệ yêu cầu–kiểm chứng |
| [Danh mục thông số](06-danh-muc-thong-so.md) | Bảo toàn chức năng của 11 nhóm; hợp đồng trước khi sinh binding |
| [Người dùng và AI](07-nguoi-dung-va-ai.md) | Nhóm kín, quyền, cài đặt cá nhân, BYOK và chi phí từng người |
| [Mở rộng và lộ trình](08-mo-rong-va-lo-trinh.md) | Module, job/artifact, version, profile máy và cổng triển khai |
| [Ma trận yêu cầu](requirements.json) | ID, tài liệu, ca nghiệm thu và trạng thái triển khai |
| [Tổ chức kiểm thử](../../tests/README.md) | Test lưu trong Git và đầu ra trong phòng phiên |

Yêu cầu trực tiếp mới nhất của chủ dự án được ưu tiên. Trong tài liệu repo,
thứ tự áp dụng: [AGENTS.md](../../AGENTS.md) →
[hợp đồng đầu vào](../assets/INPUT-CONTRACT.md) và lock/catalog tài nguyên →
bộ đặc tả này. Không dùng dữ liệu ngoài đường cơ sở để lách quy tắc giữ nguồn
hoặc bỏ màu, dấu, clip, lỗ. Mâu thuẫn mới phải thành
quyết định có lý do và test; không tự chọn tài liệu thuận tiện hơn.

“Phải/không được” là yêu cầu bắt buộc. “Mục tiêu/ứng viên” là phương án cần qua
cổng kiểm chứng đã nêu. Mã yêu cầu không tái sử dụng sau khi bỏ. Sửa hành vi phải
cập nhật ca nghiệm thu và truy vết cùng lượt; thay snapshot/corpus phải có bằng
chứng độc lập. Không xóa một điều khiển chỉ để khớp một tổng số định trước.

Hiện trạng được đối chiếu: repo có tài nguyên đầy đủ, `src/input/font-source.mjs`
và công cụ audit; **chưa có UI, nhân mesh, slicer adapter hoặc phép in thử của ứng
dụng này**. Mọi số đo phải gắn với dữ liệu, phiên bản và phép kiểm thực tế của dự án.
Kết quả thẩm định và giới hạn cấu hình ghế nằm trong
[báo cáo đợt đặc tả](../reviews/20260907-specification/README.md).
