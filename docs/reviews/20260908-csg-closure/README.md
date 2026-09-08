# Phản biện và nghiệm thu tích hợp CSG — 08-09-2026

225 tệp đã được tích hợp vào mã dự án sau khi đối chiếu toàn bộ hash trước/sau, không có xung đột. TypeScript và năm phép kiểm tập trung đạt. Hồ sơ này chứng minh phạm vi đã kiểm dưới đây, không thay quyết định nghiệm thu toàn bộ v1.

## Bằng chứng được giữ cùng tài liệu

[Danh mục SHA-256](manifest.json) kiểm [gói bằng chứng](evidence.zip), gồm 76 tệp. Gói chứa báo cáo độc lập, cấu hình thực tế, danh mục nguồn được phản biện, biên bản tích hợp, log, kết quả đọc lại STL và ảnh chụp giao diện. Không cần giữ phòng làm việc để đọc hoặc kiểm các bằng chứng này. Các đường dẫn tuyệt đối trong biên bản là thông tin lịch sử, không là liên kết phụ thuộc để sử dụng tài liệu.

Grok 4.6, effort xhigh được xác minh bằng metadata runtime. Ghế đọc nguồn độc lập trước khi nhận kết luận của người triển khai; không chạy test và không đánh giá backend. Lượt kết thúc trả mã giới hạn số lượt sau khi công cụ đã ghi báo cáo; báo cáo được giữ nguyên trong gói, không suy mã đó thành phép kiểm đạt. [Bản đọc báo cáo](review.md) giữ kết luận và giới hạn đã nêu.

## Kết quả thực thi của người tích hợp

Bản sản xuất bật Printing, tắt TestFixtures; cùng Worker/WASM, controller, UI, IndexedDB và HTTP/SQLite thực tế. Danh tính thử nghiệm cục bộ, không có gọi AI trả phí.

- Trừ STL: hai xác nhận, một commit, thể tích giảm 0,384002029 mm³ so với oracle 0,384 mm³; xuất STL, lưu/mở lại, dựng lại, undo/redo và xuất lại đạt.
- Hợp OBJ với đích/vật liệu tường minh: thể tích tăng 0,063999922 mm³ so với oracle 0,064 mm³; lưu và dựng lại đạt.
- Thêm STL rời: tăng đúng một part và 1 mm³; toàn bộ đỉnh/mặt của mô hình gốc giữ nguyên; không tự tạo đích giả. Thiếu lựa chọn vật liệu bị từ chối.
- Hủy ở cả hai bước xác nhận: không commit ngầm; xác nhận cũ bị từ chối; mô hình hợp lệ vẫn còn.
- Nhân thêm rời: 21 ca WASM đạt, gồm cả năm loại sản phẩm, transform và các từ chối có kiểu. Đây là phạm vi nhân, không gán thành 21 luồng UI.
- Nguồn 😀 COLRv1: một ca Chromium Worker đạt trên cùng cặp sản xuất; 13 part qua oracle, giữ byte font, selection và paint graph 60 phép/1 gradient. Không gán kết quả một emoji thành toàn bộ thư viện.

Bốn lỗi tìm được qua UI đã sửa rồi kiểm lại: chốt hình học từ chối bảo thủ quá mức; nhầm định danh nguồn hình học với định danh vật liệu khi xuất; nhận sai khác danh sách tài nguyên giữ lại thành thay đổi dự án khi dựng lại; giới hạn bốn tải xuống trong 30 giây làm việc xuất liên tiếp thất bại. Giới hạn mới giữ tối đa 32 URL và tổng 256 MiB, vẫn có hủy/thu hồi và không giải phóng URL trước hạn.

## Phân xử ý kiến độc lập

| Ý kiến | Đánh giá theo bằng chứng và đặc tả |
| --- | --- |
| F1: dropdown không nhớ đơn vị/đích/vật liệu sau mở dự án | Chấp nhận là hạn chế trải nghiệm mức thấp. Recipe và danh mục đích gốc vẫn được giữ; các ca lưu/mở lại/dựng lại đã đạt. Áp dụng mới cần chọn và xác nhận lại; không ngăn dựng/xuất feature đã lưu. |
| F2: OBJ qua UI được giản lược về một vật liệu | Chấp nhận giới hạn capability: đề nghị xác nhận ghi rõ toàn bộ khối nhập dùng vật liệu nào. GEO-04 cho phép giản lược tường minh. Nhân có kiểm nhiều vật liệu, UI chưa công bố ánh xạ riêng từng vật liệu OBJ. |
| F3: chưa có tự chọn khối chạm nhiều nhất | Giữ là phần chưa hoàn tất của GEO-04, không đánh đồng việc chọn đích tường minh đã đạt với chế độ tự chọn. Khi chưa có bound thể tích/diện tích được chứng minh, không suy đích từ nhiễu số. |
| F4: guard facet/tunnel bảo thủ, set khác multiset | Giới hạn remesh được giữ rõ. Nhánh thêm rời kiểm multiset từng part; những nhánh khác vẫn qua kiểm topology, collision và cơ khí. Chưa có phản ví dụ làm nhận mesh sai; không suy từ đó thành bảo đảm hình học mọi đầu vào hoặc fit vật lý. |
| F5: AABB tiếp xúc và giao dương | Đồng ý cách phân biệt interior; ca chạm mặt/cạnh/điểm và dịch giao dương có kiểm riêng. Chỉ tái sử dụng kiểm cặp gốc khi facet/material/multiplicity khớp; part mới vẫn bị kiểm giao. Không tuyên bố bound sai số toàn cục. |

Các sửa JS về định danh vật liệu, retention, tải xuống và nguồn màu được thêm sau bản nguồn Grok đọc; có kiểm hồi quy và thực thi tích hợp của người viết, chưa có phản biện độc lập riêng cho các delta này. Không trình bày hồ sơ này như phê duyệt phát hành của Grok.
