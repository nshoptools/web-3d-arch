# Đặc tả chức năng

Thuộc [đặc tả 1.0.1](README.md). Mã bên dưới nối với ca nghiệm thu trong
[ma trận yêu cầu](requirements.json). Danh mục điều khiển chi tiết ở
[11 nhóm thông số](06-danh-muc-thong-so.md).

## Sản phẩm và môi trường

### FND-01 — Mục đích và phạm vi

Công cụ thiết kế tham số tạo chi tiết in FDM nhiều màu từ raster, SVG, chữ và emoji.
Ưu tiên hình đúng, nhiều vật liệu đúng và lắp vừa phần cứng thật. Chất lượng hình
học và tính toàn vẹn dữ liệu đứng trước tối ưu tốc độ/dung lượng; vẫn phải có trần
bộ nhớ, tiến độ và hủy. Đây là công cụ chỉnh sửa, giữ đầy đủ chức năng thủ công.
Mục tiêu hình học chính là khối 2,5D xếp tầng; lưới 3D nhập thêm là nhánh riêng.

Năm loại sản phẩm: móc khóa; keycap có trụ tương thích kiểu MX và khay switch;
dây đeo; ngàm khối lắp ghép; charm cài dép. Bốn họ cơ khí là trụ MX, khay switch,
ngàm khối và nút charm. Tên thương hiệu mô tả mục tiêu tương thích,
không phải chứng nhận tương thích mọi đời phần cứng.

### FND-02 — Khởi động, khả năng và offline

Hình học chạy cục bộ trong trình duyệt. HTTPS hoặc localhost được cấu hình đúng;
`file://` hiện trang giải thích và cách chạy. Dò năng lực thật (WASM, Worker,
shared memory/cách ly, kho dữ liệu, WebGL), không suy từ CSS `scrollbar-width`.
Thiếu năng lực thiết yếu chỉ chặn chức năng phụ thuộc và nêu mã lỗi; UI cứu dữ
liệu vẫn mở nếu thực hiện được. Mất một dịch vụ tùy chọn không làm trắng trang.

Chế độ offline theo quyền/thời hạn ở ACC-04, sau khi app shell, nhân và tài nguyên được chọn đã tải
và được giữ trong cache. Hiện rõ tài nguyên nào chưa có offline; không hứa bộ font/
emoji tải lười luôn sẵn. PWA phải cho biết phiên bản, tiến độ tải bộ offline và lỗi
quota. AI, đăng nhập mới, đồng bộ cloud và tải tài nguyên chưa cache cần mạng.

### FND-03 — Luồng hai bước, sáu khu vực

Bước 1 “Nguồn & màu”: nhập, phân vùng, sửa vùng. Bước 2 “Mô hình 3D”: dựng, điều
chỉnh, xem và xuất. SVG/chữ/emoji đi đường vector/paint graph, không bị ép thành ảnh.
Nút Dựng 3D hoặc Ctrl+Enter đi tiếp; quay lại giữ nguyên dự án. Sáu khu:
Ảnh nguồn, Sản phẩm, Lớp màu, Thông số, Xuất file, Thư viện. Khởi tạo bằng chữ
hoặc emoji hợp lệ cũng thoát trạng thái rỗng dù không có ảnh raster.

## Nguồn và tài nguyên

### SRC-01 — Nhập raster và SVG

Kéo thả trên toàn khung xem, hộp chọn hoặc dán; Ctrl+V nhường ô nhập đang có focus.
Kiểm chữ ký/parse, kích thước giải mã và trần byte, không chỉ tin MIME `image/*`.
PNG/JPEG/WebP là tập nền; GIF/AVIF và định dạng khác chỉ hiện hỗ trợ khi decoder
hiện hành vượt corpus. Ảnh động chọn một frame có hiển thị số frame, không tự bỏ
chuyển động mà không báo. Giữ nguyên byte nguồn và metadata định hướng/màu;
chuẩn hóa EXIF, màu sang sRGB và alpha thành bản dẫn xuất có phiên bản.

