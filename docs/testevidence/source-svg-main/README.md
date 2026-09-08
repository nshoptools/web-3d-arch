# Kiểm SVG nguồn trên main

26 nhóm Node, typecheck, năm họ nguồn qua Worker thật trên ba engine và 163 kiểm
XML/affine/winding/hash bằng Python đã đạt. [Kết quả](verification.json),
[đọc lại](readback.json), [đầu vào trước](source-before.json) và
[đối chiếu sau](source-after.json) ghi lần kiểm và hash.

Bản sao test đầu tiên thiếu khai báo type-only; bộ chuẩn bị đã sửa rồi chạy
đầy đủ lần r2. Không thay assertion hay dữ liệu kỳ vọng. Đây là provider SVG
nguồn trước dựng mesh, không phải toàn giao diện/sản phẩm. Lỗi nhận lại bảng
vật liệu sau chỉnh raster vẫn là việc cần sửa ở adapter phía trước.
