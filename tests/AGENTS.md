# Quy tắc cho kiểm thử

Kế thừa [AGENTS.md gốc](../AGENTS.md), đọc [README](README.md).

- Chỉ lưu test/fixture/kịch bản có thể tái sử dụng ở đây; output vào phòng phiên.
- Không thay đổi assets hoặc expected chỉ để làm xanh kiểm thử.
- Không chạy JS/G-code từ fixture. Parse dữ liệu, kiểm path/hash/giới hạn.
- Không công bố ca chưa chạy hoặc thiếu oracle là pass; không nhân số test thành
  tuyên bố sản phẩm đã hỗ trợ.
- Không cài toàn cục, không tạo browser profile ngoài repo, không dùng cache của
  ghế khác. Test ngoài phạm vi baseline phải khai prerequisite và cách chạy.
- Corpus đã version không sửa tại chỗ. Thay thước đo cần phiên bản và giải thích;
  snapshot mới cần kiểm độc lập trước chấp nhận.
