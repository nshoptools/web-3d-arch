# Phân xử hợp đồng giao diện xuất UI-C10

Hợp đồng vẫn là 0.3, bổ sung tương thích. Đây là quyết định tích hợp của Codex
cho giao diện do Opus triển khai; không phải kết luận review độc lập.

| Điểm cần rõ | Quyết định |
| --- | --- |
| Vai trò field inspection | UI dựng mọi field theo kind/label. Không cần thêm role; không suy ra sự đồng ý từ verdict hoặc nhãn nút. Controller công bố boolean inspection=false ban đầu. |
| Tải hồ sơ | export.receipt gọi bộ tải xuống trong controller. UI không cần URL/blob, không khẳng định hệ điều hành đã ghi tệp. |
| Revision khi gõ | Chụp revision khi bắt đầu sửa một bản nháp. Giữ nguyên qua các lần gõ sau, blur và Enter. Chỉ nhận nền mới sau khi bản nháp được đồng bộ/xử lý rõ ràng; không tự làm mới hàng rào từ một snapshot chen ngang. |
| Danh sách tùy chọn | exportReceipts vắng mặt nghĩa là chưa công bố tính năng; mảng rỗng nghĩa là phiên có tính năng nhưng chưa có hồ sơ. |
| Commit cấu hình | Controller tạo một bước lịch sử khi giá trị đổi; nhập lại cùng giá trị không tạo bước mới. UI chỉ đọc revision từ snapshot, không tự cộng hoặc sửa visibleModelRevision. |
| Lỗi cấu hình | Controller có các câu cố định ở export-messages.mjs. UI hiển thị diagnostic.message cho mã chưa biết; không chuyển lỗi provider tùy ý thành thông báo người dùng. |
| Xác nhận export.configure (Q7) | Không thêm confirmed vào lệnh cấu hình. Khi cần cắt lịch sử, controller trả đề xuất riêng có ID, retry là proposal.accept với confirmed=true; UI gửi đúng retry. Không ghi nhớ sự đồng ý chỉ theo cặp field/giá trị và không lặp lại lệnh cấu hình như một xác nhận. |
| Nhóm confirmEffect (Q8) | export.configure thuộc thay đổi có lịch sử/hoàn tác. Chỉ controller quyết định có tạo bước mới sau validation; giá trị không đổi là no-op. |
| formatId của hồ sơ | Cùng không gian ID với ExportOption.id. Có thể dùng nhãn đường xuất nếu còn tồn tại, luôn giữ mã gốc làm fallback. Danh sách đường xuất có thể đổi sau khi hồ sơ được tạo. |

Hồ sơ giữ giới hạn phiên theo [hợp đồng cấu hình xuất](export-controls.md).
Các kiểm controller dùng bộ tải xuống/CAS giả lập có nhãn rõ; nghiệm thu ứng dụng
phải chạy tiếp với exporter, Worker, lưu trữ và giao diện thật.
