# Danh mục thông số và quy tắc bảo toàn

Thuộc [đặc tả 1.0.1](README.md), yêu cầu MOD-03. Danh mục này định nghĩa đầy đủ
các nhóm điều khiển và giá trị ứng viên của dự án. **Chưa phải schema thực thi**.
[parameters-reference.json](parameters-reference.json) chứa toàn bộ 126 field:
94 slider, 22 checkbox, 10 select; default đã kiểm type/domain/step.
Khối nhập có 10 field dữ liệu; cộng 2 vị trí nút Áp dụng và 1 input file thành 13
điều khiển. Điều đó giải thích tổng 129, không chứng minh ngữ nghĩa hình học đúng.
Các nút trùng cùng lệnh không được tính thành hai tham số hình học.

Danh mục giữ đủ field/default/miền/nhãn/nhóm/bước/loại áp dụng, mô tả cấu trúc
các trường và chế độ sản phẩm; hash nằm ở [manifest dữ liệu](source-manifest.json).
Đây là **dữ liệu tham khảo đã kiểm cấu trúc**, không bảng kích thước phần cứng
đã chứng nhận. Dependency, công thức tác động, giá trị 0=tự động, Z schedule và
thay impVox/strapSeg còn phải thẩm định trước sinh schema thực thi. Không thiếu
dữ liệu rồi bịa, cũng không coi parse thành công là đã hiệu chuẩn.

Mười một nhóm giữ ID bên dưới; số đếm dùng để kiểm độ đầy đủ, không ép schema
phải đúng 129 bằng cách xóa hoặc thêm control vô nghĩa.

| ID nhóm | Nhóm; số điều khiển | Điều khiển phải có đường truy cập |
| --- | --- | --- |
| color | Màu & chi tiết; 7 | Số màu; resolution raster; làm phẳng mảng; gộp vụn; khử nhiễu raster; mượt viền; bo cong |
| shape | Kích thước & dáng; 13 | Cạnh dài; kiểu đế theo viền/khung bo/tròn/vuông; bo góc khung; giãn viền; hàn chi tiết rời; chi tiết nhỏ nhất giữ; lấp lỗ đế; bật bo mép trên, radius, kiểu tròn/vát45/bậc lớp, số bậc, gộp mảng trước bo |
| height | Chiều cao; 13 | Layer height; bước/chip nhanh; dày đế/thân; dày mặt cap; họa tiết Nổi/Chìm/Phẳng1/Phẳng2; lớp màu mặt trên; cao họa tiết; bật nền màu riêng và dày nền; cao riêng đối tượng; màu theo tầng; đổ lõi màu đế và dày màu trên |
| keyring | Lỗ móc; 7 | Bật; Ø gờ; Ø lỗ; neo hình/chữ; vị trí/góc quanh hình; chồng vào thân; cao gờ |
| brick | Ngàm khối; 19 | Bật; pitch; Ø/sâu lỗ; pattern đủ/bàn cờ/¼; khe hở; dày thành; khoét rỗng; dời lưới X/Y; bật rãnh chữ thập + rộng; bật tai gióng bẻ bỏ + rộng/dài/cổ; bật rãnh bán nguyệt + radius/cao tâm |
| charm | Charm; 12 | Nút rời/liền; Ø/cao cổ; Ø/dày vành; vát dẫn; Ø chốt; sâu chốt/ổ; khe ổ–chốt; assembly-view; dời X/Y |
| strap | Dây đeo; 9 | Ø lỗ; góc ống; cao tâm; dời tâm; dài slot và hướng; vát; chất lượng bề mặt/tolerance thành lỗ; xoay vật |
| cap | Thân keycap; 3 | Cao váy; dày thành; gân gia cố |
| stem | Trụ MX; 9 | Dài/rộng nhánh; khe hốc; sâu hốc; cao trụ; Ø thân/cổ; cao cổ; chốt nhô trên switch |
| tray | Khay switch; 24 | In kèm; tự tăng kích thước; hốc thân/chân và độ sâu; miệng hốc; chìm switch; dày đáy/vách bao/vách quanh hốc; khe cap–vách; chênh cao vách; hành trình; bật chặn hành trình + rộng gờ; bật móc khay + Ø gờ/Ø lỗ/vị trí/chồng/cao; chung màu thân; assembly-view |
| imported_mesh | Khối nhập; 13 | Bật; chọn STL/OBJ; thêm rời/hàn khối chạm nhiều nhất/trừ; scale; XYZ translate; XYZ rotate; điều khiển chất lượng ghép; hai vị trí nút Áp dụng cùng lệnh |

