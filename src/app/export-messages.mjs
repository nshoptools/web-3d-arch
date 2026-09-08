/** Public fixed messages only; never forward an arbitrary exporter/provider error body. */
export const EXPORT_MESSAGES=Object.freeze({
 EXPORT_CONFIGURATION_UNSUPPORTED:'Đường xuất này chưa hỗ trợ lưu cấu hình.',
 EXPORT_CONFIGURATION_VERSION:'Phiên bản cấu hình xuất chưa được hỗ trợ.',
 EXPORT_FIELD_UNKNOWN:'Trường cấu hình xuất không tồn tại.',
 EXPORT_FIELD_LOCKED:'Trường này không được sửa trong chế độ xuất hiện hành.',
 EXPORT_FIELD_BOOLEAN:'Hãy chọn bật hoặc tắt cho trường này.',
 EXPORT_FIELD_TEXT:'Hãy nhập giá trị bằng văn bản.',
 EXPORT_FIELD_RANGE:'Giá trị nằm ngoài giới hạn được công bố.',
 EXPORT_FIELD_CHOICE:'Lựa chọn không có trong danh sách được hỗ trợ.',
 EXPORT_FILENAME:'Tên tệp rỗng hoặc chứa ký tự/tên hệ thống không hợp lệ.',
 EXPORT_FILENAME_EXTENSION:'Tên tệp cần có đúng phần mở rộng của đường xuất.',
 EXPORT_FILENAME_BUDGET:'Tên tệp vượt giới hạn byte của định dạng; hãy đặt tên ngắn hơn.',
 EXPORT_PATTERN_DOWN_REST:'Hướng hoa văn xuống yêu cầu đặt đáy trên bàn.',
 EXPORT_SECTION_RANGE:'Cao độ kết thúc phải lớn hơn cao độ bắt đầu.',
 EXPORT_SECTION_BUDGET:'Dãy vượt giới hạn 256 mặt cắt; hãy tăng bước hoặc giảm khoảng cao độ.',
 EXPORT_RECEIPT_NOT_FOUND:'Hồ sơ không còn trong phiên hiện hành hoặc không có metadata để tải.',
 EXPORT_RECEIPT_IDENTITY:'Hồ sơ không khớp byte hoặc bản sửa dự án; tệp chưa được tải.',
 EXPORT_RECEIPT_OPTIONS:'Hồ sơ không khớp lựa chọn xuất; tệp chưa được tải.',
 PNG_FRAME_STALE:'Khung nhìn đã đổi trong lúc chụp; hãy xuất lại ảnh hiện hành.',
 PNG_CAPTURE_FAILED:'Không chụp được ảnh từ khung 3D hiện hành.'
});
