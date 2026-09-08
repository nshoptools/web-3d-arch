# Printing implementation candidate 0.2.0

lib3MF 2.5.0 xuất Core 3MF trong **cùng module Emscripten 6.0.9** với Rust
runtime ABI 2, Manifold/Clipper2 và HarfBuzz 14.4.0. Target CMake
`arch_printing::core` có thể thêm bằng `add_subdirectory`; native dùng static
archives trong cùng executable, không cần lib3mf.dll.

`createUnifiedPrinting(existingModule)` nhận Module đã khởi tạo, đọc trực tiếp
snapshot ARCH/1 đang có lease trong cùng heap. API flat mesh vẫn dùng được.
Adapter Bambu P1S 0.4 / U1 0.4 giữ profile và schedule snapshot đã đóng hash,
gồm override lớp đầu .25/.20 so với .16/.20.

- [API và lifetime](docs/API.md), [recipe offline](docs/BUILD.md).
- [Quyết định unified module](docs/ADR-002-unified.md), [Core/adapter](docs/ADR-001.md).
- [Parent integration](integration/README.md), [source pins](docs/unified-pins.json),
  [third-party notices](docs/THIRD-PARTY-NOTICES.md).
- [Tests](tests/README.md), [slicer scope](docs/SLICERS.md).

Đã chạy native, Node và Worker thật trên Chromium/Firefox/WebKit; mỗi browser
chỉ instantiate WASM một lần. Readback gồm lib3MF, ZIP/XML, Core XSD nguyên bản
và trimesh/oracle giải tích. Các kết quả này chưa mở capability full G5/G6.
U1 CLI vẫn unverified; Bambu wave1 chỉ có hai dry slice giải tích đã khai.

Package không chứa fixture profile JS, STL exporter/triangulator/boolean mới.
Importer STL/3MF tổng quát được để lại cho wave sau. Parent sở hữu mọi sửa đổi
main, UI/backend, ACL/revision gates và quyết định phát hành.
