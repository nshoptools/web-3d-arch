# Kiểm checker và provider scene trên main

43 nhóm Node, typecheck và năm sản phẩm mỗi Chromium/Firefox/WebKit đã đạt với
nguồn SVG hai màu có lỗ và bộ nhân thật. Các Worker validator có ca hợp lệ,
không hợp lệ và hủy. [verification.json](verification.json) giữ kết quả, hash
binary và danh sách file đã tích hợp. Review checker độc lập đang thực hiện.

Kết quả scene được ràng buộc với mesh đang thấy, head, nguồn, vật liệu, epoch
và các cổng assembly/cơ khí. Đây là kiểm thành phần, chưa là toàn ứng dụng,
slicer hoặc lắp vừa vật lý. Lần chạy trước bản sửa ASFR mới có binary riêng;
phải xác minh lại kết quả ứng dụng trên bản nhân đóng gói cuối.
