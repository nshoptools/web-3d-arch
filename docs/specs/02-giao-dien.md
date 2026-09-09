# Đặc tả giao diện

Thuộc [đặc tả 1.0.1](README.md), dùng hành vi của [chức năng](01-chuc-nang.md).
Các số px sau là token thiết kế khởi điểm có hiệu lực, không phải số đo UI đã tồn
 tại. Nếu mâu thuẫn với đọc được, thao tác được hoặc reflow, sửa token có bằng chứng
và cập nhật đặc tả; không giữ một số px để làm mất chức năng.

### UI-01 — Bố cục và sáu khu vực

Giao diện có hai trạng thái tách bạch. **Chưa mở dự án**: màn hình bắt đầu thay
cho không gian làm việc, gồm đúng hai việc có thể làm — *Tạo dự án mới* (chọn
loại sản phẩm, một nút Tạo) và *Mở dự án đã lưu* (danh sách dự án, mở từ gói
`.arch-project.zip`); không hiện rail/panel/stage, phím tắt khu vực và công cụ
bị từ chối kèm lý do; chưa đăng nhập thì chỉ hiện thẻ đăng nhập. **Đang chỉnh
sửa** (có dự án): giao diện tối, bảng thiết lập trái, khung thiết kế phải là vùng
lớn nhất khi màn hình cho phép. Thanh trên 56 px, và ở >1180 px luôn một hàng:
phần không vừa gập thành biểu tượng có tên trợ năng (tìm nhanh, mạng, nhãn bước
ngắn) chứ không xuống hàng thứ hai, nên khung bên dưới không nhảy khi nút hành
động chính xuất hiện hay biến mất; rail 74 px; panel 376 px, 344 px ở ≤1400 px. Dùng CSS grid, `minmax(0,1fr)` cho stage. Gập panel bằng biến
chiều rộng ở desktop; mobile có trạng thái ngăn kéo riêng. Backdrop desktop
`display:none`, không để phần tử trong grid vô hình sinh hàng.

Thanh trên: logo/tên, tên dự án đang mở kèm trạng thái lưu, hai bước, tìm nhanh,
trạng thái mạng, **một** nút hành động chính (Chuyển sang ảnh raster / Tách vùng
màu khi ảnh hoặc emoji chưa có vùng màu, rồi Dựng 3D / Dựng lại / Xem mô hình /
Xuất file, tự đổi theo trạng thái), menu trợ giúp và menu tài khoản. Một hành động
không xuất hiện ở hai nơi trên cùng màn hình; tải nguồn nằm ở khu Ảnh nguồn,
khung xem trống, kéo thả, dán và Ctrl+O. Bước hiện tại/hoàn thành/chưa có nguồn
phân biệt bằng chữ+biểu tượng+màu. Rail gồm icon + nhãn, vạch 3 px khu đang chọn;
badge số màu, kết quả dựng và số dự án, không dùng dấu ✓ thay cho trạng thái mesh
đã đạt. Rail và mobile tabs cùng registry; active/disabled/badge nhất quán.

| Khu | Màu nhận diện | Phụ đề |
| --- | --- | --- |
| Ảnh nguồn | #5b9dff | Tải ảnh, tạo bằng AI, gõ chữ hoặc chọn emoji |
| Sản phẩm | #b478ff | Loại sản phẩm và mẫu |
| Lớp màu | #38cfa0 | Vùng màu, vật liệu và khe filament |
| Thông số | #ffab3d | Kích thước, chiều cao, lỗ và lắp ghép |
| Xuất file | #ff7a9c | 3MF, STL, SVG và PNG |
| Thư viện | #4dd0e1 | Tên, lưu, dự án đã lưu và sao lưu |

Đầu panel có tên, phụ đề và tiện ích được wrap; không hardcode chiều cao theo
một font. Thân cuộn, padding 12 px, chỉ preview chữ sticky. Vấu gập hình vẽ
18×44 px có **hit target ít nhất 24×44 px**, không chồng target bên cạnh.
Trạng thái rỗng có câu chỉ đường và nút thực hiện, không để khoảng trống câm.

### UI-02 — Token, chữ và chuyển động

| Nhóm | Giá trị nền tảng |
| --- | --- |
| Nền b0/b1/b2/b3/b4 | #0b0e14 / #10151e / #141924 / #1b2130 / #232b3b |
| Viền ln/ln2 | #2b344a / #39445c |
| Canvas/stage/glass | #0b0e13 / #090d14 / rgba(12,16,24,0.86) |
| Chữ t1/t2/t3 | #e9eef7 / #8b98ad / #7e8b9f |
| Nhấn/đạt/cảnh báo/lỗi/yêu thích | #5b8cff / #39d0a0 / #ffb545 / #ff6b6b / #f5c451 |
| Nút chính chữ trắng | nền #3f6fe0; gradient chỉ dùng khi toàn dải đủ tương phản |
| Nút hoàn tất | nền #39d0a0, chữ #052419 |
| Bo góc | 7 / 10 / 14 / 18 px |
| Nhịp | 130 / 220 ms; cubic-bezier(0.4,0,0.2,1) |

