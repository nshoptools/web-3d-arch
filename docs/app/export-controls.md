# Cấu hình và hồ sơ xuất qua AppBridge

Bổ sung tương thích cho hợp đồng 0.3. Các thành viên mới là tùy chọn; UI cũ
không tự bật đường xuất thiếu năng lực. Căn cứ EXP-01, EXP-02 và DAT-01.

## Trường cấu hình

Mỗi ExportOption có thể công bố configuration gồm projectRevision và fields.
ExportFieldView định nghĩa id, nhãn, kiểu text/number/boolean/select, giá trị
đang lưu, đơn vị, giới hạn, choices và trạng thái cho phép. UI dùng đúng danh
sách công bố; không tự thêm hướng, định dạng hoặc giới hạn.

UI gửi export.configure với id đường xuất, projectRevision đã chụp, id field
và chuỗi nguyên bản/boolean. Controller kiểm quyền, revision và trường; parse
số, kiểm phạm vi và lưu cấu hình xuất trong dự án. Không dùng parseFloat để
bỏ phần đuôi, đổi đơn vị hoặc làm tròn ở UI. Lỗi giữ nguyên bản nhập để sửa.
Lệnh không còn thuộc input/tài khoản/dự án hiện hành không được ghi lỗi hoặc
mở xác nhận vào ngữ cảnh mới.

Thay cờ xuất là commit dự án; mô hình có thể trở thành cũ. Controller có thể
dựng lại để gắn cấu hình/head mới; UI luôn theo visibleModelRevision và trạng
thái job được công bố. UI không sửa snapshot để giả rằng mô hình khớp bản sửa.

Các nhóm được controller cung cấp: tên tệp, ý định xuất kiểm tra, hướng chế
tạo/lật hoa văn xuống và đặt đáy; SVG mặt cắt có Z đơn/phạm vi, bước, mm/in,
trước/sau và chính sách màu. Những giá trị Z nhập là mm ở hệ chế tạo, kể cả
khi đơn vị SVG xuất là inch. 3MF chỉ hiển thị hướng mà adapter thật hỗ trợ.

Chưa chọn “xuất kiểm tra” thì fail/unverified không tự được thông qua. Nhãn
“Xuất để kiểm tra” không phải sự đồng ý thay người dùng. Cờ này không bỏ qua
quyền truy cập, assembly, mapping sai, revision sai hoặc serializer không hợp lệ.

## Hồ sơ kết quả

AppSnapshot.exportReceipts là danh sách hồ sơ của phiên truy cập/dự án hiện
hành. Mỗi hồ sơ công bố tên và byte thực, SHA-256 tệp, format, project revision,
thời điểm, verdict, cờ inspection và cảnh báo. Chỉ hiện hồ sơ do controller
trả; việc bấm nút xuất chưa phải bằng chứng đã có tệp hay hệ điều hành đã lưu.

Lệnh export.receipt với id tải JSON metadata qua controller khi
metadataAvailable=true. JSON chứa nguồn, phép biến đổi, giới hạn và kết quả
kiểm thực được exporter công bố. Hồ sơ phiên không tự tồn tại sau đóng/đổi
dự án hoặc đăng xuất; UI có câu hướng dẫn tải hồ sơ để lưu cùng tệp. Bảng kê
đã có trong ZIP/3MF được giữ nguyên. Không dùng hồ sơ phiên làm chứng cứ duy
nhất cho việc lắp vừa hay in vật lý.

## Ranh giới lưu và xác nhận

Controller lưu dữ liệu tùy chọn `app.exportOptions` phiên bản 1. Tài liệu chưa
có trường này vẫn mở được; mặc định inspection=false. Trường số dùng lưới
0,000001 mm, parser thập phân chính xác của domain. Cấu hình sai bị từ chối nguyên
giao dịch. Chọn lật hoa văn xuống bao gồm đặt đáy trên bàn, ghi rõ trong lựa chọn;
SVG mặt cắt và 3MF giữ hệ chế tạo. Không dùng góc camera làm hướng chế tạo.

Phiên giữ tối đa 50 hồ sơ hoặc 16 MiB JSON, loại hồ sơ cũ nhất khi vượt giới hạn.
Đóng/mở lại dự án cũng xóa danh sách phiên. Một đề nghị hiệu chỉnh hình học dùng
`prepared-proposal`: chuẩn bị chưa có tệp STL; xác nhận đúng hash/ngữ cảnh mới
gọi bộ mã hóa rồi tạo hồ sơ. Hủy hoặc đổi dự án sẽ giải phóng đề nghị đó.

## Nghiệm thu UI-C10

- Đường không có configuration giữ hành vi cũ; cấu hình vẫn đọc được khi
  export bị chặn. Trường bị khóa hiển thị lý do.
- Số thập phân, chữ Việt trong tên và ký tự không hợp lệ đi nguyên vẹn tới
  controller; UI không âm thầm sửa tên trước khi nhận kết quả thực.
- Dùng được bằng bàn phím, 320px và zoom200%; nhãn/lỗi gắn đúng field, không
  mất focus do snapshot đổi không liên quan.
- Thay field hoặc đóng/đổi tài khoản/dự án khi lệnh pending không để kết quả
  muộn, rejection hay confirmation cũ công bố sai nơi. Đối chứng hiện hành
  vẫn hiển thị lỗi/xác nhận một lần.
- Hồ sơ phân biệt normal/inspection và pass/fail/unverified/unsupported;
  cảnh báo giữ nguyên, không đổi thành nhãn “sẵn sàng in”. Tải metadata phải
  dùng đúng receipt id, không tải nhầm hồ sơ sau khi danh sách đổi.
