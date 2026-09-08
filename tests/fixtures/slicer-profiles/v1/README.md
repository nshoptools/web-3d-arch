# Mẫu cấu hình slicer v1

Hai tệp trong thư mục này là fixture bền vững, dùng nội bộ để kiểm parser và
adapter. [Manifest](manifest.json) ghi hash, byte/key count, version và quyền.
Byte của các tệp không đổi; metadata được chỉnh ngày 2026-09-08 để đọc độc lập.
Không thực thi JavaScript hoặc G-code của fixture.

Bambu có 582 key, version 02.08.02.60, máy P1S 0.4; U1 có 549 key, version
2.2.1 và bốn nozzle 0.4. Đây là object cấu hình, không phải gói 3MF hoặc bằng
chứng in. Bambu giữ print_settings_id mang tên X1C; việc kết hợp đó cần kiểm
trên slicer đích, không sửa nhãn rồi mặc nhiên nhận hợp lệ.

Các mảng dài 4/8/16 phải phân loại theo từng key trước khi mở rộng số filament.
Thêm fixture sạch, binary/version, readback và slice preview trước khi nhận
adapter supported. [Fixture 3MF và bàn in](../../printing-reference/v1/README.md)
cung cấp dữ liệu kiểm bổ sung; gói U1 có mapping lỗi chỉ dành cho ca từ chối.
Quyền phân phối settings/G-code chưa xác minh: fixture không vào bundle sản phẩm.
