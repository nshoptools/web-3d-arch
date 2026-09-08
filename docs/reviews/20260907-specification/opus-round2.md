# Tổng hợp phản biện: Opus — vòng 2

Bản tổng hợp biên tập ngày 2026-09-08 từ nhận xét độc lập ngày 2026-09-07.
Các vấn đề và quyết định được trình bày đầy đủ tại đây; đây không phải nguyên
văn một lượt trả lời của ghế và không phải một vòng phê chuẩn mới. Điều khoản
hiện hành ở [bộ đặc tả](../../specs/README.md); [metadata ghế](seat-evidence.json)
ghi cấu hình đã quan sát và giới hạn chưa xác minh. Review không thay kiểm
thử ứng dụng, slicer hoặc bản in.

| ID | Vấn đề | Kết luận và xử lý |
| --- | --- | --- |
| O2-01 | Đăng xuất mặc định xóa dự án local, trong khi sao lưu cloud là tùy chọn (P1, mất dữ liệu) | Chấp nhận rủi ro mất dữ liệu. ACC-04 private giữ byte; shared kê backup theo revision/hash, chỉ xóa khi backup hoặc xác nhận xóa cụ thể; hết phiên không purge — AT-031.1/2 |
| O2-02 | cases.json dùng một oracle mẫu cho cả 39 ca, và một verdict cho ca gộp nhiều khẳng định (P1, chất lượng nghiệm thu) | Chấp nhận. Oracle phương pháp/ngưỡng riêng, check có ID/verdict, requirements.testChecks liên kết hai chiều; công cụ chưa triển khai vẫn unverified — QA-04, AT-039.1/4 và 113 check |
| O2-03 | Reservation `unknown` giữ vô hạn, không có luật qua kỳ; trần “thấp hơn giữa user và system” khác đơn vị (P2, ngân sách) | Một phần. AI-03 kiểm từng chiều cùng đơn vị/kỳ; unknown giữ nghĩa vụ kỳ gốc, không trừ kỳ mới/chiếm running slot. Không dùng TTL để tự xóa nghĩa vụ chưa đối soát — AT-033.2/4/5 |
| O2-04 | Chính sách owner siết miền nhưng không có luật xử lý giá trị cá nhân/snapshot đã nằm ngoài miền (P2) | Chấp nhận. Policy-blocked giữ giá trị gốc, chặn capability, không fallback/rebuild ngầm; gỡ policy phục hồi khả năng — AT-007.3 |
| O2-05 | Owner trả tiền hạ tầng nhưng không có hạn mức tài nguyên theo user ở phía server (P2) | Chấp nhận. Server quota cloud/settings/stage/rate/concurrency theo user, bắt buộc policy trước G4/O-05; không tự bịa hạn mức tiền — AT-030.3 |
| O2-06 | “Hình học chạy cục bộ” phát biểu không gắn phiên bản, đụng chính trục mở rộng đã mở ở EXT-02 (P2) | Chấp nhận. ARC-01 giới hạn local geometry ở v1; remote về sau qua ADR/consent/quota/execution adapter — AT-019.2, AT-034.3 |
| O2-07 | Hạn offline 24 giờ neo vào đồng hồ client, không có luật chống chỉnh giờ/lệch giờ (P3) | Một phần. Lease server-signed, monotonic trong phiên, phát hiện lùi quá 5 phút; công bố không chống người kiểm soát client sửa code/kho. Không nhận một wall clock local là nguồn auth tin cậy — AT-031.4 |
| O2-08 | Phạm vi khóa ghi còn hai câu khác nhau: `project+origin` và `userId+projectId+schemaVersion` (P3) | Một phần và sửa sâu hơn. Store theo user/project/schema; **writer lock theo user/project xuyên schema**, để migration và hai bản app không cùng ghi. Không dùng schemaVersion làm cách né khóa — AT-015.3 |
