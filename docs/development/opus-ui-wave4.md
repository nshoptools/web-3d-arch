> Hồ sơ giao việc lịch sử. Chỉ đạo mới nhất ngày 2026-09-08 đã ngừng Opus; không dùng tài liệu này để gọi lại. Phân công hiện hành ở [README](README.md).

# Opus UI wave 4 — hoàn thiện trải nghiệm sau tích hợp

Implementation đã được chủ dự án ủy quyền. Run `20260908-ui-wave4`, chỉ ghi
phòng Opus của run này. Đọc AGENTS, phân công, cấu hình ghế và SEAT-CONFIG
trước khi làm; launcher dùng opus/max/fast off. Ghi cấu hình thực và
giới hạn như wave3. Không mở ghế khác; không tự coi đây là review độc lập.

Candidate là bản UI3 đã khóa, contract 0.3 hiện hành. Parent đã tích hợp 55
file UI và typecheck đạt. Parent chạy E2E UI thật cùng controller/backend,
HTTPS host, storage, Worker/WASM/Three. Mã core/main tiếp tục đổi; chỉ đọc
để hiểu interface, không sửa hoặc chép đè main. Mọi test/browser/cache/profile
ở ownrun, `.toolchain` chỉ đọc. Không gọi AI thật hoặc máy in.

1. Khi chưa có project.id, UI phải đưa được người dùng tới bước tạo dự án và
   chọn loại sản phẩm. Những lối “Tải nguồn / Gõ chữ / Chọn emoji” không được
   gửi một lệnh chắc chắn PROJECT_REQUIRED mà không hướng dẫn. Chọn luồng đơn
   giản phù hợp bố cục hai bước: ví dụ card tạo dự án có lựa chọn loại, rồi mở
   đúng tác vụ nguồn. Không tự viết nghiệp vụ lưu hoặc tự tạo thành công.
   Thất bại tạo/import phải còn thấy được và có đường thử lại.
2. Library xuất gói cần nhận option controller hiện trả id `project`,
   extension `arch-project.zip`, ngoài alias cũ. Chọn option theo ý nghĩa đã
   công bố; gọi đúng id đó, không bịa exporter. Gói cứu phải dùng được khi
   offline lease hết hạn nhưng snapshot.exports vẫn enabled. Nút không nên
   bị chặn bởi project.write nếu exporter riêng đã cho phép cứu.
3. Ở 320px/200% chữ, cho phép gập cả dải số liệu/gợi ý để giữ đủ khung vẽ;
   giữ mọi thông tin bằng đường mở lại. Kiểm các điểm bấm/trật tự focus và
   khả năng dùng canvas/nhập tọa độ thật, không chỉ không-overflow.
4. Bỏ raw command JSON khỏi xác nhận thông thường; trình bày thay đổi, mã
   đề xuất và lỗi có ý nghĩa. Người dùng chỉ cần JSON trong chẩn đoán mở
   riêng. Không bảo mọi xác nhận đều hoàn tác được: xuất/gọi mạng/thay quyền
   có thể có hiệu lực khác. ConfirmDialog chỉ đóng sau khi retry trả ok;
   lỗi/xác nhận mới không bị mất vì đóng dialog cũ theo kiểu pop-stack.
5. Ghi rõ ngữ nghĩa gesture của 0.3: revision dự án bao gồm mọi thay đổi
   EditorView/material. Nhân chụp editor trong đúng revision lúc nhận, và
   từ chối gesture nếu revision thay đổi. Vì vậy giữ gesture capture hiện
   tại và kiểm đổi màu/chế độ giữa nét không áp vào nguồn mới. Không thêm
   brush/opacity/tolerance vào hợp đồng ngoài đặc tả chỉ vì API core có.
6. TopBar chuyển bước2 phải dựa trên mô hình đã có, không chỉ source có
   dữ liệu. Parent đã sửa controller: build thành công→step2; project.step
   là trạng thái điều hướng, không tăng revision/history. Kiểm đường quay
   lại và chuyển sang khối đã dựng; khi cần rebuild nói rõ nguyên nhân.

Tiêu chí: typecheck/build và các kiểm mock ba engine tiếp tục đạt; thêm ca
phiên đã đăng nhập/chưa có project, create fail, rescue khi lease hết, retry
confirmation fail/stale không tự đóng, 320px/200% với dải gập/mở và ít nhất
một thao tác canvas sau gập. Giữ test mock ngoài bundle. Parent có E2E riêng,
không nhận kiểm mock là chứng minh core. Bàn giao hash manifest, ảnh đại diện,
phát hiện/tác động/lý do sửa và phần còn thiếu; không sửa core hộ parent.
