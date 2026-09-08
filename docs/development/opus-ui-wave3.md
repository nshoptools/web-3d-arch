> Hồ sơ giao việc lịch sử. Chỉ đạo mới nhất ngày 2026-09-08 đã ngừng Opus; không dùng tài liệu này để gọi lại. Phân công hiện hành ở [README](README.md).

# Opus — UI wave 3: nối thao tác nguồn và hoàn thiện hợp đồng

Làm implementation trong run `20260908-ui-wave3`; không sửa main, wave2,
phòng khác hay .toolchain. Đọc AGENTS.md, docs/development/README.md,
docs/reviews/seat-config.json, SEAT-CONFIG.md và tmp/reviews/README.md trước
khi làm; dot-source env đúng ghế/run trước công cụ ghi tệp. Dùng launcher
Opus dùng model opus/effort max/fast off qua launcher; tự ghi bằng chứng runtime.
Không mở ghế khác/agent con. Không tự nhận implementation là review độc lập.

Candidate đã sao chép từ UI wave2 vào work/ui, hợp đồng root 0.3 được sao
chép vào src/contracts. Giữ contract nguyên trạng; đề xuất sửa bằng báo cáo
nếu phát hiện bất hợp lý. Parent tích hợp UI wave2 vào main, đang làm renderer
Three thật. Worker Codex khác đang làm controller theo 0.3 và các bộ xử lý
raster/editing/font/cơ khí. Không viết backend/boolean/codec/mesh/pixel core.

1. Áp toàn bộ thay đổi ở docs/development/contracts-v0.3.md và app-bridge.ts.
   Đóng 10 điểm thiếu trong báo cáo wave2: heal controls, selection bàn phím,
   slot null, máy in, mirror picker, policy read/replace/version, credential
   metadata, budget readback, bỏ selectedTool, close-unknown có lý do/xác nhận.
   Form policy giữ nguyên toàn bộ document chưa đổi, diff/xác nhận trước gửi;
   không bịa schema hoặc gửi khóa policy.* qua settings. Các field không biết
   được giữ nguyên và hiển thị đúng mức, lỗi version không âm thầm ghi đè.
2. AI cho chọn size/quality theo registry model; hiển thị lựa chọn trước prepare,
   gửi chúng trong request, đổi chúng hủy báo giá/consent. Không chọn một giá trị
   ẩn. Không gọi AI mất phí. Key vẫn chỉ sống trong form và xóa mọi nhánh.
3. Dựng source canvas 2D THẬT bằng ảnh từ project.sourceCanvas; nguồn không
   editable giữ lý do. Canvas/ảnh nguồn thuộc UI, host attachViewport hiện tại
   vẫn chỉ dành cho renderer 3D của Codex, hiển thị theo bước. Không tự thay
   ảnh đầu vào bằng glyph/placeholder. Hỗ trợ pan/zoom, fit, nguyên gốc/đã sửa,
   giữ tỷ lệ/không mất thao tác sau resize, pointer capture và bàn phím.
   Mỗi gesture gửi một editSource với ID duy nhất, project/source revision
   đã chụp, tọa độ PIXEL ảnh (không tọa độ màn hình), points và pressure.
   Không commit theo pointermove. Nháp đường cong: click thêm knot,
   Backspace bỏ knot cuối, Enter/double click kết thúc, Escape hủy.
   Paint/heal region dùng điểm seed; line/curve/erase/cut dùng chuỗi điểm;
   crop from/to là hai điểm, shape/keep/square theo các lựa chọn.
   Shift snap45; không chặn phím trong input/IME. Hủy gesture chưa gửi không
   tạo history; tránh pointerup sau cancel gửi nhầm. Lượt đang chạy do job
   controller quản lý và nút Hủy dùng hợp đồng hiện tại.
   Đọc docs/editing/API.md và ADR để hiểu hành vi bảy công cụ; không tự viết lại
   thuật toán pixel. So sánh bản gốc phải nói đúng đó là ảnh trước sửa của bản
   chuyển đổi, không gọi nó byte gốc vector. Cung cấp đường bàn phím tương đương
   để nhập tọa độ và áp thao tác nếu pointer không dùng được.
4. Mock/harness chuyển 0.3 đầy đủ, ảnh dùng fixture tự tạo có màu/lỗ thay vì
   thành công ảo không hình. Mock ghi gesture để kiểm chính xác tọa độ/revision;
   không được đưa mock vào src/ui hay bundle sản phẩm. 0.3 missing capability
   không biến thành pass. Chạy typecheck/build và browser tests thực trên ba
   engine; kiểm resize/zoom/pan/gesture/undo dispatch/cancel/keyboard/320px/200%,
   AI size/quality invalidation, slot null, policy stale và readback budget.
   Các kết quả mock phải ghi rõ; parent chạy thêm E2E controller/nhân thật.

Ưu tiên triển khai đầy đủ các thao tác bình thường, tự sửa và kiểm lại các lỗi
phát hiện. Các quy tắc cô lập/whitelist browser server của wave2 tiếp tục áp dụng.
Bàn giao manifest SHA256, thay đổi/tiêu chí thực chạy, ảnh đại diện và hạn chế.
Không dừng ở đề xuất nếu hợp đồng đã đủ để làm; hỏi parent về binding còn thiếu.
