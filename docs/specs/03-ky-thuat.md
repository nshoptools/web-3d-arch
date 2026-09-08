# Đặc tả kỹ thuật và hợp đồng

Thuộc [đặc tả 1.0.1](README.md). Các nguồn chính thức dùng để hiệu đính nằm trong
[quyết định và truy vết](05-quyet-dinh-va-truy-vet.md). Đây là yêu cầu thiết kế,
không tuyên bố nhân đã tồn tại.

### ARC-01 — Kiến trúc và trách nhiệm

Cây tham số/đồ thị ngữ nghĩa có version là nguồn sự thật. Mesh/preview là cache
có generation và nguồn hash. UI gửi lệnh khai báo, không boolean, offset, shaping,
dò vùng, tessellate hay sửa mesh. Nhân sở hữu validation tham số, history và công
thức bốn họ cơ khí; vỏ sở hữu trình bày, input thiết bị, điều phối I/O và quyền OS.
Trong v1 hình học chạy cục bộ; tài khoản/proxy AI/lưu cloud là dịch vụ mạng được
phép ở bản nhóm kín. Execution adapter remote về sau theo EXT-02, cần quyết định
có ID, đồng ý truyền dữ liệu, chủ thể trả chi phí và quota riêng; module không
tự đổi nơi xử lý.

Ngôn ngữ mục tiêu Rust cho nhân, TypeScript cho vỏ. Clipper2 cho polygon 2D,
Manifold qua C ABI cho lưới 3D, usvg cho diễn giải SVG và resvg cho preview là
ứng viên ưu tiên. Dùng HarfBuzz hiện đã vendor cho contract chữ/màu; skrifa+
rustybuzz chỉ thay khi chứng minh tương đương đầy đủ bằng corpus (gồm COLRv1,
variation, cluster, tiếng Việt), không chỉ so glyph mặc định. Không cài lại parser,
shaper, boolean, triangulator, lõi 3MF hoặc mesh repair chỉ để tránh chọn dependency.

Mục tiêu web một module Emscripten liên kết tĩnh có C ABI; tích hợp Rust+C+++
HarfBuzz, allocator và toolchain phải vượt spike native+WASM trước khi khóa build.
Không trộn wasm32-unknown-unknown với Emscripten bằng giả định link được. Nếu spike
thất bại, ghi ADR so sánh giải pháp trước khi đổi cấu trúc, không âm thầm đổi nhân.
Tắt song song **nội bộ thư viện mesh** ở cấu hình ban đầu để có baseline tái lập;
điều này độc lập với shared memory/Worker runtime. Không khẳng định mọi bản song
song đều hỏng memory; chỉ bật sau corpus/race/resource tests của đúng bản.

B-rep/STEP, voxel/SDF làm nhân cơ khí không thuộc v1. Raster vẫn được dùng cho
preview/phân vùng nguồn ảnh, không dùng làm mô hình kích thước các mặt lắp ghép.
Các lý do loại thư viện phải gắn tính năng, benchmark và giấy phép từng bản;
không tuyên bố một họ thuật toán luôn bất khả thi.

### GEO-01 — Hình học chủ và chung biên

Lưu source curves và feature giải tích trong cây; sinh planar subdivision có
nhãn/vật liệu/provenance cho từng khoảng Z. Slab có z0<z1 và tập vùng, không phải
chỉ `{z0,z1,material}` thiếu miền XY. Vùng trong một slab không chồng nội thất;
biên chung có ID/chia sẻ topology và một chuỗi đỉnh định hướng tham chiếu hai phía.

Clipper2 xử lý polygon, nên cần **biểu diễn polygon dẫn xuất có kiểm sai số trước
boolean/offset**. Bỏ quy tắc bất khả thi “chỉ tạo polygon một lần lúc xuất”. Cung
tròn/Bézier nguồn vẫn giữ, mọi lần flatten có tolerance theo mm và ledger; không
đẩy polygon mất nguồn ngược thành đường cong “chính xác”. Sau boolean cần kiểm
holes, đỉnh lặp, self-intersection, thành phần rời và vùng nhỏ. Không xóa phần rời
như dấu Việt để hợp thức hóa input của triangulator.