Chú thích không tối hơn t3 khi cùng nền; **phải đo nền thực sau opacity, gradient,
compositing**, cả hover/selected/focus, gồm warning/star và màu từng khu.
Không sao chép tỷ lệ tương phản đời trước làm kết quả hiện tại. Chữ thường ≥4,5:1,
chữ lớn ≥3:1, thành phần UI cần nhận biết ≥3:1 theo tiêu chí WCAG áp dụng.
Không dùng màu làm dấu hiệu duy nhất. Cỡ chữ phải qua zoom/readability;
mặc định nội dung thân tối thiểu 14 px,
nhãn phụ 12 px và vẫn tăng theo cài đặt chữ.

Reduced motion tắt chuyển động không thiết yếu, shimmer/spinner thành trạng thái
chữ/tĩnh, bỏ smooth scroll. `prefers-contrast:more` tăng phân biệt; forced-colors
dùng màu hệ thống và focus rõ, select có mũi tên native. Đặt cascade đúng thứ tự
hoặc layer rõ, không dựa vào nhận định mọi media query tự tăng độ ưu tiên.

### UI-03 — Khung thiết kế, lớp phủ và chồng lớp

Stage margin 10 px trên/hai bên, sát thanh kế tiếp; viền 1 px, bo 14 px. 2D nền
ca-rô 20 px hoặc trắng, 3D canvas kín stage. Thước đo nhãn có viền nền để đọc được
trên khối sáng/tối. Lớp phủ chỉ số trên trái, nhóm nút trên phải, gợi ý dưới trái,
nút tách tầng dưới phải; nền kính có fallback nền đặc. `pointer-events:none`
chỉ dùng trên phần gợi ý trang trí, không áp lên nút/chú thích cần thao tác.

Nhóm nút gập được, nhớ riêng; nhãn gập là button có tên và aria-expanded. Bước 1:
ba dải gập (Chỉ số, Công cụ, Gợi ý) ở mép trên, cột công cụ bên phải, điều khiển
khung (thu/phóng, vừa khung, so sánh) ở góc dưới phải; khi chưa có nguồn không
có lớp phủ nào ngoài thẻ bắt đầu. Bước 2: nhóm Khung xem (kể cả bộ chọn khối)
gập mặc định ở ≤1180 px và khi gập vẫn nêu tên khối đang chọn; nút của năng lực
nhân không công bố thì không hiện. Chỉ số
và toolbar không chồng nhau: desktop có khoảng cách tối thiểu 12 px, bề rộng được
đo theo nội dung; ở ≤1180 px toolbar xuống dưới dải chỉ số. Nếu chỉ số cần cuộn,
phải có dấu hiệu còn nội dung và thao tác bàn phím; không giấu thông tin trong
scrollbar vô hình không có chỉ báo. Không coi công thức 34%/66% là bằng chứng
không chồng khi đổi ngôn ngữ/zoom.

Trạng thái stage: chưa có nguồn thì phủ toàn khung với các lối bắt đầu (tải tệp,
chữ, emoji, AI khi có kết nối);
bận bước 1 là pill giữ vùng đang sửa; bận bước 2 phủ mờ nhưng nút Hủy vẫn thao tác
được. Khi nhân đang chờ trả lời trong hộp xác nhận, thẻ bận ghi “chờ bạn trả lời”
thay vì “đang chạy” và không có nút Hủy riêng: Bỏ qua trong hộp là đường hủy. Lỗi/cảnh báo nằm đáy trái và có vùng đọc lại lâu dài. Khi rỗng, các toolbar
không có nghĩa thực sự hidden/inert. Bận có tiến độ/công đoạn/job id; không khóa
mất đường cứu/lưu dữ liệu độc lập.

Thứ tự lớp trong stacking context đã định: nhãn 1; chỉ số/gợi ý 2; thước/toolbar 3;
nút góc 4; cảnh báo 5; rỗng 6; bận 7/8; vấu panel 9; popup 20; backdrop 55;
panel trượt 60; tìm nhanh 200; toast 300; tooltip 400; skip link 999. Các giá trị
là token, phải kiểm stacking context do transform/opacity/backdrop tạo ra.

