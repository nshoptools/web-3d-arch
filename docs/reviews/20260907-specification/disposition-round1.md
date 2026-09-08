# Phân xử phản biện vòng đầu

Các [nhận xét Opus](opus-round1.md) và [nhận xét Grok](grok-round1.md) được
biên tập thành bản tổng hợp có vấn đề, quyết định và điều khoản hiện hành.
Không nhận mọi nhận xét là đúng; bằng chứng và lý do phân xử được ghi dưới đây.

## Opus

| ID | Quyết định | Cách xử lý / giới hạn |
| --- | --- | --- |
| OPR-01 | Chấp nhận | ACC-01/02: vòng đời, owner/member, phân quyền server và owner cuối |
| OPR-02 | Chấp nhận | ACC-03/04: local store/lock theo user, logout, callback muộn, máy dùng chung |
| OPR-03 | Chấp nhận | AI-01/02: BYOK, vault riêng, không key owner fallback hoặc key trong ZIP |
| OPR-04 | Một phần | AI-03/04: estimate/actual/unknown/reservation và ngân sách; owner không mặc nhiên được xem chi tiêu/prompt riêng |
| OPR-05 | Một phần | Idempotency theo operation và provider; cache kết quả riêng không giải timeout sau gửi; giữ unknown, không hứa exactly-once |
| OPR-06 | Một phần | WEB-01 có chẩn đoán và cứu dữ liệu khi thiếu COI/SAB; không bắt buộc copy fallback chưa spike; user cài riêng không nghĩa self-host |
| OPR-07 | Chấp nhận có giới hạn | EXT-01/04 registry/capability và recipe có schema; thêm loại UI hoàn toàn mới vẫn có thể cần component mới, không hứa mọi mở rộng chỉ đổi JSON |
| OPR-08 | Chấp nhận | Bổ sung các tệp còn thiếu; runner bảo toàn summary/exit khi thiếu acceptance manifest; kiểm tự động riêng |
| OPR-09 | Một phần | WEB-01 loại auth redirect/login khỏi cache; ACC-04 lease 24 giờ rồi cứu dữ liệu. Không cho quyền offline vô hạn theo đề xuất |
| OPR-10 | Một phần | Scope system/user/device/project và precedence ACC-03; profile hiệu chuẩn được đồng bộ nhưng pin đúng máy, không mặc nhiên mọi profile là device-only |
| OPR-11 | Chấp nhận | EXT-03 version tách biệt, preserve byte/version lạ, migration copy-on-write và orphan ID; fixture migration trước cổng triển khai |
| OPR-12 | Một phần | Danh mục 126 field đã đóng gói; 0,05/0,02 cần quyết định grid; 1,7/5,50 mm giữ nominal khi phù hợp, không snap ngầm. GEO-02, O-02. |
| OPR-13 | Chấp nhận | UI-06 các khoảng nửa mở, không chồng biên 720/1023/1180/1400 |
| OPR-14 | Chấp nhận | Đọc được/target/reflow thắng token px, kiểm zoom và nhìn thật |
| OPR-15 | Chấp nhận | 8 font chỉ danh sách cá nhân; font đóng gói theo trần riêng, không xóa font referenced |
| OPR-16 | Chấp nhận | EXP-02 định danh cửa chặn theo capability, giữ quyền/parser/security ngoài quyền bỏ qua cảnh báo |
| OPR-17 | Chấp nhận | 55 điều khoản liên kết 40 chiến dịch/113 check có prerequisite, phương pháp/ngưỡng riêng; chưa thực thi sản phẩm. |
| OPR-18 | Chấp nhận có cổng | GEO-02 bound intermediate và miền an toàn thư viện; O-01 pin/đo trước khóa ABI; không đổi scale bằng phỏng đoán |
| OPR-19 | Chấp nhận | EDT-01 quy định bảy công cụ; README dẫn bộ đặc tả hiện hành. |

**Đính chính:** danh mục có đầy đủ 126 field; bộ fixture có hai gói 3MF thực.
Nhận xét cho rằng không có dữ liệu tương ứng không được chấp nhận.

## Grok