Khối nhập phải có thông tin tam giác/bounds và bỏ khối; report hở/nối/không kiểm
được không suy từ generator. Hàn “chạm nhiều nhất” phải định nghĩa thước đo thể
tích/diện tích tiếp xúc và tie-break stable ID trước khi triển khai; không chọn
ngẫu nhiên. Boolean voxel bị thay bằng boolean mesh có kiểm, nên điều khiển cỡ ô
voxel cũ chuyển thành tolerance/chất lượng phép ghép có đơn vị và ý nghĩa thật;
không giữ núm không còn tác dụng. Việc chuyển này có migration và test, không là
quyền bỏ chức năng ghép hoặc sửa sản phẩm trong lượt review.

Hợp đồng CSG, scope sản phẩm và vật liệu theo GEO-04. Migration là quy trình
giữ nguồn và chọn thay thế, không nhất thiết phép đổi số. Disposition field
dùng `keep-mm`, `to-layers(datum,rounding)`, `replace-capability(no numeric map)`
hoặc `tombstone`. `impVox` thuộc replace: dry-run giữ 0,25 mm như provenance,
yêu cầu chọn tolerance mới có nghĩa; không gán 0,25→0,25. `strapSeg` chuyển theo
bound tessellation đã kiểm. Field Z chưa chốt datum/mode ở O-02 thì không tự
migration từ cờ `bamLopIn`.

Ngoài 11 nhóm: 8 điều khiển chữ, 2 công tắc chữ, chỗ đứng chữ, dùng chữ làm hình,
bỏ chữ; màu/khe/NỀN/reset/chiều cao mỗi vùng và vai; bo/màu/height riêng khối;
transform tương tác gờ/lưới/chữ; profile hiệu chuẩn; gộp/lật khi xuất. Các đường
UI khác nhau tới cùng parameter ID không tạo hai nguồn sự thật.

## Giá trị ứng viên đã ghi đầy đủ trong danh mục

| Thông số | Mặc định mục tiêu | Miền/enum | Bước hoặc điều kiện |
| --- | --- | --- | --- |
| Cạnh dài | 45 mm | 12–160 mm | bước ứng viên1 mm; O-02 kiểm tác động |
| Resolution raster | 520 px | 360,520,720,960,1280 | chỉ nguồn raster |
| Layer height | 0,20 mm | 0,08–0,30 mm | schedule theo GEO-02 |
| Số màu | 4 theo danh mục | 2–16 | nguyên; candidate default, kiểm phân vùng |
| Dài nhánh MX | 4,10 mm | 3–6 mm | 0,05 mm; preset thử |
| Rộng nhánh MX | 1,35 mm | 0,8–2 mm | 0,01 mm; coupon đối chứng1,17 |
| Khe hốc MX | 0,05 mm là giá trị ứng viên | 0–0,4 mm | quy đổi semantics theo một phía/toàn bề rộng trước khi dùng; bước UI mục tiêu0,02, chưa sửa giá trị ứng viên |
| Hốc thân switch | 14,05 mm | 13,2–15,5 mm | chưa đo phần cứng |
| Sâu chân switch | ứng viên 1,7 mm | 0,5–6 mm | giữ nominal mm; nếu chuyển sang layer-bound phải chọn schedule/rounding tường minh |
| Sâu hốc MX | ứng viên 5,50 mm | 2–9 mm, field `socketD` | nominal mm, không tự đổi thành 27,5 lớp; O-02 chốt scope |
| Pitch lỗ ngàm | 8 mm | 4–32 mm | bước ứng viên0,1; chưa đo |
| Ø lỗ ngàm | 4,9 mm | 1–12 mm | bước ứng viên0,1; clearance semantics cần chốt |
| Sâu lỗ ngàm | 1,8 mm | 0,4–6 mm | 9 lớp chỉ khi schedule đều 0,2 mm và mặt tham chiếu phù hợp |
| Ø cổ charm | 12,5 mm | 4–24 mm | coupon |
| Cao cổ charm | 3 mm | 0,6–12 mm | O-02 phân loại nominal/layer-bound theo GEO-02 |
| Ø vành charm | 14,5 mm | 5–28 mm | coupon |
| Dày vành charm | 1,6 mm | 0,4–6 mm | O-02 phân loại nominal/layer-bound theo GEO-02 |

## Cổng schema trước khi lập trình nhóm

Mỗi field cần id, type, group, unit, domain/enum, default, step, semantic scope,
constraints, applicability nguồn/sản phẩm, dependency, version/migration và test
boundary/interaction. Lệnh có id/args/precondition/undo; widget/display thuộc
metadata UI riêng. Mặc định phải thuộc miền và đúng grid bước; số liệu xung đột
như khe0,05 với bước0,02 phải được đóng bằng quyết định, không lén snap.

Có test bảo toàn tập khả năng từ bảng trên, kiểm mọi field có đường truy cập kể
cả không có hàng, palette giải thích đúng lý do ẩn. Nhóm chưa đủ schema giữ O-02
mở và **chặn triển khai nhóm ấy**, không chặn spike core không phụ thuộc field đó.
Việc xác định thêm miền/default là một lượt thiết kế có bằng chứng, không đọc
bảng thiếu thành yêu cầu đã chốt đầy đủ.