Biên màu dùng chung sau phân vùng/tessellation/bo tầng, không vectorize mặt nạ
từng màu riêng rồi ghép. Nắp có lỗ phải triangulate bằng thư viện đã chọn và được
oracle kiểm; “đùn tự sinh nắp” không chứng minh thuật toán nắp đúng.

### GEO-02 — Đơn vị, sai số và chính sách Z

Đơn vị public mm. Tọa độ polygon mục tiêu int64 với scale 10^6 unit/mm (1 nm);
đường cong/biến đổi có biểu diễn số phù hợp và provenance. Scale lưu cùng ABI/
project. Kiểm miền tọa độ và overflow trước mỗi phép kể cả sau transform/offset;
không coi toàn miền int64 đều chính xác cho thư viện. Chính sách ban đầu chặn
|tọa độ sau biến đổi| >10.000 mm; mọi intermediate phải có bound và phép kiểm
riêng. Decimal từ UI parse chính xác; quantize về grid dùng ties-to-even nơi hệ
thống kiểm soát được; sai số/luật rounding nội bộ dependency phải đo/ghi lại.
Không hứa boolean/intersection/trig không làm tròn lần thứ hai.

Mục tiêu sai số **tính toán**, chưa được benchmark: kernel ≤0,002 mm; flatten khi
xuất ≤0,004 mm, mặt lắp ≤0,001 mm. Đây là các budget thành phần, phải cộng bound
của import scale/quantize, boolean/offset, curve flatten, triangulation và output
float; khi chưa bound được một khâu, tổng là unverified. Tolerance dùng như trần,
không dải “1–2” khó nghiệm thu. Không suy kernel micron bảo đảm máy in micron.
Chốt/lỗ kiểm signed deviation và kích thước vật liệu tối đa; không áp bù nửa
sagitta chung. Cùng một seam chỉ flatten một lần cho snapshot; vùng hai phía phải
tham chiếu cùng đỉnh. Arc sau nonuniform scale không còn là circle.

Thông số tạo bậc theo lớp lưu số lớp nguyên n≥0 và `heightMode=layers`; UI hiện
n và mm suy ra. Kích thước cơ khí danh nghĩa có thể giữ mm với `heightMode=mm`,
nhưng báo sai lệch giữa mặt thiết kế và mặt cắt có thể chế tạo, không ngầm snap.
Không ép vertex lưới 3D nhập/mặt nghiêng hoặc cao độ tâm lỗ thành số lớp.

Lịch lớp có `firstLayerHeight` và `layerHeight`: z(0)=0; z(n)=firstLayerHeight +
(n−1)×layerHeight với n≥1. Chỉ khi hai chiều cao bằng nhau mới có Z=n×h. Chiều
dày một khoảng là z(n1)−z(n0), không luôn là số lớp nhân h. Adapter phải pin
first-layer/schedule; mẫu Bambu0,16 và U1 0,25 không khớp giả định mọi lớp0,20.
Adaptive schedule là capability riêng, chưa đạt thì không gắn nhãn tương thích.

Project lưu một record schedule có version/hash, `firstLayerHeight`,
`layerHeight`, nguồn `user|profile` cho từng giá trị và profile ID đã áp. Chip
và adapter cùng đọc record này. Field layers có datum (bed hoặc feature/mặt
tham chiếu có ID) và chỉ số lớp mốc; dùng z(n1)−z(n0), không suy datum từ tên
field. `bamLopIn` trong mẫu cũ không tự tạo mode/datum mới. Các field schedule
và mode/datum là bổ sung vào schema O-02, không sửa danh mục parameters-core-v1.

