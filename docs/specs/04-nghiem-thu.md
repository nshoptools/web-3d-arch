# Nghiệm thu, thước đo và điều kiện phát hành

Thuộc [đặc tả 1.0.1](README.md). [cases.json](../../tests/acceptance/cases.json)
chứa kịch bản với bước thực hiện/oracle/điều kiện; [requirements.json](requirements.json)
nối mỗi yêu cầu tới kịch bản. Danh sách kịch bản **chưa phải kết quả đã chạy**.

40 chiến dịch chứa 113 phép kiểm có ID `AT-xxx.n`, action/expected và oracle
riêng (công cụ dự kiến, cách đo, ngưỡng, tính độc lập và readiness). Ma trận
`testChecks` ánh xạ yêu cầu tới đúng phép kiểm; `testCases` chỉ nhóm để điều phối.
Công cụ/version chưa có ghi null/unverified, không giả đã chọn hoặc đã chạy.
Khi thực thi, ghi verdict/evidence riêng từng check và từng biến thể môi trường;
không dùng một tick làm đạt mọi khẳng định trong cả chiến dịch.

### QA-01 — Verdict và mức xác minh

| Verdict | Nghĩa | Exit khi chọn làm phép kiểm bắt buộc |
| --- | --- | --- |
| pass | Phép kiểm đã chạy, đúng input/version và đạt oracle | 0 |
| fail | Đã chạy và không đạt | 1 |
| unverified | Chưa chạy đủ: thiếu tool/máy/fixture hoặc vượt budget | 2 |
| unsupported | Capability chưa có ở phiên bản được kiểm | 2 |

Suite tổng: có fail →1; không fail nhưng có phép bắt buộc unverified/unsupported
→2; mọi phép đã chọn chạy đạt →0. Capability ngoài scope có thể không chọn nhưng
phải liệt rõ, không tăng số pass. Một test **kiểm từ chối định dạng chưa hỗ trợ**
có thể pass khi hành vi từ chối đúng; đó không phải format đã supported.

Mỗi record gồm requirement/case ID, input hash/corpus version, application/kernel/
adapter version, tool/OS/browser/printer, command/steps, expected/actual, verdict,
thời điểm và evidence path/hash. Không có phép đo thì không ghi “verified” trên
asset hoặc tính năng. Không dùng cờ tự khai của generator hoặc vote của các ghế
thay cho oracle. Lời nhận xét review và kết quả chạy test là loại bằng chứng khác.

| Mức trên một artifact | Phải có | Không chứng minh |
| --- | --- | --- |
| Nguồn đọc được | Hash, parse, semantics được xử lý/ghi rõ thiếu | Mesh hoặc khả năng in |
| Hình học đã kiểm | Oracle độc lập, units, holes/manifold/volume/intersection/bounds | Slicer hiểu mapping hoặc bản in lắp vừa |
| Đã kiểm trên slicer | Đúng slicer/version/profile, preview lớp/materials/dimensions | Sai số/lực lắp bản in |
| Đã in và đo | Coupon/raw measurements/phần cứng/vật liệu/dụng cụ, giới hạn kết luận | Máy/vật liệu/cấu hình khác |

“Xuất để kiểm tra” ở EXP-02 giữ warning và verdict trong report; không cấp nhãn
sẵn sàng in. Mức qualification là vector theo từng tiêu chí, không một tick xanh
chung. Fail topology có thể vẫn serialize STL để sửa ở công cụ khác; 3MF bắt buộc
tuân schema/semantics của biến thể xuất, không chứa tham chiếu vật liệu hỏng.

### QA-02 — Corpus, oracle và tính độc lập

Corpus có manifest/hash/license/purpose/expected provenance; bản v1 bất biến,
thêm regression riêng hoặc v2. Giữ corpus đo tách catalog nguồn phát hành. Hai
gói máy khác nhau nhưng cùng payload mesh chỉ là một ca geometry, hai ca adapter.
Fixture có lỗi được gắn expected rejection, không tự “sửa golden” để test xanh.

Phủ tối thiểu trước G3/G5: SVG fill-rule mặc định/evenodd/nonzero, lỗ/contour rời,
stroke/transform/arc/nonuniform scale/nested clip/use, gradient/alpha/composite,
mask/filter/foreignObject/ảnh nhúng bị từ chối có tên khi chưa hỗ trợ; raster
alpha/EXIF/khác resolution; TTF/OTF/WOFF2 theo capability; tiếng Việt NFC/NFD,
ligature/kerning/bidi, variable axes và glyph thiếu; emoji ZWJ/modifier/flag/keycap/
FE0E/FE0F/COLRv1/CBDT; STL ASCII/binary, OBJ; gói3MF hợp lệ và mapping hỏng;
ZIP thiếu font/hash sai/path traversal/zip bomb; dữ liệu qua giới hạn và lỗi I/O.

Oracle hình học đọc **file xuất**, không chỉ buffer trước serialize: topology
cạnh và vertex link, orientation, degenerate face, thể tích có dấu, self-intersection,
giao thể tích giữa vật liệu, lỗ/thành mỏng/chi tiết rời, bounds/unit/placement.
Với hình giải tích dùng area/volume/kích thước độc lập và bound của pipeline.
Tessellation lệch về phía vật liệu tối đa phải kiểm sign ở cả chốt lẫn lỗ.
Đọc lại bằng thư viện khác writer; kiểm mối phụ thuộc chung khi gọi “độc lập”.

