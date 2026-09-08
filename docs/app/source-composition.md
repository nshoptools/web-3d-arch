# Ghép nguồn vào ứng dụng

SourceAdapter của ứng dụng được tạo bởi src/integration/source-compositor.mjs. Catalog và đường dẫn tài nguyên được cung cấp qua sourceLibrary ở mountApplication. Mỗi bản gốc được giữ bằng byte và SHA-256; việc giữ nguồn không phụ thuộc lịch sử undo. Font, outline và ảnh dựng đầu tiên vẫn được tham chiếu sau sửa ảnh và phân vùng lại.

SVG/chữ/emoji giữ vector hoặc paint graph khi nhập. Chuyển sang RGBA là một đề xuất riêng có source context, thông số dựng, renderer, artifact hash và hash từng tài nguyên. Controller chỉ ghi xác nhận sau khi kiểm đúng người dùng/dự án/revision/candidate; sửa byte hoặc ngữ nghĩa renderer làm xác nhận không còn hợp lệ. Ảnh được chuyển tiếp sang các vùng vật liệu bằng một đề xuất khác; renderer đã được chấp nhận không đồng nghĩa đã chấp nhận hình học phân vùng.

Chính sách mặc định arch-app-raster-policy/1 đề xuất alpha threshold128: pixel alpha dưới128 bị loại, pixel còn lại trở thành opaque. Bản RGBA trước xử lý luôn được giữ; cutoff và thay đổi đo được nằm trong đề xuất để người dùng chấp nhận hoặc hủy. Không mặc nhiên bỏ alpha khi đọc nguồn hoặc dùng độ phân giải pixel làm độ chính xác máy in. Adapter có thể nhận processingPolicy khác; thay đổi chính sách làm mất tương thích của lần chuẩn bị cũ và cần đề xuất mới.

Mọi thao tác native dùng cùng kernel.operation, Worker, bộ nhớ và generation. Facade raster chỉ được tạo sau khởi tạo nhân, giữ đúng epoch sở hữu lease. Xác nhận hoặc giải phóng lease cũ không khởi động Worker thay thế. WebKit thiếu canvas2D trong Worker dùng cổng renderer riêng cho nguồn chữ màu; cổng chỉ nhận đúng request hiện hành và được đóng khi Worker bị thay.

Kiểm thành phần tái chạy: tests/kernel/source-composition.test.mjs, tests/kernel/text-rpc.test.mjs và tests/raster-app/run.ps1. Chọn môi trường phiên bằng tools/development/env.ps1, đặt ARCH_WASM_MODULE tới bản nhân chính đã build, rồi chạy Node test. Phép thử compositor dùng controller descriptor/receipt validator thật với trình nhận nguồn mô phỏng; nghiệm thu lưu/lịch sử và giao diện nằm trong tests/app và tests/e2e.