Đổi máy/profile là lệnh atomic: đề xuất lịch của profile, giữ override user
nhưng gắn chưa tương thích nếu ngoài capability, hiện diff Z và chỉ áp khi
xác nhận; undo phục hồi cả profile/schedule/tham số. Adapter nhận snapshot
schedule của dự án, không đọc đè profile mặc định khi serialize. Với h0=0,16,
h=0,20: 12 lớp từ bàn là 2,36 mm; đổi h0=0,25 thành 2,45 mm. Field nominal
2,40 mm vẫn giữ 2,40 mm và báo lệch, không bị đổi thành 12 lớp ngầm.

Đổi lịch lớp mặc định **giữ số lớp** cho field layers và **giữ mm** cho field mm;
xem trước mọi thay đổi và có undo. Migration mm→layers hiển thị floor/ceil/
nearest cùng sai lệch có dấu trên lịch đang chọn, người dùng chấp nhận rồi mới
commit. Không tự đổi1,7→1,8 hoặc coi mặc định1,85 là số lớp nguyên. Lựa chọn lịch
lớp không chứng minh chiều cao bản in thực; phần đó cần coupon.

### GEO-03 — Cơ khí và hiệu chuẩn

Bốn họ lắp ghép từ công thức nhân có schema/version/semantic ID. Bảo toàn số cơ
khí gốc như **preset thử**, không chứng nhận: MX nhánh 4,10×1,35 mm (đối chứng
1,17), hốc 5,50, thân Ø5,70, cổ Ø6,00, cao7,00; switch hốc14,05, sâu chân1,7;
ngàm pitch8, lỗ4,9, sâu1,8; charm cổ12,5×3, vành14,5×1,6 mm. Các cao độ preset
phải qua chính sách Z. Miền/bước đang thiếu nằm ở O-02, không bịa full 129 default.

Tách **khe thiết kế** và **bù máy**. Khe dương nghĩa tăng khoảng trống giữa hai bề
mặt; cần khai rõ theo một phía hay toàn đường kính cho từng thông số. Bù có sign,
đại lượng được hiệu chỉnh, máy/nozzle/vật liệu/layer/slicer/version/ngày và coupon.
UI bước khe mục tiêu 0,02 mm; coupon có thể dùng nấc nhỏ hơn, không dùng bước UI
làm bằng chứng phân giải máy. Bù lấy từ chọn coupon vừa, có thể nhập hồ sơ hiệu
chuẩn được kiểm schema; chưa đo hiển thị “chưa hiệu chuẩn”, không vẽ sigma giả.
Nếu có sigma đo thật, vẽ dải bất định trên điều khiển và ghi n/lặp/phương pháp.

Đặc tả coupon mục tiêu gồm lỗ, chốt, chữ thập hai bề rộng/hướng, thanh dài hồi quy
scale/bias, bậc Z và seam 4 vật liệu. Thiết kế một hoặc nhiều tấm phù hợp bed,
**không ép tất cả vào 70×40×4 mm khi chưa bố trí được**. Đo ít nhất 3 lần in khác
ngày trên mỗi cấu hình; công cụ đo có độ phân giải/độ không đảm bảo thích hợp.
Bậc Z đo chiều cao, ca chân voi đo đường kính riêng. Giữ raw measurements, sai
số dụng cụ, fit/insertion force và tiêu chí nứt/lỏng, không lấy g-code làm bản in.

Mặt lắp chịu ảnh hưởng lớp đầu, bù XY/co ngót/line width phải có trong profile;
không pin 0,42 mm hay 40 µm làm chân lý máy FDM. Mặc định adapter hiệu chuẩn giữ
bù XY slicer=0 để tránh bù hai lần, nhưng kiểm lại profile thực và mọi shrink
compensation. Mặt lắp ưu tiên một vật liệu/một đầu và tránh lớp đầu; trường hợp
khác cần coupon riêng. Gân đàn hồi/cổ xẻ/ống mỏng là biến thể cần đo mỏi và lực,
không bảo đảm fit ±0,1 mm ở máy lạ. Xuất chia sẻ kèm coupon và phạm vi tương thích.

