# Quyết định hiệu đính, nguồn và truy vết

Thuộc [đặc tả 1.0.1](README.md), cập nhật ngày 2026-09-08. “Chấp nhận” ở đây là chọn yêu cầu
thiết kế; “đã kiểm” luôn kèm phép đo riêng. Mỗi quyết định dưới đây nêu đủ
lý do và điều khoản áp dụng; không cần mở một tài liệu soạn thảo khác để hiểu.

## Quyết định đã chốt cho đường cơ sở

| ID | Hiệu đính / lý do | Điều khoản áp dụng |
| --- | --- | --- |
| D-01 | Web nội bộ có dịch vụ identity/settings/AI; hình học cục bộ. Bỏ “chỉ máy chủ tĩnh” | FND-02, ARC-01, ACC-01 |
| D-02 | Owner quản users; mỗi user tự cấu hình và trả provider bằng kết nối riêng; không key/credit chung | ACC-02/03, AI-01–04 |
| D-03 | Catalog/lock và INPUT-CONTRACT là căn cứ tài nguyên; giữ full font và Noto màu | SRC-02/04, LIC-01 |
| D-04 | Giữ bảy công cụ2D, không sáu; tất cả là lệnh có undo | EDT-01 |
| D-05 | Giữ source curves, polygon dẫn xuất trước boolean/offset có tolerance; Clipper2 không là boolean cung | GEO-01/02 |
| D-06 | Bỏ “chỉ làm tròn một lần”; kiểm overflow, bound và ledger từng bước | GEO-02, ABI-01 |
| D-07 | Graph màu/clip giữ nguồn; manufacturing regions là chuyển đổi có chấp nhận | VEC-01 |
| D-08 | SVG nguồn thiếu fill-rule có mặc định nonzero; buffer chuẩn hóa phải ghi rule | VEC-01 |
| D-09 | Layer-bound dùng số lớp; kích thước nominal giữ mm khi cần; first layer thuộc schedule | GEO-02, MOD-03 |
| D-10 | Kích thước MX/ngàm/charm và bước khe là preset thử, coupon mới chứng minh fit | GEO-03 |
| D-11 | Ngân sách µm là mục tiêu tính toán, không độ chính xác máy hoặc mọi raster | GEO-02, QA-02 |
| D-12 | Khóa C ABI/schema sau spike Rust/C++/WASM; shared memory baseline, không hứa zero-copy toàn ứng dụng | ARC-01, ABI-01, WEB-01 |
| D-13 | Commit kéo+ack; một head atomic, không transaction xuyên OPFS/IDB; byte deterministic có điều kiện | STO-01, DAT-01 |
| D-14 | Phân biệt parse/mesh/slicer/physical; fail/unverified/unsupported không đổi thành pass | QA-01–03, EXP-02 |
| D-15 | JS profile và gói3MF là hai loại mẫu; số582/549 không bằng roundtrip. Mẫu U1 có khe5/6 thiếu filament → fixture lỗi | OUT-01, EXT-04 |
| D-16 | Mảng cấu hình theo từng key; không resize theo length. Bed polygon/vùng cấm, không bbox | EXT-04, EXP-03 |
| D-17 | Cài đặt local theo user, session/credential/server quyền theo request; offline không thu hồi từ xa tức thì | ACC-01–04 |
| D-18 | Không hardcode chỉ bảy exporter/hai slicer trong kiến trúc; version/capability/job/artifact có hợp đồng | EXT-01–05 |
| D-19 | Token px là điểm xuất phát; a11y đọc được/target/reflow thắng bố cục cứng; benchmark cần corpus/version để chứng nhận | UI-01–06 |
| D-20 | Không cắt văn bản âm thầm, không lấy MIME làm decoder, không xóa font còn referenced | SRC-01/04, LIM-01 |
| D-21 | 126 field có trong mẫu tham chiếu, đã kiểm type/domain/default; còn thiếu semantics/dependency mới | MOD-03, danh mục06, O-02 |
| D-22 | Không dùng G-code hoặc machine profile tự khai làm chứng cứ in; fixture không được execute | OUT-01, QA-02 |
| D-23 | Không khẳng định mọi copyleft “lây”, mọi LGPL chỉ dynamic; kiểm license/component/cách phân phối đúng bản | LIC-01 |
| D-24 | Không ép framework frontend, vendor hosting, số người/hiệu năng hoặc thuật toán thay thế chưa đo thành quyết định đã chứng minh | ARC-01, O-01/04/05 |
| D-25 | Mặc định cá nhân không sửa snapshot cũ; đổi loại giữ overrides hoặc công bố diff trong lệnh atomic | ACC-03, MOD-01/02 |
| D-26 | Không xem từng ý kiến ghế là chân lý: phân xử bằng nguồn/phép đo, ghi chấp nhận một phần hoặc bác bỏ | QA-04, báo cáo review |
| D-27 | Logout private giữ byte; shared cần backup hoặc xác nhận xóa, policy-blocked không fallback; lock qua schema và ngân sách từng đơn vị/kỳ | ACC-03/04, AI-03 |
| D-28 | CSG có nhánh mesh-scene, đích/vật liệu/orphan; cho cả năm loại, không kế thừa giới hạn keychain của danh mục parameters-core-v1 | GEO-04, EXT-01 |
| D-29 | Lịch lớp là snapshot dự án có datum; đổi máy có diff; 113 check riêng thay oracle chung; U1 lỗi không là golden | GEO-02, QA-04, EXP-02 |
| D-30 | Yêu cầu, danh mục và bằng chứng được lưu bền; truy vết bằng ID yêu cầu–quyết định–check, fixture được đóng gói và kiểm hash | QA-04, MOD-03, OUT-01 |