Ảnh làm việc tối đa cạnh dài 1280 px; các mức 360/520/720/960/1280 chỉ điều khiển
phân vùng raster. Không thay nguồn bằng PNG thu nhỏ. SVG giữ vector, viewBox,
đơn vị, transform, fill-rule, thứ tự vẽ và clip/paint; preview không là nguồn mesh.
Nội dung không hỗ trợ phải báo phần tử/khả năng bị thiếu, không xuất hình cụt như
thành công. Xử lý gradient, alpha, mask theo hợp đồng kỹ thuật, không bỏ âm thầm.
Đổi nguồn bị hủy giữ nguyên nguồn cũ. Xóa nguồn là lệnh dự án hoàn tác được;
xóa vĩnh viễn byte không còn tham chiếu thuộc quy trình dọn dữ liệu có xác nhận.

### SRC-02 — Chọn và tìm emoji

Lưới hiện ngay ở khu nguồn; tải lười artwork khi ô vào tầm nhìn. Tìm tiếng Việt
có/không dấu, tên, nhóm và mã hex; bảng nhãn/dịch phải có nguồn và version riêng.
Có nhóm, Yêu thích, Gần đây; giữ nguyên chuỗi ZWJ/modifier/flag/keycap/variation.
Bộ chọn và mức độ phủ đọc từ `src/assets/emoji/collections.json` và catalog thực;
bộ màu mặc định theo catalog. Noto màu, Noto đơn sắc là nguồn khác nhau.
Twemoji là yêu cầu mở rộng bộ chọn, chỉ bật sau khi có nguồn nguyên bản, lock,
ghi công và audit tương ứng; không giả định đã có 1.914 hình trong repo.

Hạng in tốt/cần chỉnh/không nên in/chưa đo gắn source hash, kích thước, quy tắc
chuyển màu, cấu hình in và phiên bản phép kiểm. Chưa có phép mesh/in không được
gán “in tốt”. Mặc định có thể lọc khó in nhưng **không giấu toàn bộ mục chưa đo**.
Cho hiện hình khó in, lý do và số mục đang lọc. Bộ thiếu mã báo thiếu; không tự
thay bằng bộ khác, glyph hệ thống hay placeholder có vẻ là hình thật.

### SRC-03 — Tạo ảnh AI

Có bộ chọn model theo cấu hình dịch vụ, prompt, ảnh tham chiếu, prompt đã lưu.
Model được bật theo adapter và khả năng đã kiểm của tài khoản; không khóa nhà
cung cấp bằng tên hiển thị. Chỉ khi người dùng bấm Tạo mới gửi prompt/ảnh tham chiếu, hiển thị nơi
nhận, loại dữ liệu và hạn mức/chi phí áp dụng. Mở tab không gửi nội dung sáng tác.
Proxy chỉ dùng thông tin kết nối AI của đúng user đang đăng nhập; mỗi user tự
trả provider theo AI-01–AI-04. Không có key chung/fallback key của owner. Proxy
chặn lạm dụng, giới hạn lượt/byte/timeout; AI không xử lý hình học.

Phân loại lỗi: dữ liệu bị app từ chối; offline; không tải được thành phần;
lượt bị hủy/ngắt; không nối được dịch vụ; dịch vụ trả lỗi (kể cả auth/quota/rate
limit). Cho thử lại mà không tự nhân đôi lượt có tính phí. Giữ prompt/model/
request id nếu có, byte ảnh trả về và hash; cùng prompt không bảo đảm sinh lại ảnh.

### SRC-04 — Chữ và font

Dùng bộ font gốc đủ biến thể theo catalog; tìm họ/style, chỉ tải font đang chọn.
Nạp TTF/OTF cá nhân, kiểm an toàn và quyền sử dụng; WOFF2 là ca corpus/khả năng mở
rộng, chưa hứa đường nhập UI khi decoder chưa đạt. Giữ bytes/hash/trục và giấy
phép nếu người dùng cung cấp. Font tự nạp dùng lại giữa dự án; xóa hai bước chỉ
loại khỏi danh sách chung, không làm hỏng dự án còn tham chiếu font.

Giới hạn 8 font chỉ áp danh sách font cá nhân dùng lại, không tính font đóng
gói trong dự án nhập. Mỗi dự án được tham chiếu tổng tối đa 128 MiB font tự nạp,
vẫn giữ trần 16 MB/tệp và tổng gói ở LIM-01. Vượt trần từ chối import trước
commit, giữ gói gốc để cứu; không cắt font hoặc đổi sang font hệ thống.