### GEO-04 — Ghép lưới nhập và mô hình theo lớp

Ba capability riêng: `import-as-part`, `csg-union`, `csg-subtract`. V1 cho phép
cả năm loại sản phẩm; giới hạn keychain trong `apChoLoai` danh mục parameters-core-v1 không là
giới hạn mới. Import STL/OBJ giữ byte/hash, khai đơn vị/transform, chọn vật liệu;
OBJ nhiều vật liệu chỉ được giữ hoặc giản lược tường minh theo capability.

Thêm rời giữ part riêng trong mesh scene. Hàn/trừ cần tessellate phần đích từ
slab thành solid đã kiểm, rồi boolean mesh với lưới nhập đã qua oracle topology.
Input hở/không manifold hoặc chưa kiểm được không được commit CSG, có lỗi/lý do;
không tự voxel, vá hoặc inflate bằng epsilon ngầm. Thêm rời có thể giữ part lỗi
để kiểm/sửa, nhưng verdict lỗi theo part và scene vẫn được giữ.

User được chọn đích rõ ràng. Chế độ “hàn khối chạm nhiều nhất” chọn thể tích giao
dương lớn nhất; nếu mọi thể tích nằm trong bound zero thì xét diện tích mặt
tiếp xúc đã đo lớn nhất. Phá hòa bằng semantic ID ổn định sau so tolerance.
Tiếp xúc chỉ điểm/cạnh không đủ thành solid; không có đích hợp lệ thì không
commit. Bound thể tích/diện tích từ oracle, chưa xác định thì unverified và
yêu cầu chọn/điều chỉnh đích, không chọn số do nhiễu float.

Hàn một đích giữ vật liệu/khe đích sau xác nhận; trừ giữ vật liệu phần đích còn
lại. Bộ phận khác không bị gộp màu ngầm. Kiểm lại giao vật liệu/thành phần rời
toàn scene; kết quả không phải slab được lưu như dẫn xuất `mesh-scene` của một
feature CSG có nguồn/params/target IDs, không ghi ngược mesh thành slab giả.
Rebuild đánh giá lại feature; đích mất thì báo orphan, không dùng kết quả cũ.
Áp dụng/hủy/undo đều atomic, giữ bản hợp lệ cuối và generation đúng.

SVG mặt cắt sau CSG phải cắt **scene cuối** ở Z đã chọn; nếu nhánh section mesh
chưa có thì capability đó unsupported, không xuất mặt cắt slab trước CSG.
SVG nguồn vẫn là nguồn 2D, có nhãn đúng phạm vi. Oracle AT-040 dùng hai hộp giải
tích: thể tích mỗi hộp 1.000 mm³, giao 500, union 1.500, trừ 500 mm³; thêm ca
tiếp xúc mặt, điểm/cạnh, lưới hở, đích hòa và nhiều vật liệu. Tolerance boolean
và migration impVox phải đóng O-01/O-02 trước triển khai, không nhận cỡ ô voxel
làm sai số mặt lưới tương đương.

### ABI-01 — Dữ liệu qua nhân và vòng đời bộ nhớ

C ABI versioned, buffer phẳng, không trả container Rust/C++/JS. Định rõ fixed-width
fields, little-endian, alignment, offset/length/stride, enum discriminant, optional
field, overflow/NaN, error code và giới hạn. Trên wasm32 dùng offset uint32 trong
linear memory; native pointer size quy định bằng adapter; không giả một layout
pointer native byte-khớp wasm. i64 đọc bằng BigInt64Array/BigInt hoặc accessor, không
đổi thẳng sang JS Number làm mất chính xác. Bảng schema có phiên bản và test layout.