## Điểm cần kiểm trước khi triển khai hoặc cấp nhãn

Đây là backlog **kiểm chứng có cổng**, không câu hỏi buộc chủ dự án trả lời hết
ngay. Người triển khai tự làm spike/đo trong phạm vi được giao, cập nhật ADR và
case; chỉ cần quyết định của owner nếu thay mục tiêu, chi phí hoặc phạm vi.

| ID | Thiếu gì / người phụ trách | Đóng bằng gì | Chặn gì |
| --- | --- | --- | --- |
| O-01 | Nhóm core: toolchain Rust+Clipper2+Manifold+HarfBuzz, graph màu, ownership, memory | Pin phiên bản, build native+WASM, corpus/oracle/error budget | Khóa ABI và phát hành nhân; không chặn thiết kế hợp đồng |
| O-02 | Nhóm domain: chuyển126 field trong danh mục thành schema chính thức, dependency, auto0, Z, impVox/strapSeg, text/override fields | Field-level disposition, constraints/defaults, migration dry-run và boundary/interaction cases | Sinh binding và triển khai nhóm chưa có schema; không chặn core spike |
| O-03 | Nhóm geometry/đo: máy/vật liệu/phần cứng, clearance sign, coupon/force/endurance | Raw measurements, dụng cụ,3 lần in/cấu hình, tiêu chí fit định trước | Nhãn lắp vừa/độ chính xác vật in |
| O-04 | Nhóm web: baseline thiết bị/browser, tổng bộ nhớ, số user/concurrent, thời gian hủy và worst input | Benchmark có hardware/version/input hash và SLO cụ thể | Tuyên bố hiệu năng, nới resource limits |
| O-05 | Nhóm vận hành cùng owner: nhà cung cấp identity/host/DB/secret store/AI adapters | ADR giá/plan/region/rights, security/COI/backup drill; owner duyệt chi phí thực | Deploy/mở AI dùng thật; không chặn viết spec hoặc test double |
| O-06 | Nhóm export: hai slicer/version, first-layer, U1 slot mapping, quyền nguồn profile/bed | Mẫu sạch+schema+roundtrip/slice preview và nguồn pin | Nhãn tương thích profile tương ứng; không chặn export trung tính |

