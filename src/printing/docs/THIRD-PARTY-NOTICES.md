# Third-party notices and pins
Kiểm nguồn ngày 2026-09-08; wave2 kiểm lại byte local offline. Bản chữ giấy phép giữ nguyên byte trong licenses/.

Production path:
- **lib3MF 2.5.0**, BSD-2-Clause, [official release](https://github.com/3MFConsortium/lib3mf/releases/tag/v2.5.0),
  [source commit](https://github.com/3MFConsortium/lib3mf/tree/64bb454d1fcb53effa57d3cef752a10d740d41a2).
  Source/SDK archive SHA-256 và release digest ở pins.json. Gồm libzip, zlib,
  cpp-base64, fast_float; giữ các license gốc riêng.
- **libzip**: source bundle/probe tạo LIBZIP_VERSION **1.11.1**. Release README
  vẫn ghi 1.10.1; không dùng con số README làm bằng chứng binary component.
  Bản source archive đã pin là căn cứ; [license](https://libzip.org/license/).
- **zlib 1.3.1**, header thực ZLIB_VERSION; [license](https://www.zlib.net/zlib_license.html).
- **cpp-base64 2.rc.08** (release credits), [upstream](https://github.com/ReneNyffenegger/cpp-base64);
  byte source nằm trong archive đã pin, license riêng.
- **fast_float v6.0.0** (release credits), MIT/Apache alternatives,
  [upstream version](https://github.com/fastfloat/fast_float/tree/v6.0.0).
- **fflate 0.8.3**, MIT, [upstream](https://github.com/101arrowz/fflate).
- **@xmldom/xmldom 0.9.12**, MIT, [upstream](https://github.com/xmldom/xmldom).
  npm resolved tarball URLs + SHA-512 integrity nằm trong package-lock.json.

Lib3MF optional LibreSSL/googletest tests không được link vào production target
của candidate. Wave2 liên kết lib3MF static từ source archive đã pin; SDK DLL chỉ là bằng chứng wave1.

Test/oracle-only: trimesh, NumPy, networkx, lxml theo oracle-requirements.txt và
oracle-wheels.json. .NET System.Xml, Python, Node, CMake, Ninja, Emscripten, Vite,
Playwright và browsers là công cụ đã có được chạy bằng đường repo/môi trường
đã khai; versions thực ở pins.json / run evidence. Emscripten/Rust runtime code
được link vào module chung và có notices bổ sung dưới đây.

Bambu Studio portable và Snapmaker Orca portable dùng riêng cho kiểm chứng;
AGPL-3.0 licenses/source ở [Bambu release](https://github.com/bambulab/BambuStudio/releases/tag/v02.08.02.60)
và [Snapmaker release](https://github.com/Snapmaker/OrcaSlicer/releases/tag/v2.2.1).
Không phân phối lại binary slicer trong package này.

Fixtures ở tests/fixtures/slicer-profiles và printing-reference là dữ liệu nội bộ
có quyền phân phối chưa xác minh. Package chứa parser/recipe, không chứa bản sao
profile JS, G-code máy hoặc resource bundle của slicer. Các artifact kiểm thử có
settings nguồn chỉ lưu trong ownrun và không được phát hành cùng browser bundle.

XSD kiểm từ archive lib3MF giữ nguyên; XML namespace schema dùng
[W3C xml.xsd](https://www.w3.org/2001/xml.xsd), hash được bootstrap kiểm.
[3MF Core specification](https://github.com/3MFConsortium/spec_core/tree/997b385e06f3181cf9aae0c578e0b45ccd48ccb2)
được lưu như tài liệu tham khảo trong inputs, không thay schema âm thầm.

## Unified runtime, wave2

[unified-pins.json](unified-pins.json) giữ source revisions, archive/tree hashes,
flags và tool versions thực; [unified-license-files.json](unified-license-files.json)
chốt từng notice byte. Các nguồn chính thức được nhận từ pin đã kiểm ở phiên;
wave2 không tải nguồn mới.

- Manifold 3.5.3: Apache-2.0, original notice dưới licenses/kernel/.
- Clipper2 commit 46f6391: BSL-1.0, original notice và patch no-iostream của parent.
- HarfBuzz 14.4.0, commit 36cb489: license theo original COPYING. Wrapper
  harfbuzzjs 1.6.1 và giấy phép đã được parent giữ trong src/assets/harfbuzz.
- Emscripten 6.0.9 runtime: original LICENSE, musl COPYRIGHT, libc++/libc++abi/
  compiler-rt notices; allocator dlmalloc public-domain notice được trích nguyên
  byte từ source đã hash, ghi byte range riêng. Không thay bản source gốc.
- Rust 1.98.1 và nightly-2026-09-07: COPYRIGHT-library.html cùng toàn bộ license
  texts liên kết trong licenses/rust/. Parent Rust crates/locked checksums và
  original license paths được liệt kê ở integration/parent-license-references.json;
  phải giữ các notice gốc đó cùng runtime, không chỉ notice riêng của lib3MF.
- Test-only Inter OFL font có SHA và nguyên bản OFL trong licenses/test/.
  Byte font không được bundle sản phẩm.

Các notice tổng hợp Rust liệt kê cả component upstream có thể không nằm trên
đường code đang dùng; giữ đầy đủ không phải tuyên bố module link mọi component.
MSVC/Windows toolchain/system DLL không được phân phối lại trong candidate này.