UI không serialize mesh sang JSON. Lệnh/metadata/project file có thể serialize;
I/O/network/export tất nhiên là bytes, quy tắc buffer chỉ áp ranh giới tính toán.
Zero-copy là mục tiêu cho host xem buffer shared, **không** bao gồm upload GPU,
encode file, parser sở hữu bytes hay mirror đĩa. Tránh phát biểu “toàn ứng dụng 0
bản chép”. Chỉ đọc snapshot đã publish, không đọc mesh trong lúc nhân sửa.

Quy trình: tạo job từ revision → Worker xử lý → atomic publish generation và
layout → host acquire/pin snapshot → read → release. Dùng double-buffer/ownership
hoặc protocol tương đương có kiểm; khi buffer grow phải lấy view mới, view cũ bị
invalid về mặt contract kể cả JS chưa throw. Không reuse/free khi còn consumer.
Lệnh lỗi/hủy không commit state/mesh dở; job hoàn tất muộn không đè revision mới.

Nhân không callback host để I/O/tiến độ; host gọi C API, poll trạng thái đã lượng
tử hóa bằng atomics. Hủy bằng flag atomic được Worker kiểm ở điểm chặn; thao tác
native không ngắt được phải có watchdog Worker và khôi phục commit cuối. Native
API start/poll/join được phép; vỏ web **không blocking join/Atomics.wait ở main
thread**. Lệnh điều phối nhỏ qua postMessage không phải serialize hình học.

### VEC-01 — Nhập vector và graph màu

Tách hai contract: (1) source display graph giữ fill/stroke/transform/clip/gradient/
alpha/composite và provenance; (2) manufacturing regions đã resolve appearance và
lượng tử vật liệu. Không ép source vào record chỉ có một màu đặc/một clip path.
Graph lồng nhiều clip, group, transform không bị mất bằng cách chọn một chỉ số.

Path buffer `M/L/Q/C/Z`, closed contours, tọa độ đã quy đổi và có rounding ledger.
SVG arc phải chuyển có bound (hoặc giữ arc extension đã version), không biến thành
line mặc định. Fill-rule trong buffer bắt buộc, nhưng parser phải resolve SVG
mặc định **nonzero**, không báo SVG nguồn thiếu thuộc tính là lỗi. Stroke/text cần
outlines đúng sau layout/shaping; source clip có rule/transform/thứ tự/group riêng.
Provenance gồm source SHA-256, path ID, paint order, chuỗi tham chiếu và source
location khi parser cung cấp; không bịa line cho dữ liệu không có source span.

Graph COLRv1 giữ gradient stops/extend/transforms, clip, compositing theo
INPUT-CONTRACT. Giản lược gradient/alpha sang palette vật liệu là thao tác tường
minh có preview so nguồn, lưu thuật toán/version/tham số, chỉ commit khi người
dùng chấp nhận. Với mask/filter/foreignObject/ảnh nhúng: preserve nguồn, đánh dấu
khả năng; nếu chưa có chuyển đổi được kiểm thì `unsupported` ở nhánh sản xuất,
vẫn cho xem nguồn khi renderer an toàn đọc được. Bitmap có thể được vectorize
qua nhánh raster có so sánh sai số và chấp nhận; không âm thầm dùng nó thay vector.

Hai bridge độc lập so **semantic normalized records và sai số có bound** trước;
chỉ yêu cầu byte-khớp sau khi cả schema, canonical order, float/rounding, metadata
đều đã quy định. Tên parser khác không tự chứng minh độc lập nếu dùng chung core.

### WEB-01 — Worker, PWA và cô lập

