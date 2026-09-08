# Chạy lại trên mã tích hợp

Dùng `tools/kernel/build.ps1` để dựng native và WASM cùng dependency đã pin.
`-Printing` dùng bộ lib3MF/HarfBuzz/Manifold/Clipper đã chuẩn bị trong phòng
của người chạy. `-EvidenceTag` giữ log riêng cho từng lượt; `-ModuleDirectory`
đặt cặp Module/WASM vào một thư mục con riêng của `work`.

Bản ứng dụng được dựng **không có** `-TestFixtures`. Bản đo nội bộ dùng
`-TestFixtures`; xuất các hàm tạo fixture và đọc số lượng allocation để kiểm
thử. Bản này phải ở thư mục khác, không thay cặp runtime dự kiến phân phối.
Native probe và Rust unit test cũng cần thư viện C++ dựng với `-TestFixtures`;
Rust lib tests chạy với `--test-threads=1` vì dùng registry native chung.

Dựng executable `tests/final-float/native/Cargo.toml` bằng Rust đã pin, với
`ARCH_NATIVE_BUILD` trỏ đúng build native có fixture và `ARCH_PRINTING_ENABLED=1`.
Chạy [runner](../../tests/final-float/run.ps1) bằng một RunId mới, cung cấp
`ModulePath` và `NativeExecutable` rõ ràng:

- `Mode Production`: probe native, oracle tệp, kiểm ready và ba trình duyệt
  thật qua API công khai; không đòi hỏi hàm đo/fixture trong runtime ứng dụng.
- `Mode Instrumented`: thêm ba nhóm Node dùng hàm đo/fixture; tổng bảy nhóm.

Runner tạo đầu vào native trước, ghi kết quả/mesh đối chiếu, rồi chạy Node và
trình duyệt. Browser so khớp hash byte với kết quả native trong chính phiên;
không lấy báo cáo của phiên cũ làm oracle. Byte Module/WASM được chụp vào phòng
kiểm trước khi chạy và hash mọi binary đầu vào được lưu cùng kết quả.
