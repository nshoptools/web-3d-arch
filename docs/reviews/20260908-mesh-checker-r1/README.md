# Phản biện độc lập bộ kiểm mesh và kết quả dựng

Ngày 2026-09-08, Codex Astra/max, Fast off theo cấu hình công cụ; service tier phía máy chủ không được attestation. [Bản review ban đầu](archive/reports/initial-review.md) không tìm được lỗi có đủ bằng chứng trong phạm vi đã chụp. Codex điều phối chấp nhận kết luận có giới hạn sau khi đối chiếu mã, cách xây oracle và toàn bộ hash nguồn/evidence; [phân xử](adjudication.json) ghi giới hạn cụ thể.

Review dùng oracle phân số chính xác cho2.909cặp tam giác,5.000cặp tứ diện,450cặp khối lõm,2.197phép kiểm lồng chứa và28kiểm tra quyền công bố kết quả. Ba trình duyệt chạy nhân và Worker kiểm mesh thật với cặp runtime được ghi trong báo cáo. Đây là các tập hữu hạn, không phải chứng minh mọi đầu vào. Bộ43kiểm tra tác giả được ghi tách với phép thử độc lập.

[Hồ sơ lưu trữ](archive-integrity.json) ghi702tệp nguồn và135mục evidence, trong đó0mục có sai khác công bố rõ. Báo cáo và dữ liệu cần đối chiếu được giữ tại đây; bản executable/WASM cùng toàn bộ cây chụp không được sao chép vào hồ sơ. Không dùng hồ sơ này để khẳng định tái tạo được binary lịch sử.

Bản review không kiểm bộ nạp runtime đã sửa sau đó, ASFR/probe mới, toàn ứng dụng, hiệu năng cực hạn, slicer hoặc bản in/lắp ghép thật. Không có kết luận sản phẩm sẵn sàng phát hành từ riêng mốc này.