Giữ văn bản gốc, NFC, grapheme/cluster; layout nhiều dòng, bidi/script/font-run
trước shaper. Đúng dấu Việt, kerning/offset, lỗ và contour rời. Khuyết glyph/trục
không hợp lệ phải nói rõ. Không subset nguồn hoặc fallback font hệ thống ngầm.

Preview chữ ghim trong bảng. Có hai công tắc độc lập “Có đế đỡ chữ”, “Bo mép chữ
và đế”; bo chữ không phụ thuộc bo mép trên của thân. Tám điều khiển: cỡ chữ, cao
chữ, rộng đế, dày đế, bo viền đế, uốn cong, giãn chữ, giãn dòng. mm↔pt chỉ đổi cỡ
chữ (1 pt = 25,4/72 mm); phân biệt em-size với chiều cao nét nhìn thấy. Các chiều
cao theo lớp dùng số lớp và số mm suy ra theo chính sách Z.

Chữ ở trên mô hình hoặc rời bên cạnh trên bàn in; đặt XY bằng số hoặc Shift+kéo.
“Dùng chữ làm hình” tạo nguồn thiết kế hợp lệ, bỏ chế độ này khi thay bằng ảnh
trong một lệnh có undo. “Bỏ chữ” gỡ chữ/đế chữ. Cùng component tham số dùng trong
khu nguồn và popup khối chữ; chỉnh một nơi cập nhật nơi kia.

## Thiết kế

### MOD-01 — Loại sản phẩm và mẫu

Mẫu dựng sẵn lọc theo loại; loại chưa có mẫu hiện giải thích và đường tạo thủ công.
11 mẫu (6 móc/2 keycap/1 dây/2 charm) là danh mục mục tiêu, phải có
manifest/ID/giấy phép và test trước khi tính là đã cung cấp; ngàm cũng dùng được
khi chưa có mẫu. Mẫu của tôi lưu thông số có tên, không chụp mất nguồn đang sửa.
Tổng tối đa 20 trên mọi loại; UI hiện số toàn bộ và số đang lọc. Xóa hai bước,
xuất/nhập JSON có schema/version, nhập gộp không ghi đè ID có nội dung khác.

Đổi loại sản phẩm là một transaction có preview phần thay đổi và undo. Giữ
nguồn, chữ, vùng, màu/khe đã chọn tay và giá trị có scope chung còn hợp lệ; chỉ
áp mặc định loại mới cho field auto hoặc chưa có giá trị. Field không áp dụng
được giữ theo loại, chưa tham gia dựng; khi quay lại phải phục hồi. Xung đột
dependency/domain hiện lựa chọn trước commit, không lén reset cả dự án.

### MOD-02 — Lớp màu, vật liệu và lựa chọn tay

Phân biệt vùng nguồn, lớp theo Z, khối ngữ nghĩa, vật liệu và khe filament. Một
màu không luôn là một lớp in. Sắp hàng theo cao độ, diện tích rồi hex và ID để
phá hòa, không theo khe. Hiện màu/hex hợp lệ, phần trăm diện tích (mẫu số và vùng
đang tính phải rõ), khe 1–16 ở bước 2 hoặc khi đã có màu bộ phận.

Nút NỀN chỉ cắt thành phần nền chạm biên nguồn; không xóa lỗ/vùng bên trong cùng
màu. Nó tác động dựng thân nên hiện ở bước 2. Chiều cao riêng chỉ cho vùng họa
 tiết khi kiểu Nổi; nhập số lớp, hiện mm. Vùng không sinh khối vẫn ở bảng, có
nhãn/lý do thay ô khe và NỀN. Không giấu dữ liệu cần để sửa phân vùng.

Màu theo vai: đế/thân, chữ, đế chữ, viền họa tiết, váy, trụ+gân, khay. Vai không
có NỀN. Lưu `origin=auto|user`, màu/khe riêng theo vai/vùng/khối. Auto chỉ được
thay giá trị auto; người chọn tay được giữ qua rebuild, preset không áp màu và
khôi phục. Nút về mặc định chỉ hiện override của user, xóa override rồi tính lại.
Tự gợi tương phản cho chữ auto, không đè màu chữ user. Cùng khe khác màu báo rõ
và cho remap; không tự sửa. Màu riêng từng khối có scope hiện ngay trong popup.

