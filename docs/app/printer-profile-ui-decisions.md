# Phân xử hợp đồng UI-C11

Codex ghi ngày 2026-09-08, theo bộ kiểm PrinterProfile và hợp đồng cài đặt cá nhân.
Áp dụng cùng [hợp đồng thư viện hồ sơ](printer-profile-ui.md).

| Điểm | Quyết định |
| --- | --- |
| Khe và đầu in | Với hồ sơ hợp lệ, phần tử i của slotExtruders ứng với khe i+1; giá trị là số đầu in từ 1. Không suy thêm khe từ máy đang chọn. Hồ sơ lỗi có thể thiếu dữ liệu, giữ thông báo lỗi. |
| Filament | Với hồ sơ hợp lệ, filamentTypes và filamentColors cùng thứ tự/độ dài với slotExtruders. Màu là #RRGGBB hoặc #RRGGBBFF, FF là alpha đục. Có thể trình bày theo từng khe; không tự ghép dữ liệu thiếu của bản ghi lỗi. |
| Nozzle | Phần tử i của nozzleDiametersMm là đường kính đầu in i+1. Không hiểu là các lựa chọn nozzle có thể thay nhau. |
| Revision | settingsRevision thuộc toàn bộ cài đặt cá nhân, tăng khi ghi thành công, kể cả khóa khác. Đọc key và revision của cùng snapshot sống lúc bấm; core vẫn kiểm lại đúng bản ghi/revision. |
| Key | Key opaque thuộc đúng capture cài đặt/tài khoản. Có thể đổi khi tải lại cài đặt, đổi revision/quyền hoặc reset, kể cả byte và vị trí hàng không đổi. Dùng key và settingsRevision từ cùng snapshot hiện tại lúc bấm; không suy lại key từ ID, index, hash hoặc màu. |
| Năng lực | enabled/reason của printerProfiles là cổng quản lý hồ sơ. Không thêm điều kiện project.write/printer.list. Phiên checking là đang xác định; vắng trường ở bridge cũ là chưa công bố. |
| Tải hồ sơ | Không tạo ExportReceiptView của dự án và không khẳng định hệ điều hành đã lưu. |
| Xác nhận | Gửi nguyên retry. PROFILE_PROPOSAL_EXPIRED khi đề xuất không còn; PROFILE_SETTINGS_CHANGED khi cài đặt/quyền đã thay. Core không cam kết một thời hạn tính theo phút. Không giữ native lease; chỉ một tệp/JSON có giới hạn, được dọn khi đổi cài đặt/quyền, nhập mới hoặc reset. |
| ID thiếu/trùng | ID thiếu không được nhập thành hồ sơ hợp lệ. Bản ghi lỗi có thể xóa/tải theo exact key; UI không tự đặt ID, đổi tên hay thay bản trùng. |
| Undo | Cả ba printer.profile-* đều ngoài lịch sử undo dự án. Giữ nhóm OUTSIDE_HISTORY là đúng. |

Bộ kiểm chỉ hỗ trợ các cấu hình máy/slicer/nozzle đã khai báo. Hợp lệ về cấu trúc
không tạo nhãn đã slice, đã in hoặc lắp vừa. Byte tệp hồ sơ nhập được giữ riêng;
không gọi chúng là nguồn gốc của nhà cung cấp chỉ vì hồ sơ có source.sha256.
