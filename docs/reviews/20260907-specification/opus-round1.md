# Tổng hợp phản biện: Opus — vòng 1

Bản tổng hợp biên tập ngày 2026-09-08 từ nhận xét độc lập ngày 2026-09-07.
Các vấn đề và quyết định được trình bày đầy đủ tại đây; đây không phải nguyên
văn một lượt trả lời của ghế và không phải một vòng phê chuẩn mới. Điều khoản
hiện hành ở [bộ đặc tả](../../specs/README.md); [metadata ghế](seat-evidence.json)
ghi cấu hình đã quan sát và giới hạn chưa xác minh. Review không thay kiểm
thử ứng dụng, slicer hoặc bản in.

| ID | Vấn đề | Kết luận và xử lý |
| --- | --- | --- |
| OPR-01 | Mô hình tài khoản và vai trò | Chấp nhận — ACC-01/02: vòng đời, owner/member, phân quyền server và owner cuối |
| OPR-02 | Cô lập kho theo người dùng | Chấp nhận — ACC-03/04: local store/lock theo user, logout, callback muộn, máy dùng chung |
| OPR-03 | BYOK và nơi giữ secret | Chấp nhận — AI-01/02: BYOK, vault riêng, không key owner fallback hoặc key trong ZIP |
| OPR-04 | Hiển thị chi phí và hạn mức | Một phần — AI-03/04: estimate/actual/unknown/reservation và ngân sách; owner không mặc nhiên được xem chi tiêu/prompt riêng |
| OPR-05 | Retry và tính phí trùng | Một phần — Idempotency theo operation và provider; cache kết quả riêng không giải timeout sau gửi; giữ unknown, không hứa exactly-once |
| OPR-06 | Thiếu COI/SAB | Một phần — WEB-01 có chẩn đoán và cứu dữ liệu khi thiếu COI/SAB; không bắt buộc copy fallback chưa spike; user cài riêng không nghĩa self-host |
| OPR-07 | Hợp đồng mở rộng | Chấp nhận có giới hạn — EXT-01/04 registry/capability và recipe có schema; thêm loại UI hoàn toàn mới vẫn có thể cần component mới, không hứa mọi mở rộng chỉ đổi JSON |
| OPR-08 | Tính đầy đủ của tệp và runner | Chấp nhận — Bổ sung các tệp còn thiếu; runner bảo toàn summary/exit khi thiếu acceptance manifest; kiểm tự động riêng |
| OPR-09 | Offline và redirect đăng nhập | Một phần — WEB-01 loại auth redirect/login khỏi cache; ACC-04 lease 24 giờ rồi cứu dữ liệu. Không cho quyền offline vô hạn theo đề xuất |
| OPR-10 | Phạm vi cài đặt | Một phần — Scope system/user/device/project và precedence ACC-03; profile hiệu chuẩn được đồng bộ nhưng pin đúng máy, không mặc nhiên mọi profile là device-only |
| OPR-11 | Version và migration | Chấp nhận — EXT-03 version tách biệt, preserve byte/version lạ, migration copy-on-write và orphan ID; fixture migration trước cổng triển khai |
| OPR-12 | Miền/bước và chính sách Z | Một phần — Danh mục 126 field đã đóng gói; 0,05/0,02 cần quyết định grid; 1,7/5,50 mm giữ nominal khi phù hợp, không snap ngầm. GEO-02, O-02. |
| OPR-13 | Biên responsive không chồng | Chấp nhận — UI-06 các khoảng nửa mở, không chồng biên 720/1023/1180/1400 |
| OPR-14 | Đọc được và kích thước control | Chấp nhận — Đọc được/target/reflow thắng token px, kiểm zoom và nhìn thật |
| OPR-15 | Font cá nhân và font đóng gói | Chấp nhận — 8 font chỉ danh sách cá nhân; font đóng gói theo trần riêng, không xóa font referenced |
| OPR-16 | Cửa chặn xuất có tên | Chấp nhận — EXP-02 định danh cửa chặn theo capability, giữ quyền/parser/security ngoài quyền bỏ qua cảnh báo |
| OPR-17 | Phép kiểm nghiệm thu quan sát được | Chấp nhận — 55 điều khoản liên kết 40 chiến dịch/113 check có prerequisite, phương pháp/ngưỡng riêng; chưa thực thi sản phẩm. |
| OPR-18 | Scale số nguyên và overflow | Chấp nhận có cổng — GEO-02 bound intermediate và miền an toàn thư viện; O-01 pin/đo trước khóa ABI; không đổi scale bằng phỏng đoán |
| OPR-19 | Bảy công cụ và đường vào đặc tả | Chấp nhận — EDT-01 quy định bảy công cụ; README dẫn bộ đặc tả hiện hành. |

Các nhận định thiếu bảng thông số hoặc thiếu gói 3MF đã được bác:
danh mục 126 field và các fixture đều có trong repository. Các kết luận thiếu dữ liệu
không được dùng làm căn cứ thiết kế.
