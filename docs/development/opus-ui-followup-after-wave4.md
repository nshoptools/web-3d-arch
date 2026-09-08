# Kiểm lại giao diện sau wave 4

Các mục dưới đây là yêu cầu tích hợp do Codex ghi nhận khi đọc candidate và
chạy ứng dụng thật. Chưa là kết luận review độc lập. Opus xử lý UI, Codex xử lý
hợp đồng/controller. Không đổi mã nhân để làm khớp mock.

## Opus: ràng buộc nháp và phản hồi bất đồng bộ với đúng nguồn

`source-canvas-state.tsx` ở candidate wave 4 có `keepRejected()` lấy revision
từ snapshot mới nhất sau khi `editSource()` bị từ chối. Cần kiểm trường hợp
người dùng mở dự án khác, thay nguồn hoặc đổi tài khoản trong khi chờ kết quả.
Không để phản hồi cũ dựng lại nháp trên dự án/nguồn khác sau khi effect đã xóa
nháp. Cũng không để phản hồi thành công cũ xóa nháp mới hoặc thay `lastSent`.

Chụp identity dự án/nguồn và token của lần gửi trong phần trạng thái trình bày.
Khi phản hồi về, đối chiếu với identity/token hiện tại trước khi cập nhật nháp.
Chỉ giữ và cho gửi lại nháp khi còn cùng nguồn; không tự chuyển tọa độ sang nguồn
khác. Nếu chỉ đổi màu/chế độ trên cùng nguồn, lần gửi lại phải là thao tác rõ ràng
của người dùng và nói đúng cài đặt được áp dụng. Không tự gửi lại.

Tiêu chí kiểm: promise `editSource` có điều khiển; đổi project, source, identity
và tạo nháp mới trong lúc chờ; cho promise cũ thành công hoặc thất bại. Nháp mới
và nguồn mới không bị tác động; không có lần gửi tự động. Chạy lại ba engine và
giữ kiểm gửi đúng một gesture/undo một bước. Không mở rộng EditorGesture bằng
tham số thuật toán ngoài đặc tả.

## Opus: đường phục hồi khi ảnh không tải được

`srccanvas__notice` phủ toàn canvas, cao hơn `srccanvas__banner`; khi ảnh preview
lỗi, nó chặn nút chuyển nguồn. Giữ thông báo lỗi nhưng cho phép thao tác phục hồi
đã được controller công bố. Không cho bắt đầu vẽ lên một ảnh chưa hiển thị đúng.
Kiểm bằng lỗi tải ảnh có chủ đích, con trỏ thật và bàn phím, cả khung hẹp/200%.

Trong test tích hợp của Codex, ảnh WebKit từng không tải vì chính test chặn nhầm
URL blob cùng origin; đã sửa harness và luồng đầy đủ đạt. Điều này không chứng
minh UI xử lý tốt mọi lỗi tải ảnh: ca phục hồi có chủ đích vẫn cần kiểm riêng.

## Codex: các thay đổi hợp đồng phải bàn giao cùng ví dụ

- Công bố `proposal.discard` để đóng đề xuất đồng thời nhả tài nguyên giữ lại.
- Công bố revision của mô hình đang hiển thị và trạng thái cũ rõ ràng.
- Áp cửa xuất theo capability của định dạng: nguồn 2D, renderer hoặc mesh;
  không yêu cầu dựng mesh cho SVG nguồn.
- Lựa chọn bị chặn có lý do đọc được; lựa chọn hợp lệ không dùng `reason: ''`.
- Ghi rõ revision của gesture bao gồm EditorView/material, và controller từ
  chối khi revision thay đổi thay vì dùng cài đặt mới cho lần gửi cũ.

Thay hợp đồng phải cập nhật types, controller, mock, ví dụ và UI cùng lượt.
Các phần này chưa được tính hoàn tất theo báo cáo wave 4.
