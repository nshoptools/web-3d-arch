# Dựng và kiểm chứng exporter cùng nhân ứng dụng

Package bền ở `src/printing`. Rust, hình học C++, HarfBuzz 14.4.0 và lib3MF
2.5.0 liên kết trong **cùng một module**. Exporter nhận lease của snapshot
ARCH/1; không khởi tạo WASM thứ hai và không đưa mesh lớn qua JSON.
`createUnifiedPrinting(module)` dùng Module đã có. UI giữ primary lease;
export chỉ mượn thêm reader lease và trả đúng một lần, kể cả khi thất bại.

Prerequisite đã kiểm: Node 24.19.0, Python 3.13.3, Rust 1.98.1/native và
nightly-2026-09-07/WASM, Emscripten 6.0.9, CMake 4.4.3, Ninja 1.13.2,
Visual Studio 18/MSVC. Dependency dùng chung phải được chuẩn bị theo
`tools/kernel` và hồ sơ toolchain trong `docs/development`; không cài global.
Mọi build/cache/profile/artifact đặt trong phòng phiên; không cần mã nguồn
hoặc kết quả từ một phiên cũ.

Từ gốc repo trong PowerShell 7:

```powershell
$printingRun='printing-verification-01'
. ./tools/development/env.ps1 -Seat codex -RunId $printingRun
./src/printing/tools/prepare-js.ps1 -RunId $printingRun
./src/printing/tools/prepare.ps1 -RunId $printingRun
$env:PIP_TARGET=Join-Path $env:PROJECT_REVIEW_RUN 'work/deps/python'
python -B -m pip install --target $env:PIP_TARGET --only-binary=:all: --no-compile -r src/printing/tests/oracle-requirements.txt
./tools/kernel/build.ps1 -RunId $printingRun -Target native -Printing -TestFixtures
./tools/kernel/build.ps1 -RunId $printingRun -Target wasm -Printing -TestFixtures
./src/printing/tools/test.ps1 -RunId $printingRun -Browsers
```

`prepare.ps1` tải đúng archive nguồn lib3MF và schema XML chính thức, kiểm
byte length/SHA-256, rồi sao chép cây Manifold/Clipper2/HarfBuzz đã pin vào
phiên. CMake chỉ ghi vào bản sao đó. Bộ chuẩn bị kiểm toàn bộ cây và từ chối
đầu ra đã thay đổi; không ghi đè nguồn gốc. Bản vá lib3MF giữ riêng với hash.
Muốn dùng archive có sẵn trong repo, gọi `prepare-dependencies.py --archive`
sau khi dot-source môi trường; vẫn cần đúng schema XML đã pin cho oracle.

Đầu ra thống nhất: `work/module/arch-kernel.mjs` và `.wasm`, native example
`work/rust-target/release/examples/unified_printing.exe`. `-TestFixtures`
chỉ dành cho kiểm thử; build phân phối phải dựng lại không cờ này. Wrapper
`build-unified.ps1` gọi cùng recipe gốc. Recipe standalone cũ phục vụ đối
chiếu riêng, không phải cách tích hợp runtime của ứng dụng.

Runner kiểm API regression, lease/generation, SVG thật qua nhân chung,
HarfBuzz, nhiều lần xuất và ba engine trình duyệt nếu chọn `-Browsers`.
Trimesh đọc lại tệp bằng oracle giải tích riêng: thể tích, diện tích, lỗ,
hướng và manifold. .NET System.Xml kiểm schema gốc với DTD/network tắt.
Không sửa XSD để hợp validator; lxml vẫn là reader phụ, không nhận verdict
schema khi upstream maxOccurs vượt khả năng của nó.

Fixture slicer bền được parse/hash, không chạy JavaScript hoặc G-code.
Profile chỉ dùng kiểm nội bộ không đi vào bundle. Thành công runner chứng
minh phạm vi component đã chọn; không thay kiểm toàn ứng dụng, đúng profile
máy/slicer G5 hoặc bản in/fit G6. U1 CLI và physical fit vẫn chưa được chứng
minh. Không có lệnh điều khiển máy in hoặc gọi AI mất phí trong runner này.
