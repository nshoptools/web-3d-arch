# Kiến trúc mở rộng và lộ trình theo cổng

Thuộc [đặc tả 1.0.1](README.md). V1 là công cụ thiết kế hiện hành; kiến trúc phải
cho phép bổ sung xử lý/tạo tệp in 3D mà không thay dự án cũ hay phá hợp đồng nguồn.

### EXT-01 — Module và chiều phụ thuộc

Khởi đầu bằng một ứng dụng có module rõ, một backend dịch vụ có module rõ;
không bắt buộc microservices cho một nhóm nhỏ. Các ranh giới: domain/project,
asset/input, geometry, validation, export, printer/slicer adapters, storage,
identity, AI providers và UI. Geometry/domain không import UI/network/OS path;
UI không import trực tiếp parser hay boolean. Backend không làm hình học v1.

Registry khai capability của importer/exporter/processor/product recipe bằng
ID ổn định, version, configSchemaVersion, input/output types, requirements,
limits, migrations và validation hooks. V1 nạp module đã kiểm trong bản dựng;
không eval JS/Python từ tệp dự án hoặc tải plugin tùy ý của member. Plugin từ
bên thứ ba về sau cần mô hình phân quyền/cô lập và review trước khi mở.

Bảy đường xuất v1 là các mục registry có ID trong bản dựng, không một tập switch
đóng theo tên hãng. ID gồm `export.svg.source`, `export.svg.section`,
`export.3mf.bambu-project`, `export.3mf.snapmaker-project`,
`export.stl.material-zip`, `export.stl.union`, `export.png.view`; profile là
đối số có version riêng. UI đọc metadata module đã đăng ký, không đọc script
từ project để tạo module. Thêm module dùng widget đã có không sửa logic UI;
capability mới cần tương tác mới được thêm component có kiểm, không hứa mọi
chức năng chỉ cần sửa JSON. Core 3MF là hợp đồng nội bộ của adapter; thêm nút
Core trung tính sau này qua registry, chưa là đường xuất thứ tám của v1.

Các dạng trung gian có tag/schema: source bytes, display/paint graph, vùng sản
xuất xếp Z, mesh scene và artifact. Toolpath có thể là dạng mới khi thêm slicing;
không ép mesh 3D tổng quát/STEP/SDF thành slab, không raster hóa để đi vừa ABI cũ.
Recipe mới khai feature types và test; chỉ phần hình học tương đương mới tái sử
dụng pipeline 2,5D. Sáu khu/hai bước là workspace thiết kế v1, registry có thể
đăng ký workspace xử lý khác về sau, không kéo tab cũ thành lệnh vô nghĩa.

### EXT-02 — Hợp đồng job và artifact

Job khai jobId, ownerId, projectId/revision, processorId/version, input hashes,
params, capability snapshot, resource budget và cancellation token. Các trạng
thái queued/running/succeeded/failed/cancelled/unverified có event sequence và
progress stage; thứ tự cập nhật không được suy từ thời gian client. Validator
trả bốn verdict của QA-01 độc lập với trạng thái thực thi job.

Artifact bất biến có id, mediaType/formatVersion, byteLength, SHA-256, source/job
provenance, units/coordinate system/bounds khi có hình học, material mapping,
validation report và warnings. Thumbnail là artifact riêng, không bằng chứng
mesh. Side effects chỉ publish sau validation và commit, không lộ tệp nửa ghi.
Execution adapter local Worker hiện hành và adapter remote tương lai dùng cùng
job envelope; remote là mở rộng cần người dùng đồng ý truyền dữ liệu, quyền,
chi phí và quota riêng. Không cho module tự đổi nơi xử lý.

### EXT-03 — Version, migration và sự bền vững của ID

Tách project schema, C ABI, parameter schema, recipe, source catalog, slicer
profile, AI adapter và application version. Manifest pin mọi version/hash cần
tái dựng. Thay tên UI không thay ID; field bị bỏ có tombstone và migration.
Semantic ID bền cho feature nguồn. Khi boolean/segmentation tách/gộp vùng, dùng
provenance mapping xác định; override không có đích duy nhất trở thành orphan
có UI xử lý, không gán sang vùng “gần nhất” hoặc xóa ngầm.

Đọc version mới/extension bắt buộc chưa hiểu: read-only/cứu dữ liệu, giữ nguyên
byte và chỉ rõ module thiếu. Không mở bằng cách bỏ node/field rồi lưu đè. Migration
copy-on-write, có dry-run/diff, backup và rollback. Thử old→new, new→old bị từ
chối an toàn, missing module, crash giữa migration. Update PWA giữ bundle/schema
cùng phiên bản cho phiên đang sửa, không hot-swap WASM giữa job; mời reload sau
commit. Rollback bản chạy không được làm hỏng dự án đã nâng schema.

### EXT-04 — Adapter định dạng, máy in và năng lực

