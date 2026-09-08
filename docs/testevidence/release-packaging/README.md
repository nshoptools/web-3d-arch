# Kiểm gói vận hành trên mã tích hợp

[Kết quả chính](main-verification.json): 46/46 đạt, syntax đạt, byte mã không
đổi trong lần chạy. Không có ca bỏ qua. Cặp browser-entry/WASM của bộ kiểm là
giả lập có nhãn; thư viện nguồn, host/backend, SQLite, CLI và HTTPS là thật.

Đã đối chiếu 157 tệp của bàn giao, tích hợp 38 tệp cần dùng; hai tài liệu giao
việc tạm không thuộc bộ tài liệu vận hành. Manifest host tăng lên 65.536 asset
và 32 MiB JSON, vẫn giữ giới hạn byte công khai và allowlist MIME riêng.

Phạm vi kiểm: artifact tái lập/có thể di chuyển, hash và danh sách tệp, thư viện
đầy đủ 21.391 tài nguyên, SVG gốc truyền dưới dạng byte trơ, PNG thật, ba trình
duyệt, Worker, tài khoản owner/hai thành viên tổng hợp, vòng đời tiến trình,
backup/restore và rollback. Nguồn/preview không bị thay bằng bản thu nhỏ hoặc
placeholder. Không có gọi AI trả phí, hóa đơn thật hoặc triển khai máy ngoài.

Chạy lại từ gốc repo với mã phiên mới:

```powershell
./tests/release/run.ps1 -RunId release-package-check -Label main
```

Runner tự lấy thư viện đã tích hợp và kiểm hash; không phụ thuộc phòng bàn giao.
[API](../../release/API.md), [hướng dẫn vận hành](../../release/RUNBOOK.md) và
[ranh giới kiểm](../../release/TESTING.md) mô tả cách dùng. Sản phẩm chỉ được
đánh giá phát hành sau khi bộ đóng gói nhận entry/runtime sản phẩm cuối cùng
và luồng ứng dụng thật vượt nghiệm thu tương ứng.