### MOD-03 — Thông số và ràng buộc

Giữ đủ 11 nhóm ở danh mục riêng, gồm điều khiển chỉ sống trong tab chữ/khung xem.
ID máy ổn định tách nhãn Việt; tìm thiếu ID là lỗi, đổi nhãn không làm mất cấu hình.
Một nguồn schema cho miền/default/đơn vị, sinh binding/validation; metadata UI
riêng cho widget, search, điều kiện hiện. Không dùng tổng 129 làm tiêu chí duy nhất.

Có Nâng cao/Đang gọn, Mở hết, Thu gọn, gập từng nhóm và nhớ trạng thái. Lọc không
dấu ẩn hàng/nhóm không khớp. Năm cổng gốc (không có hàng, bước, loại sản phẩm,
phụ thuộc, chế độ gọn) cộng cổng loại nguồn/năng lực. Hàng ẩn vẫn giữ giá trị.
Ô số nhập dấu phẩy hoặc dấu chấm thập phân không nhập nhằng; dữ liệu lưu dùng số
chuẩn, không NaN/Infinity. Chip mốc và số mm tính lại khi đổi chiều cao lớp.

Hai điều chỉnh cho vừa hốc switch hoặc sâu lỗ ngàm phải là lệnh atomic có undo,
hiện trị trước/sau và lý do; vượt trần giữ bản hợp lệ cuối, nêu lượng còn thiếu.
Thông số cơ khí sinh giải tích, không đi qua resolution raster hoặc voxel.

### EDT-01 — Bảy công cụ 2D và lịch sử

| Công cụ | Phím | Hành vi bắt buộc |
| --- | --- | --- |
| Tô màu | B | Đổi vật liệu vùng được chọn |
| Vẽ nét | V | Nét có bề rộng; Shift bám ngang/dọc/45° |
| Đường cong | U | Thêm điểm; Enter/bấm đúp kết thúc, Backspace lùi điểm, Esc hủy |
| Xóa | X | Gộp màu hoặc cắt thủng theo chế độ |
| Đường cắt | C | Xẻ vùng bằng nét; Shift bám hướng |
| Khung cắt | K | Chữ nhật/elip; giữ trong/ngoài; Shift vuông/tròn |
| Vá hở | H | Vá lỗ/khe chọn; màu chọn hoặc A=tự theo vùng bao; vá mọi khe hẹp |

Bảy công cụ cùng ghi vào cây/lịch sử nhân; giữ holes, provenance và chung biên.
Dãy màu dùng cho Tô/Vẽ/Đường cong/Vá. Ba công cụ Xóa/Cắt/Khung dùng chung chế độ
“gộp màu/cắt thủng”. Bề rộng 1–60 px chỉ thuộc chế độ raster; vector dùng mm hoặc
quy đổi từ màn hình tại lúc bắt đầu nét và lưu mm, không phụ thuộc zoom về sau.
Ngưỡng vá mọi khe phải hiển thị theo đơn vị thiết kế, không vá tùy zoom.

Undo/redo là lệnh dự án, gồm vùng, tham số, nguồn, màu, vị trí. Một nét kéo và một
lượt tự điều chỉnh chỉ tạo một transaction. Hiện số bước undo; thiếu ngân sách
history nói rõ trước khi cắt lịch sử, không làm mất trạng thái hiện tại.

### EDT-02 — Điều hướng 2D và nguồn gốc

Lăn phóng, F/bấm đúp vừa khung; kéo dời khi không cầm công cụ, có cách pan tạm
thời bằng bàn phím. Một ngón sửa, hai ngón phóng/dời; Pointer Events phân biệt bút
và touch, không hứa palm rejection trên mọi thiết bị. Bút hỗ trợ pressure dùng
0,4–1,6 lần nét; không có pressure dùng 1 lần. Xem ảnh gốc khóa chỉnh sửa và đồng
bộ khung đối chiếu; tắt trở lại đúng zoom/pan cũ. Có nền ca-rô/trắng. Chỉ số:
vùng, đường bao, cỡ xử lý và zoom; ảnh gốc hiện cỡ gốc. Với nguồn vector hiển thị
đơn vị/bounds thay nhãn px xử lý gây nhầm độ chính xác.

