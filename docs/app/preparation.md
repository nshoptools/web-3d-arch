# Chuẩn bị dữ liệu và kiểm tra mô hình

`JobOperations.prepareCurrent` chạy việc chuẩn bị nguồn xuất và cấu hình in như
một tác vụ có tiến độ, có hủy. Nó chụp trạng thái/byte đầu vào, kiểm người dùng,
dự án và bản sửa trước khi công bố. Dữ liệu dẫn xuất không tạo giao dịch lịch sử.
Danh sách máy in được đọc lại trước khi xử lý nguồn; nguồn lỗi không giữ lại
danh sách máy in của cài đặt cũ.

`scheduleApplicationPreparation` gộp các thay đổi trạng thái/cài đặt bất biến,
đợi tác vụ và đề xuất đang xử lý kết thúc. Thông báo tiến độ, lựa chọn trong
viewport và render UI không tự khởi chạy thêm việc chuẩn bị. Các lời gọi native
vẫn đi qua cùng `kernel.operation` và một EngineClient/Module.

Sau dựng hình, controller đưa đúng lease vào viewport rồi gọi
`preparation.qualifyModel` bằng cùng ticket/tín hiệu hủy. Không bọc lại lease,
không sửa `ModelLease.stats`, không đánh đồng native dựng thành công với kết
luận của bộ kiểm mesh. Snapshot UI lấy verdict hiện hành từ provider kiểm tra;
mô hình cũ hoặc chứng cứ không còn khớp hiển thị `unverified`. Lỗi kiểm tra vẫn
giữ mô hình thực tế để quan sát; quyền xuất phụ thuộc chứng cứ và các điều kiện
của exporter.

`product-services.mjs` nối nguồn, năm sản phẩm, xác nhận thay đổi hình học,
kiểm tra mesh, cấu hình in, SVG nguồn, PNG viewport và các serializer. Factory
kiểm mesh/SVG nguồn phải do điểm khởi động đã biên dịch cung cấp. Cấu hình dự án,
URL và cài đặt người dùng không chọn mã thực thi hay thay thế provider kiểm tra.
Lịch lớp được chụp từ lần dựng thật. Bảng vật liệu giữ ID đầy đủ và ordinal
riêng cho bản sửa, không lấy màu hoặc cắt ngắn ID hình học làm danh tính.

Kiểm chứng controller hiện có: bảy ca trong
[preparation.node.test.mjs](../../tests/app/preparation.node.test.mjs) kiểm
cùng lease/ticket, hủy, kết quả muộn, đổi tài khoản, gộp tác vụ, lỗi nguồn và
danh sách máy in. Các ca này dùng adapter thử có nhãn rõ; chưa thay thế nghiệm
thu ứng dụng hoàn chỉnh với nhân hình học và bộ kiểm mesh thực.