UI main thread, nhân trong Dedicated Worker. Secure context, COOP same-origin,
COEP require-corp là cấu hình baseline để shared memory; kiểm `crossOriginIsolated`
thực tế, Worker handshake và load WASM trên cả Chromium/Firefox/WebKit. Header
phải đúng trên dev, navigation, offline service-worker, cache/reload/redirect.
Resource khác origin cần CORS/CORP phù hợp; ưu tiên cùng origin. Không suy có
header tĩnh là mọi response đều có header đó.

Không đạt COI/SAB hoặc Worker handshake: hiện `CORE_UNAVAILABLE` cùng chẩn
đoán, chặn dựng mới và báo chủ vận hành; vẫn cho cứu/xuất gói dự án local và
cài đặt tài khoản nếu các năng lực ấy hoạt động. Không treo spinner hoặc dùng
mesh cũ như kết quả mới. Shared memory là baseline trên host nội bộ được quản
lý; user tự cấu hình cá nhân không có nghĩa tự host website. Adapter copy buffer
là phương án thay thế phải qua ADR, ABI và corpus G2 nếu spike cho thấy cần,
chưa phải khả năng dự phòng đã triển khai.

Không dùng SDK auth popup phụ thuộc opener trong trang cần cách ly. Redirect
cùng luồng điều hướng/edge auth là phương án cho nhóm kín. Popup không bị tuyên
bố mọi loại đều chết; phải xét luồng cụ thể. Serverless được phục vụ API; nếu
phục vụ navigation thì cũng phải gắn/kiểm header, không cấm chỉ vì loại máy chủ.
PWA cache theo build/hash, không trộn engine/catalog/schema khác generation.
Update hỏi chuyển khi đã commit hoặc giữ build cũ để phục hồi; không xóa cache
của dự án chưa migrate. Offline và edge logout không đồng nghĩa xóa byte đã tải.

Service worker chỉ cache navigation status 200, cùng origin, có dấu app build
hợp lệ. Loại redirect/login/error và response riêng tư khỏi app-shell cache;
không cache trang đăng nhập cuối chuỗi redirect dù nó trả 200. Offline mở lại
theo lease ACC-04, hết hạn còn cứu dữ liệu; đăng nhập lại giữ commit chưa đồng
bộ. Test phải gồm auth redirect, cookie hết hạn, build cũ và thiếu COI header.

Dev loop: native contract/geometry → UI với WASM dựng sẵn và dev headers → local
integration Worker/storage → build/deploy từ CI khi phát hành. “Không compile”
chỉ áp vòng chỉnh UI có HMR/bundle sẵn; sửa Rust/C++ vẫn cần build. Không đưa cloud
CI vào mọi lượt sửa. Toolchain, dependency, browser và mọi output test nằm trong
repo theo project-env; không tự mua host hoặc triển khai trong đợt đặc tả.

### STO-01 — Commit bền và nhiều nơi lưu

Nhân phát thao tác I/O dạng kéo: put asset(content hash,bytes) → put manifest →
commit journal/head → cleanup. Host ack từng transaction/step id với thành công/
lỗi; retry idempotent, ack cũ/nhầm generation bị từ chối. Tên nội bộ content-addressed
khác tên export người dùng. Manifest chứa source/dependency hashes, schemaVersion,
engineVersion, project revision và dữ liệu đủ để dựng lại.

Mọi asset đã hash+ghi+đóng trước khi publish head; head là record atomic của một
store được chọn, không yêu cầu rename xuyên OPFS/IndexedDB. Reader chỉ nhận head
trỏ manifest hoàn chỉnh và hash đúng; thiếu dữ liệu quay thế hệ lùi hợp lệ. Giữ ít
nhất một thế hệ lùi và nguồn nó tham chiếu; cleanup chỉ sau commit, crash cleanup
không làm hỏng head. Không mô tả cả OPFS+IDB trong một transaction.

