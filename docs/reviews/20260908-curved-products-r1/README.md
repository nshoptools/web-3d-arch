# Phản biện hình học cong và quyết định tích hợp

Ngày 08-09-2026. Ghế độc lập Codex Astra/max đã khóa kết luận trước khi đọc kết luận triển khai. Fast mode được kiểm phía client; service tier phía máy chủ chưa được xác minh. [Bản ghi gốc](archive/reports/initial-findings.json) có hai lỗi được chứng minh, không đưa ra kết luận phát hành toàn ứng dụng.

| Phát hiện | Bằng chứng và phân xử |
| --- | --- |
| F1: phép giản lược truy vấn xóa khe mái rất hẹp rồi công bố mái dương | Chấp nhận. Có đầu vào prepared-source và mesh kết quả trên native/WASM; ghế sửa tái hiện lại trên đúng dependency canonical, loại trừ việc khác cây Clipper là nguyên nhân duy nhất. |
| F2: bỏ qua cạnh song song của hốc dây tại vùng lõm | Chấp nhận. Hốc thoát ngang qua thành cục bộ nhưng được nhận; có cả ca không chamfer và trục xoay để kiểm lại. |

Bản sửa đã tích hợp hai tệp C++: giữ cận của phần thiếu vật liệu chưa giản lược trước; chỉ cho phép fallback khi nguồn qua điều kiện độ phân giải; kiểm cạnh thành cục bộ trước bước dò miệng hốc. [Giới hạn chính xác](../../curved-products/GUARD-RESOLUTION.md) là một phần bắt buộc của kết luận: đây không phải chứng minh hình học đúng với mọi đầu vào.

Bản sửa đạt 7 ca từ chối gốc, 10 ca đối chứng và 40 mẫu thông thường cùng phép đọc mesh trên mỗi native/WASM. Bộ R2 bổ sung vẫn chỉ đạt 18/22 assertion: hai ca âm đổi mã lỗi, hai ca lỗ/đảo bị từ chối bảo thủ hơn. Không sửa assertion để che kết quả này. [Hồ sơ bản sửa](../20260908-curved-guard-remediation/README.md) giữ phạm vi và hash.

Reviewer ban đầu dựng cây Clipper upstream kèm patch có hash khác cây đã khai báo, đã công bố giới hạn này. Ghế triển khai tái hiện lại hai lỗi trên cây canonical trước khi sửa. Kết luận accepted dựa trên các ca tái hiện này, không dựa trên số phiếu hay tên ghế.

[Danh mục lưu chọn lọc](archive-selection.json) giữ 79 tệp nguyên byte đã kiểm hash: kết luận, seal, đầu vào và kết quả liên quan. Đây không phải bản sao toàn bộ môi trường build lịch sử. Các đường dẫn phòng chạy trong bản gốc là định danh lịch sử; kết luận và dữ kiện cần đọc đã được lưu cùng hồ sơ này. Kiểm compiled Worker, giao diện/backend, slicer và lắp vừa cần bằng chứng riêng.
