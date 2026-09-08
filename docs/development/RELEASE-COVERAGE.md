# Release coverage inventory — 2026-09-08

Đây là implementation audit trong phòng riêng, **không phải review độc lập, chứng nhận hoặc quyết định phát hành**. Đối chiếu toàn bộ **55 yêu cầu /40 chiến dịch /113 check ID**. Mốc chính state v15; cập nhật v16 (ngừng Opus) và v17 được chụp riêng. JSON giữ action/expected/oracle, nguyên văn clause, hash/line/path và công việc cho từng check.

Chưa có bằng chứng kết thúc whole-app trên artifact hiện hành trong phạm vi đã đọc. Partial không nghĩa “chưa làm gì”: nhiều core/HTTP/Worker đã chạy thật. Số assertion hoặc MockBridge không là tỷ lệ hoàn thành yêu cầu. [QA-01–04](../../docs/specs/04-nghiem-thu.md) yêu cầu đúng input/version/oracle.

Liên kết repo dùng vị trí sau promotion tại docs/development. Candidate và input đã chụp ở tmp/reviews/codex/runs/20260908-release-coverage-inventory; JSON filePins giữ snapshot/hash để đọc đúng phiên bản khi main thay đổi.

## Có thể bàn giao website ở mức nào

Có thể bàn giao **artifact bất biến để đánh giá nội bộ**, kèm phạm vi chưa hoàn tất và capability bị chặn đúng lý do. Đây không phải nghiệm thu v1 hay xác nhận G4. Trước khi mở dịch vụ cho thành viên, parent vẫn phải xác minh auth/ownership/BYOK không thu phí chéo, dữ liệu và điều kiện vận hành của host; inventory không thay review bị từ chối.

Có thể giữ target3MF chưa qualified/fit chưa đo, thiếu key hoặc renderer ở trạng thái rõ ràng mà không khóa SVG/STL/PNG độc lập hợp lệ. Không dùng gating để gọi CSG chưa nối, text/edit adoption bị lỗi hoặc STL bình thường chưa xuất được là “v1 hoàn tất”. Các guard P1/P2 v17 cần adjudicate đúng dependency và phạm vi reachable; không tự suy đã gây lỗi toàn app, cũng không bỏ qua bằng corpus pass.

**Giới hạn lượt này:** chốt theo yêu cầu thời gian; đầy đủ ID/truy vết nhưng coverage là partial. Không chạy lại sản phẩm, browser, benchmark, slicer hay review. Parent có thể dùng bản này ngay để ưu tiên và tạo package tiếp theo.

## Cổng và phạm vi quyết định

**G4 mở ứng dụng nội bộ** cần chức năng bắt buộc, tài khoản/settings/BYOK, auth isolation/không thu phí chéo, a11y, recovery và resource tests. **G5** cho nhãn từng slicer/profile; **G6** cho lời bảo đảm fit của đúng cấu hình. Normal source/text/edit/CSG/STL thiếu đường chạy là gap chức năng, không miễn bằng nhãn “unsupported”. Không đòi chứng minh mọi geometry hoặc in coupon để mở các điều khiển digital độc lập.

**G3** — [docs/specs/08-mo-rong-va-lo-trinh.md:106](../../docs/specs/08-mo-rong-va-lo-trinh.md)

> | G3 — chức năng nguồn và cơ khí | Bốn họ, raster/vector/chữ/màu, schema/lịch sử | Nhóm tham số có schema thẩm định; fixture/migration; fit còn nhãn chưa đo nếu thiếu coupon |

**G4** — [docs/specs/08-mo-rong-va-lo-trinh.md:107](../../docs/specs/08-mo-rong-va-lo-trinh.md)

> | G4 — ứng dụng nội bộ | UI đủ bảy công cụ, tài khoản/settings/BYOK, save/export | Auth isolation, không thu phí chéo, a11y/recovery/resource tests đạt |

**G5** — [docs/specs/08-mo-rong-va-lo-trinh.md:108](../../docs/specs/08-mo-rong-va-lo-trinh.md)

> | G5 — xuất theo máy | Hai adapter đích, đọc lại/slice/preview/material mapping | Từng slicer/version đạt độc lập; profile chưa đạt không mở như đã hỗ trợ |

**G6** — [docs/specs/08-mo-rong-va-lo-trinh.md:109](../../docs/specs/08-mo-rong-va-lo-trinh.md)

> | G6 — nhãn lắp vừa | Coupon, bản in, vật liệu/phần cứng/dụng cụ và raw measurements | Đạt tiêu chí đã khai cho đúng cấu hình; không mở rộng lời bảo đảm sang máy khác |

**O-01** — [docs/specs/05-quyet-dinh-va-truy-vet.md:50](../../docs/specs/05-quyet-dinh-va-truy-vet.md)

> | O-01 | Nhóm core: toolchain Rust+Clipper2+Manifold+HarfBuzz, graph màu, ownership, memory | Pin phiên bản, build native+WASM, corpus/oracle/error budget | Khóa ABI và phát hành nhân; không chặn thiết kế hợp đồng |

**O-03** — [docs/specs/05-quyet-dinh-va-truy-vet.md:52](../../docs/specs/05-quyet-dinh-va-truy-vet.md)

> | O-03 | Nhóm geometry/đo: máy/vật liệu/phần cứng, clearance sign, coupon/force/endurance | Raw measurements, dụng cụ,3 lần in/cấu hình, tiêu chí fit định trước | Nhãn lắp vừa/độ chính xác vật in |

**O-04** — [docs/specs/05-quyet-dinh-va-truy-vet.md:53](../../docs/specs/05-quyet-dinh-va-truy-vet.md)

> | O-04 | Nhóm web: baseline thiết bị/browser, tổng bộ nhớ, số user/concurrent, thời gian hủy và worst input | Benchmark có hardware/version/input hash và SLO cụ thể | Tuyên bố hiệu năng, nới resource limits |

**O-05** — [docs/specs/05-quyet-dinh-va-truy-vet.md:54](../../docs/specs/05-quyet-dinh-va-truy-vet.md)

> | O-05 | Nhóm vận hành cùng owner: nhà cung cấp identity/host/DB/secret store/AI adapters | ADR giá/plan/region/rights, security/COI/backup drill; owner duyệt chi phí thực | Deploy/mở AI dùng thật; không chặn viết spec hoặc test double |

**O-06** — [docs/specs/05-quyet-dinh-va-truy-vet.md:55](../../docs/specs/05-quyet-dinh-va-truy-vet.md)

> | O-06 | Nhóm export: hai slicer/version, first-layer, U1 slot mapping, quyền nguồn profile/bed | Mẫu sạch+schema+roundtrip/slice preview và nguồn pin | Nhãn tương thích profile tương ứng; không chặn export trung tính |

**EXP-02-route** — [docs/specs/01-chuc-nang.md:262](../../docs/specs/01-chuc-nang.md)

> Chỉ cửa chặn có liên quan tới dữ liệu đường xuất mới áp dụng: PNG cần renderer,
> mesh/3MF cần mesh snapshot, SVG nguồn cần snapshot vùng đã commit; không ép SVG
> nguồn phải dựng 3D trước. Mỗi cửa nêu nguyên nhân, đối tượng và cách sửa. Quyền

**EXP-02-inspection** — [docs/specs/01-chuc-nang.md:268](../../docs/specs/01-chuc-nang.md)

> Kiểm mesh độc lập sau mỗi lần dựng và nhắc đúng lúc xuất. `fail` hình học được
> phân biệt với `unverified` (thiếu công cụ/vượt tài nguyên). Bản **xuất để kiểm tra**
> có thể cho người dùng tiếp tục khi mesh fail/unverified nhưng serializer vẫn
> viết được định dạng hợp lệ; nhãn không bảo đảm in, cảnh báo giữ trong bảng kê,

**EXP-02-invalid** — [docs/specs/01-chuc-nang.md:272](../../docs/specs/01-chuc-nang.md)

> không đánh dấu đạt. Nếu serializer không tạo được cấu trúc hợp lệ thì chặn.
> Giữ ý định “cảnh báo cho người thiết kế tiếp tục” nhưng không cho nhãn “sẵn sàng

**QA-04-P1** — [docs/specs/04-nghiem-thu.md:105](../../docs/specs/04-nghiem-thu.md)

> Trước cổng phát hành, ghi phạm vi, remaining issues và người chịu trách nhiệm;
> không còn lỗi bảo mật/tính phí/mất dữ liệu/serializer P1 trong scope. Quyết định
> chưa có phép đo chặn đúng capability/nhãn tương ứng như O-01–O-06, không biến
> mọi thiếu máy in thành lý do không làm tiếp phần độc lập. Chi tiết review và

**EXT-05-ops** — [docs/specs/08-mo-rong-va-lo-trinh.md:121](../../docs/specs/08-mo-rong-va-lo-trinh.md)

> Vận hành có version inventory, health của dịch vụ, log loại secret, backup/restore
> và rollback drill. Mục tiêu khởi điểm metadata/settings cloud RPO 24 giờ/RTO
> 8 giờ, phải đo trước phát hành; project local chưa mirror không có cam kết cloud
> RPO. Mọi số hiệu năng và số người đồng thời cần benchmark phần cứng/network cụ

Diễn giải để parent adjudicate: file cấu trúc hợp lệ có thể giữ verdict/cảnh báo “xuất kiểm tra” theo EXP-02; serializer invalid, source/authority sai, security và mapping máy invalid vẫn chặn đúng route. Thiếu WebGL chỉ chặn PNG/pick/đo; thiếu key chỉ chặn Generate. Cloud project backup/mirror là capability tùy chọn có lý do/ZIP thay thế; đồng bộ settings, nguồn referenced và local recovery vẫn là v1. RPO/RTO phải đo trước phát hành dịch vụ trên môi trường đã chọn; SQLite synthetic không thay phép đo đó.

## Việc cần ưu tiên