Hành động chính: bước 1 là Dựng 3D (hoặc Dựng lại / Xem mô hình đã dựng; với ảnh
hoặc emoji chưa có vùng màu là bước chuyển nguồn tương ứng), bước 2
là mở lựa chọn xuất đang hợp lệ; ở bước 2 khi mô hình cũ có thêm nút Dựng lại.
Tất cả nằm ở thanh trên, không có thanh việc kế tiếp riêng. Quay lại bước 1 bằng
chip bước 1. Không cho “nút chính” ngầm chọn sai profile máy. Gợi ý ngữ cảnh nằm
ở góc dưới trái của stage ở mọi bề rộng, gập được; nội dung dài không bị cắt.

### UI-04 — Điều khiển, bảng màu và emoji

Nút chính cao mục tiêu 38 px, input ≥34 px, checkbox hình vẽ 16 px nhưng nhãn+
ô thành target đủ lớn. Nút phụ có viền, trạng thái tắt có lý do bằng text/hint
focus được; opacity không thay semantics. Select native hoặc custom đạt keyboard;
slider có ô số cùng giá trị, min/max/unit, phím Home/End/mũi tên, không khác hành
vi theo kích thước thumb Firefox/Blink.

Hàng tham số: nhãn, giá trị, đơn vị và control. Checkbox/select không cần lặp giá
trị ở cột khác. Nhóm có màu/vạch/tiêu đề gập; lọc ẩn hẳn không khớp. Chip số lớp
luôn thống nhất với nhân. Hai nút Áp dụng đầu/cuối nhóm khối nhập cùng một lệnh;
khi dirty màu cam và có chữ “Chưa áp dụng”.

Sửa thông số hoặc màu thuần được áp dụng và dựng lại ngay, không qua hộp xác
nhận. Hộp xác nhận chỉ mở khi có quyết định của người dùng: nhập hoặc chuyển
nguồn, tách vùng màu, đổi loại sản phẩm, dùng chữ làm hình, chọn mặt hay khe.
Mỗi bước chuyển nguồn (chuyển sang raster, tách vùng màu) hỏi đúng một lần; cập
nhật sản phẩm theo sau áp dụng thẳng khi kế hoạch không mang quyết định, nên ảnh
hoặc emoji đi tới mô hình qua ba xác nhận (nhận nguồn, chuyển, tách vùng).
Dòng đầu của hộp nói việc vừa làm bằng lời người dùng (tệp nào, nguồn gì); hai
nút là Bỏ qua và Áp dụng thay đổi, nhật ký và hủy việc nằm trong chi tiết kỹ thuật.
Hộp có đề xuất không còn hiệu lực (đã dùng, đã hủy, dữ liệu đã đổi) báo một lần
rồi tự đóng, không mời thử lại. Phép kiểm lưới không xong (watchdog) ghi thành
vấn đề cần xem với kết quả “chưa kiểm”, không làm lệnh đã tạo mô hình thất bại.

Hàng màu gồm swatch (mục tiêu 27 px), hex (78 px), phần trăm hoặc tên vai, NỀN nếu
hợp lệ, khe (80 px), reset nếu có override; được wrap trên panel hẹp. Input color
native có label, focus của wrapper không bị overflow cắt. Chiều cao nằm hàng dưới.
Hàng không sinh khối vẫn có lý do, không biến mất. Trùng khe báo dưới bảng bằng
màu + văn bản nêu các hàng. Dấu selected khác với focus.

Lưới emoji khởi điểm 9 cột, cao 190 px có scroll rõ; tự giảm số cột để giữ target.
Có nhóm thật và hai nhóm ảo recent/favorite, tìm, ví dụ tìm, bộ nguồn và bộ lọc khó
in. Mục khó in vẫn có tên đọc được khi mờ; không dùng emoji font hệ thống đại diện
artwork. Icon UI có thể là SVG vendor có giấy phép; tài nguyên minh họa UI và
nguồn emoji tạo mô hình không đánh tráo lẫn nhau.

### UI-05 — Popup, tìm kiếm, thông báo và phím tắt

Popup bộ phận 238–300 px, max-height 78% với scroll, kéo qua header, bấm đúp reset;
mobile ≤720 px inset 8 px, không bắt kéo. Tên/scope/màu/khe/chiều cao/nguồn rõ.
Ghi chú văn xuôi là khối chữ, không `display:flex` chia từng đoạn thành cột.

Tìm nhanh dạng dialog, hộp tối đa 680 px, top mục tiêu 11vh, nhập + danh sách kết
quả nhóm có giá trị và lý do disabled. Focus luôn nhìn thấy, kể cả ô nhập duy nhất.
Trap focus cho modal, nền inert, Escape đóng, trả focus nơi mở; popup không modal
không trap. Tooltip xuất hiện khi hover/focus, có Escape và không che thao tác.
Toast có biến thể success/warning/error; mọi toast tự mất (6 s thành công/thông
tin, 12–14 s cảnh báo/lỗi), cùng câu gộp làm một, tối đa ba, xóa khi đổi dự án,
ở ≤720 px nằm trên hàng tab; lỗi quan trọng không chỉ tồn tại trong toast tự
mất mà còn trong nhật ký và dải vấn đề của khung. Có thông báo được đọc bằng screen reader và vùng xem lại.