Session12h/idle60m, lời mời7ngày, offline24h, URL5phút, dedup30ngày, audit90ngày,
backup purge30ngày và RPO24h/RTO8h là **policy v1 do biên tập lựa chọn**, không
khẳng định user đã đưa các số đó. Chúng là cấu hình có version và giới hạn ở07/08;
thay policy phải sửa acceptance tương ứng. Hạn mức tiền/người không tự bịa:
user/owner phải cấu hình khi mở AI thực tế.

Mode private mặc định, ngưỡng phát hiện lùi đồng hồ 5 phút và trần font tự nạp
128 MiB/dự án cũng là quyết định đường cơ sở, không số chủ dự án đã yêu cầu
hoặc độ an toàn đã đo. Thay chúng cần cập nhật quyết định/ca kiểm tương ứng.

## Nguồn chính thức đã đối chiếu

Ngày truy cập2026-09-07. URL động giải thích ngữ nghĩa, **không là dependency lock**;
trước build phải pin revision/version như AGENTS. Không lấy brochure/library
guarantee thay phép kiểm pipeline của dự án.

| Nguồn | Điểm dùng để hiệu đính |
| --- | --- |
| [SVG2 painting](https://www.w3.org/TR/SVG2/painting.html#FillRuleProperty) | fill-rule mặc định, paint/stroke/opacity |
| [Clipper2 overview](https://angusj.com/clipper2/Docs/Overview.htm) | boolean/offset trên polygon |
| [Clipper2 export header](https://github.com/AngusJohnson/Clipper2/blob/main/CPP/Clipper2Lib/include/clipper2/clipper.export.h) | Có export interface chính thức; bác phát biểu không có bất kỳ C interface nào |
| [Manifold](https://manifoldcad.org/docs/html/) | Điều kiện input manifold, C/WASM support; không phải repair mọi mesh |
| [3MF Consortium](https://3mf.io/spec/) | Core/Materials/Production là các contract khác metadata project slicer |
| [BambuStudio upstream](https://github.com/bambulab/BambuStudio) | Nơi phải pin adapter/profile đích |
| [Snapmaker Orca upstream](https://github.com/Snapmaker/OrcaSlicer) | Nơi phải pin schema/profile U1; không chứng minh mẫu người dùng đúng |
| [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) | secure context/cross-origin isolation, chia sẻ memory |
| [WCAG2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | 24 CSS px và ngoại lệ; không thay điều kiện keyboard/contrast |
| [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Least privilege, deny default, kiểm mỗi request |
| [OWASP Secrets](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) | Vòng đời, mã hóa, least privilege, rotation/audit secret |

Nguồn licensing cụ thể vẫn là LICENSE/notices/lock của từng asset trong repo.
Các câu về giá/model AI lịch sử không được sao chép thành danh sách sản phẩm
đang hỗ trợ. Cấu hình review và nguồn OpenAI/Anthropic/xAI ở báo cáo review,
không dùng model của ghế làm model AI mặc định của website.

## Truy vết

[traceability.json](traceability.json) nối từng requirement ID với tài liệu,
quyết định thiết kế và check ID trong bộ nghiệm thu. Bản ghi có nội dung yêu cầu
ngắn, không dùng số dòng của một văn bản bên ngoài làm khóa. Các lần sửa phải
cập nhật liên kết hai chiều cùng ca kiểm và lý do quyết định.

[source-manifest.json](source-manifest.json) chỉ liệt kê dữ liệu bền đã đóng gói:
danh mục 126 field, hai cấu hình slicer, hai gói 3MF và danh mục bàn in. Mỗi mục
có ID, đường dẫn hiện hành, số byte, hash, mục đích và mức xác minh. Không có
manifest nào được coi là thay thế cho tệp đầu vào cần đọc. Chi tiết ở
[báo cáo dữ liệu](../reviews/20260907-specification/source-audit.md).

Kết luận phản biện được trình bày cùng vấn đề và cách xử lý trong hồ sơ review.
Chỉnh sửa sau review ghi riêng; không nhận đó là một vòng phê chuẩn mới.