Budget GEO-02 là **mục tiêu tính toán**, không lấy raster 45/520 mm/px để nghiệm
thu1 µm. Render so nguồn phát hiện mất hình/màu; không thay oracle mesh. Kiểm
slicer/g-code chỉ chứng minh toolpath theo phạm vi phép kiểm, không là đo vật in.
Mọi tỷ lệ đạt phải được tính từ record đã chạy trên corpus/version có mặt
trong bộ kiểm, không nhận con số thiếu dữ liệu tái lập làm baseline.

### QA-03 — Các chiến dịch nghiệm thu bắt buộc

| Chiến dịch | Cách kiểm / kết quả cần quan sát |
| --- | --- |
| Native/ABI | Cùng input/revision qua native và WASM; layout/i64, overflow, error, ownership/pin/release, grow, publish muộn và cancel; không đọc mesh đang ghi |
| Web | Chromium, Firefox, WebKit đúng phiên bản ghi log; COI headers trên dev/deployed/offline/cache/redirect; thiếu SAB/WebGL/storage có lý do và cứu dữ liệu |
| History/storage | Font riêng+lưới nhập+màu tay+flip; kill tại từng bước put/manifest/head/cleanup, ít nhất20 lần trên mỗi backend/browser được hỗ trợ; khôi phục commit cuối đã ack, không trộn thế hệ |
| Nhiều nơi lưu | 2 tab cùng user/dự án, 2 user cùng origin, 2 thiết bị; lock handover/revision conflict, mất quota/quyền mirror, thiếu asset và migration lỗi giữ bản cũ |
| UI | Mỗi6 khu×2 bước và popup; bảy công cụ, text component ở2 vị trí, hidden params qua tìm nhanh, IME/touch/keyboard, override/undo và cảnh báo xuất |
| Layout/a11y | 320 px; x−1/x/x+1 quanh720/1023/1180/1400; fractional zoom, text200%, height≤520, virtual keyboard/safe area, forced-colors/reduced-motion, font fallback; screen reader + nhìn thật |
| AI/account | 2 member+owner; IDOR/CSRF/session revoke, credentials/job/result khác user; double-click/retry timeout unknown, atomic budget race, logout callback muộn, không key owner fallback |
| Input thù địch | MIME giả, decompress/depth/size limits, XXE/recursive-use, SVG script/fetch, font/mesh hỏng; không chạy code, không leak nguồn/secret hoặc commit dở |
| Slicer | Bambu và U1 từng version riêng; Core/project metadata, transforms, khe/nozzle/materials, first layer, bed, compensation; đọc/slice/preview/screenshot/log |
| Physical | Bốn họ cơ khí + seam/màu; ít nhất3 lần in khác ngày mỗi cấu hình, raw measurements/coupon/hardware/version và criteria lực/nứt/lỏng đã định trước |
| Mở rộng | Importer/exporter/processor mới từ registry không sửa logic UI cứng; thiếu module/version mới read-only, migration crash rollback, không phá nguồn màu/hồ sơ cũ |

Không giết trình duyệt/ứng dụng người dùng để tạo phép crash. Dùng process/profile
thử nghiệm riêng trong repo. Chưa có app/slicer/coupon ở đợt biên soạn nên các
chiến dịch sản phẩm ở trên đều **unverified**.

### QA-04 — Duy trì đặc tả và chứng cứ

Kiểm tự động tài liệu bắt ID duy nhất, link nội bộ, truy vết toàn bộ mục nguồn,
check có action/ngưỡng/phép đo riêng và liên kết hai chiều, dữ liệu mẫu có hash
và parameter default/domain. Từ chối oracle mẫu chép giống nhau; ca hình học
giải tích trỏ corpus/hash và số kỳ vọng (184 mm², seam 10 mm, thể tích CSG).
Kiểm này không xác nhận chất lượng văn xuôi hoặc thay phản biện. Mọi đầu vào
của kiểm đặc tả phải là tệp bền trong repository; thiếu fixture bắt buộc là
lỗi đóng gói. Không hạ lỗi thiếu dữ liệu thành bỏ qua hoặc pass. Bộ kiểm phải
chạy được trên bản sao chỉ gồm tài liệu, công cụ, mã và fixture đã khai.

Trước cổng phát hành, ghi phạm vi, remaining issues và người chịu trách nhiệm;
không còn lỗi bảo mật/tính phí/mất dữ liệu/serializer P1 trong scope. Quyết định
chưa có phép đo chặn đúng capability/nhãn tương ứng như O-01–O-06, không biến
mọi thiếu máy in thành lý do không làm tiếp phần độc lập. Chi tiết review và
disposition ở [báo cáo thẩm định](../reviews/20260907-specification/README.md).

Chạy kiểm tài liệu hiện có bằng `tools/tests/run.ps1 -Suite specification`.
Baseline có thêm contract font-source hiện hữu; hai suite không bao gồm app UI,
mesh generation, slicer hoặc in thử. Không cài tool/dependency toàn cục.