| Phím | Phạm vi và lệnh |
| --- | --- |
| Ctrl/Cmd+K, / | Tìm nhanh, / chỉ ngoài vùng nhập |
| 1–6, \\ | Chọn khu; gập/mở panel |
| Ctrl/Cmd+O, Ctrl/Cmd+Enter | Chọn nguồn; bước tiếp |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Undo, redo lệnh dự án |
| Z | Undo ngoài vùng nhập ở cả hai bước |
| B V U X C K H | Bảy công cụ, bước 1 |
| F | Fit, cả hai bước |
| G T I P C M | Lưới, top, nghiêng, front, giữa bàn, đo; bước 2 |
| Shift+kéo | Đặt vị trí theo đối tượng; có ô số thay thế |
| Escape | Hủy thao tác/lớp trên cùng trước, không đóng mọi lớp cùng lúc |

Không bắt phím một chữ khi focus ở input/textarea/select/contenteditable, khi
IME đang composition hoặc tổ hợp trợ năng. Phím C chọn theo bước. U đang tạo
curve dùng Enter/Backspace/Esc cục bộ. Phím mở sai năng lực hiện lý do. Tất cả
label, palette và bảng phím được sinh cùng registry lệnh.

### UI-06 — Responsive và trợ năng

| Bề rộng CSS | Bố cục |
| --- | --- |
| w > 1400 | Desktop ba cột panel 376 |
| 1180 < w ≤ 1400 | Panel 344, ẩn phụ đề thương hiệu |
| 1023 < w ≤ 1180 | Toolbar dưới chỉ số; mạng còn ở vùng trạng thái |
| 720 < w ≤ 1023 | Rail+stage; panel fixed từ trái có backdrop; hai bước còn qua tiêu đề/nút tiếp |
| w ≤ 720 | Tabs đáy, drawer dưới cao mục tiêu min(56dvh,470px); header hai hàng (hàng nhận diện: dấu hiệu, tên dự án + trạng thái lưu, tìm nhanh và tài khoản dạng icon có nhãn trợ năng — hai điều khiển icon-only duy nhất, chỉ ở bề rộng này —, mạng, trợ giúp; hàng việc: hai bước dạng ngắn và một hành động chính), mục tiêu ≤ 100 px; drawer đóng khi đổi bố cục hoặc khi dựng xong vào bước 2 |

Các điểm đúng ranh giới áp một quy tắc duy nhất; viết mobile-first/range queries
để tránh khe/chồng, không phụ thuộc lượng tử CSS 1/64 px của một engine. Thử cả
x−1/x/x+1 quanh 720,1023,1180,1400 và fractional zoom. Thêm ca chiều cao ≤520 px,
landscape, bàn phím ảo; drawer không che hết đường đóng/lưu. Cộng safe-area đáy;
trang có `viewport-fit=cover`. Panel/body vẫn cuộn khi chữ 200%, reflow 320 CSS px;
canvas cần hai chiều có thể là ngoại lệ nhưng các control không được viện theo.

Mục tiêu WCAG 2.2 AA theo tiêu chí áp dụng, vừa không hồi quy vừa đạt ngưỡng tuyệt
đối; baseline cũ không hợp thức hóa lỗi. Target ≥24×24 CSS px hoặc ngoại lệ có
chứng minh; chọn 44 px trên pointer coarse khi bố cục cho phép. Có skip link,
focus visible/không bị che, không cử chỉ drag-only: số/keyboard thay thế.
Dùng tablist+tabpanel, radiogroup, listbox/option cho lựa chọn, combobox cho tìm
với keyboard theo pattern tương ứng; chỉ dùng role khi thực hiện đủ hành vi.
Roving tabindex, aria-selected/expanded, aria-controls đúng ID. Lưới favorite có
nút phụ tránh nhét button tương tác sai vào option; cung cấp thao tác yêu thích
riêng khi thiết kế pattern yêu cầu. Live status không đọc lại mọi frame; lỗi
`role=alert` có chừng mực. Tương phản phải thử trên nền pha, forced-colors, reduced
motion, nhiều font fallback và screen reader. Máy kiểm layout/a11y phải đi kèm
xem thật để phát hiện văn xuôi vỡ cột, overlay đè nhau hoặc thông tin nằm ngoài tầm.