### VIEW-01 — Xem và chỉnh 3D

Xoay trái, pan phải/hai ngón, lăn/chụm zoom; F giữ góc và fit. Có lưới G, top T,
isometric I, front P; C và bốn góc chỉ đổi vị trí xem trên bàn, không đổi file.
Đo M có hai điểm và mm, ghi rõ là đo mesh/tessellation, không phải phép đo vật in.
“Tách màu theo tầng cao” chỉ hiện cho Nổi và cập nhật cùng tham số trong bảng.

Bấm khối mở popup: màu theo scope, khe của override khối; chiều cao, bo mép,
nguồn và nút về đúng nguồn; thông số chung ghi rõ scope cả mô hình. Chữ dùng
component chung. Lõi/tầng đã gộp phải giải thích phần nào không sửa độc lập được.
Tên khối đọc được, có ID ngữ nghĩa ổn định; không pin “30 tên” chưa có schema.

Shift+kéo: nền dời **vị trí xem**; chữ dời **thiết kế**; gờ móc đổi góc/chồng;
lưới lỗ đổi XY thiết kế. Có hit-test ưu tiên rõ, preview điểm đáp và thông số số
thay cử chỉ. Lỗ giữ/liệt giản dùng vòng liền/đứt. Cử chỉ sửa dự án phải undo được.
Popup kéo/đặt lại, kẹp trong viewport, trạng thái nhớ; mobile dùng panel cố định.

Phục hồi WebGL context tái tạo tài nguyên từ snapshot hợp lệ. Không WebGL vẫn
chỉnh bằng ô số, dựng và xuất hình học nếu nhân hoạt động; tắt công cụ pick/đo và
PNG với lý do. Chỉ số luôn gắn generation: XYZ mm, bộ phận, tam giác, thời gian.
Kết quả cũ khi đang dựng được gắn “đang cập nhật”, không giả là kết quả mới.

## Xuất và lưu

### EXP-01 — Bảy đường xuất

SVG màu; SVG mặt cắt cho 3D/CNC; 3MF dự án Bambu; 3MF dự án Snapmaker;
ZIP STL theo vật liệu; STL gộp; PNG khung xem. SVG mặt cắt phải chọn Z/phạm vi,
đơn vị, mặt trước/sau và chính sách màu, không ngầm nhận công cụ CNC mọi dạng.
STL không lưu đơn vị/màu nên ghi mm trong hướng dẫn. STL theo vật liệu nhóm theo
(khe, mã màu), cùng gốc tọa độ, có bảng kê tệp↔khe; không tùy tiện mỗi bộ phận một
file. STL gộp phải union hình học, không chỉ nối danh sách tam giác giao nhau.

3MF chuẩn và 3MF dự án slicer là hai hợp đồng khác nhau; profile Bambu P1S 0,4 mm
và Snapmaker U1 là hai đích mục tiêu, chỉ bật như đã hỗ trợ khi có fixture và test
đúng phiên bản slicer. Không dùng 582/549 khóa chứng minh tương thích. Khi chưa
đạt, giữ mục trong UI với trạng thái/lý do và chỉ đường STL, không sinh ZIP giả 3MF.

Có gộp phần cùng vật liệu và lật mặt hoa văn xuống. Lật là transform xuất có lưu
trong dự án, đặt đáy về Z=0, normals đúng; không dùng transform camera. Bảng tầng
hiện màu, z0–z1 mm và số màu gộp. Tên tệp giữ Unicode, loại ký tự đường dẫn không
hợp lệ; báo tên, byte thực, biến thể xuất và cảnh báo.

### EXP-02 — Cửa chặn, cảnh báo và mức xác minh

Luôn chặn: không có snapshot dựng hoàn tất; tham số/nguồn không hợp lệ; nhân
thất bại; assembly-view đang bật; khối nhập có sửa chưa Áp dụng; exporter/format
chưa hỗ trợ. Không xuất kết quả một phần hay snapshot sai generation.

