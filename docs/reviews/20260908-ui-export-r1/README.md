# Phản biện giao diện xuất, vòng 1

Ngày 2026-09-08. Ghế Codex độc lập đã kiểm React/AppShell thật với bridge mô phỏng
có điều khiển, khóa kết luận trước khi đọc kết luận khác. Codex điều phối chấp
nhận tám phát hiện dựa trên ca tái hiện và mã nguồn tương ứng. **Cả tám phát hiện đã có bản sửa và đạt kiểm lại trong phạm vi UI.**

| ID | Mức | Vấn đề | Xử lý |
| --- | --- | --- | --- |
| UI-R1-01 | P1 | Bản nháp chưa gửi đi theo khi đổi dự án/tài khoản | Codex: ràng buộc ngữ cảnh và khóa trạng thái trường |
| UI-R1-02 | P2 | Phản hồi cũ còn mở xác nhận hoặc ghi lỗi chung | Codex: kiểm quyền sở hữu trước mọi phản hồi UI |
| UI-R1-03 | P2 | Xác nhận đang mở sống qua đổi ngữ cảnh rồi quay lại | Codex: epoch của xác nhận, kiểm cả lúc bấm |
| UI-R1-04 | P2 | Enter ở số đã trở lại giá trị công bố giữ revision cũ | Codex: hủy bản nháp nhất quán |
| UI-R1-05 | P2 | Một Escape vừa hủy bản nháp vừa đóng ngăn di động | UI đã tích hợp: một tầng mỗi Escape, trả focus hữu ích |
| UI-R1-06 | P2 | Không dùng Tab để tới lý do của checkbox/select bị khóa | UI đã tích hợp: lý do có đường truy cập bàn phím |
| UI-R1-07 | P2 | Đơn vị/giới hạn số không gắn với mô tả trợ năng | UI đã tích hợp: mô tả từ đúng dữ liệu đã công bố |
| UI-R1-08 | P2 | Nhãn select bị ép thành chữ dọc ở panel desktop hẹp | UI đã tích hợp: bố cục theo khoảng trống thực của panel |

Tác động được giữ đúng mức bằng chứng: đây là lỗi UI; chưa chứng minh core đã
thực thi một proposal cũ hoặc dữ liệu đã gửi sang tài khoản khác. Yêu cầu trợ
năng căn cứ UI-04/05/06 của dự án. Không nhận việc kiểm DOM thay cho phiên dùng
screen reader, hoặc bridge mô phỏng thay cho toàn ứng dụng/native.

Ghế thực tế: gpt-6-astra/max, CLI 0.153.4, Fast off kiểm ở phía client; service
tier phía máy chủ chưa có metadata. [Phát hiện đầy đủ](archive/reports/initial-findings.json)
và [phân xử](adjudication.json) giữ trigger, bằng chứng và giới hạn riêng.

95 tệp đầu vào đã được kiểm hash. Trong 304 mục danh mục bằng chứng, 303 khớp.
Riêng reports/response.md bị launcher ghi câu trả lời cuối sau khi reviewer khóa
danh mục; tệp này không được tính khớp. Kết luận ban đầu, dấu khóa và các bằng
chứng của tám phát hiện vẫn khớp. Chi tiết ở [kiểm lưu trữ](archive-integrity.json).
Các đường dẫn phòng chạy trong bản gốc là định danh lịch sử; hồ sơ bền đã giữ
các báo cáo, ca tái hiện và bằng chứng được liệt kê trong danh mục lưu trữ.

Ca tái hiện được đưa vào [bộ kiểm consent](../../../tests/ui/export-consent/README.md)
để kiểm mã hiện hành. Khi sửa oracle phải giữ thất bại cũ và giải thích: ca L11
ban đầu đếm cả truy vấn danh mục font/emoji khi đòi không có lệnh; bản kiểm lại
chỉ đếm dispatch/export và kiểm không có nội dung bản nháp riêng trong mọi call.

Bản sửa Codex đã đạt 21 ca lifecycle trên mỗi Chromium/Firefox/WebKit, gồm
đổi ngữ cảnh ABA và bấm xác nhận trong cùng batch trước khi React cập nhật DOM.
10 kiểm Node, typecheck và 48 ca hồi quy mỗi ba engine cũng đạt. Bằng chứng ở
[hồ sơ kiểm lại](../../testevidence/ui-consent/verification.json); chưa là vòng
phản biện độc lập mới hoặc nghiệm thu toàn ứng dụng.


Kiểm lại cuối ngày 08-09: UI-R1-05–08 đạt trên Chromium, Firefox và WebKit; 33 ca extra và 9 ca readability, không lỗi page/console hoặc request ngoài origin. [Hồ sơ đã lưu và kiểm hash](../../testevidence/ui-handover/parent-verification.json) xác nhận source hiện hành khớp capture. Đây là kiểm triển khai React với bridge điều khiển; chưa là review độc lập mới hoặc nghiệm thu site cuối.
