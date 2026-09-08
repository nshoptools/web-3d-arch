# Hợp đồng tích hợp 0.3

Ngày 2026-09-08. Định nghĩa máy đọc: `src/contracts/app-bridge.ts`.
Kế thừa 0.2; cập nhật UI, controller và mock cùng lượt trước tích hợp.

Các điểm UI đã phát hiện được chấp nhận sau khi đối chiếu API và yêu cầu:

- `sourceCanvas` công bố ảnh hiện hành, ảnh gốc của bản raster dùng để sửa,
  kích thước pixel, tỷ lệ mm và revision. `editSource` nhận một gesture hoàn
  chỉnh trong tọa độ ảnh, kèm revision dự án/nguồn. UI chỉ giữ nháp đường vẽ;
  controller xử lý pixel, xác nhận phép chuyển đổi, budget, undo và công bố.
  Ảnh gốc dùng so sánh phải được giải thích là bản raster trước sửa khi đầu vào
  gốc là vector/font; byte nguồn ban đầu vẫn được giữ riêng.
  `source.convert` chuẩn bị phép chuyển đổi được yêu cầu. Đề xuất chuyển nguồn,
  giảm chi tiết hoặc cắt lịch sử trả diff cùng `proposal.accept` chứa ID tạm;
  ID ràng buộc hash nguồn/options/kết quả và revision/head hiện tại. Consent
  hết hiệu lực khi một đầu vào đã đổi. Không thực thi đề xuất trước xác nhận.
- `EditorView` thêm chế độ vá tất cả khe và ngưỡng mm. Không có `selectedTool`
  thứ hai trong dự án. Thuật toán đổi ngưỡng sang pixel thuộc bộ xử lý editing.
- Chọn khối có danh sách `blocks` và lệnh `selection.set` cho bàn phím.
  Khe vật liệu nhận `null` để bỏ gán. Danh sách máy in do controller công bố;
  nhãn `qualified` chỉ từ bằng chứng đúng profile và phạm vi.
- Model AI công bố danh sách size/quality hợp lệ. Mọi lựa chọn được hiển thị
  trước prepare, nằm trong hash báo giá; đổi lựa chọn làm mất hiệu lực consent.
  Metadata credential và budget ba kỳ đọc từ backend. `ai.close-unknown`
  cần lý do và xác nhận; đóng theo dõi không xóa nghĩa vụ chi phí chưa biết.
- Policy có version và document hiện hành, lệnh riêng với version và xác nhận;
  không dùng khóa settings giả. Controller áp If-Match và quyền owner tại server.
- `pickMirrorDirectory` gọi ngay từ cử chỉ người dùng để giữ activation của
  File System Access API. Capability được kiểm thực tế. Hủy hộp chọn không sửa
  thư mục hoặc trạng thái dự án; mirror không thay bản lưu chính.

API fetch chỉ cùng origin. Điều hướng đăng nhập là ngoại lệ có chủ đích:
controller được điều hướng cùng tab tới URL HTTPS do endpoint `/auth/start`
cùng origin vừa trả về, sau khi kiểm scheme/không credentials/không fragment.
Backend lấy endpoint này từ cấu hình IdP vận hành. Không lấy đích điều hướng
từ tệp dự án, settings, query hoặc thông điệp lỗi; không tải mã từ IdP bằng fetch.

Đây là hợp đồng sản phẩm. Capability chưa có triển khai/bằng chứng giữ lý do
thật; thay đổi schema không tự chứng minh các chức năng đã chạy.
