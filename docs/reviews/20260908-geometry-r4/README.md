# Phản biện nhân hình học, vòng 4

Ngày 2026-09-08. Ghế độc lập Codex đã khóa kết luận trước khi đọc ý kiến người
triển khai hoặc ghế khác. **Không có lỗi được chứng minh trong phạm vi đã xét.**
Codex điều phối chấp nhận kết luận có giới hạn này; chưa chấp nhận phát hành.

Phạm vi: chuẩn bị và xác nhận chuyển tọa độ xuất sang float32, điều kiện topo,
đọc hợp các vùng vật liệu ở binary64, quyền của snapshot và vòng đời lease.
652 tệp đầu vào và toàn bộ 80 mục bằng chứng đã được kiểm lại hash khi lưu hồ sơ.

Bằng chứng chính: 43 kiểm native trên executable được cung cấp; Worker thật ở
Chromium, Firefox và WebKit; 24.000 cặp tam giác đối chiếu oracle phân số độc lập
(seed 20260908), không sai khác; 14 bề mặt đối kháng; phép kiểm vật liệu, xác nhận,
hủy và đầu ra thường không bị đổi. Reviewer không dựng lại toàn bộ nhân native.

Sai số chuyển tọa độ được xét tương đối với mesh hợp native đã chụp. Hồ sơ này
không chứng nhận sai số toàn chuỗi nguồn/boolean, biến dạng liên tục không va
chạm, lắp vừa vật lý, slicer hoặc toàn ứng dụng. Trường hợp chưa chứng minh
được quan hệ giữa các thành phần vẫn bị từ chối rõ ràng.

Ghế thực tế: gpt-6-astra/max, CLI 0.153.4. Đã kiểm metadata phiên và cấu hình
Fast off của CLI; không có biên nhận service tier từ máy chủ. [Phân xử](adjudication.json)
và [kết luận chi tiết](archive/reports/initial-review.md) ghi phạm vi chấp nhận.

[Danh mục đầu vào](source-manifest.json), [danh mục bằng chứng](evidence-manifest.json)
và [kiểm toàn vẹn lưu trữ](archive-integrity.json) giữ hash, dung lượng và các mục
đã lưu. Thư mục archive giữ báo cáo, dữ liệu đo và mã tái hiện đã chọn. Các đường
dẫn phòng chạy trong báo cáo gốc là định danh lịch sử; bản executable, WASM và
bản chụp toàn mã nguồn không nằm trong hồ sơ rút gọn này. Dựng lại mã hiện hành
phải tạo lần kiểm mới với hash mới, không nhận là tái tạo đúng binary cũ.