| Ưu tiên | Phạm vi | Việc còn làm / người nhận |
|---|---|---|
| P-A (1) | Required digital functionality / G3→G4 | Hoàn tất actual import/add/union/subtract cho cả5 loại, target/material/orphan/history và post-CSG final scene. Current engine vẫn available:false. Parent + root CSG owner; không phụ thuộc máy in — [E27](#e27) |
| P-B (1) | Required source/edit functionality / G3→G4 | Hoàn tất source datum/negative text frame, atomic text recapture và raster erase/reconversion identity. Sau đó chạy7tools + accepted source SVG trước3D + save/reopen trên actual app. Parent + source-adoption/root owners — [E03](#e03), [E08](#e08), [E25](#e25) |
| P-C (1) | Required normal export / G4 | Nối executable float-conditioning proposal/rebase với exact head/consent/current final scene; default STL có đường hợp lệ hoặc proposal dùng được, không biến refusal thành feature pass. Parent + final-export adapter owner — [E10](#e10), [E09](#e09) |
| P-D (1) | Exact current source/artifact and geometry findings / G1→G4 | Tách kiểm native/same-WASM/current wrapper/current compiled app. Giải quyết Firefox navigation, điều tra81model deadline theo từng case, repackage sau integrations. v17 thêm guard P1/P2 cần locked-dependency reproduction/adjudication;52model cross-author pass không phủ định finding. Parent/root owners + full-app acceptance owner — [E24](#e24), [E26](#e26), [E09](#e09) |
| P-E (2) | Required UI accessibility and actual flows / G4 | Giữ UI authored work, nhận Grok/Codex handoff; đóng UI-R1-05..08 và kiểm actual control/IME/Escape/disabled reasons/units/reflow/contrast/screen reader. Không dùng hoặc resume Opus. Parent + current UI owner — [E16](#e16), [E28](#e28) |
| P-F (2) | Required data/offline/identity acceptance / G2→G4 | Thực hiện kill matrix đúng AT-015.1, ZIP đầy đủ referenced font/mesh, private/shared logout, profile/settings ABA+ETag, cache population và signed offline lease trên current artifact. Mirror/cloud optional phải ghi unavailable rõ. Parent/storage/application acceptance owner — [E13](#e13), [E14](#e14), [E21](#e21), [E23](#e23) |
| P-G (2) | Internal managed service enablement / G4/O-05 | Rerun current backend/profile delta với2members+owner and actual HTTP/UI; parent adjudicates security/cost/data/serializer P1. Review filter rejection là thiếu kết luận, không bằng chứng exploit; không retry route hoặc dùng inventory thay review. Cấu hình TLS/IdP/quota/key custody và đo backup RPO/RTO trước phát hành dịch vụ. Parent/owner/operator; live actions cần quyền riêng — [E18](#e18), [E19](#e19), [E20](#e20), [E21](#e21) |
| P-H (3) | Capability labels only / G5,G6,O-03,O-06 | Giữ target profile chưa qualified và fit chưa đo. Bambu chỉ2analytic slices; U1 chưa chạy. Khi có công cụ/máy/quyền phù hợp mới slice-preview/coupon theo exact config. Không dùng thiếu máy in để khóa SVG/STL/PNG đúng route. Parent decides target labels; operator/measurement campaign later — [E11](#e11), [E12](#e12), [E26](#e26) |

## Mốc nguồn và giới hạn phiên bản

- state v15 · 2026-09-08T10:56:41.739Z · SHA256 `aedf14b1bcf023ff98b427ead9ac464f60d762cc32dac92b851d249c7aa85888`.
- state v16 · 2026-09-08T11:11:27.083Z · SHA256 `f45403d3c617f0a3fad47e91f54901154b28aeddae1a07d500ed07cc60ee4489`.
- state v17 · 2026-09-08T11:38:53.621Z · SHA256 `f327043e92474f5e75edaff1dd4a63eb310cd8ba81820ad809050d746ca434e4`.

Current wrapper `64c5f89e2ee8fecda371436f907faf83e9120c41e11089979bd011bc8a197ed2`; WASM `f14689439108be1abfd6db77c06d758e08b172980313efe905d3a6d6d196287e` (5807077 bytes). Inventory chỉ hash byte; receipt build exit0 không là Worker/geometry acceptance. v16 ghi Chrome/WebKit pass, Firefox page navigation dừng trước geometry; lượt81model hết240s trước text/emoji. Không nới timeout để đánh xanh.

v17 là cập nhật sau cutoff: cross-author52native/52WASM models+parity và7surface controls/3cancel,224 main input matches; không độc lập review. Parent nhận2 guard findings P1/P2 (roof oblique slit residual; concave strap notch lateral breakout). Prepared-source ABI reachability đã báo, **full-app source generation chưa chứng minh**, dependency variant còn khác lock. Đây là candidate blocker cần reproduce/adjudicate đúng lock, không kết luận mới của inventory và không bị52pass phủ định.

Baseline artifact `1147ad94…` /prepared `136b8b90…` dùng64c5/b67d, compiled owned-byte Worker3/3 và HTTPS shell; khác currentf146. [docs/application-build/HANDOFF.md](../../docs/application-build/HANDOFF.md) ghi shell cachePaths rỗng, không qualify offline population; lần5/7 SOURCE_CHANGED và receipt thiếu APPLICATION_BUILD_INPUT giữ nguyên. Whole-app acceptance đang tiến hành; chưa dùng kết quả chưa có.

Backend136/136 là cohort 2026-09-08T05:15:40.1062276Z; hiện có 2 tệp khác hash. Rerun current source sau profile hardening; không cộng136 thành requirement pass. JSON backend136SourceDrift ghi từng hash.

## Cách đọc trạng thái

| Nhãn | Nghĩa |
|---|---|
| observed-pass | Named subcheck/campaign has executed evidence for its stated pinned cohort and scope; does not qualify later code/binary/artifact |
| partial | Meaningful component/integration evidence exists; remaining exact clause or current combined artifact work listed |
| unverified | No sufficient executed evidence for required method/scope, or harness/resource prevented execution |
| blocked | Known functional gap/finding or necessary upstream implementation prevents scoped acceptance; not automatically security severity |

Nhãn coverage (không phải % hoàn thành/release): requirement {"observed-pass":0,"partial":40,"unverified":3,"blocked":12}; campaign {"observed-pass":2,"partial":26,"unverified":1,"blocked":11}; check {"observed-pass":25,"partial":64,"unverified":8,"blocked":16}. Observed-pass chỉ mang phạm vi/hash của evidence. Full requirement được xét toàn clause, không tự đạt từ một check hẹp.

## Ma trận55 yêu cầu

| ID / nguyên văn tiêu đề | Status | Code/test/evidence | Clause còn cần xử lý / cổng |
|---|---|---|---|
| [FND-01 — Mục đích và phạm vi](../../docs/specs/01-chuc-nang.md) (line9) | blocked | [E09](#e09), [E14](#e14), [E26](#e26), [E27](#e27), [E28](#e28); [AT-001](#at-001) | G3/G4 cần đủ5 loại hoạt động từ nguồn thực và các lựa chọn bình thường; đây là phạm vi chức năng, không phải đòi fit đã đo. |
| [FND-02 — Khởi động, khả năng và offline](../../docs/specs/01-chuc-nang.md) (line22) | partial | [E21](#e21), [E23](#e23), [E24](#e24), [E13](#e13), [E14](#e14); [AT-002](#at-002) | Kiểm cả phát hiện capability, file:// và rescue UI. Entry hiện chọn allow-authenticated-online; chưa có bằng chứng tải bộ offline và lease cho artifact thật. |
| [FND-03 — Luồng hai bước, sáu khu vực](../../docs/specs/01-chuc-nang.md) (line35) | partial | [E09](#e09), [E14](#e14), [E26](#e26), [E27](#e27), [E28](#e28); [AT-001](#at-001) | Sáu khu/hai bước có UI và controller; điều hướng không phải transaction thiết kế. Cần lặp trên sản phẩm thật. |
| [SRC-01 — Nhập raster và SVG](../../docs/specs/01-chuc-nang.md) (line45) | partial | [E06](#e06), [E07](#e07), [E14](#e14), [E25](#e25), [E08](#e08); [AT-003](#at-003) | Giữ raster/SVG gốc, EXIF/alpha và các mức resolution; local PNG/JPEG/WebP khác subset PNG/JPEG của AI backend. Không lấy một codec refusal để nói thiếu toàn bộ local WebP. |
| [SRC-02 — Chọn và tìm emoji](../../docs/specs/01-chuc-nang.md) (line62) | partial | [E04](#e04), [E05](#e05), [E14](#e14); [AT-004](#at-004) | Cần lazy catalog/search không dấu/recent/favorite/collection và giữ chuỗi; không cần mọi emoji có nhãn in tốt. Không fallback glyph/font khác. |
| [SRC-03 — Tạo ảnh AI](../../docs/specs/01-chuc-nang.md) (line78) | partial | [E18](#e18), [E19](#e19), [E15](#e15), [E28](#e28); [AT-005](#at-005) | Tạo bằng ý định mới, exact consent dữ liệu/quote/reference, private result và đường sửa lỗi; live account/giá/plan thuộc O-05, AI thiếu kết nối không được khóa thiết kế. |
| [SRC-04 — Chữ và font](../../docs/specs/01-chuc-nang.md) (line93) | blocked | [E04](#e04), [E05](#e05), [E08](#e08), [E14](#e14), [E13](#e13); [AT-006](#at-006) | TTF/OTF gốc, quota font cá nhân khác font referenced trong project; shaping/layout/axes đúng chưa đủ nếu text edit/datum/beside placement không commit/reopen được. |
| [MOD-01 — Loại sản phẩm và mẫu](../../docs/specs/01-chuc-nang.md) (line123) | partial | [E02](#e02), [E14](#e14), [E18](#e18), [E11](#e11); [AT-007](#at-007) | Cả5 loại luôn có đường thủ công;11 preset mục tiêu cần manifest và test, không coi tên preset là proof. Mẫu cá nhân20 và precedence/undo phải kiểm UI. |
| [MOD-02 — Lớp màu, vật liệu và lựa chọn tay](../../docs/specs/01-chuc-nang.md) (line138) | blocked | [E02](#e02), [E06](#e06), [E09](#e09), [E08](#e08), [E25](#e25); [AT-008](#at-008) | Tách vùng/lớp Z/vật liệu/khe; màu hoặc thứ tự không là identity. NỀN chỉ thành phần nối biên; orphan và remap có quyết định. |
| [MOD-03 — Thông số và ràng buộc](../../docs/specs/01-chuc-nang.md) (line157) | partial | [E02](#e02), [E06](#e06), [E26](#e26), [E28](#e28); [AT-009](#at-009) | 126 field và2 replacement có schema không đồng nghĩa mọi knob tác động thật. Rà field→native→UI→oracle, các blocker O-02 cũ đối chiếu implementation v2 hiện tại. |
| [EDT-01 — Bảy công cụ 2D và lịch sử](../../docs/specs/01-chuc-nang.md) (line174) | blocked | [E03](#e03), [E06](#e06), [E14](#e14), [E25](#e25); [AT-010](#at-010) | Core7pixel tools không thiếu thuật toán; khoảng trống ở product integration sau edit, toàn bộ mode UI/history và đường vector theo đơn vị thiết kế. |
| [EDT-02 — Điều hướng 2D và nguồn gốc](../../docs/specs/01-chuc-nang.md) (line196) | partial | [E03](#e03), [E14](#e14), [E17](#e17); [AT-011](#at-011) | Raster width/pressure/affine kiểm được; vector-mm stroke không thể nhận pass từ ảnh đã rasterize. Original view phải read-only và phục hồi khung. |
| [VIEW-01 — Xem và chỉnh 3D](../../docs/specs/01-chuc-nang.md) (line206) | partial | [E17](#e17), [E09](#e09), [E14](#e14); [AT-012](#at-012) | Kiểm actual picking, context loss, thiết kế khác camera; thiếu WebGL chỉ chặn PNG/pick/đo tương ứng, không khóa geometry numeric/export. |
| [EXP-01 — Bảy đường xuất](../../docs/specs/01-chuc-nang.md) (line230) | blocked | [E09](#e09), [E10](#e10), [E11](#e11), [E12](#e12), [E25](#e25), [E17](#e17); [AT-013](#at-013) | Bảy registry entries chưa bằng bảy đường usable. Float32 STL normal path/proposal và source SVG sau edit là chức năng; target3MF chưa qualified có nhãn/lý do/STL fallback. |
| [EXP-02 — Cửa chặn, cảnh báo và mức xác minh](../../docs/specs/01-chuc-nang.md) (line249) | partial | [E10](#e10), [E11](#e11), [E12](#e12), [E25](#e25), [E09](#e09), [E16](#e16); [AT-014](#at-014) | Chặn đúng capability: SVG cần committed REGION, mesh cần mesh, PNG cần renderer. Serializer invalid luôn chặn; fail/unverified mesh có thể xuất kiểm tra với file cấu trúc hợp lệ và cảnh báo. |
| [DAT-01 — Dự án, journal và phục hồi](../../docs/specs/01-chuc-nang.md) (line277) | partial | [E13](#e13), [E14](#e14); [AT-015](#at-015) | Bằng chứng hook/page-close không đủ kill20 lần/phase/backend/browser. Save chỉ sau ack, retained generation/fonts/edits và writer lock không đổi theo schema. |
| [DAT-02 — Thư viện, sao lưu và nhập gói](../../docs/specs/01-chuc-nang.md) (line292) | partial | [E13](#e13), [E14](#e14), [E04](#e04); [AT-016](#at-016) | ZIP toàn project với original fonts/meshes phải rebuild được. Cloud backup tùy chọn; mirror qua API có thể unavailable rõ và ZIP vẫn phải chạy. Không nhận commit local là backup. |
| [DAT-03 — Cài đặt, hồ sơ, tìm nhanh và xóa](../../docs/specs/01-chuc-nang.md) (line310) | partial | [E02](#e02), [E14](#e14), [E18](#e18), [E15](#e15), [E28](#e28); [AT-017](#at-017) | Cần actual settings/profile merge/replace/reset/raw rescue/search toàn registry và xóa hai bước4s; quota và referenced-source GC không phá thế hệ lùi. |
| [LIM-01 — Giới hạn và dữ liệu quá trần](../../docs/specs/01-chuc-nang.md) (line325) | partial | [E03](#e03), [E04](#e04), [E06](#e06), [E13](#e13), [E19](#e19), [E26](#e26); [AT-018](#at-018) | Trần là chính sách khởi điểm. Cần matrix dưới/bằng/trên, reject trước cấp phát và benchmark thực nếu hứa hiệu năng; không tăng timeout để che default case chậm. |
| [UI-01 — Bố cục và sáu khu vực](../../docs/specs/02-giao-dien.md) (line8) | partial | [E14](#e14), [E16](#e16), [E28](#e28), [E23](#e23); [AT-024](#at-024) | Kiểm khu/trạng thái trên actual compiled app; chỉ số button và shell bootstrap không chứng minh đủ hành vi. |
| [UI-02 — Token, chữ và chuyển động](../../docs/specs/02-giao-dien.md) (line36) | unverified | [E16](#e16), [E28](#e28); [AT-025](#at-025) | Màu token không chứng minh contrast sau compositing, zoom và reduced/forced colors. Chưa tìm thấy matrix đầy đủ cho bản hiện hành. |
| [UI-03 — Khung thiết kế, lớp phủ và chồng lớp](../../docs/specs/02-giao-dien.md) (line63) | blocked | [E14](#e14), [E16](#e16), [E28](#e28), [E23](#e23); [AT-024](#at-024) | UI-R1-05/08 còn mở tại cutoff. Toolbar/overlay/close/cancel phải thao tác được ở layout thực, không chỉ declaration z-index. |
| [UI-04 — Điều khiển, bảng màu và emoji](../../docs/specs/02-giao-dien.md) (line94) | blocked | [E16](#e16), [E28](#e28); [AT-025](#at-025) | UI-R1-06/07: lý do disabled và unit/domain cần đường keyboard/accessibility. PNG artwork thật, target đủ lớn, slot conflict rõ. |
| [UI-05 — Popup, tìm kiếm, thông báo và phím tắt](../../docs/specs/02-giao-dien.md) (line119) | blocked | [E15](#e15), [E16](#e16), [E28](#e28); [AT-026](#at-026) | Một Escape xử lý lớp trên cùng; IME/input không kích phím đơn. Toast không thay vùng lỗi lâu dài; cần đọc screen reader thực. |
| [UI-06 — Responsive và trợ năng](../../docs/specs/02-giao-dien.md) (line150) | blocked | [E16](#e16), [E28](#e28); [AT-025](#at-025) | Cần reflow320, boundary±1, fractional zoom,200%text, thấp520, safe-area/virtual keyboard và xem thật; finding select layout còn mở, không chỉ snapshot mock. |
| [ARC-01 — Kiến trúc và trách nhiệm](../../docs/specs/03-ky-thuat.md) (line7) | partial | [E07](#e07), [E08](#e08), [E24](#e24), [E26](#e26), [E02](#e02), [E14](#e14), [E18](#e18), [E22](#e22); [AT-019](#at-019), [AT-034](#at-034) | Same Module/Worker và kiểm dependency closure là G1/G2; không tự kích geometry remote. Bộ release cũ không chứng minh bytes của current pair. |
| [GEO-01 — Hình học chủ và chung biên](../../docs/specs/03-ky-thuat.md) (line38) | partial | [E07](#e07), [E06](#e06), [E09](#e09), [E26](#e26); [AT-020](#at-020) | Shared boundaries/holes/accents và rejected topology đã có fixture; bảo toàn source ngữ nghĩa trên current artifact cần corpus hữu hạn có hash, không yêu cầu chứng minh mọi hình có thể có. |
| [GEO-02 — Đơn vị, sai số và chính sách Z](../../docs/specs/03-ky-thuat.md) (line56) | partial | [E02](#e02), [E09](#e09), [E10](#e10), [E11](#e11), [E26](#e26); [AT-021](#at-021) | Ledger theo công đoạn và targets định lượng; thiếu bound toàn nguồn giữ unverified. Nominal mm/layer datum không bị snap; fit vật lý là cổng khác. |
| [GEO-03 — Cơ khí và hiệu chuẩn](../../docs/specs/03-ky-thuat.md) (line107) | unverified | [E12](#e12), [E26](#e26); [AT-022](#at-022) | Bốn cơ cấu có số đo geometry component; coupon3ngày/force/endurance chỉ cần để đóng lời bảo đảm fit theo đúng cấu hình. Không chứng minh fit từ kích thước CAD. |
| [GEO-04 — Ghép lưới nhập và mô hình theo lớp](../../docs/specs/03-ky-thuat.md) (line137) | blocked | [E27](#e27), [E10](#e10), [E09](#e09), [E02](#e02); [AT-040](#at-040) | Required add/union/subtract cho cả5 loại, material/target/tie/transform/history/final-section. Current app binding available:false là blocker chức năng, không miễn bằng unsupported label. |
| [ABI-01 — Dữ liệu qua nhân và vòng đời bộ nhớ](../../docs/specs/03-ky-thuat.md) (line172) | partial | [E08](#e08), [E10](#e10), [E24](#e24); [AT-023](#at-023) | i64/owned leases/grow/cancel/ABA và same-byte initialization có evidence theo phiên bản; cần regression đúng pair hiện hành. |
| [VEC-01 — Nhập vector và graph màu](../../docs/specs/03-ky-thuat.md) (line199) | blocked | [E06](#e06), [E07](#e07), [E14](#e14), [E25](#e25), [E08](#e08); [AT-003](#at-003) | Giữ graph gốc/clip/gradient/composite và versioned explicit conversion; named unsupported filter được phép theo clause, không xóa paint để giả thành công. |
| [WEB-01 — Worker, PWA và cô lập](../../docs/specs/03-ky-thuat.md) (line226) | partial | [E21](#e21), [E23](#e23), [E24](#e24), [E13](#e13), [E14](#e14); [AT-002](#at-002) | Host fixture có COI/SW proof; baseline compiled owned byte proof chỉ64c5/b67d. Current64c5/f146 Firefox chưa tới geometry; cache/offline/lease toàn app còn mở. |
| [STO-01 — Commit bền và nhiều nơi lưu](../../docs/specs/03-ky-thuat.md) (line263) | partial | [E13](#e13), [E14](#e14); [AT-015](#at-015) | Local atomic head+previous generation, ack và hash là phần đã kiểm. Cloud replica/provider optional chưa có, không được gán LWW hoặc local lock là multi-device sync. |
| [OUT-01 — Multi-material, lưới và 3MF](../../docs/specs/03-ky-thuat.md) (line291) | partial | [E09](#e09), [E10](#e10), [E11](#e11), [E12](#e12), [E25](#e25), [E17](#e17); [AT-013](#at-013) | Đọc file độc lập cần topology/material/units, không chỉ edge2. Bambu hai dry slices khác U1 chưa chạy; per-profile G5 không khóa neutral export hợp lệ. |
| [SEC-01 — Dịch vụ, quyền và nguồn không tin cậy](../../docs/specs/03-ky-thuat.md) (line329) | partial | [E07](#e07), [E18](#e18), [E19](#e19), [E21](#e21), [E13](#e13); [AT-027](#at-027) | Synthetic HTTP/SQLite negative evidence là bằng chứng chức năng giới hạn. Không có độc lập review backend do route bị từ chối; parent adjudicates, không retry route. Host/security/P1 thực chặn G4. |
| [LIC-01 — Nguồn, giấy phép và phát hành](../../docs/specs/03-ky-thuat.md) (line355) | partial | [E05](#e05), [E22](#e22), [E23](#e23); [AT-028](#at-028) | Giữ originals/version/license và derivative recipes;172 notice baseline không tự chứng nhận đầy đủ pháp lý/current build. Private customer profile không thành fixture công khai mặc nhiên. |
| [QA-01 — Verdict và mức xác minh](../../docs/specs/04-nghiem-thu.md) (line14) | partial | [E01](#e01), [E12](#e12), [E13](#e13), [E23](#e23), [E24](#e24); [AT-039](#at-039) | Exitcodes/verdict độc lập với execution/supported; aggregation sản phẩm phải giữ partial/unverified và không cộng assertion thành requirement. |
| [QA-02 — Corpus, oracle và tính độc lập](../../docs/specs/04-nghiem-thu.md) (line46) | partial | [E01](#e01), [E12](#e12), [E13](#e13), [E23](#e23), [E24](#e24); [AT-039](#at-039) | Fixture geometry/định nghĩa oracle/custody tách reader khác core với ghế review độc lập; hai3MF cùng mesh không thành hai geometry oracle. Chưa xem toàn corpus là full artifact qualification. |
| [QA-03 — Các chiến dịch nghiệm thu bắt buộc](../../docs/specs/04-nghiem-thu.md) (line74) | partial | [E01](#e01), [E12](#e12), [E13](#e13), [E23](#e23), [E24](#e24); [AT-039](#at-039) | 113 planned check IDs là denominator truy vết, chưa113 executed official acceptances. Cần current artifact/test method/platform/input/output oracle matrix, không cộng số test component. |
| [QA-04 — Duy trì đặc tả và chứng cứ](../../docs/specs/04-nghiem-thu.md) (line94) | partial | [E01](#e01), [E12](#e12), [E13](#e13), [E23](#e23), [E24](#e24); [AT-039](#at-039) | Giữ scope/issues/người chịu trách nhiệm và không P1 security/cost/data/serializer trong scope. v15/v16 là evidence cutoff, docs lịch sử không tự đồng bộ status. |
| [ACC-01 — Nhóm kín và vòng đời thành viên](../../docs/specs/07-nguoi-dung-va-ai.md) (line8) | partial | [E18](#e18), [E21](#e21), [E14](#e14); [AT-029](#at-029) | Backend invite/lastowner/reauth/revoke có controlled HTTP proof; actual owner UI/IdP config/host session lifecycle cần xác minh trước nhóm dùng. |
| [ACC-02 — Ma trận quyền và sở hữu](../../docs/specs/07-nguoi-dung-va-ai.md) (line29) | partial | [E18](#e18), [E19](#e19), [E11](#e11), [E14](#e14); [AT-030](#at-030) | Owner không có quyền key/project sáng tác của member. Backend test2member+owner không thay actual artifact/private UI/download proof; optional cloud project503 không là pass CRUD. |
| [ACC-03 — Phạm vi cài đặt và thứ tự áp dụng](../../docs/specs/07-nguoi-dung-va-ai.md) (line52) | partial | [E02](#e02), [E14](#e14), [E18](#e18), [E11](#e11), [E19](#e19); [AT-007](#at-007), [AT-030](#at-030) | Settings user sync bắt buộc, project snapshot thắng defaults, device state tách; profile hardening mới phải exact user ABA/ETag/import/reset và không đổi snapshot âm thầm. |
| [ACC-04 — Offline, đổi người dùng và vòng đời dữ liệu](../../docs/specs/07-nguoi-dung-va-ai.md) (line95) | partial | [E13](#e13), [E14](#e14), [E18](#e18), [E15](#e15); [AT-031](#at-031) | Private logout giữ bytes; shared chỉ purge sau danh sách/backup/xác nhận, lease24h/clock rollback, không cache riêng chung. Bounded online grant không thay signed offline feature. |
| [AI-01 — Từng người tự trả nhà cung cấp](../../docs/specs/07-nguoi-dung-va-ai.md) (line128) | partial | [E18](#e18), [E19](#e19), [E15](#e15), [E28](#e28); [AT-005](#at-005) | BYOK từng user, không key owner fallback và không silent provider switch; metadata/price/capability/date phải đúng lúc real enablement. Thiếu key chỉ khóa Generate. |
| [AI-02 — Kho secret và biên tin cậy](../../docs/specs/07-nguoi-dung-va-ai.md) (line146) | partial | [E18](#e18), [E19](#e19), [E20](#e20), [E21](#e21), [E23](#e23); [AT-032](#at-032) | Vault key ngoài DB/bundle, scoped auth-before-send, masking/revoke/SSRF có tests. Operator vẫn là trust boundary; không claim xóa plaintext tuyệt đối trong JS heap. |
| [AI-03 — Giao dịch, hạn mức và retry](../../docs/specs/07-nguoi-dung-va-ai.md) (line163) | partial | [E18](#e18), [E19](#e19), [E20](#e20); [AT-033](#at-033) | Original UTC periods, atomic tiền/request/byte/concurrency, dedup/unknown/tombstone và above-quote settlement đã test; chạy lại current cohort+UI receipt, không cần paid test ở lượt này. |
| [AI-04 — Giao diện và nghiệm thu riêng tư](../../docs/specs/07-nguoi-dung-va-ai.md) (line203) | partial | [E18](#e18), [E19](#e19), [E15](#e15), [E28](#e28); [AT-005](#at-005) | Menu account/AI/cost/admin nằm ngoài6workspace sections; DOM thực phải so ledger riêng với2members+owner. Component bridge không thay actual HTTP E2E. |
| [EXT-01 — Module và chiều phụ thuộc](../../docs/specs/08-mo-rong-va-lo-trinh.md) (line6) | partial | [E02](#e02), [E14](#e14), [E18](#e18), [E22](#e22); [AT-034](#at-034) | Bound module/registry compiled IDs/versions/schema; actual thêm module không sửa vendor branch chưa có campaign evidence đầy đủ. Không eval dự án/plugins. |
| [EXT-02 — Hợp đồng job và artifact](../../docs/specs/08-mo-rong-va-lo-trinh.md) (line37) | partial | [E09](#e09), [E14](#e14), [E15](#e15), [E19](#e19), [E20](#e20); [AT-035](#at-035) | Job ticket/sequence/source hash và artifact immutable độc lập verdict; test actual stale/cancel/output before atomiccommit on current product, remote needs explicit future authorization. |
| [EXT-03 — Version, migration và sự bền vững của ID](../../docs/specs/08-mo-rong-va-lo-trinh.md) (line53) | blocked | [E02](#e02), [E13](#e13), [E08](#e08), [E23](#e23); [AT-036](#at-036) | COW/dry-run/tombstone/retained originals và no mixed-generation PWA; source/CSG orphan/datum và migration actual artifact vẫn còn việc. |
| [EXT-04 — Adapter định dạng, máy in và năng lực](../../docs/specs/08-mo-rong-va-lo-trinh.md) (line69) | unverified | [E02](#e02), [E14](#e14), [E18](#e18), [E22](#e22); [AT-034](#at-034) | Preview/import/edit/export/roundtrip/fit khác nhau; registry7entries và fileextension không là compatibility. Cần thực nghiệm thêm compiled adapter và per-key profile semantics. |
| [EXP-03 — Hồ sơ bàn in và bố trí vật thật](../../docs/specs/08-mo-rong-va-lo-trinh.md) (line83) | partial | [E11](#e11), [E12](#e12), [E02](#e02), [E09](#e09); [AT-037](#at-037) | Real selected user profile/schedule/bed polygon/material bindings, camera khác printpose; unmeasuredprofile qualified=false, slot mismatch chặn đúng machine target. |
| [EXT-05 — Cổng triển khai và phát hành](../../docs/specs/08-mo-rong-va-lo-trinh.md) (line99) | partial | [E20](#e20), [E21](#e21), [E22](#e22), [E23](#e23); [AT-038](#at-038) | G4 cần chức năng/accounts/BYOK/privacy/data/a11y/resources; G5 per-slicer;G6 fit label. Backup RPO24h/RTO8h phải đo trước phát hành trên môi trường đã chọn, không yêu cầu physical print để mở digital UI. |

## Ma trận40 chiến dịch và113 check

E-ID dẫn code, tests và evidence paths cụ thể. JSON giữ toàn bộ113 action/expected/oracle và association requirement↔check. “Repeat/rerun” là việc còn cần trên combined artifact, không nói đã chạy trong inventory.

<a id="at-001"></a>

### AT-001 — Năm loại sản phẩm, hai bước

blocked · G3, G4 · [E09](#e09), [E14](#e14), [E26](#e26), [E27](#e27), [E28](#e28)

Five-product root matrices exist, but the current actual artifact/source/default workflow is not accepted.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-001.1 | blocked | Run actual compiled entry for all5 products with image/text/selected color emoji, defaults and relevant proposals; resolve current source/adoption and curved-runtime failures. |
| AT-001.2 | partial | Repeat 1→2→1 via buttons/keys in all6 areas on actual recipes; assert committed source/edit/head content unchanged by navigation. |

<a id="at-002"></a>

### AT-002 — Khởi động, offline và năng lực

partial · G2, G4 · [E21](#e21), [E23](#e23), [E24](#e24), [E13](#e13), [E14](#e14)

Host/component capability tests pass; current compiled app offline/cache and complete3engine handshake proof are incomplete.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-002.1 | partial | Run current64c5/f146 package missing COI/SAB/malformed ready/no-WebGL scenarios with real rescue UI and zero stale/new mesh publication. |
| AT-002.2 | partial | Populate exact production shell/engine/catalog selected offline assets, stop network, test sufficient/missing bytes and signed lease expiry/backward-clock; do not count empty CacheStorage shell smoke. |
| AT-002.3 | observed-pass | Retest actual compiled release SW including callback redirect/login200, then record cache entries+hashes. Observed: Host SW negative controls and real redirect fixture passed; observed-pass limited to that host fixture. |

<a id="at-003"></a>

### AT-003 — Nhập nguồn không mất semantics

blocked · G3, G4 · [E06](#e06), [E07](#e07), [E14](#e14), [E25](#e25), [E08](#e08)

Local decoder/SVG and explicit conversions operate; source adoption after edits is a known integration gap.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-003.1 | partial | Actual file PNG/JPEG/WebP+EXIF/alpha import/cancel through product entry; independent raw/hash/store/head and reopen check. Backend AI codec restrictions do not describe local importer support. |
| AT-003.2 | partial | Re-run nonzero/holes/nested clip/transform/use analytic source graphs on current pair; verify emitted artifacts and preserved originals. |
| AT-003.3 | blocked | Resolve accepted raster erase/reconversion material IDs, then exercise gradient/alpha accept/cancel and unsupported named operations without silent changes; commit/reopen exact receipt. |

<a id="at-004"></a>

### AT-004 — Bộ emoji và chuỗi

partial · G3, G4 · [E04](#e04), [E05](#e05), [E14](#e14)

Both selected collection routes, full sequences and no-fallback negatives have component evidence.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-004.1 | partial | Actual selector query/favorite/recent/aliases and ZWJ/modifier/flag/keycap/FE0E/FE0F creation on current product artifact, verify all code points and source hashes. |
| AT-004.2 | partial | Switch installed Noto color/mono in UI; missing asset/glyph remains explicit and does not send system-font/other-collection fallback requests. Reopen exact source. |

<a id="at-005"></a>

### AT-005 — Lượt AI dùng kết nối cá nhân

partial · G4, O-05 · [E18](#e18), [E19](#e19), [E15](#e15), [E28](#e28)

Controlled backend references/BYOK exact consent are functional; actual account/AI UI flow and deployed provider remain unverified.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-005.1 | partial | Actual File reference stage→quote→explicit Generate/cancel with synthetic provider behind real HTTP. Verify zero content sent when simply opening tab or editing prompt/reference. |
| AT-005.2 | observed-pass | Repeat on composed artifact with2members+owner; maintain zero fallback and clear UI repair for missing/denied/quota key. Observed: 136 backend cohort covers scoped credentials/no owner fallback; no live provider success. |
| AT-005.3 | partial | Compare actual accessible DOM provider/model/estimate/actual/unknown with independent captured SQLite ledger; test late delivery after source change/logout. |

<a id="at-006"></a>

### AT-006 — Chữ, dấu và variation

blocked · G3, G4 · [E04](#e04), [E05](#e05), [E08](#e08), [E14](#e14), [E13](#e13)

Reference shaping/layout is tested; source text datum/adoption is not yet complete in actual products.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-006.1 | partial | Run exact pinned HarfBuzz reference/native vs currentWASM for required VietnameseNFC/NFD/bidi/font runs/axes; explicitly enumerate unsupported complex bidi cases, preserving clusters/outlines. |
| AT-006.2 | blocked | Complete actual on-model/beside text datum and negative-frame binding; exercise8controls/2toggles in both UI positions, mm/pt invariant and one undo. |
| AT-006.3 | partial | Remove reusable personal font while a project retains it; full save/package/reopen uses identical font bytes/dependencies despite defaults/list changes. |

<a id="at-007"></a>

### AT-007 — Preset, đổi loại và ưu tiên cài đặt

partial · G3, G4 · [E02](#e02), [E14](#e14), [E18](#e18), [E11](#e11)

Schema/history/default precedence and policy fences have component tests.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-007.1 | partial | All5 actual product switches retain type overrides, source/manual color and one transaction; return to each type and independently compare head. |
| AT-007.2 | partial | Actual defaults/presets/profile import/reset and reopen old project after defaults change; sparse preset must not recolor. Verify displayed provenance and quota20templates. |
| AT-007.3 | observed-pass | Re-run actual account UI for policy removal/restoration and visible reason on current backend build. Observed: Backend/controller policy-blocked and no-fallback/no-auto-rebuild tests recorded; scoped to tested cohort. |

<a id="at-008"></a>

### AT-008 — Vùng, vật liệu, vai và override

blocked · G3, G4 · [E02](#e02), [E06](#e06), [E09](#e09), [E08](#e08), [E25](#e25)

Material/source identity is sealed in components; explicit raster reconversion remains blocked.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-008.1 | partial | Actual NỀN action on a same-color boundary component plus enclosed island; only connected exterior excluded in current source SVG and3D. |
| AT-008.2 | partial | Current artifact role/block/material/slot override→rebuild→scope reset; compare full semantic IDs/origin and output material ledger. |
| AT-008.3 | blocked | Resolve default palette and accepted edit/reconversion identity conflicts; test split/merge orphan UI and slot-color collision without color/order-derived identity or automatic remap. |

<a id="at-009"></a>

### AT-009 — Field schema và ràng buộc

partial · G3, G4, O-02 · [E02](#e02), [E06](#e06), [E26](#e26), [E28](#e28)

126 catalog fields are accounted for structurally; native effects/UI coverage is broader than the schema tests.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-009.1 | partial | Create field-by-field disposition→native operation→actual reachable control mapping for11groups plus text/overrides, checking duplicate Apply controls route same command; identify inert or still-blocked fields. |
| AT-009.2 | partial | Exercise effective domains/dependencies/auto0 in current compiled UI+kernel across products, including nonfinite/out-of-range atomic refusal and hidden-value retention. |
| AT-009.3 | partial | Actual persisted legacy impVox=0.25 migration dry-run must preserve raw value and require new tolerance decision; verify UI/CSG does not reinterpret it numerically. |

<a id="at-010"></a>

### AT-010 — Bảy đường sửa và undo

blocked · G3, G4 · [E03](#e03), [E06](#e06), [E14](#e14), [E25](#e25)

All7 pixel algorithms run; only limited actual pointer edit E2E exists and the post-edit source path is blocked.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-010.1 | blocked | Resolve current raster edit→accepted reconversion→source/3D/export; run all7 tools and all specified keep/cut/merge/crop/curve/heal options through real UI. Decide/implement direct vector-mm route or obtain explicit specification scope change; rasterization is not that proof. |
| AT-010.2 | partial | Persist one gesture/undo/redo with original source and complete domain hashes; exhaust actual24MiB/20transaction budget and verify consent before pruning, cancel publishes nothing. |

<a id="at-011"></a>

### AT-011 — Điều hướng và nguồn gốc

partial · G4 · [E03](#e03), [E14](#e14), [E17](#e17)

Affine/pressure pixel algorithms and some original-view UI paths are tested.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-011.1 | partial | Actual pan/pinch/fit/original-toggle restores previous view and exact project content on touch/keyboard with cancel/source changes. |
| AT-011.2 | unverified | Direct vector stroke-mm export at two zooms plus physical pen-event missing/explicit pressure1× semantics lacks an executed product oracle; define route and test actual outline units. |

<a id="at-012"></a>

### AT-012 — Scene và transform

partial · G4 · [E17](#e17), [E09](#e09), [E14](#e14)

Real Three picking/camera/PNG component tests exist, not complete design-manipulation E2E.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-012.1 | partial | Read actual current exported file before/after camera/background move/Fit to prove print coordinates unchanged. |
| AT-012.2 | partial | Actual text/eyelet/grid drag versus numeric transforms with identical matrices and undo; source datum/remediation must be integrated first. |
| AT-012.3 | partial | Current composed5product renderer WEBGL context loss/recreate and late root job; record resource lifecycle and ensure newer generation remains authoritative. |

<a id="at-013"></a>

### AT-013 — Bảy đường xuất và đọc lại

blocked · G4, G5 · [E09](#e09), [E10](#e10), [E11](#e11), [E12](#e12), [E25](#e25), [E17](#e17)

All seven export entries exist with route-specific gates; independent files and limited Bambu slicing are scoped evidence.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-013.1 | blocked | Finish executable float-conditioning consent on current final union and source-adoption blockers; exercise seven entries on actual artifact with fresh independent SVG/STL/ZIP/PNG/3MF readback. A refused normal STL is not an export pass. |
| AT-013.2 | partial | Rebuild exact profile/schedule/material packages on current pair; independentZIP/XML/XSD/reference reader and same-origin custody hashes; U1badfixture remains a rejection. |
| AT-013.3 | partial | Complete safely isolated target U1 run and per-target manual layer/material preview; broaden real current artifact Bambu fixtures before qualified label. |

<a id="at-014"></a>

### AT-014 — Cửa chặn và xuất kiểm tra

partial · G4, G5 · [E10](#e10), [E11](#e11), [E12](#e12), [E25](#e25), [E09](#e09), [E16](#e16)

Route-specific source/mesh/renderer, assembly/revision/serialization/material gates and negatives are implemented.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-014.1 | partial | Run each required gate from current actual controller/source/model state, incl sourceSVG before3D, revoked user and stale/ABA/cancel; no partial artifact or old head. |
| AT-014.2 | partial | Actual export inspection opt-in for fail/unverified mesh plus independently valid neutral serialization; retain warning/verdict without ready-to-print label. Float proposals must be executable and separately accepted. |
| AT-014.3 | observed-pass | Repeat current product profile/UI path and confirmed valid remap/STL alternative. Observed: U1refs1..6/4slots rejected by independent reader and adapter; neutral STL remains independently allowed. |

<a id="at-015"></a>

### AT-015 — Crash-consistent commit

partial · G2, G4 · [E13](#e13), [E14](#e14)

Local ordered commit/fault injection/CAS recovery is implemented; exact campaign crash method remains incomplete.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-015.1 | unverified | Execute kill20 times at each put/manifest/head/cleanup boundary per supported browser/backend, with ack log outside killed process and independent recovered asset/head inspector. Mark WebKitOPFS unavailable, test supportedIDB; do not substitute20 resume-hook iterations. |
| AT-015.2 | observed-pass | Repeat composed source/asset dependencies and current schema migration after source integration; preserve exact last acknowledged head. Observed: Missing asset/wrong-generation ack/cleanup interruption and real hash fallback are tested on captured storage cohort. |
| AT-015.3 | partial | Current two users sameprojectID and sameuser different schema/app versions in independent tabs: inspect actual writerlock/CAS/handover and reload latest head. |

<a id="at-016"></a>

### AT-016 — Import ZIP và mirror

partial · G4 · [E13](#e13), [E14](#e14), [E04](#e04)

Bounded STORE ZIP, CRC/hash/path and staged import are tested; complete actual project/mirror flow is not.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-016.1 | partial | Export actual text+font/color source+imported mesh project and independently enumerate/hash all dependencies; import and rebuild current canonical geometry in3 engines. |
| AT-016.2 | observed-pass | Repeat packaged actual source ZIP corruption/large declared bounds with head unchanged; document supported compressed methods. Observed: Traversal/CRC/SHA/schema/limits negatives and COW/no-partial-head are component-tested. |
| AT-016.3 | unverified | Provide actual optional mirror adapter and permission/quota failure acknowledgment tests where supported, or leave specific mirror capability unavailable with working ZIP route; do not mark local commit as mirror backup. |

<a id="at-017"></a>

### AT-017 — Quản lý kho và tìm nhanh

partial · G4 · [E02](#e02), [E14](#e14), [E18](#e18), [E15](#e15), [E28](#e28)

Settings/project/control primitives exist; actual search/delete/rescue coverage is incomplete.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-017.1 | partial | Actual user settings merge/replace/reset, invalid-record visible raw export and canary scan; preserve project/user/device/credential separation through HTTP refresh/account reset. |
| AT-017.2 | partial | Actual accentless multiword search across all listed command/field/material IDs, hidden reasons and undo transitions; exact4s two-step deletion/Esc/change-selection cancellation with storedrecord counts. |

<a id="at-018"></a>

### AT-018 — Ngưỡng và bảo vệ tài nguyên

partial · G2, G4, O-04 · [E03](#e03), [E04](#e04), [E06](#e06), [E13](#e13), [E19](#e19), [E26](#e26)

Finite byte/pixel/graph/work guards and invalid boundaries are tested in components; no comprehensive target-hardware benchmark.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-018.1 | partial | Map every LIM-01 limit to actual admission path and min/equal/max+1 case including parser/decompression and retained originals; measure peak allocation/cancel/worst-case on named device. Investigate current81model timeout rather than inflate timeout. |
| AT-018.2 | partial | Actual UI/core input500 vs501 graphemes (ZWJ/NFD), perfile font16MB and total project budget, no truncation/font omission; package import remains atomic. |

<a id="at-019"></a>

### AT-019 — Spike native và WASM

partial · G1, G2, O-01 · [E07](#e07), [E08](#e08), [E24](#e24), [E26](#e26)

Actual native/WASM analytic and ownership evidence exists across explicit historical cohorts.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-019.1 | partial | Current curved pair/native build sameinput hole/seam source→file and independent oracle; include exact recipe/source versions and bounded ledger. Complete Firefox geometry after navigation failure is diagnosed. |
| AT-019.2 | partial | Re-audit final compiled dependency closure and same-Module geometry boundary after integrations; forbid fixture recipe/remote geometry switches and second HB Module. |

<a id="at-020"></a>

### AT-020 — Chung biên, lỗ và topology

partial · G1, G3 · [E07](#e07), [E06](#e06), [E09](#e09), [E26](#e26)

Analytic source/mesh oracles check holes/shared seams and disconnected accents; current combined source cases remain incomplete.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-020.1 | partial | Re-run rectangle-hole184mm²/onehole/onecomponent through currentproductionpair and exportedfile independent reader; preserve origincurves. |
| AT-020.2 | partial | Current pair two100mm²regions/200total/10mmseam, single sharededge authority and disjoint material volume/readback. |
| AT-020.3 | partial | Current native/WASM post-boolean/offset self-cross/duplicate/winding/1nm edge/thin-island source fixtures and independent topology/readback; explicitly bound failed/unsupported inputs. |

<a id="at-021"></a>

### AT-021 — Sai số, scale và first layer

partial · G1, G3, G5, O-02 · [E02](#e02), [E09](#e09), [E10](#e10), [E11](#e11), [E26](#e26)

Integer/datum/layer and local float analysis are implemented; total pipeline bound remains unknown.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-021.1 | partial | Fresh exact tie/overflow/quantization/local conditioning tests on latestpair; label missing source/reduction/global stages unverified, not measured micron/physical fit. |
| AT-021.2 | observed-pass | Repeat actual project export with first.16/regular.20 and layer12=2.36 using independent reader. Observed: Decimal/domain and independent Bambu analytic schedule evidence meet the named local calculation. |
| AT-021.3 | partial | Actual P1S→U1 schedule proposal/diff/confirmation/one-undo plus source text and applied profile hash; read layer12=2.45 after explicit first.25. |
| AT-021.4 | observed-pass | Repeat real project field UI and output report; no nominal snap during profile update. Observed: Domain and printing tests distinguish nominal2.40mm and signed schedule deviation. |

<a id="at-022"></a>

### AT-022 — Coupon và fit vật thật

unverified · G6, O-03 · [E12](#e12), [E26](#e26)

No physical coupon/force/endurance measurements were performed or claimed.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-022.1 | unverified | Owner-led print3differentdays perexact printer/nozzle/material/slicer/hardware configuration for4families, raw dimensions/instruments/uncertainty and retained coupon files. This blocks fit label, not independent digital UI. |
| AT-022.2 | unverified | Define acceptance force/crack/loosen/fatigue criteria before measurements; report exactconfiguration outcome and no extrapolation. No printer action authorized in this assignment. |

<a id="at-023"></a>

### AT-023 — Ownership và race

partial · G1, G2 · [E08](#e08), [E10](#e10), [E24](#e24)

ABI/leases/growth/cancel/retirement tests exist; current binary regression pending.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-023.1 | partial | Latest production/instrumented native sanitizer+3Worker stress for pin/grow/release/cancel/out-of-order publish and byte accounting, keeping diagnostic fixture exports separate. |
| AT-023.2 | partial | Latest actual ABI layout/i64 values beyondNumber safe range, offsets/alignment/length and ownedbuffer roundtrip with independent wire decoder. |

<a id="at-024"></a>

### AT-024 — Bố cục và overlay

blocked · G4 · [E14](#e14), [E16](#e16), [E28](#e28), [E23](#e23)

UI components and actual compiled shell exist; scope-critical layout findings remain unresolved at capture.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-024.1 | partial | Current actual app all6areas×2steps empty/busy/error/cancel, long localized labels and control availability with persistent data; no wholeapp proof from shell70buttons. |
| AT-024.2 | blocked | Resolve UI-R1-08 select labels and UI-R1-05 drawer/Escape overlap behavior; verify hit/focus/save/close at desktop/tablet/mobile/shortheight in actual composed app. |

<a id="at-025"></a>

### AT-025 — Trợ năng và responsive

blocked · G4 · [E16](#e16), [E28](#e28)

Partial accessibility/layout measurements exist with explicit remaining UI findings; no comprehensive AA claim.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-025.1 | unverified | Measure computed composited contrast actualstates/backgrounds/gradient/selected/focus to4.5:1normal,3:1large/UI; automated tokens alone insufficient. |
| AT-025.2 | blocked | Resolve keyboard-accessible disabled reasons and numeric units/limits (UI-R1-06/07), then actual palette/zoom200/targets/screenreader workflow across3engines. Historical Chromium zoom evidence is not Firefox/WebKit. |
| AT-025.3 | blocked | Resolve panel select wrapping/UI-R1-08 and verify320CSSpx,720/1023/1180/1400±1, fractionalzoom, height≤520, virtualkeyboard/safearea/forcedcolors/reducedmotion; preserve visual/focus evidence. |

<a id="at-026"></a>

### AT-026 — Phím tắt và modal

blocked · G4 · [E15](#e15), [E16](#e16), [E28](#e28)

Shortcut registry/IME and modal async tests are partial; one-Escape layering remains a known issue.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-026.1 | partial | Actual IME/input/textarea/select/contenteditable/assistive modifier and step-specific C/U Enter/Backspace/Esc, no unintended domain edit. |
| AT-026.2 | blocked | Resolve UI-R1-05; oneEscape dismisses only top interaction, preserves lower drawer and restores useful focus. Validate nestedmodals/inert/a11ytree+screenreader on actual app. |

<a id="at-027"></a>

### AT-027 — Input và mạng không tin cậy

partial · G2, G4 · [E07](#e07), [E18](#e18), [E19](#e19), [E21](#e21), [E13](#e13)

Hostile input, SSRF/CSRF and state preservation tested in controlled modules/HTTP.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-027.1 | partial | Current SVG/font/import/project parsers across actual app:script/fetch/XXE/use cycles/unknown metadata/prototype pollution, zeroexternalnetwork/DOMcode; retain originalbytes and safe named rejection. |
| AT-027.2 | observed-pass | Repeat exact deployed allowlist/redirect/DNS/auth-before-send policy before liveenablement; no external probes in inventory. Observed: Controlled HTTP transport/socket counts prove tested private/metadata/redirect URLs and CSRF rejected without credential leakage. |
| AT-027.3 | partial | Malformed/oversize source+cancel in actual application keeps oldhead/all dependencies, no stale canvas/artifact; scan logs/errors/bundle for canaries on new build. |

<a id="at-028"></a>

### AT-028 — Nguồn và nghĩa vụ

partial · G4, LIC-01 · [E05](#e05), [E22](#e22), [E23](#e23)

Original library, dependency notices and separate derivatives/transport are pinned in immutable build inputs.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-028.1 | observed-pass | Rebuild combined-source artifact with currentexplicitpair and verify full notices/inputhashes/publicallowlist; re-pin changed inputs, not re-label baseline. Observed: Original catalog/deployment/license hashes and172notice release inventory observed on baseline1147…artifact. |
| AT-028.2 | partial | Audit all distributed derivative recipes/parameters/original hashes and legal scope; keep projectprivateLicenseRef, no uncertain customerprofile distribution. Hashes prove identity, not legal sufficiency. |

<a id="at-029"></a>

### AT-029 — Mời, role và thu hồi

observed-pass · G4, O-05 · [E18](#e18), [E21](#e21), [E14](#e14)

Actual backend owner/member/OIDC/reauth lifecycle is tested with synthetic identities.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-029.1 | observed-pass | Current actual account UI flow for invite TTL/single-use/revoke/resend with2members+owner; operator must provision actual issuer/client/redirect beforedeployment. Observed: Backend local signed OIDC/invitation ownership+expiry tests passed in136 cohort. |
| AT-029.2 | observed-pass | Repeat active/suspended/deleted/reactivated session/authVersion in composedapp and realhostpolicy; never replay sent provider jobs. Observed: Server immediately checks version/status before protected requests in scoped HTTP tests. |
| AT-029.3 | observed-pass | Repeat actual admin UI confirmation/reauth owner transfer and lastowner fence; archive bounded audit outcome. Observed: Last-owner/reauth transfer negative/positive backend paths tested. |

<a id="at-030"></a>

### AT-030 — Quyền ngang tài khoản

partial · G4, O-05 · [E18](#e18), [E19](#e19), [E11](#e11), [E14](#e14)

HTTP owner isolation and quotas are exercised; actual user UI/object replica scope must remain explicit.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-030.1 | observed-pass | Current member/owner wholeapp private list/settings/job/image requests plus knownIDs from otheruser; optionalcloudproject503 is not supported CRUD. Observed: Two members+owner realHTTP/SQLite IDOR/no-owner-key tests passed in backend cohort. |
| AT-030.2 | observed-pass | Current stagedref/job/original/thumbnail expired/wronguser/source/session retrieval; inspect actualnetwork no existence/secret leak. Observed: B03 owner/session/job scoped result/download and stale reference checks included in136. |
| AT-030.3 | partial | Re-run quotas after personalprofile hardening on realHTTP and actual UI simultaneous settings/stagedimage writes; display exactused/limit and keep oldcommits. Cloudprojects optionaldisabled must not be called accepted objectstore. |

<a id="at-031"></a>

### AT-031 — Đổi user và offline lease

partial · G4 · [E13](#e13), [E14](#e14), [E18](#e18), [E15](#e15)

Private/shared logout/lease and late callback primitives are tested; complete exact multisource product scenarios remain open.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-031.1 | partial | Actual3projects+1confirmedbackup private logout→relogin withall originalfonts/edits/history bytes retained and UIinaccessible whilelocked. |
| AT-031.2 | partial | Actual shareddevice2unbackedprojects: list exactrevision/hash, backup or two-stepdelete/cancel, revoke session while preserving unhandled bytes; no accidental purge onexpiry. |
| AT-031.3 | partial | Real received AI decode, editorWorker/sourceRenderer/job callbacks afterA→B→A: no old private UI/source commit; retain original accounting owner. |
| AT-031.4 | partial | Actual signedlease offlineexpiry/restart/backward>5min/rescue; online-only fallback is not24h offline capability or lease signature proof. |

<a id="at-032"></a>

### AT-032 — Vòng đời secret

partial · G4, O-05 · [E18](#e18), [E19](#e19), [E20](#e20), [E21](#e21), [E23](#e23)

Ciphertext/vault scoped authorization and credential rotation are tested; infrastructure privileges/key custody remain explicit.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-032.1 | partial | Scan actual compiled package/browserstores/projectZIP/log/error outputs with syntheticcanary. Match exact backend cohort afterprofile changes; plaintextheader JS cannot claim secureheap erasure. |
| AT-032.2 | observed-pass | Repeat current app keyUI/add/rotate/revoke requestbinding and alreadyreceivedsettlement, no oldkeyversion/newjob and noownerfallback. Observed: 136 backend verifies credentialversion/no new send after revoke; recovery missingkey identity never restores usable credentials. |
| AT-032.3 | observed-pass | Repeat only controlled transport with final authorization afterDNS and exactHTTPS allowlist; realoperator must validate endpointconfiguration. Observed: SSRF/private/metadata/redirect canary negatives passed scoped backend transport tests. |

<a id="at-033"></a>

### AT-033 — Idempotency và ngân sách

observed-pass · G4, O-05 · [E18](#e18), [E19](#e19), [E20](#e20)

Executed backend136 campaign covers exact dedup, atomic dimensions, original-period obligations and recovery, with synthetic provider facts.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-033.1 | observed-pass | Re-run same tests on current settings/profile backend cohort plus actual UI doubleclick/reload/newintent; never infer liveprovideridempotency. Observed: SameoperationId/payload dedup and payload-conflict no-duplicatesend tested. |
| AT-033.2 | observed-pass | Re-run concurrent quote/reference byte +currency/day/month caps aftercurrentpolicychanges. Observed: Atomic same-unit/period reservations and independent dimensions in actualSQLite tests. |
| AT-033.3 | observed-pass | Keep unknown/reservation on aftersend ambiguity; newjob requires new explicit intent. Actual provider status/idempotency remains unavailable. Observed: Postsubmitted uncertainty, no retry/no actualzero, tombstones and recovery tests passed. |
| AT-033.4 | observed-pass | Operator reconciles actualinvoice againstoriginalUTCperiod; preserve signed recoveryplan/keyversion identity on restore. Observed: Late settlement/closedunknown/abovequote actual125vs60/partialholds and originalperiods tested in B05/B11. |
| AT-033.5 | observed-pass | Current UI must show exhausted byte/request/concurrency dimension and cancellation maystillcharge; bounded shutdown mustdrain received output. Observed: Budget dimension and fullyreceivedcodec/close/runOnce races tested without duplicate send. |

<a id="at-034"></a>

### AT-034 — Thêm capability qua registry

partial · G3, G4 · [E02](#e02), [E14](#e14), [E18](#e18), [E22](#e22)

Registries/module boundaries exist; official no-special-case extension campaign has no full executed mapping here.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-034.1 | unverified | Add compiled benign exporter/importer through registry with metadata/schema/preflight using existingwidgets; prove no UIvendorbranch modification. Not simply list7 existing formats. |
| AT-034.2 | partial | Actual project import with unknownmodule/schema retainsrawassets read-only with explicitmissingmodule; no eval/plugin network. |
| AT-034.3 | observed-pass | Repeat final bundle closure/config showing remotegeometry cannotactivate; keep futureADR/consent/ACL/quota prerequisites. Observed: v1 local-only application boundary and explicitprovider registry; remote replica/geometry not silently enabled. |

<a id="at-035"></a>

### AT-035 — Job và artifact

partial · G2, G4 · [E09](#e09), [E14](#e14), [E15](#e15), [E19](#e19), [E20](#e20)

Job/result ownership and exactartifacthash guards operate in components and realHTTP.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-035.1 | partial | Actual compiled productprocessing/AIreference/sourcegesture cancel/fail/stale/partialoutput afterrevision/userchange; independently countno partialpublish and correctaccounting. |
| AT-035.2 | partial | Tamper exact actual exportedSVG/STL/ZIP/PNG and privateAIartifactbytes, jobstate+hash mismatch; independentvalidator verdict mustnot become executionstatuspass. |

<a id="at-036"></a>

### AT-036 — Migration và ID split/merge

blocked · G3, G4 · [E02](#e02), [E13](#e13), [E08](#e08), [E23](#e23)

COW/version/identity primitives exist; source-adoption/splitmerge and wholeapp migration remain incomplete.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-036.1 | partial | Actual old/new/missingextension package/dry-run/read-onlyrescue withfont/raster/mesh originals and rollbackbytes; explicitlyretain unsupportednewerfields. |
| AT-036.2 | blocked | Complete root source-adoption stableID/datum/editerase and CSGorphan handling; actual impVox/strapSeg dispositions needchoice notnumericreinterpretation, with oneundo. |
| AT-036.3 | partial | Kill migration at actualcommitboundaries; PWAengine update during job cannotmixschema/catalog/WASM or lose lastack. Repackage combinedsource and verify rollbackopensrawnewerschema safely. |

<a id="at-037"></a>

### AT-037 — Bed polygon và placement

partial · G4, G5, G6 · [E11](#e11), [E12](#e12), [E02](#e02), [E09](#e09)

Sealed personal profiles and analytic bed/material/layer checks exist; current actualproduct placement notfullyaccepted.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-037.1 | partial | Current finalscene footprint on round/concave/excludedbed includingrotated+flip/restZ0 parts and bedZheight, independentpolygonoracle; do not usebboxonly. |
| AT-037.2 | observed-pass | Actual current account profile import/reset displaysqualified=false and unmappedcollision reason; offer independentneutralSTL. Observed: Unmeasuredprofile gating and U1badmapping independently reject; machine capabilities do not certify fit. |
| AT-037.3 | partial | Actual selectedprinter change updates sealing/schedule/placementproposal with explicitconfirmation/oneundo; compare camera move with unchanged exportpose. |

<a id="at-038"></a>

### AT-038 — Cổng phát hành và backup

partial · G4, G5, G6, O-05 · [E20](#e20), [E21](#e21), [E22](#e22), [E23](#e23)

Foreground config/backup/restore/rollback tools and gate-specific runbooks exist; no deployment RPO/RTO measurement.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-038.1 | partial | Parent adjudicates actual G1→G4 scope/P1/features with declaredunsupportedlabels; resolve digitalfeaturegaps, provisionTLS/IdP/quota/keys/providerpolicy before opening managedhost. Do not demandcoupon towritecode/openindependentdigitalcontrols. |
| AT-038.2 | unverified | Measure complete deployedmetadata/settings restore RPO≤24h/RTO≤8h on namedenvironment incl offsitebackup/keycustody/purge/rollback andretain timestamps+rawhashes. LocalSQLite synthetichashroundtrip is not elapsedRPO/RTO proof. |

<a id="at-039"></a>

### AT-039 — Tính trung thực của nghiệm thu

partial · G0, G4 · [E01](#e01), [E12](#e12), [E13](#e13), [E23](#e23), [E24](#e24)

Authoring IDs/oracles and verdict semantics are documented/tested; this inventory does not execute all official checks.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-039.1 | partial | Actual comprehensive campaign aggregation preservesfail1/unverified2, excludesunsupportednegative asfeaturesupport; emit percheckevidence without countingassertionsasrequirements. |
| AT-039.2 | observed-pass | Revalidate currentcorpusmanifestandcanonicalpayloadidentity; onechangedbyte mustinvalidateevidence. Observed: Durable fixtureaudit identifies two3MF packages sharing onegeometry and U1 mismatch; nottwoindependentcases. |
| AT-039.3 | partial | Complete percheckinput/source/app/kernel/adapterhash/environment/command/verdict/oraclecustody for actualnewartifact; keepFFpre-navigationfailure separate and historicalb67dproof distinctfromf146. |
| AT-039.4 | partial | Run suppliedspecificationvalidator and corruptioncontrols on currentfinalspec+evidence; inventoryvalidation separately checks55/40/113 links/exactclauses, notproductpass. |

<a id="at-040"></a>

### AT-040 — CSG giữa slab và lưới nhập

blocked · G3, G4 · [E27](#e27), [E10](#e10), [E09](#e09), [E02](#e02)

Captured product engine explicitly disables actual parent import CSG; algorithm fixtures cannot replace product binding.

| Check | Status | Còn cần / phạm vi observed |
|---|---|---|
| AT-040.1 | blocked | Bind actualrootmesh import+union; analyticoverlapping10mmcubes produce1500mm³, material/target/transform/confirmationandfileoracle with singleatomiccommit. |
| AT-040.2 | blocked | Actualsubtract500mm³ and separate2parts withsourcebytes/XYZ transforms; undo/reopen/rebuildcurrenthead. |
| AT-040.3 | blocked | Openmesh aspart verdict; booleanrefusals point/edgecontacts/ambiguous ties and stableID+metrics cannotcommitpartial/guess target. |
| AT-040.4 | blocked | All5products+2materials actual imported/generatedCSG, orphans onrebuild and exactsource/rawhash/domainhistory; preserve immutable originals. |
| AT-040.5 | blocked | Currentpost-CSGfinalmesh section oracle or clearlynamedunsupportedsection withindependentSTL stillvalid; never fall back to oldslabs. |

## Evidence catalog — code, tests và giới hạn

Mọi đường dẫn dưới đây đã tồn tại và byte được chụp/hash. Narrative/summary khác artifact thật; lần này không rerun sản phẩm. Stable paths không nghĩa mã hiện tại khớp cohort cũ; xem filePins và binary identities.

<a id="e01"></a>

### E01 — Official traceability and verdict contract

Authoring verification records 11 documentation/input checks; official registry enumerates55 requirements,40 campaigns,113 checks.

Code: [tools/reviews/audit-spec-sources.py](../../tools/reviews/audit-spec-sources.py).

Tests: [tests/specification/specification.test.mjs](../../tests/specification/specification.test.mjs).

Evidence: [docs/reviews/20260907-specification/verification.json](../../docs/reviews/20260907-specification/verification.json); [docs/specs/requirements.json](../../docs/specs/requirements.json); [docs/specs/traceability.json](../../docs/specs/traceability.json); [tests/acceptance/cases.json](../../tests/acceptance/cases.json).

Giới hạn (documentation): Authoring statuses specified/unverified are not a current execution ledger. Test code/ID integrity alone does not execute product acceptance.

<a id="e02"></a>

### E02 — Domain schema, transactions and migrations

Parent domain25 and storage-history integration recorded;128 schema fields retain126 catalog entries plus replacements; schedule/diff/origins/undo implemented.

Code: [src/domain/schema.mjs](../../src/domain/schema.mjs); [src/domain/transactions.mjs](../../src/domain/transactions.mjs); [src/domain/layers.mjs](../../src/domain/layers.mjs); [src/domain/migration.mjs](../../src/domain/migration.mjs); [src/domain/project.mjs](../../src/domain/project.mjs).

Tests: [tests/domain/domain.test.mjs](../../tests/domain/domain.test.mjs); [tests/domain/browser-esm.test.mjs](../../tests/domain/browser-esm.test.mjs).

Evidence: [docs/domain/field-dispositions.md](../../docs/domain/field-dispositions.md); [docs/domain/decisions.md](../../docs/domain/decisions.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (component): Field inventory and historical O-02 comments do not establish every native effect or actual UI reachability; current mechanics adapter and raster v2 supersede some earlier pending descriptions.

<a id="e03"></a>

### E03 — Seven deterministic pixel tools

76 portable checks,44 analytic bitmaps; all seven tools and modes, pressure/Shift, crop ellipse, healing, typed undo and stale/cancel.76 checks+17 transport requests per3 engines recorded.

Code: [src/editing/index.mjs](../../src/editing/index.mjs); [src/editing/raster.mjs](../../src/editing/raster.mjs); [src/ui/stage/source-canvas-state.tsx](../../src/ui/stage/source-canvas-state.tsx); [src/ui/stage/SourceCanvas.tsx](../../src/ui/stage/SourceCanvas.tsx).

Tests: [tests/editing/suite.mjs](../../tests/editing/suite.mjs); [tests/editing/core.test.mjs](../../tests/editing/core.test.mjs); [tests/editing/browser.test.mjs](../../tests/editing/browser.test.mjs); [tests/editing/protocol-scenarios.mjs](../../tests/editing/protocol-scenarios.mjs).

Evidence: [docs/editing/ACCEPTANCE.md](../../docs/editing/ACCEPTANCE.md); [docs/editing/ADR-001-raster-semantics.md](../../docs/editing/ADR-001-raster-semantics.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (component): Raster semantics operate. No direct vector-mm editing proof; accepted conversion and actual app all-tool/history/resource UI still require exact product tests.

<a id="e04"></a>

### E04 — Text and selected emoji source preparation

Reference Vietnamese/NFD/variation/cluster/layout, mm/pt/bend, whole sequences and original paint graphs tested. Parent45+14 Node and46+14 per3 engines; actual root/private renderer RPC recorded.

Code: [src/input/text-layout.mjs](../../src/input/text-layout.mjs); [src/input/text-source.mjs](../../src/input/text-source.mjs); [src/input/emoji-source.mjs](../../src/input/emoji-source.mjs); [src/integration/text-adapters.mjs](../../src/integration/text-adapters.mjs); [src/core/text-operations.mjs](../../src/core/text-operations.mjs).

Tests: [tests/text-source/shared-suite.mjs](../../tests/text-source/shared-suite.mjs); [tests/text-source/renderer-suite.mjs](../../tests/text-source/renderer-suite.mjs); [tests/text-app/suite.mjs](../../tests/text-app/suite.mjs); [tests/kernel/text-rpc.test.mjs](../../tests/kernel/text-rpc.test.mjs); [tests/kernel/harfbuzz-native.test.mjs](../../tests/kernel/harfbuzz-native.test.mjs).

Evidence: [docs/input-source/ACCEPTANCE.md](../../docs/input-source/ACCEPTANCE.md); [docs/text-app/ACCEPTANCE.md](../../docs/text-app/ACCEPTANCE.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (component): Full-bidi/font-run and every selected glyph coverage must match the exact corpus. WebKit Worker canvas unavailable: explicit private bounded main-thread renderer tested, not fake Worker pixels. Not full-product/source-datum adoption.

<a id="e05"></a>

### E05 — Immutable font/emoji library and licenses

Parent17 Node/types;16,913 PNG decode;21 checks per3 engines;21,391 assets/306,260,612 bytes and7,751 PNG previews. Original mediaType preserved across distinct .bin wire binding.

Code: [src/integration/source-library.mjs](../../src/integration/source-library.mjs); [src/integration/source-catalog.mjs](../../src/integration/source-catalog.mjs); [tools/release/source-transport.mjs](../../tools/release/source-transport.mjs).

Tests: [tests/source-library/catalog.test.mjs](../../tests/source-library/catalog.test.mjs); [tests/source-library/deploy.test.mjs](../../tests/source-library/deploy.test.mjs); [tests/source-library/browser.mjs](../../tests/source-library/browser.mjs).

Evidence: [docs/assets/readiness-audit.json](../../docs/assets/readiness-audit.json); [docs/assets/input-runtime-audit.json](../../docs/assets/input-runtime-audit.json); [docs/development/integration-evidence-20260908.md](../../docs/development/integration-evidence-20260908.md); [docs/application-build/HANDOFF.md](../../docs/application-build/HANDOFF.md).

Giới hạn (component): Catalog usability/byte provenance is not all-glyph geometric quality, physical printability or automatic legal certification. September5 narrative counts are older than current library.

<a id="e06"></a>

### E06 — Decoded raster and confirmed shared region graph

Real PNG/JPEG/WebP/EXIF and bounded RGBA; operational v2 catalog controls; exact shared graph and confirmation. Parent25 Node+25 per3 Workers and root12 fixtures/11 negatives recorded.

Code: [src/kernel/raster-source/src/decode.rs](../../src/kernel/raster-source/src/decode.rs); [src/kernel/raster-source/src/process.rs](../../src/kernel/raster-source/src/process.rs); [src/kernel/raster-source/src/geometry.rs](../../src/kernel/raster-source/src/geometry.rs); [src/integration/raster-adapters.mjs](../../src/integration/raster-adapters.mjs).

Tests: [src/kernel/raster-source/tests/decoding.rs](../../src/kernel/raster-source/tests/decoding.rs); [src/kernel/raster-source/tests/processing.rs](../../src/kernel/raster-source/tests/processing.rs); [src/kernel/raster-source/tests/topology.rs](../../src/kernel/raster-source/tests/topology.rs); [tests/kernel/raster-rpc.test.mjs](../../tests/kernel/raster-rpc.test.mjs); [tests/product-source/raster-rebind.test.mjs](../../tests/product-source/raster-rebind.test.mjs).

Evidence: [src/kernel/raster-source/README.md](../../src/kernel/raster-source/README.md); [docs/raster-app/ACCEPTANCE.md](../../docs/raster-app/ACCEPTANCE.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (component): Raw label-cell topology and derived geometry are distinct. Total source error remains unknown. Accepted erase/reconversion material-identity path remains a current upstream blocker in state/source-SVG evidence.

<a id="e07"></a>

### E07 — SVG parser, source topology and assembly

35 parser tests and native/WASM fixtures; source assembly140 parity cases/992 independently read parts recorded, including holes/shared seams.

Code: [src/kernel/src/vector.rs](../../src/kernel/src/vector.rs); [src/kernel/source-assembly/src/source_assembly.cpp](../../src/kernel/source-assembly/src/source_assembly.cpp).

Tests: [tests/kernel/svg-source.test.mjs](../../tests/kernel/svg-source.test.mjs); [tests/kernel/native.test.mjs](../../tests/kernel/native.test.mjs); [tests/kernel/wasm.test.mjs](../../tests/kernel/wasm.test.mjs).

Evidence: [docs/development/state.json](../../docs/development/state.json); [docs/development/integration-evidence-20260908.md](../../docs/development/integration-evidence-20260908.md).

Giới hạn (component): Historical binary cohorts; normalized fixture graphs do not prove arbitrary SVG filters, continuous geometry or all current sources. Explicit unsupported paint conversion remains valid only where spec permits.

<a id="e08"></a>

### E08 — Source frame and same-root source ownership

ASFR/root promotion41 files; parent17 native+334 oracle+3Node+3Worker groups recorded. Owned bytes proof has a separate later cohort.

Code: [src/core/runtime-integrity.mjs](../../src/core/runtime-integrity.mjs); [src/integration/product-source-contexts.mjs](../../src/integration/product-source-contexts.mjs); [src/kernel/src/abi/product_runtime.rs](../../src/kernel/src/abi/product_runtime.rs).

Tests: [tests/native-source/runtime.test.mjs](../../tests/native-source/runtime.test.mjs); [tests/native-source/worker.test.mjs](../../tests/native-source/worker.test.mjs); [tests/native-source/oracles.mjs](../../tests/native-source/oracles.mjs).

Evidence: [docs/native-source/EVIDENCE.md](../../docs/native-source/EVIDENCE.md); [docs/native-source/evidence/results.json](../../docs/native-source/evidence/results.json); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (component): Current source-adoption remediation still pending. The captured helper still contains PRODUCT_TEXT_SOURCE_FRAME_UNSUPPORTED for negative manufactured coordinates; do not close adoption from root feature existence alone.

<a id="e09"></a>

### E09 — Actual five-product final scene and material authority

43 Node/types and15 real root+checker Worker models:5 products per3 engines, two-color holedSVG; historical product runtime46 models perengine.

Code: [src/integration/product-adapters.mjs](../../src/integration/product-adapters.mjs); [src/integration/product-services.mjs](../../src/integration/product-services.mjs); [src/integration/final-scene-evidence.mjs](../../src/integration/final-scene-evidence.mjs); [src/integration/final-scene-gates.mjs](../../src/integration/final-scene-gates.mjs).

Tests: [tests/final-scene/provider.test.mjs](../../tests/final-scene/provider.test.mjs); [tests/final-scene/qualification.test.mjs](../../tests/final-scene/qualification.test.mjs); [tests/final-scene/browser.test.mjs](../../tests/final-scene/browser.test.mjs); [tests/product-runtime/runtime.test.mjs](../../tests/product-runtime/runtime.test.mjs).

Evidence: [docs/testevidence/final-scene-main/verification.json](../../docs/testevidence/final-scene-main/verification.json); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (root-integration): Final-scene verification used211b392f…WASM, explicitly not full UI/slicer/fit. Current curvedf146 pair and actual product source/default/edit/reopen matrix not yet qualified.

<a id="e10"></a>

### E10 — Float32 conditioning and final-file readback

Production4 groups and native43 checks; separate instrumented7 groups. Actual union STL correspondence/topology and bounded pair-edge conditioning tested.

Code: [src/core/engine-client.mjs](../../src/core/engine-client.mjs); [src/integration/export-adapters.mjs](../../src/integration/export-adapters.mjs).

Tests: [tests/final-float/runtime.test.mjs](../../tests/final-float/runtime.test.mjs); [tests/final-float/file-oracle.mjs](../../tests/final-float/file-oracle.mjs); [tests/final-float/worker.test.mjs](../../tests/final-float/worker.test.mjs).

Evidence: [docs/testevidence/root-float-integration/verification.json](../../docs/testevidence/root-float-integration/verification.json); [docs/final-export-float-conditioning/EVIDENCE.md](../../docs/final-export-float-conditioning/EVIDENCE.md).

Giới hạn (component): 211b…production vs5be4…fixture binary distinguished. Narrow local conditioning is not whole-pipeline/ambient-isotopy proof. App executable consent/proposal rebase remains pending; fail-closed serializer is not a normal export feature pass.

<a id="e11"></a>

### E11 — Personal printer/settings and sealed mapping

33 Node tests/types/3browser actual root printing;12 readbacks and reader negative control; profile/user ABA, schedule/material hashing. Current personal-profile hardening promoted per state.

Code: [src/integration/printing-adapters.mjs](../../src/integration/printing-adapters.mjs); [src/printing/src/profiles.mjs](../../src/printing/src/profiles.mjs); [src/printing/src/contracts.mjs](../../src/printing/src/contracts.mjs); [src/server/settings.mjs](../../src/server/settings.mjs).

Tests: [tests/printing-app/adapters.test.mjs](../../tests/printing-app/adapters.test.mjs); [tests/printing-app/runtime.test.mjs](../../tests/printing-app/runtime.test.mjs); [tests/printing-app/remote.test.mjs](../../tests/printing-app/remote.test.mjs); [tests/app/printer-profiles.test.mjs](../../tests/app/printer-profiles.test.mjs); [tests/server/printer-profile-boundary.test.mjs](../../tests/server/printer-profile-boundary.test.mjs).

Evidence: [docs/testevidence/printing-app/main-verification.json](../../docs/testevidence/printing-app/main-verification.json); [docs/printing-app/ACCEPTANCE.md](../../docs/printing-app/ACCEPTANCE.md); [docs/app/printer-profile-ui-decisions.md](../../docs/app/printer-profile-ui-decisions.md).

Giới hạn (root-integration): Printing test usedf13…WASM and synthetic scene authority. Available profile is qualified=false; no automatic target qualification. Later profile hardening needs artifact UI/HTTP regression.

<a id="e12"></a>

### E12 — Independent format readback and limited target slicing

Core/project3MF generated and independently decoded. Bambu02.08.02.60 two analytic dry slices passed with exact P1S/source process, placement/material/layer checks.

Code: [src/printing/src/exporter.mjs](../../src/printing/src/exporter.mjs); [src/printing/src/native/arch3mf.cpp](../../src/printing/src/native/arch3mf.cpp).

Tests: [src/printing/tests/unified-oracle.py](../../src/printing/tests/unified-oracle.py); [src/printing/tests/slicer-readback.py](../../src/printing/tests/slicer-readback.py); [src/printing/tests/slicer-cli.py](../../src/printing/tests/slicer-cli.py); [src/printing/tests/verify-schema.ps1](../../src/printing/tests/verify-schema.ps1).

Evidence: [src/printing/docs/SLICERS.md](../../src/printing/docs/SLICERS.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (target-slicer-limited): U1 2.2.1 executable not launched because pre-CLI Sentry writes could not be contained. Manual layer preview/general profile remapping and physical print absent. Two supplied3MFs share one mesh, not two geometry cases.

<a id="e13"></a>

### E13 — Durable local storage, ZIP and crash boundaries

160 checks recorded;20 checkpoint-fault iterations per available browser/backend; actual page-close, IDB abort, CAS/lock and hash fallback. WebKit Windows OPFS unusable, checked IDB fallback.

Code: [src/storage/store.mjs](../../src/storage/store.mjs); [src/storage/head.mjs](../../src/storage/head.mjs); [src/storage/history.mjs](../../src/storage/history.mjs); [src/storage/package.mjs](../../src/storage/package.mjs); [src/storage/zip.mjs](../../src/storage/zip.mjs); [src/storage/access.mjs](../../src/storage/access.mjs); [src/storage/replica.mjs](../../src/storage/replica.mjs).

Tests: [tests/storage/cases.mjs](../../tests/storage/cases.mjs); [tests/storage/multi-tab.mjs](../../tests/storage/multi-tab.mjs); [tests/storage/batch-cases.mjs](../../tests/storage/batch-cases.mjs); [tests/storage/domain-adapter.node.test.mjs](../../tests/storage/domain-adapter.node.test.mjs); [tests/storage/verify-zip.ps1](../../tests/storage/verify-zip.ps1).

Evidence: [docs/storage/VERIFICATION.md](../../docs/storage/VERIFICATION.md); [docs/storage/ADR.md](../../docs/storage/ADR.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (component): Not AT-015.1 kill20 times at each phase perbackend/browser. Quota injected; ZIP STORE subset; mirror/real cloud provider unavailable. Wholeapp geometry rebuild/history latency still unverified.

<a id="e14"></a>

### E14 — Controller and initial actual HTTPS integration

Controller35 Node/selected browser flows; source adoption45 Node plus6 selected cases per3 engines. Actual UI HTTPS source/erase/undo/save/reopen/STL passed in three engines.

Code: [src/app/controller.mjs](../../src/app/controller.mjs); [src/app/projects.mjs](../../src/app/projects.mjs); [src/app/remote.mjs](../../src/app/remote.mjs); [src/integration/application.mjs](../../src/integration/application.mjs).

Tests: [tests/app/controller.node.test.mjs](../../tests/app/controller.node.test.mjs); [tests/app/source-adoption.node.test.mjs](../../tests/app/source-adoption.node.test.mjs); [tests/app/online-policy.browser.mjs](../../tests/app/online-policy.browser.mjs); [tests/e2e/application.test.mjs](../../tests/e2e/application.test.mjs).

Evidence: [docs/development/integration-evidence-20260908.md](../../docs/development/integration-evidence-20260908.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (initial-e2e-fixture-recipe): Those E2E tests inject a labelled SVG extrusion recipe; they do not qualify five actual product recipes. Later source/profile/controller changes require current package runs.

<a id="e15"></a>

### E15 — Async input identity and export drafts

10 Node/type plus41/48 browser checks perengine for file-byte identity, draft preservation, account/project ABA and late result rejection. Initial3 failures preserved.

Code: [src/ui/core/registry.ts](../../src/ui/core/registry.ts); [src/ui/components/Fields.tsx](../../src/ui/components/Fields.tsx); [src/ui/sections/ExportSection.tsx](../../src/ui/sections/ExportSection.tsx).

Tests: [tests/ui/request-boundary/pure.test.mjs](../../tests/ui/request-boundary/pure.test.mjs); [tests/ui/request-boundary/browser-cases.mjs](../../tests/ui/request-boundary/browser-cases.mjs); [tests/ui/request-boundary/export-cases.mjs](../../tests/ui/request-boundary/export-cases.mjs).

Evidence: [docs/testevidence/ui-request-boundary/README.md](../../docs/testevidence/ui-request-boundary/README.md); [docs/testevidence/ui7-export/verification.json](../../docs/testevidence/ui7-export/verification.json).

Giới hạn (component): Real React with explicit synthetic bridge; actual provider/backend/native assembly not exercised.

<a id="e16"></a>

### E16 — Explicit consent and partial UI remediation

21 lifecycle+48 boundary checks each3engines,10 Node/types; UI-R1-01..04 closed in this scope. Later9 follow-up perengine reported by parent.

Code: [src/ui/dialogs/confirm-effect.ts](../../src/ui/dialogs/confirm-effect.ts); [src/ui/sections/ExportConfiguration.tsx](../../src/ui/sections/ExportConfiguration.tsx).

Tests: [tests/ui/export-consent/cases.mjs](../../tests/ui/export-consent/cases.mjs); [tests/ui/export-consent/followup-cases.mjs](../../tests/ui/export-consent/followup-cases.mjs); [tests/ui/export-consent/keyboard-cases.mjs](../../tests/ui/export-consent/keyboard-cases.mjs); [tests/ui/export-consent/readability-cases.mjs](../../tests/ui/export-consent/readability-cases.mjs).

Evidence: [docs/testevidence/ui-consent/verification.json](../../docs/testevidence/ui-consent/verification.json); [docs/reviews/20260908-ui-export-r1/README.md](../../docs/reviews/20260908-ui-export-r1/README.md).

Giới hạn (component): UI-R1-05..08 still unresolved at captured v15/v16: Escape layering, disabled reasons, units/limits accessible names, select layout. UI11 exit1 retained; no use/resumption of Opus.

<a id="e17"></a>

### E17 — Real viewport, picking and PNG

Three engines18 realSVG/root/Three checks and9 PNG checks perengine recorded: picking including hole, camera, framebuffer dimensions, resource cleanup.

Code: [src/viewport/three-viewport.mjs](../../src/viewport/three-viewport.mjs); [src/integration/viewport-export.mjs](../../src/integration/viewport-export.mjs).

Tests: [tests/viewport/browser.test.mjs](../../tests/viewport/browser.test.mjs); [tests/viewport/png-checks.mjs](../../tests/viewport/png-checks.mjs); [tests/viewport/adapters.test.mjs](../../tests/viewport/adapters.test.mjs).

Evidence: [docs/development/state.json](../../docs/development/state.json); [docs/development/integration-evidence-20260908.md](../../docs/development/integration-evidence-20260908.md).

Giới hạn (component): Not all design-object drag/numeric equivalence or actual five-product/contextloss UI. Camera/view proof independent of print pose.

<a id="e18"></a>

### E18 — Accounts, authorization, BYOK and exact ledger

Parent136/136 real HTTP/SQLite tests,syntax and codeStable; real signed localIdP/two members+owner, secret canaries, scoped quota/dedup/unknown accounting.

Code: [src/server/accounts.mjs](../../src/server/accounts.mjs); [src/server/oidc.mjs](../../src/server/oidc.mjs); [src/server/vault.mjs](../../src/server/vault.mjs); [src/server/ai.mjs](../../src/server/ai.mjs); [src/server/policy.mjs](../../src/server/policy.mjs).

Tests: [tests/server/accounts-settings.test.mjs](../../tests/server/accounts-settings.test.mjs); [tests/server/boundaries.test.mjs](../../tests/server/boundaries.test.mjs); [tests/server/ai-ledger.test.mjs](../../tests/server/ai-ledger.test.mjs); [tests/server/adapters-ledger.test.mjs](../../tests/server/adapters-ledger.test.mjs).

Evidence: [tmp/reviews/codex/runs/20260908-backend-b11-main-r1/reports/test-summary.json](../../tmp/reviews/codex/runs/20260908-backend-b11-main-r1/reports/test-summary.json); [docs/backend/ISSUES.md](../../docs/backend/ISSUES.md); [docs/backend/ADAPTER-ISSUES.md](../../docs/backend/ADAPTER-ISSUES.md).

Giới hạn (backend-integration): Synthetic identities/provider facts, not deployment or invoices. Later settings/profile changes differ from recorded136 cohort. Independent review route rejected; never retry or infer certification.

<a id="e19"></a>

### E19 — Staged AI references and genuine images

B03 included in136: owner/session/revision/hash staged reference, PNG8/baselineJPEG real decode+thumbnail, private result/download, exact quote/reference consent and byte reservation.

Code: [src/server/image-assets.mjs](../../src/server/image-assets.mjs); [src/server/image-codec.mjs](../../src/server/image-codec.mjs); [src/server/adapters/xai-image.mjs](../../src/server/adapters/xai-image.mjs); [src/app/remote.mjs](../../src/app/remote.mjs).

Tests: [tests/server/image-codec.test.mjs](../../tests/server/image-codec.test.mjs); [tests/server/image-http.test.mjs](../../tests/server/image-http.test.mjs); [tests/server/image-remote.test.mjs](../../tests/server/image-remote.test.mjs); [tests/server/image-adapter.test.mjs](../../tests/server/image-adapter.test.mjs).

Evidence: [docs/backend/IMAGE-API.md](../../docs/backend/IMAGE-API.md); [docs/backend/IMAGE-CODEC.md](../../docs/backend/IMAGE-CODEC.md); [docs/backend/IMAGE-PROVIDER-EVIDENCE.md](../../docs/backend/IMAGE-PROVIDER-EVIDENCE.md); [tmp/reviews/codex/runs/20260908-backend-b11-main-r1/reports/test-summary.json](../../tmp/reviews/codex/runs/20260908-backend-b11-main-r1/reports/test-summary.json).

Giới hạn (backend-integration): Backend AI codec subset differs from local design importer. Progressive/CMYK/EXIF/ICC/remote outputs refused. No liveAI/key/spend. Pricing evidence dated; deployments must revalidate plan/capability; no browsing/live call in this inventory.

<a id="e20"></a>

### E20 — Recovery and foreground maintenance

B05+B11 actualSQLite/CLI in136: actual charge above quote, original UTC holds, replay tombstones, no restored keys, exact recovery plan, lock/no-overlap/high-water, received-output shutdown settlement/deadline. Schema5/cadence5min.

Code: [src/server/recovery.mjs](../../src/server/recovery.mjs); [src/server/runtime-operations.mjs](../../src/server/runtime-operations.mjs); [src/server/maintenance.mjs](../../src/server/maintenance.mjs); [src/server/operations.mjs](../../src/server/operations.mjs).

Tests: [tests/server/recovery.test.mjs](../../tests/server/recovery.test.mjs); [tests/server/recovery-cli.test.mjs](../../tests/server/recovery-cli.test.mjs); [tests/server/runtime-shutdown.test.mjs](../../tests/server/runtime-shutdown.test.mjs); [tests/server/runtime-maintenance.test.mjs](../../tests/server/runtime-maintenance.test.mjs); [tests/server/runtime-cli.test.mjs](../../tests/server/runtime-cli.test.mjs).

Evidence: [docs/backend/RECOVERY-ACCEPTANCE.md](../../docs/backend/RECOVERY-ACCEPTANCE.md); [docs/backend/RUNTIME-ACCEPTANCE.md](../../docs/backend/RUNTIME-ACCEPTANCE.md); [docs/backend/RUNTIME-RUNBOOK.md](../../docs/backend/RUNTIME-RUNBOOK.md); [tmp/reviews/codex/runs/20260908-backend-b11-main-r1/reports/test-summary.json](../../tmp/reviews/codex/runs/20260908-backend-b11-main-r1/reports/test-summary.json).

Giới hạn (backend-integration): Controlled backup hashes/drain races are not physical RPO/RTO or offsite purge; operators must preserve external key material, ACLs and reconcile real provider facts.

<a id="e21"></a>

### E21 — HTTPS host, OIDC proxy and service worker

LocalHTTPS COI/SAB/strictCSP/cookies/redirect/CSRF and owner+two member isolation; stopped-host offline public-shell retrieval; poisoned/private/login200 cache rejection.

Code: [src/host/manifest.mjs](../../src/host/manifest.mjs); [src/host/server.mjs](../../src/host/server.mjs); [src/host/service-worker.mjs](../../src/host/service-worker.mjs).

Tests: [tests/host/https.test.mjs](../../tests/host/https.test.mjs); [tests/host/service-worker.test.mjs](../../tests/host/service-worker.test.mjs); [tests/host/browser.test.mjs](../../tests/host/browser.test.mjs); [tests/host/operations.test.mjs](../../tests/host/operations.test.mjs).

Evidence: [docs/hosting/TESTING-AND-LIMITS.md](../../docs/hosting/TESTING-AND-LIMITS.md); [docs/hosting/DEPLOYMENT.md](../../docs/hosting/DEPLOYMENT.md).

Giới hạn (host-integration-fixture): Synthetic WASM42 and fixture shell, not production geometry/catalog. RealTLS/IdP/cloud/ops load/powerloss unresolved. Stopped host is not airplane-mode proof.

<a id="e22"></a>

### E22 — Release transport, package and licenses

46 parent tests including real localhostHTTPS;21,391 original assets+7,751 previews; bounded manifests, hashes, MIME/private-path protections.

Code: [tools/release/build.mjs](../../tools/release/build.mjs); [tools/release/source-transport.mjs](../../tools/release/source-transport.mjs); [src/host/manifest.mjs](../../src/host/manifest.mjs).

Tests: [tests/release/build.test.mjs](../../tests/release/build.test.mjs).

Evidence: [docs/testevidence/release-packaging/main-verification.json](../../docs/testevidence/release-packaging/main-verification.json); [docs/release/TESTING.md](../../docs/release/TESTING.md); [docs/release/RUNBOOK.md](../../docs/release/RUNBOOK.md).

Giới hạn (packaging): Synthetic entry/WASM in initial release tests. 306MB assets is not RSS cap. Immutable catalog transport is separate from original materializer. No deployment claim.

<a id="e23"></a>

### E23 — Actual production builder and immutable baseline

26 promoted files;33 unit+6 pinned receipt pass. Actual index/main/product-entry,4 explicit Worker chunks, private runtime schema5 and full library packaged. Baseline1147…manifest/136b…prepared.

Code: [tools/application/build.mjs](../../tools/application/build.mjs); [tools/application/engine.mjs](../../tools/application/engine.mjs); [tools/application/snapshot.mjs](../../tools/application/snapshot.mjs); [src/integration/product-entry.mjs](../../src/integration/product-entry.mjs).

Tests: [tests/application-build/unit.test.mjs](../../tests/application-build/unit.test.mjs); [tests/application-build/receipt.test.mjs](../../tests/application-build/receipt.test.mjs); [tests/application-build/acceptance.test.mjs](../../tests/application-build/acceptance.test.mjs); [tests/application-build/browser.test.mjs](../../tests/application-build/browser.test.mjs).

Evidence: [docs/application-build/HANDOFF.md](../../docs/application-build/HANDOFF.md); [docs/application-build/TESTING.md](../../docs/application-build/TESTING.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (compiled-artifact-shell): Baseline64c5/b67d only. First missing-input receipt invocation failed before tests. Earlier5/7 acceptance SOURCE_CHANGED retained, not7/7; current full7 fresh reproducibility rerun and actual product workflows pending.

<a id="e24"></a>

### E24 — Strict owned-byte compiled Worker initialization

Baseline64c5/b67d compiled Worker3/3:one fetch,one byte-array instantiation,hash exact,no streaming/secondModule;corrupt bytes rejected before ready. Parent13 scenarios per3workers separately recorded.

Code: [src/core/runtime-integrity.mjs](../../src/core/runtime-integrity.mjs); [src/core/engine-client.mjs](../../src/core/engine-client.mjs); [tools/kernel/module-incoming-api.json](../../tools/kernel/module-incoming-api.json).

Tests: [tests/application-build/owned-worker.test.mjs](../../tests/application-build/owned-worker.test.mjs); [tests/application-build/owned-worker-probe.mjs](../../tests/application-build/owned-worker-probe.mjs).

Evidence: [docs/application-build/OWNED-WORKER.md](../../docs/application-build/OWNED-WORKER.md); [docs/application-build/HANDOFF.md](../../docs/application-build/HANDOFF.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (compiled-worker): Old527a wrapper ignored Module.wasmBinary and cannot qualify. Current64c5/f146 receipt is build evidence only here; v16 Chrome/WebKit reported pass,Firefox page navigation failed before geometry. No current three-engine pass.

<a id="e25"></a>

### E25 — Committed source-only color SVG

26 Node/types;5 real source families per3 rootWorkers;163 independent SVG readbacks. Before3D path, current materials/dependencies, forged metadata/hash/ABA/cancel gates.

Code: [src/integration/source-svg-export.mjs](../../src/integration/source-svg-export.mjs); [src/integration/export-adapters.mjs](../../src/integration/export-adapters.mjs).

Tests: [tests/source-svg-export/cases.test.mjs](../../tests/source-svg-export/cases.test.mjs); [tests/source-svg-export/browser.test.mjs](../../tests/source-svg-export/browser.test.mjs); [tests/source-svg-export/readback.py](../../tests/source-svg-export/readback.py).

Evidence: [docs/testevidence/source-svg-main/verification.json](../../docs/testevidence/source-svg-main/verification.json); [docs/testevidence/source-svg-main/readback.json](../../docs/testevidence/source-svg-main/readback.json).

Giới hạn (root-integration): WASM211b…cohort, not latestf146. Explicit raster erase/reconversion material-ID conflict remains open upstream; sourceprovider must not export old original instead.

<a id="e26"></a>

### E26 — Curved default products remediation

110 files promoted; authored40 default real InterO/Notoemoji product/style cases+12 derivatives addressed prior22 refusals with independent geometry oracles.

Code: [src/kernel/mechanics/src/catalog-map.mjs](../../src/kernel/mechanics/src/catalog-map.mjs).

Tests: [tests/curved-products/surface-parity.test.mjs](../../tests/curved-products/surface-parity.test.mjs); [tests/curved-products/oracle.mjs](../../tests/curved-products/oracle.mjs); [tests/product-source/native-refusals.json](../../tests/product-source/native-refusals.json).

Evidence: [docs/curved-products/LIMITS.md](../../docs/curved-products/LIMITS.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (native-component): Historical native-refusals records22 failures; new author matrix is not current root acceptance. v16 combined81model Node run exceeded240s before text/emoji; SVG/raster partial captures are not suite pass. Full-source/adoption remediations still ongoing.

<a id="e27"></a>

### E27 — Required imported CSG binding gap

Captured main advertises geometry.import-csg available:false, reason Actual parent import CSG is not bound.; mesh.apply requires a capability not exposed by that engine.

Code: [src/integration/product-adapters.mjs](../../src/integration/product-adapters.mjs); [src/app/projects.mjs](../../src/app/projects.mjs).

Tests: [tests/product-app/adapters.test.mjs](../../tests/product-app/adapters.test.mjs); [tests/product-runtime/runtime.test.mjs](../../tests/product-runtime/runtime.test.mjs).

Evidence: [docs/development/state.json](../../docs/development/state.json); [docs/product-source/ISSUES.md](../../docs/product-source/ISSUES.md).

Giới hạn (code-inspection): No actual all-five-product add/union/subtract app proof. Separate parser/native work cannot close root/history/material/target or post-CSG section acceptance. This is required GEO-04, not merely a physical-fit label.

<a id="e28"></a>

### E28 — Field control and application acceptance remaining

Actual React component regression and authored UI work retained; v16 owner stopped Opus, UI11 exit1.

Code: [src/ui/components/Fields.tsx](../../src/ui/components/Fields.tsx); [src/ui/stage/SourceCanvas.tsx](../../src/ui/stage/SourceCanvas.tsx); [src/ui/core/registry.ts](../../src/ui/core/registry.ts).

Tests: [tests/app/ui-contract.browser.mjs](../../tests/app/ui-contract.browser.mjs); [tests/ui/export-consent/extra-cases.mjs](../../tests/ui/export-consent/extra-cases.mjs).

Evidence: [docs/reviews/20260908-ui-export-r1/README.md](../../docs/reviews/20260908-ui-export-r1/README.md); [docs/development/state.json](../../docs/development/state.json).

Giới hạn (component): No current combined wholeapp5products/login/defaults/import/undo/save/reopen/export result at inventory cutoff; owner/UI handoff needed, not automatic waiting/resuming a stopped agent.

## Kiểm inventory và bàn giao

Run này chỉ đọc, chụp/hash và kiểm association/quote/path; không gọi ghế review/agent, Opus, AI trả phí, provider thật, máy in hay deploy. Main và frozen builder không bị ghi. Inherited Codex không tự chứng minh actual effort/fast/model; không có independent-review compliance claim. Backend filter rejection không thử lại hoặc thay route.

Machine JSON: [RELEASE-COVERAGE.json](../../docs/development/RELEASE-COVERAGE.json). Validation/preimages/checked manifest và input custody ở `tmp/reviews/codex/runs/20260908-release-coverage-inventory/reports` và `inputs`. Parent nhận2 delta docs, tự quyết gate và rerun khi combined source/package ổn định. Đổi dependency/input/artifact phải tạo cohort mới; không đổi kết luận lịch sử thành pass.
