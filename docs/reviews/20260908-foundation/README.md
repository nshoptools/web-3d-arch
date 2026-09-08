# Phân xử phản biện nền tảng — 2026-09-08

Phản biện Opus độc lập đọc snapshot nhân trước khi tích hợp SVG/Worker đầy đủ;
không phải bản phát hành cuối. Reviewer dùng Claude Code 2.1.263,
`claude-opus-5`, ultracode/xhigh với Workflow, fast off. Caller kiểm init và
settings thực; reviewer tự chạy phép thử. Kết luận gốc: cần sửa, 4 P1, 10 P2,
8 P3. Các phát hiện được phân xử theo chứng cứ, không theo số phiếu.

Mã P1/P2/P3 dưới đây giữ ID của reviewer. Các test bền trong `tests/kernel`,
`tests/oracles` và Rust kernel mô tả ca tái hiện; tài liệu không cần bản mẫu
ngoài cây chính thức để hiểu hành vi yêu cầu.

| ID | Phân xử và tình trạng | Căn cứ / phép kiểm |
| --- | --- | --- |
| P1-01 | Nhận; chặn point contact cùng vùng trước extrude | Hai vuông 10×10 chạm tại (10,10) tạo cạnh STL có 4 mặt sau weld. Nay trả PLANAR_POINT_CONTACT; ca SVG/native giữ islands rời hợp lệ |
| P1-02 | Nhận; đã sửa vòng đời error buffer | Buffer 513 byte địa chỉ cố định, UTF-8 có giới hạn; read synchronous ở Worker. Native test giữ pointer qua nhiều lần publish |
| P1-03 | Nhận hiện tượng; **bác cách sửa một dòng**, còn mở đường xuất các contour quá dày | Ba đỉnh f64 có tích có hướng −6,6555×10^-8 nhưng sau f32 là 0. Normal từ f64 không phục hồi tọa độ tam giác trong tệp. Cần remesh/simplify có bound hoặc chặn đúng lý do; không bỏ kiểm degeneracy |
| P1-04 | Nhận thiếu hợp đồng; đã khai và kiểm primary lease | Build chuyển một lease cho caller; acquire chỉ thêm reader. Runtime ABI 2/header và vòng 24 acquire/release giữ đúng cân bằng |
| P2-03 | Nhận; generation-tagged cancel và Worker watchdog đã triển khai | Cancel N không hủy N+1; native/control và browser cancel/retained-generation. Chi tiết progress/native checkpoints còn ở P2-04 |
| P2-04 | Nhận; đã tối ưu phần paint và thêm checkpoint, input cực lớn còn mở | Bỏ union lặp của mọi vùng phía sau; lọc bounds trước Difference. Probe native 4.096 ô đạt khoảng 0,08 s, contour 8.000 điểm khoảng 0,04 s; 200.000 điểm vượt 25 s. Checkpoint native có progress/cancel giữa các pha, nhưng một lệnh thư viện dài vẫn cần Worker watchdog. Không suy các số đo này tương đương toàn bộ corpus reviewer |
| P2-05 | Nhận; sửa ca mất vùng đã biết, outcome tổng quát còn mở | Clipper2 bỏ triangle có edge lệch <2 grid unit hai trục. Nay raw input bị chặn có mã riêng, kể cả cạnh vuông khác. Chưa coi việc này chứng minh mọi boolean không mất vùng |
| P2-06 | Nhận rủi ro diễn giải; giữ ledger là topology **phẳng** | Shared XY edge không chứng minh tiếp xúc 3D khi Z khác. Slab/mechanics phải có kiểm tiếp xúc riêng; đã đưa vào yêu cầu tích hợp |
| P2-07 | Nhận; đã sửa | Reset generation tăng đơn điệu; publish cũ không đổi trạng thái job mới. Có native regression |
| P2-08 | Nhận khoảng trống ở snapshot cũ; đã có runtime thực và tests | Rust+C++ WASM, native ABI, Node và ba browser. Không lấy test của snapshot mới để nói reviewer đã đọc nó |
| P2-09 | Nhận; hợp đồng đã tách đúng tầng, tích hợp UI còn mở | AppBridge 0.3; EngineClient/runtime ABI 2 quản lease/Worker. ThreeViewport chỉ mượn buffer đồng bộ để tạo GPU arrays; không nhận ownership. Component UI không đọc memory protocol trực tiếp |
| P2-10 | Nhận; ledger sai số output tổng quát còn mở | f32 ở tọa độ gần 10000 mm tiêu tốn đáng kể budget. Các fixture nhỏ có bound riêng; không suy thành fit qualification |
| P2-11 | Nhận; đã bổ sung và kiểm dependency của Cargo | build.rs theo dõi từng static archive bằng rerun-if-changed. verify-link-freshness.ps1 ghi lại archive của phiên với cùng bytes rồi chứng minh Cargo báo Dirty/relink. Đây là kiểm dependency graph, không phải phép thử thay thuật toán C++ |
| P2-12 | Nhận phần offline/hash/license; không nhận nhận định revision trôi | Revision Clipper2 vốn được Manifold pin. Nay có archive SHA, original/derived riêng, carry patch/license bền, CMake downloads OFF và tree hash |
| P3-11 | Nhận; đã sửa | Chọn trục lớn hơn khi tạo anchor tránh overflow giả; native regression gần đường đứng trong miền |
| P3-12 | Nhận; đã sửa | StripDuplicates sau boolean và kiểm output trước dựng line keys |
| P3-13 | Nhận hardening; đã sửa | checked_slice xử lý count=0 không dereference null; count>0 kiểm pointer/alignment |
| P3-14 | Không nhận việc tiếp tục sau panic như mặc định an toàn; giữ open về fault recovery | Panic nội bộ làm Worker hỏng thì controller phải loại Worker, không tiếp tục trạng thái không tin cậy. Chưa có chứng cứ user input hợp lệ làm poison Mutex |
| P3-15 | Nhận hardening đóng gói; còn mở | Export test-fixture WASM đã có feature gate; cần loại helper/harness khỏi build sản phẩm cuối và pin corpus manifest |
| P3-16 | Nhận; đã sửa | Error truncate theo ký tự UTF-8; test 300 chữ ế giữ 510 byte hợp lệ |
| P3-17 | Nhận yêu cầu ledger, không suy lỗi rounding từ input đã là integer | SVG qua quantize_mm ties-to-even và metadata grid; các nguồn khác phải chứng minh ở adapter của chúng |
| P3-18 | Nhận gaps; mở theo nhóm | Bổ sung ca source/clip/lease/lifetime/failure; nguồn phức tạp, resource/DoS, fit và slicer vẫn theo các gate riêng |

Ca bác đề xuất P1-03 có các điểm XY (mm):
`(-74.268919,-66.963629)`, `(-74.247878,-66.986958)`,
`(-74.258400,-66.975295)`. Sau `Math.fround` cho mỗi tọa độ, tích có hướng bằng
0 dù cả ba điểm khác nhau. Đây là suy biến của **tọa độ đầu ra**, không chỉ
lỗi lưu pháp tuyến. Chưa đóng phát hiện bằng cách tạo một tệp sai hình học.

Tình trạng: **chưa nghiệm thu toàn mốc và chưa sẵn sàng phát hành**. Những
phần đã sửa phải được reviewer đọc lại ở snapshot mới sau khi hoàn thiện các
điểm mở. Trạng thái đang chạy ở [PLAN](../../development/PLAN.md).