| ID | Quyết định | Cách xử lý / giới hạn |
| --- | --- | --- |
| G-01 | Chấp nhận | Hoàn thiện nghiệm thu, truy vết, matrix và báo cáo |
| G-02 | Chấp nhận | GEO-01/02 giữ curves nguồn, polygon trước boolean có bound; không chỉ polygon lúc xuất |
| G-03 | Chấp nhận | VEC-01 graph màu/clip/transform; manufacturing conversion có chấp nhận |
| G-04 | Chấp nhận | Catalog/lock và INPUT-CONTRACT quản lý tài nguyên; giữ đủ font nguồn nguyên bản |
| G-05 | Một phần | Hai JS settings và hai gói 3MF là fixture bền riêng biệt. Parse hoặc đếm key không chứng minh roundtrip; OUT-01 quy định mức kiểm. |
| G-06 | Một phần | WEB-01 chẩn đoán thiếu COI/SAB và cứu dữ liệu; cài đặt cá nhân không đồng nghĩa tự vận hành host |
| G-07 | Chấp nhận | ACC/AI riêng, người dùng trả nhà cung cấp qua key của chính mình |
| G-08 | Chấp nhận có cổng | CSG mesh hợp lệ, metric chọn đích/tie-break và migration impVox phải chốt O-02; input hở không tự voxel/repair |
| G-09 | Một phần | Budget tính toán tách nhiễu raster và độ chính xác vật in; không nhận µm thành độ chính xác tổng hoặc ép một resolution slicer phổ quát |
| G-10 | Chấp nhận | HarfBuzz đã vendor; thay shaper phải chứng minh tương đương đầy đủ |
| G-11 | Chấp nhận | STO-01 một head commit atomic và canonical geometry; byte deterministic có điều kiện |
| G-12 | Chấp nhận | EXT registry/job/artifact/adapter, mở rộng khỏi slab khi cần |
| G-13 | Chấp nhận | Bảy công cụ; camera ≠ print transform; tương thích slicer theo version/test |
| G-14 | Một phần | Danh mục 126 field chứa đủ số ứng viên, còn ngữ nghĩa/dependency và migration ở O-02; không snap Z hoặc clearance ngầm. |
| G-15 | Chấp nhận | Mọi tỷ lệ đạt phải có corpus/hash và record thực thi; fixture lỗi có expected rejection, không đổi thành golden. |
| G-16 | Một phần, bác một mệnh đề | O-01 spike toolchain là cần. Bác câu Clipper2 không có C export chính thức: upstream có clipper.export.h, dẫn nguồn trong [sổ quyết định](../../specs/05-quyet-dinh-va-truy-vet.md) |
| G-17 | Một phần | Phân biệt Core/project metadata và reader độc lập; 3MF Core là nền của adapter, chưa thêm nút xuất thứ tám ngoài yêu cầu v1 |
| G-18 | Một phần | Pin profile, kiểm resolution/arc-fitting/compensation qua slicer. Không ép tắt arc fitting toàn cục hoặc lấy toolpath làm đo vật in |

Không nhận suy luận offset dương “không nên làm co lỗ” nếu thiếu định nghĩa
chiều offset: tăng miền vật liệu thường làm lỗ nhỏ đi. GEO-02/03 kiểm sign theo
chốt/lỗ và lượng khe, không chép một quy tắc dấu từ lời phản biện.

## Kết luận trực tiếp của biên tập viên

| ID | Xử lý |
| --- | --- |
| C-01, C-11 | ACC-01–04 và AI-01–04 |
| C-02, C-12 | QA-01–04, matrix/cases và báo cáo có giới hạn |
| C-03 | Danh mục đầy đủ 126 field, giữ O-02 cho ngữ nghĩa chưa chứng minh |
| C-04, C-05 | U1 mapping lỗi, hai gói cùng mesh hash; O-06 |
| C-06 | Nominal/layers và first-layer schedule GEO-02 |
| C-07 | Curves nguồn, polygon có bound trước boolean |
| C-08 | EXT-01–05 và EXP-03 |
| C-09 | Bed polygon/exclusion/provenance, profile tham khảo |
| C-10 | Bảy công cụ và tách field/control |
| C-13 | MOD-01 đổi loại có preview, giữ overrides, undo |
| C-14 | Chuyển đổi có nguồn/provenance/preview/chấp nhận, không bỏ lỗ/dấu ngầm |

“Đã xử lý trong tài liệu” không nghĩa công cụ hoặc sản phẩm đã vượt phép kiểm.
Điểm đòi thực nghiệm được chuyển thành cổng có bằng chứng phải nộp; không xóa
điểm mở để làm báo cáo xanh.