Importer có sniff/validate/decode, danh sách semantics hỗ trợ và diagnostics
theo phần nguồn. Exporter có preflight/serialize/validate-output; trả file chuẩn
hoặc lỗi có tên. Capability matrix phân biệt preview/import/edit/export/roundtrip/
physical calibration; nút chỉ gọi capability đã có, không suy từ extension tên tệp.

Slicer adapter pin slicer/version/profile hash và mapping theo **từng khóa**:
filament, extruder, nozzle, dimensions, first layer/layer schedule, machine G-code,
materials, coordinate transforms và bed exclusion. Không nhân/cắt mọi mảng cùng
độ dài như thể cùng ngữ nghĩa. Gói 3MF Core dùng thư viện; metadata riêng hãng do
adapter phụ trách và kiểm bằng slicer đích. Mẫu đầu vào chỉ là fixture, không
template phát hành khi còn xung đột hoặc chưa rõ nguồn/quyền.

### EXP-03 — Hồ sơ bàn in và bố trí vật thật

User chọn máy của mình, số nozzle/filament, đường kính nozzle, vật liệu, vùng
in và profile hiệu chuẩn. Bed là polygon có hệ tọa độ/origin, vùng loại trừ,
giới hạn Z và quy tắc placement; hộp rộng×sâu là thông tin phụ. Máy tròn/đa giác/
có vùng cấm phải kiểm toàn footprint sau transform, không chỉ min/max XY.

Camera placement độc lập với design/print placement. Lật xuất đặt đáy Z=0 và
kiểm lại bed/collision; nhiều part rời giữ khoảng cách/khả năng in theo profile.
Cho custom profile có nhãn chưa kiểm chứng; không có profile thì xuất hình học
trung tính để kiểm, không gắn nhãn phù hợp máy. Fixture
[printer-beds.json](../../tests/fixtures/printing-reference/v1/printer-beds.json)
có 1.057 record tham khảo, không phải 1.057 máy đã được ứng dụng hỗ trợ.
Để promote một profile cần source revision/license/hash, đơn vị, polygon hợp
lệ, kế thừa đã resolve và kiểm trên slicer; lỗi/quá cũ được chỉ rõ.

### EXT-05 — Cổng triển khai và phát hành

| Cổng | Sản phẩm công việc phải có | Điều kiện đi tiếp |
| --- | --- | --- |
| G0 — đặc tả | Yêu cầu có ID, truy vết, phản biện và disposition | Không còn mâu thuẫn P1 chưa có quyết định/gate; giới hạn review công bố |
| G1 — nhân native | Một SVG có lỗ/chung biên đi tới mesh/STL, oracle độc lập | Source semantics, mesh và error budget của corpus tối thiểu đạt |
| G2 — web tối thiểu | Cùng nhân qua Worker/WASM, buffer ownership, hủy, COI, lưu/recover | Ba engine/host baseline và crash injection đạt; không cần viewer để chứng minh ABI |
| G3 — chức năng nguồn và cơ khí | Bốn họ, raster/vector/chữ/màu, schema/lịch sử | Nhóm tham số có schema thẩm định; fixture/migration; fit còn nhãn chưa đo nếu thiếu coupon |
| G4 — ứng dụng nội bộ | UI đủ bảy công cụ, tài khoản/settings/BYOK, save/export | Auth isolation, không thu phí chéo, a11y/recovery/resource tests đạt |
| G5 — xuất theo máy | Hai adapter đích, đọc lại/slice/preview/material mapping | Từng slicer/version đạt độc lập; profile chưa đạt không mở như đã hỗ trợ |
| G6 — nhãn lắp vừa | Coupon, bản in, vật liệu/phần cứng/dụng cụ và raw measurements | Đạt tiêu chí đã khai cho đúng cấu hình; không mở rộng lời bảo đảm sang máy khác |

G1 hoàn tất rồi G2 kiểm web; không viết điều kiện vòng tròn “phải đạt G2 mới
được bắt đầu G2”. Tài khoản/UI mock và schema có thể chuẩn bị song song, nhưng
không dùng mock làm bằng chứng nhân. Coupon chặn lời bảo đảm fit, không chặn
viết mã. Owner/BYOK/security là phạm vi v1 trước khi mở cho nhóm, không backlog.

Sau v1: repair/analysis mesh, batch convert, packing nhiều bàn, thêm 3MF import,
slicer adapters, STEP/B-rep, support/toolpath/slicing, nối máy in. Thứ tự chọn
theo nhu cầu thật, mỗi capability thêm corpus/oracle/rights/resource budget và
test backward compatibility. Tự gửi G-code/điều khiển máy **chưa thuộc v1**.

Vận hành có version inventory, health của dịch vụ, log loại secret, backup/restore
và rollback drill. Mục tiêu khởi điểm metadata/settings cloud RPO 24 giờ/RTO
8 giờ, phải đo trước phát hành; project local chưa mirror không có cam kết cloud
RPO. Mọi số hiệu năng và số người đồng thời cần benchmark phần cứng/network cụ
thể ở O-04, không biến “nhóm nhỏ” thành lời hứa chạy vô hạn.
