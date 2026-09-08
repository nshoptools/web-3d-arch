# Hồ sơ máy in cá nhân — hợp đồng UI-C11

Opus thiết kế và dựng giao diện; Codex phụ trách đọc/validation tệp, lưu cá nhân,
quyền phiên, confirmation, băm, xuất và tích hợp. Hợp đồng bổ sung tương thích
AppBridge 0.3 ở src/contracts/app-bridge.ts.

## Hiển thị

AppSnapshot.printerProfiles là thư viện hồ sơ riêng của người đang đăng nhập.
Không có trường này thì ghi tính năng chưa khả dụng, không tạo hồ sơ mẫu.
settingsRevision là revision cài đặt, độc lập revision dự án. Mỗi item có key
opaque cho đúng bản ghi, ID và nhãn, máy/slicer/phiên bản, đường kính nozzle,
khe → đầu in, loại/màu filament, hash và kết quả validation. Hồ sơ lỗi vẫn hiển
thị để người dùng xử lý. Nhãn qualified luôn false ở mốc này; validation tệp
không chứng minh đã slice hay in vừa. Chọn máy vẫn dùng printer.select hiện có.

## Nhập, giữ tệp và xác nhận

Nút nhập chọn một tệp JSON, truyền nguyên File tới bridge.importFile(file,
'printer-profile'). UI không parse, băm, sửa hay đoán schema. Codex nhận hồ sơ
chuẩn hóa dạng {payload,sha256} tương ứng bộ kiểm profile của dự án; tệp xuất từ
chức năng này có thể nhập lại. Không coi JSON slicer bất kỳ là đã chuẩn hóa.

Core kiểm nội dung và chuẩn bị thay đổi; trả CommandResult.confirmation với
thông tin cụ thể và retry printer.profile-accept/id/confirmed:true. UI hiển thị
ConfirmDialog hiện có, không tự xác nhận hoặc tạo lại retry. Hồ sơ có cùng ID
chỉ bị thay sau xác nhận cho đúng nội dung/revision đã chụp. Hủy hộp thoại không
lưu hồ sơ. Mọi bản ghi nhập vẫn chưa được kiểm bằng slicer/bản in.

Core giữ nguyên byte tệp hồ sơ người dùng nhập trong cài đặt cá nhân có giới
hạn. Đây là tệp hồ sơ đã nhập; hash nguồn ghi bên trong không tự chứng minh có
byte gốc của nhà cung cấp. UI gọi đúng tên để không gây nhầm.

## Thao tác từng hàng

- Tải hồ sơ: printer.profile-export với key, settingsRevision, original:false.
- Tải tệp đã nhập: cùng lệnh, original:true; chỉ bật khi importedFileAvailable.
- Xóa bản ghi: printer.profile-delete với key, settingsRevision, confirmed:false.
  Core yêu cầu xác nhận cụ thể; UI gửi nguyên retry nếu người dùng đồng ý.

Tải tệp không khẳng định hệ điều hành đã lưu. Xóa/thay cài đặt không nằm trong
undo dự án. Chọn hồ sơ không tự đổi kích thước lớp, khe vật liệu của dự án hay
nhãn đã kiểm. Hồ sơ bị xóa/thay làm kết quả chuẩn bị in cần kiểm lại.

## Nghiệm thu giao diện

Thư viện truy cập từ phần máy in trong cài đặt cá nhân. Render thông tin core
công bố, thông báo lỗi dễ hiểu, trạng thái trống/đang chờ/không khả dụng và các
nút đúng capability. Có thể dùng khi chưa mở dự án. Lỗi của một hồ sơ không làm
mất các bản ghi khác. Nhãn dài và hash wrap ở 320px, zoom200%, bàn phím và focus
quay về đúng điểm sau dialog. Phản hồi muộn, đóng dialog, account A→B→A và thay
revision trong lúc chờ không được công bố dữ liệu riêng cũ hoặc tự xác nhận.

Đây là hồ sơ nghiệp vụ và UI, không phụ thuộc tài liệu hay dữ liệu tạm.

Các điểm về chỉ số khe/đầu in, revision và vòng đời xác nhận đã chốt trong [phân xử UI-C11](printer-profile-ui-decisions.md).