Registry cửa chặn có ID ổn định và phạm vi capability: `NO_SNAPSHOT`,
`INVALID_INPUT`, `KERNEL_FAILURE`, `ASSEMBLY_VIEW`, `UNAPPLIED_MESH_EDIT`,
`UNSUPPORTED_EXPORTER`, `STALE_REVISION`, `INVALID_SERIALIZATION`.
`MATERIAL_SLOT_MISMATCH` chặn 3MF project của máy khi tham chiếu filament không
tồn tại hoặc adapter không biểu diễn được mapping; đây không phải cảnh báo có
thể bỏ qua. Xuất kiểm tra chỉ dùng mapping hợp lệ trong định dạng đã chọn:
STL/định dạng trung tính hoặc remap có xác nhận, không xuất 3MF project hỏng.
Chỉ cửa chặn có liên quan tới dữ liệu đường xuất mới áp dụng: PNG cần renderer,
mesh/3MF cần mesh snapshot, SVG nguồn cần snapshot vùng đã commit; không ép SVG
nguồn phải dựng 3D trước. Mỗi cửa nêu nguyên nhân, đối tượng và cách sửa. Quyền
truy cập, an toàn parser và bảo mật vẫn bắt buộc, không được bỏ qua bằng lựa chọn
“xuất để kiểm tra”. Adapter bổ sung cửa riêng qua registry và ca âm tương ứng.

Kiểm mesh độc lập sau mỗi lần dựng và nhắc đúng lúc xuất. `fail` hình học được
phân biệt với `unverified` (thiếu công cụ/vượt tài nguyên). Bản **xuất để kiểm tra**
có thể cho người dùng tiếp tục khi mesh fail/unverified nhưng serializer vẫn
viết được định dạng hợp lệ; nhãn không bảo đảm in, cảnh báo giữ trong bảng kê,
không đánh dấu đạt. Nếu serializer không tạo được cấu trúc hợp lệ thì chặn.
Giữ ý định “cảnh báo cho người thiết kế tiếp tục” nhưng không cho nhãn “sẵn sàng
in” khi có lỗi. Khe vượt khả năng máy hoặc trùng khe phải remap để được nhãn đã
xác minh; giữ lựa chọn xuất để kiểm tra, không hứa máy tự in được màu tràn.

### DAT-01 — Dự án, journal và phục hồi

Dự án có UUID, nguồn nguyên bản+hash, dẫn xuất, vùng/nét sửa, tham số, chữ/font,
lưới nhập, vật liệu, layout in, cờ xuất, schema/engine version và lịch sử được giữ.
Ghi trễ mục tiêu 350 ms sau thao tác, nhưng “đã lưu” chỉ khi commit được xác nhận.
Sau crash phục hồi **commit đã xác nhận cuối**, hoặc thế hệ lùi kiểm được; thao
tác chưa xác nhận có thể mất và UI phải nói. Không hứa không mất 350 ms cuối.

Kho byte chính OPFS, metadata/index có thể IndexedDB, nhưng không giả định có
transaction atomic xuyên hai API. Quy trình commit được định nghĩa ở kỹ thuật.
Tab writer duy nhất theo userId+projectId trong origin, chung qua schema version
như ACC-03; tab sau read-only có trạng thái,
lấy quyền lại bằng Web Locks sau khi writer kết thúc và đọc lại commit mới.
Mất quyền ghi/quota đầy chuyển chế độ cứu dữ liệu, không âm thầm ghi dở.

### DAT-02 — Thư viện, sao lưu và nhập gói

Danh sách dự án có thumbnail, tên, loại, kích thước, giờ, dấu sửa tay; mở, xóa
mục/xóa hết hai bước. Hiện usage/quota ước lượng của origin, không gọi là dung
lượng ổ đĩa. Không dò hoặc khẳng định dữ liệu tại origin khác; chỉ gợi ý kiểm tra
địa chỉ/cổng cũ khi kho trống.

Tùy chọn mirror qua File System Access: chọn thư mục, nạp, nối lại, tắt, thùng
rác và dọn xác nhận. UI theo năng lực API; khi thiếu API giấu thẻ thao tác riêng
và vẫn giải thích lựa chọn ZIP. Đây là thư mục người dùng cuối chọn trong sản
phẩm; các thao tác phát triển/test của agent vẫn chỉ ghi trong repo.