OPFS là byte store local ưu tiên; IndexedDB giữ index/head nếu spike xác nhận
transaction/durability phù hợp. Private mode/eviction/quota vẫn có thể mất kho;
`persist()` là yêu cầu đến browser, không lời bảo đảm. Có export ZIP và mirror.
Cloud storage là replica với object put/get/hash, điều kiện revision/ETag và xử
lý conflict, không last-writer-wins im lặng. Writer lock local không giải quyết
hai thiết bị: cloud dùng optimistic concurrency, conflict giữ cả hai bản.

Recovery chứng minh trạng thái commit và **canonical geometry** tái lập cùng
engine/schema/profile. Byte-khớp export chỉ bắt buộc trong chế độ deterministic:
thứ tự entry, ZIP timestamp, object/material ID, metadata và codec đều canonical.
Không lấy SHA khác do timestamp làm kết luận hình học sai; cũng không dùng CRC
để thay kiểm hash nguồn. Import version mới hơn báo chưa hỗ trợ + xuất thô;
migration copy-on-write có backup, không sửa nguồn vĩnh viễn trước xác nhận.

### OUT-01 — Multi-material, lưới và 3MF

Khối mỗi vật liệu phải kín/manifold đúng hướng, thể tích dương, không mặt suy biến
hoặc self-intersection. Kiểm union của toàn vật, khoảng hở và chồng nội thất giữa
vật liệu, shared faces có topology hợp lý, thành mỏng/lỗ và parts nổi rời. Cạnh
hai mặt là điều kiện cần, chưa đủ chứng minh mesh 2-manifold. Bộ kiểm độc lập đọc
vertices/faces và file đã ghi, không nhận cờ manifold của generator làm verdict.

3MF Core dùng thư viện đã kiểm; các extension về vật liệu/build có khác schema
riêng của slicer. Adapter từng slicer chọn namespace, file layout, object/build/
material mapping, project settings và thumbnail theo fixture/version. Có migration
profile; lưu profile hash trong kết quả. Không bảo đảm interoperable bằng đuôi
3MF hay số key. Mọi profile có G-code là dữ liệu, không execute trong test/spec.

Hai mẫu người dùng cung cấp ngày 2026-09-07 đã được bảo toàn trong
`tests/fixtures/slicer-profiles/v1/`: Bambu 582 key, version02.08.02.60, máy P1S
0.4; U1 549 key, version2.2.1, bốn nozzle0.4. Đây là **object cấu hình JS**, chưa
phải gói 3MF chứa geometry, relationships/build và kết quả roundtrip. Bambu có
`print_settings_id=0.20mm Standard @BBL X1C` dù printer là P1S; không tự sửa vì
comment nguồn giải thích ý định, phải kiểm đúng slicer. Mảng độ dài4/8/16 và các
mảng máy không được resize chỉ dựa length; schema từng key phân loại số filament,
extruder, bội số, matrix hay cố định. U1 bốn đầu không suy thành mọi mảng dài4.

Đối với từng profile: mở gói xuất bằng đúng slicer/version, kiểm kích thước,
scale/placement, material-slot-extruder, màu, layer schedule, compensation, preview
lớp và lỗi; lưu file/lệnh/ảnh/log; coupon in thật là cổng khác. Thay machine/nozzle
cần thay toàn cụm liên quan và review, không sửa lẻ id. Không gửi lệnh tới máy in.

[Bộ fixture in 3D](../../tests/fixtures/printing-reference/v1/README.md) chứa
**hai gói 3MF thật**: `bambu-project.3mf` và `u1-inconsistent-slots.3mf`.
Phép đọc ZIP/XML thấy chúng chứa cùng một payload mesh 157.824 tam giác/6 object; khác
profile không làm thành hai ca hình học độc lập. Gói U1 có metadata part tham
chiếu extruder1–6 nhưng project settings chỉ4 filament, nên **không dùng làm
golden output U1**. Cần remap được user chấp nhận và kiểm lại mọi metadata trước
nhãn tương thích. CRC/index-edge pass không là slicer/mesh-manifold/physical pass.
Chi tiết và hash nằm ở [báo cáo dữ liệu](../reviews/20260907-specification/source-audit.md)
và [manifest fixture](../../tests/fixtures/printing-reference/v1/manifest.json).

