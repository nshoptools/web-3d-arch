# Kiểm lại bản sửa guard cơ khí

Bản sửa ngày 08-09-2026 đã được điều phối viên đọc diff, đối chiếu hash của hai preimage và hai tệp C++ trước khi tích hợp. [Kiểm nhận 17 tệp](parent-verification.json) gồm mã, ca tái hiện và tài liệu; [kết quả khóa](archive/reports/authoritative-results.json) giữ cả các lần không đạt. Đây là kiểm lại triển khai, chưa phải một vòng phản biện độc lập mới trên mã cuối.

- Hai lỗi phản biện tái hiện được trên dependency canonical, cả native và WASM.
- Bản sửa: mỗi target đạt 7 ca âm gốc, 10 ca đối chứng, 40 build và 40 oracle đọc mesh. Native có ba ca hủy đạt.
- Bộ bổ sung đạt 18/22 assertion mỗi target: hai mã lỗi âm thay đổi và hai hình lỗ/đảo trước đây được nhận nay bị từ chối bảo thủ. Giữ nguyên thất bại và kỳ vọng gốc.
- Bản build thống nhất của điều phối viên ghép thêm source/datum mới. Những phép kiểm của ghế sửa ở đây dùng source assembly đã chụp trước đó; không đánh tráo hai phạm vi.

[Hợp đồng độ phân giải và các giới hạn](../../curved-products/GUARD-RESOLUTION.md) giải thích nhánh raw, fallback và các mã từ chối. Không có chứng nhận mọi đầu vào, slicer hoặc fit vật lý. [Seal](archive/final-seal.json) ràng buộc bốn báo cáo; danh mục evidence lịch sử không có nghĩa toàn bộ tệp môi trường build đã được sao chép vào hồ sơ bền.
