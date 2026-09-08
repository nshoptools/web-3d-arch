# Xem nguồn từ đường bao đã kiểm

SVG opaque đi qua parser, clip và bộ giải quyết thứ tự vẽ của nhân. Worker lấy
đường bao canonical để sinh preview; không đưa markup gốc vào DOM, object URL
hay renderer SVG của trình duyệt. Tệp nguồn và hash vẫn được lưu riêng.

`EngineClient.previewSVG` dùng generation riêng, giữ mọi lease đang hiển thị,
và hủy snapshot tạm sau khi lấy kết quả. Preview có kích thước mm của vùng hình,
pixel pitch, frame Y hướng xuống, bảng màu và provenance. Nó chưa là phép chuyển
nguồn được chấp nhận; muốn sửa raster phải xác nhận bản dẫn xuất theo hash/revision.

Bộ lấy mẫu scanline dùng winding nonzero, khoảng nửa mở và chuẩn hóa hướng cạnh.
Hai mẫu mỗi trục cung cấp coverage và không dùng alpha-over giữa hai vùng chung
biên. Giới hạn 1.280 pixel mỗi trục và 32 triệu lần xử lý cạnh mỗi preview.
Chi tiết nhỏ hơn pixel có thể biến mất; không cấp chứng chỉ giữ topology hay
ngân sách sai số hình học tổng quát cho bản raster này.

PNG dùng RGBA8, sRGB, không interlace, filter 0. Các chunk và checksum theo
[PNG Third Edition](https://www.w3.org/TR/png-3/); luồng nén do
[CompressionStream deflate/zlib](https://compression.spec.whatwg.org/#supported-formats)
của platform cung cấp. Không cần Canvas trong Worker; WebKit Windows đã cho
kết quả không có Canvas 2D trong phép kiểm thực tế.

Kiểm tái lập: thiết lập project-env và ARCH_WASM_MODULE, chạy
`node --test --test-concurrency=1 tests/kernel/browser.test.mjs tests/kernel/png-encode.test.mjs`.
Kiểm lỗ/màu/seam/lease/cancel và giải mã PNG bằng browser thật; test Node giải
nén bằng zlib, kiểm CRC, dimensions và mọi byte RGBA gồm RGB của pixel trong suốt.
Các phép này chỉ nghiệm thu component, không thay thử trải nghiệm toàn ứng dụng.