### SEC-01 — Dịch vụ, quyền và nguồn không tin cậy

Chủ dự án chọn **nhóm kín; owner quản lý người dùng; từng user tự cài đặt và tự
chi trả AI**. Hợp đồng bắt buộc ở [người dùng và AI](07-nguoi-dung-va-ai.md).
Host phục vụ headers, identity redirect, backend quản lý user/settings/secret/
AI job, DB và object store là các vai trò kiến trúc; nhà cung cấp còn mở O-05.
Không khóa nhà cung cấp hạ tầng hoặc hứa miễn phí. Trước triển khai pin
plan/date/region/limits/cost,
thử auth/COI và backup; không tự mua gói hoặc gửi AI khi chưa có hạn mức.

Cookie phiên Secure/HttpOnly/SameSite phù hợp luồng, identity lấy từ endpoint đã
xác minh chữ ký/token ở server; không yêu cầu UI đọc JWT HttpOnly. Proxy kiểm
membership/authorization mỗi request, CSRF/origin, content type/size, timeout,
rate/concurrency/chi phí và idempotency. Không nhúng secret vào WASM/PWA/JS.
Cloud mỗi project có kiểm quyền đọc/ghi/xóa, object key không đoán là đủ bảo vệ.
Log loại secret/ảnh/prompt khỏi mặc định; ghi access tối thiểu, thời hạn giữ và
xóa tài khoản có chính sách. Logout chặn network nhưng byte offline trên máy dùng
chung cần lựa chọn xóa local được giải thích, không hứa thu hồi từ xa mọi bản sao.

SVG không script/event/foreignObject active/fetch ngoài; parser chặn XXE/entity/
recursive use/path cực lớn. Preview không chèn SVG thô vào DOM quyền ứng dụng.
Zip/JSON/font/mesh xử lý như dữ liệu không tin cậy, kiểm bound/depth/entry, không
eval config mẫu, không prototype pollution. 3MF G-code profile chỉ dùng fixture
được duyệt, không nhận chạy code từ gói người lạ. CSP/resource policies và headers
phải qua test deployed/offline, không tự nhận an toàn chỉ vì xử lý local.

### LIC-01 — Nguồn, giấy phép và phát hành

Giữ bản gốc official pin revision/hash/license riêng như AGENTS; subset/convert
nếu cần là dẫn xuất riêng có công cụ/tham số. Catalog thực là nguồn đếm, không
dùng số lượng hay phiên bản chưa đo làm yêu cầu phát hành. Hợp đồng nguồn
màu Noto và HarfBuzz hiện có phải được giữ nguyên khi thay parser.

Kiểm từng dependency **đúng bản, thành phần, cách link/phân phối**, giữ notices/
attribution và danh mục phát hành. MIT/Apache/BSD/Boost/font OFL không tự bỏ nghĩa
vụ thông báo; OFL áp font theo điều khoản của nó. Không phát biểu “mọi GPL lây cả
sản phẩm”, “LGPL chỉ được dynamic”, “tool CI không bao giờ có nghĩa vụ” hoặc mặc
định mọi module CGAL cùng license. Thành phần copyleft/commercial cần quyết định
pháp lý phù hợp trước phân phối; không xem lựa chọn tên thư viện là phê duyệt.
Twemoji nếu thêm phải có attribution nguồn/tác giả/license và mô tả sửa đổi thực
sự; không ghi đã làm tròn/sửa nguồn khi nguồn còn byte nguyên bản.
Hai profile người dùng là fixture nội bộ; không đưa vào bundle phân phối đến khi
xác định quyền đối với settings/G-code thượng nguồn. Không phát hành test corpus
có tài sản riêng tư hoặc credentials.
