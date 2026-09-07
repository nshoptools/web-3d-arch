# Noto Emoji màu — nguồn cho hình nổi và in nhiều vật liệu

Yêu cầu của dự án bao gồm mô hình nhiều màu. Chỉ tải font đơn sắc là thiếu phạm
vi nguồn. Việc một thư viện chỉ đùn được outline đơn sắc không phải giới hạn
của máy in hoặc lý do bỏ bộ màu. Bộ màu và đơn sắc hiện được giữ song song.

## Nguồn gốc và phạm vi đầy đủ

Nguồn chính thức: [googlefonts/noto-emoji](https://github.com/googlefonts/noto-emoji),
commit `8998f5dd683424a73e2314a8c1f1e359c19e8742`.
Toàn bộ **8 TTF đang được xuất bản trong `fonts/`** đã được tải nguyên byte.
Phiên bản nội bộ các font là 2.051. Các nhánh `noflags`, `flagsonly`,
`emojicompat` là biến thể do upstream xuất bản; bản đầy đủ vẫn được giữ riêng.

| Tệp trong `src/assets/emoji/color/fonts/` | Nội dung |
| --- | --- |
| `Noto-COLRv1.ttf` | Bộ màu vector đầy đủ, có cờ; lựa chọn font màu mặc định |
| `Noto-COLRv1-emojicompat.ttf` | Vector + metadata tương thích EmojiCompat |
| `Noto-COLRv1-noflags.ttf` | Biến thể vector bỏ cờ |
| `NotoColorEmoji.ttf` | Bộ màu bitmap CBDT/CBLC đầy đủ |
| `NotoColorEmoji-emojicompat.ttf` | Bitmap + metadata EmojiCompat |
| `NotoColorEmoji-noflags.ttf` | Biến thể bitmap bỏ cờ |
| `NotoColorEmoji-flagsonly.ttf` | Biến thể bitmap chỉ có cờ |
| `NotoColorEmoji_WindowsCompatible.ttf` | Biến thể bitmap tương thích Windows |

Artwork đi kèm được giữ nguyên cấu trúc upstream trong `src/assets/emoji/color/`:

- `svg/`: toàn bộ 3.731 SVG emoji gốc và thông báo giấy phép.
- `png/{32,72,128,512}/`: toàn bộ PNG gốc ở mọi độ phân giải được công bố.
  Có 3.768 bản 128px và 3.731 bản ở mỗi kích thước 32/72/512px.
- `third_party/region-flags/{svg,waved-svg,png}/`: toàn bộ nguồn cờ phẳng,
  cờ uốn và PNG tại revision đã pin, kèm tài liệu/giấy phép/tác giả.
- Tổng **4.336 SVG, 15.312 PNG**, tính cả nguồn cờ và biến thể.
- 24 symlink upstream được giữ **nội dung liên kết gốc** tại `upstream/links/`.
  Catalog trỏ đến tệp đích chuẩn đã xác minh trong repo; không tạo junction hay
  symlink Windows, không ghi chuỗi đích liên kết giả làm một tệp SVG/PNG.

“Đầy đủ” ở đây là đủ font đã phát hành, toàn bộ SVG, tất cả độ phân giải PNG
nguồn cùng bộ cờ tại revision đã pin. Mã build upstream nằm trong archive
review, không dùng làm tài nguyên UI. Tổng 19.691 tệp màu gốc là 276.605.100 byte;
archive tải về nằm riêng trong phòng Codex, không phân phối/Git cùng sản phẩm.

Kết quả audit: **3.944/3.944 chuỗi fully-qualified Unicode Emoji 17.0** có
nguồn SVG và shape được thành glyph màu ở cả hai font đầy đủ COLRv1/bitmap.
Các biến thể `noflags` hỗ trợ 3.685 chuỗi, `flagsonly` hỗ trợ 259 chuỗi;
EmojiCompat và WindowsCompatible giữ độ phủ 3.944 chuỗi. Đây là kiểm tra
shaping/tham chiếu dữ liệu. Ngoài ra đã render toàn bộ SVG bằng resvg và giải mã
PNG bằng Pillow; không khẳng định các định dạng nguồn trùng pixel với nhau.

## Danh mục cho giao diện

Điểm vào: `src/assets/emoji/collections.json`. Hai lựa chọn có id ổn định:

- `noto-color-emoji`: màu, mặc định.
- `noto-emoji-monochrome`: đơn sắc, giữ nguyên danh mục cũ.

Resolve `fontCatalog` và `emojiCatalog` tương đối từ URL của `collections.json`.
Trong bộ màu, `fonts-cat.json` chứa 8 font với `id`, `name`, `family`, `path`,
`colorFormat`, `variant`, độ phủ thực đo, version, SHA-256 và giấy phép.
`colorFormat` quyết định bộ đọc; không tự đưa mọi TTF vào `opentype.getPath()`.

`color/emoji-cat.json` giữ chuỗi Unicode đầy đủ (ZWJ, màu da, cờ, VS16) theo
nhóm/phân nhóm. Mỗi item có:

- `id`, `emoji`, `name`, `codepoints`, `group`, `subgroup`, `emojiVersion`.
- `glyphs`: glyph id đã HarfBuzz shape riêng cho hai font màu đầy đủ.
  Tra font bằng `fontHashes`; id của COLRv1 và bitmap **không dùng lẫn nhau**.
- `vectors[]`: các nguồn SVG có thật, đường dẫn/hash, viewBox và đặc tính
  gradient, clipping, filter, ảnh raster nhúng hoặc tham chiếu ngoài.
- `rasters[]`: PNG có thật, đường dẫn/hash và kích thước.
- `preferredRasterPath`: ưu tiên 128px nếu có, để preview không tải ảnh lớn vô ích.
- `preferredGeometrySource`: `svg`, `colrv1`, hoặc `null`; đây là nguồn cho
  bước chuyển đổi, không phải xác nhận đã có mesh in được.
- `preferredVectorPath`: SVG ưu tiên cho chuyển đổi, đã loại các nguồn có ảnh
  raster nhúng, tham chiếu ngoài hoặc `foreignObject` khỏi lựa chọn ưu tiên.

Đường dẫn artwork/font tính từ thư mục chứa JSON bộ màu. Dùng SVG đầu tiên
để preview khi có; giữ các biến thể cờ cho người dùng chọn nếu cần. Font màu,
SVG và PNG là các sản phẩm upstream riêng: không khẳng định chúng trùng pixel
hoặc hình học tuyệt đối chỉ vì cùng emoji. Không lấy emoji hệ điều hành thay
cho nguồn preview. Tải lười theo mục được chọn, không nạp toàn bộ 277 MB lúc mở UI.

`collections.json` còn trỏ đến ba danh mục dùng chung:

- `input-aliases.json`: 1.272 cách nhập minimally-qualified/unqualified có
  `canonicalId`. Mọi cách nhập đã shape cùng glyph chuẩn ở cả hai font đầy đủ.
- `components-cat.json`: 9 thành phần độc lập, gồm màu da/kiểu tóc, có nguồn
  và glyph như mục emoji; UI có thể đặt chúng trong nhóm công cụ riêng.
- `artwork-cat.json`: đủ 4.336 SVG, có tên, nguồn/hash, giấy phép, đặc tính và
  `emojiIds` liên quan. 137 artwork ngoài các mục chuẩn vẫn có thể tìm/chọn.
  Nhãn không có tên Unicode dùng mã nguồn, đánh dấu `nameLanguage: null`.

Tên mục Unicode là tiếng Anh; đường dẫn trong từng JSON tính từ thư mục chứa
JSON đó. Không lấy id glyph của alias để dùng với một font khác hash. Mọi
phép tra chuỗi phải giữ nguyên chuỗi gõ ban đầu, không tùy tiện bỏ FE0E/FE0F.

Trong toàn bộ artwork có 2 SVG cờ nhúng raster và 3 SVG cờ phẳng chứa metadata
`foreignObject` của Illustrator (AS, MX-MIC, MX-NAY). Các bản gốc vẫn được giữ;
danh mục ghi đặc tính này, không coi mọi tệp đuôi SVG là đường vector thuần.
Không có script hoặc tham chiếu tài nguyên ngoài được phát hiện. Khi cần bản
SVG đã làm sạch/chuyển ảnh thành vector, sinh bản dẫn xuất riêng và kiểm chứng.

## Chuyển sang mô hình nhiều màu

[COLRv1](https://learn.microsoft.com/en-us/typography/opentype/spec/colr) lưu
graph lớp màu: outline, palette, gradient, biến đổi và phép trộn. Chỉ đọc `glyf`
của base glyph có thể trả hình trống hoặc mất lớp/màu. opentype.js 2.0.0 trong
repo không thay thế bộ xử lý graph COLRv1. Bộ đọc `src/input/font-source.mjs`
đã dùng HarfBuzz để lấy outline, màu, gradient, transform, clip và compositing;
đã thử 3.953 nguồn emoji/thành phần. Xem [hợp đồng chuyển đổi](INPUT-CONTRACT.md).

Với dạng hình nổi nhiều màu như ảnh tham chiếu, pipeline dự kiến là:

1. Đọc toàn bộ các hình/màu/lớp của SVG hoặc COLRv1; áp dụng transform, clip,
   mask và thứ tự chồng lớp để biết vùng nào thực sự nhìn thấy.
2. Chọn bảng màu vật liệu và độ cao/độ dày từng vùng. Gradient và alpha cần
   chuyển thành số vùng màu phù hợp hoặc được người dùng chấp nhận giản lược.
3. Tạo các khối riêng theo vật liệu, xử lý giao nhau và nền đỡ. Kiểm tra chi
   tiết nhỏ, mesh kín và độ vừa khít trước khi xuất sang bước cắt lớp/in.

PNG/bitmap vẫn hữu ích cho preview và đối chiếu màu; cũng có thể là nguồn cho
vector hóa/phân vùng có kiểm chứng. Chúng chưa có sẵn các đường vùng vector.
Giữ bản gốc và ghi phép chuyển đổi trong thư mục dẫn xuất; không thay font/SVG
gốc bằng một bản đã đơn sắc hóa. Các nguồn 2D chưa chứa độ sâu, vật liệu hoặc
mesh 3D, nên việc tải đủ bộ không đồng nghĩa đã dựng/in thử mô hình.

## Giấy phép và tái lập

- Font: `color/fonts/LICENSE`, OFL-1.1.
- SVG/PNG emoji: thông báo Apache-2.0 tại `color/svg/LICENSE`, bản đầy đủ tại
  `color/licenses/Apache-2.0.txt`.
- Cờ: giữ điều khoản/tác giả riêng ở `color/third_party/region-flags/`.
- Dữ liệu danh mục Unicode giữ giấy phép trong `emoji/licenses/unicode/`.
- `color/LICENSE` gốc hiện là OFL; README upstream còn trỏ nhầm giấy phép
  artwork vào đó. Không dùng bản OFL này để thay thông báo Apache của SVG.

`color/assets-lock.json` khóa URL, revision, SHA-256 và Git blob SHA-1 từng
tệp. Bộ tải đối chiếu archive với Git tree đầy đủ; không dựa vào danh sách
GitHub UI bị giới hạn 1.000 tệp. Hai hash kiểm tra byte gốc; không sửa artwork.

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260905-color-emoji
python -B tools/assets/sync_color_assets.py
python -B tools/assets/build_color_catalogs.py
```

Lệnh đầu chỉ tải tệp thiếu/sai hash. Lệnh thứ hai kiểm chứng offline: hash toàn
bộ nguồn, checksum font/từng bảng, outline và graph/palette COLRv1, bitmap
nhúng, PNG CRC/giải nén, XML/đặc tính SVG, symlink/alias và shaping cả tập Unicode.
Báo cáo: `docs/assets/color-emoji-audit.json` và `color-emoji-unavailable.json`.
Render độc lập nằm trong `artwork-render-audit.json`; runtime JavaScript/WASM
trong `input-runtime-audit.json`. Các phép kiểm tra không thay kiểm tra mesh/in thử.

Khi chủ ý cập nhật nguồn, sửa `REVISION` trong `tools/assets/sync_color_assets.py`,
chạy script đó với `--refresh-lock`, rồi `build_color_catalogs.py --write` và
chạy lại không có `--write` để xác nhận danh mục ổn định. Cập nhật tài liệu nếu
số lượng/định dạng upstream thay đổi; tiếp tục chạy các kiểm tra bộ chữ/đơn sắc.