ZIP một dự án phải đầy đủ font/ảnh/lưới referenced, kiểm schema, paths, CRC và
SHA-256, số entry/trần giải nén, không path traversal/symlink/zip bomb. Stage mọi
thành phần rồi commit một tham chiếu; lỗi rollback hiển thị, không tạo dự án nửa
font. Xuất gói được ở cả ba engine được hỗ trợ. Mirror/cloud chỉ báo đã sao lưu
sau xác nhận, lỗi bản sao không hủy commit local.

### DAT-03 — Cài đặt, hồ sơ, tìm nhanh và xóa

Lưu mặc định, về mặc định gốc, xuất/gộp/thay JSON; “Nạp thay” ghi rõ tác động.
Profile có tên, chọn hạng mục lưu/áp (tham số, chữ, prompt đã lưu, emoji yêu thích),
không sửa dự án đã lưu. Record hỏng vẫn hiện lý do + Xuất thô để cứu dữ liệu.
Mẫu/prompt/favorite/recent có giới hạn toàn kho. Xóa hai bước: lần một hiện Xóa?
trong 4 giây, lần hai thực hiện; hết giờ/Esc/đổi mục hủy. Garbage collection không
xóa nguồn còn được dự án hoặc thế hệ lùi tham chiếu.

Ctrl+K hoặc / tìm thông số, lệnh, mẫu, công cụ 2D, lớp+khe, sáu khu và chữ. Tìm
không dấu, mọi từ đều phải khớp; hiện giá trị và lý do mục ẩn/không dùng được.
Mở kết quả có thể đổi bước/loại/gọn bằng lệnh có undo; thay đổi làm mất công phải
nêu tác động trước. Không gọi geometry trực tiếp từ tìm kiếm. Bảng phím và lệnh
sinh từ một registry, có About: build, licenses, attribution thực tế.

### LIM-01 — Giới hạn và dữ liệu quá trần

Đường cơ sở chính sách dưới đây là lựa chọn sản phẩm, chưa phải benchmark hay
bảo đảm chạy trên mọi thiết bị. MB = 1.000.000 byte, MiB = 1.048.576 byte.

| Tài nguyên | Giới hạn |
| --- | --- |
| Raster/ảnh AI; SVG; STL/OBJ | 32 MB; 16 MB; 64 MB |
| Font tự nạp | 16 MB/tệp, 8 font trong danh sách chung |
| JSON cài đặt | 32 MB; không nhét ảnh gốc, preview nếu có ≤760 px |
| ZIP dự án | 128 MiB nén; 512 MiB tổng giải nén; 10.000 entry; mỗi entry ≤128 MiB |
| Thư viện; profile; mẫu; prompt | 40; 50; 20 tổng; 30 |
| Yêu thích; gần đây | 4096; 27 |
| Undo | mục tiêu 20 transaction; payload tổng 24 MiB, báo lịch sử bị rút ngắn |
| Prompt AI; chữ | 4.000; 500 Unicode grapheme clusters, không cắt giữa chuỗi |
| Vật liệu thiết kế | 2–16; giới hạn profile in được kiểm riêng |
| Mesh oracle mặc định | 400.000 tam giác; vượt là unverified, không phải mesh đạt |
| Raster sau giải mã | tối đa 64 triệu pixel; phải kiểm trước cấp phát lớn |

Quá trần từ chối thao tác mới có lý do/giới hạn, giữ nguyên trạng thái cũ; văn bản
quá dài báo lỗi và cho sửa, **không cắt đuôi âm thầm**. Trần giải nén/pixel là bổ
sung kiểm soát bộ nhớ, phải thử tại cổng tài nguyên. Không giải nén toàn bộ trước
rồi mới kiểm. STL ASCII/binary, OBJ được nhập nếu parser đạt. STEP/IGES/F3D/
SLDPRT/3DM và **3MF nhập mesh** chưa hỗ trợ v1; 3MF trong corpus có thể là ca từ
chối hoặc đọc xuất bằng oracle, không kéo theo cam kết nhập 3MF.
