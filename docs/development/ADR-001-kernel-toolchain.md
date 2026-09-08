# ADR-001 — Chuỗi công cụ nhân native và web

Ngày 2026-09-08; **đang kiểm chứng**, chưa đóng O-01. Version/hash ở
[toolchain-lock.json](toolchain-lock.json). Mục tiêu vẫn là Rust+C++ và HarfBuzz
trong một module Emscripten; không có quyết định chuyển hình học lên backend.

Rust 1.98.1 native liên kết tĩnh Clipper2/Manifold qua C ABI. Phía web dùng
nightly đã pin và `-Zbuild-std=std,panic_abort` để xây std bằng cùng Emscripten
với C++. Spike dùng std dựng sẵn đã gặp lỗi ABI/atomics khi liên kết. Xây lại
std giải quyết lỗi; đây là hướng được
[tài liệu Rust cho target Emscripten](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-emscripten.html)
mô tả. Nightly được pin theo ngày, không tự cập nhật qua một alias trôi nổi.

Manifold tắt song song nội bộ. Runtime vẫn dùng shared memory trong Dedicated
Worker; heap ban đầu 64 MiB, trần 1 GiB, stack 4 MiB. UI không dùng
`Atomics.wait`. Lệnh nhỏ đi qua message; mesh bất biến đi bằng lease của buffer
ARCH/1. Runtime ABI 2 khai vòng đời/ownership/cancel ở
`src/kernel/native/runtime.h`. Khởi tạo từ chối ABI sai và thiếu COI.

Native và web đã được đối chiếu trên hình giải tích, SVG có lỗ, chung biên,
clip lồng nhau, viewport và đổi kích thước. Oracle đọc lại cả STL, kiểm cạnh,
link đỉnh, diện tích nắp, thể tích và lỗ. Đây là chứng cứ theo corpus; chưa
chứng minh mọi self-intersection, ngân sách import SVG tổng quát hoặc fit máy in.

Clipper2 giữ archive gốc có SHA-256 và cây dẫn xuất riêng áp carry patch chính
thức của Manifold. `tools/kernel/prepare-clipper.ps1` kiểm archive và tree hash;
CMake tắt tải dependency và trỏ vào cây đã chuẩn bị. Cargo theo dõi từng archive
C++ qua `rerun-if-changed`, để sửa C++ buộc liên kết lại Rust. Tham số
`WASM_BIGINT` chỉ truyền khi link; đưa nó vào mọi lệnh compile gây lỗi `-Werror`
của Clipper2, nên không tắt cảnh báo để che lỗi cấu hình đó.

HarfBuzz 14.4.0 cùng revision với bộ đọc đã kiểm nay liên kết vào cùng module
Rust/C++, dùng cùng allocator và shared memory. Bộ đọc độc lập được giữ làm
đối chứng; `font-source-core.mjs` nhận HarfBuzz qua injection và
`harfbuzz-engine.mjs` nối đúng module chung. Recipe kiểm 3.808 tệp source gốc
với archive đã pin trước khi build, giữ bản gốc và giấy phép.

Đã đối chiếu glyph, cluster, advance/offset, outline và min/default/max của
các trục trên toàn bộ 53 tệp font chữ, ba chuỗi tiếng Việt mỗi cấu hình.
Native và WASM đều khớp bộ đọc đã kiểm. COLRv1 được so đầy đủ paint graph ở
web; native mới đối chiếu shaping chuỗi màu, không nhận là native rasterizer.
Ba browser Worker giữ shaping/paint sau memory.grow. Những phép kiểm này chưa
chứng minh toàn bộ luồng chữ/emoji tới vật in hoặc đóng O-01 cho mọi bộ xử lý.

Ma trận kernel hiện đạt 20 nhóm, gồm xuất STL thực qua Worker và đọc lại bằng
oracle độc lập trên Chromium, Firefox và WebKit. Probe native 4.096 ô chung
biên dựng trong khoảng 0,08 giây; contour tròn 200.000 điểm vẫn vượt giới hạn
đo 25 giây. Đây là phép đo trên corpus cụ thể, không là bảo đảm latency chung.

Các giới hạn còn phải xử lý: chi phí geometry ở input lớn; tổng sai số import;
STL float32 có thể làm các tam giác rất mảnh thành thẳng hàng. Giữ chặn xuất
khi tọa độ tệp mất tam giác; không thay pháp tuyến để che tọa độ suy biến.
