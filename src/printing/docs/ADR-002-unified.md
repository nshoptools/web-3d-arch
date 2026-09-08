# ADR-002: một module và quyền sở hữu lease

Ngày 2026-09-08. Quyết định đã triển khai trên private copy; parent áp main edits.
ADR này thay phần ứng viên Rust/WASM và SDK DLL trong ADR-001.

Rust runtime ABI 2, Manifold, Clipper2, HarfBuzz 14.4.0, arch3mf_static và
lib3MF 2.5.0 được final-link bằng em++ 6.0.9. Browser Worker instantiate đúng
một Module; JS printing và HB wrapper đều nhận Module đó. Trên WASM, Rust
allocator đi qua libc của target Emscripten, cùng dlmalloc-mt với C++.
Không truyền pointer giữa các instance. Native static link vào cùng executable,
nhưng không khẳng định Rust allocator và C++ CRT là cùng allocator native.

## Lifetime

Success của arch_build_svg/arch_test_fixture đã cấp **một primary lease**.
adoptPrimaryLease nhận quyền sở hữu lease đó, không gọi acquire.
Nếu UI còn dùng snapshot, acquireReaderLease chủ động tạo **một reader lease**
và exporter chỉ trả reader đó. UI giữ/trả primary riêng. Kernel không có
transfer token ở native ABI: caller phải bảo đảm quyền sở hữu thực tế.

JS opaque token có ready/exporting/released states; duplicate primary adoption
và duplicate consumption bị chặn. exportSnapshot3MF trả lease đúng một lần
trong finally, kể cả lỗi profile/material/schedule/busy. Lỗi trước khi adopt
thành công vẫn để quyền sở hữu ở caller. C++ bridge chỉ borrow, không acquire/
release. Module worker phải serialize runtime calls và không cho caller khác
trả cùng lease đang export.

Sau native memory.grow, JS lấy lại HEAP views. C++ không giữ borrowed pointer
qua await. Snapshot immutability đến last release là hợp đồng runtime ARCH/1.
Export không đổi runtime.h hoặc version ABI 2; chỉ thêm printing bridge ABI.

## Bản sao cần thiết

- JS chỉ clone profile/schedule/material/part mapping và vài scalar snapshot
  metadata trước await; không unpack/copy mảng vertices/faces.
- C++ bridge kiểm header, generation, bounds/alignment rồi borrow các dải
  f64 vertices và u32 global indices trong cùng heap. add_part_range rebase
  index trong lúc tạo vector của lib3MF; không có staging allocation JS mesh.
- C++ giữ dữ liệu validator và model lib3MF phục vụ readback; writer/reader
  và nén gói vẫn dùng bộ nhớ nội bộ. Không gọi đây là zero-copy serializer.
- Byte kết quả được copy ra Uint8Array không shared trước destroy/context release.
  Project adapter còn inflate/repackage metadata và đọc lại ZIP; các bản sao
  này phục vụ kiểm chứng và trả artifact độc lập với lifetime Module.

## Bằng chứng và giới hạn

Native static executable xuất 3 shape kernel; PE imports không có lib3mf.dll.
Node và mỗi Chromium/Firefox/WebKit chạy 7 nhóm, gồm memory growth, primary/
reader release, 10 job liên tiếp qua giới hạn 8 snapshot, schedule overrides,
material color failure và đường arch_build_svg → sealed cube → 3MF.
Các browser ghi wasmInstantiationCalls=1, bridgeCalls=18, flatCalls=0;
acquireCalls=1 chỉ dành cho reader tường minh, releases=18.

HarfBuzz NFC/NFD shaping dùng font Inter gốc cùng Module, native kiểm version
14.4.0. Điều đó chưa chứng minh đường font outline → text solid → slicer.
Trimesh/oracle giải tích và Core XSD kiểm riêng 19 output unified, thêm 8 output
API flat regression. Các execution paths lặp cùng hình không là oracle độc lập.

Không chạy U1 portable, không bypass thư mục OS/Sentry. Bambu wave1 chỉ giữ
hai local analytic dry slices. Không physical fit, general mesh intersections,
full G5/G6 hay release qualification. Không bắt đầu importer STL/3MF.
