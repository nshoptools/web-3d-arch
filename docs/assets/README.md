# Font, emoji và opentype

## Kết quả kiểm tra ngày 2026-09-05

Bộ nguồn hiện có **cả emoji màu lẫn đơn sắc**. Xem
[bộ Noto Emoji màu và hướng dựng nhiều vật liệu](COLOR-EMOJI.md).
Giao diện bắt đầu từ `src/assets/emoji/collections.json`, mặc định chọn bộ màu.
Đọc [rà soát đầy đủ](READINESS-AUDIT.md) và [hợp đồng đầu vào](INPUT-CONTRACT.md)
trước khi phát triển ứng dụng dựng/in 3D.

31 font cũ là bản subset (giấy phép cũ ghi Latin + tiếng Việt). Cả 31 đã được
thay bằng tệp TrueType đầy đủ từ kho Google Fonts chính thức, giữ nguyên byte.
Tên tệp cục bộ được giữ để tương thích danh mục cũ; tên tệp upstream ở
`source.filename`. Đã bổ sung 22 biến thể còn thiếu; hiện có **53 TTF, đủ các
kiểu công bố trong METADATA của 30 họ đã chọn**, tổng 21.893.368 byte.
Các bản cũ có outline, nhưng không đáp ứng yêu cầu giữ bản nguồn đầy đủ.

53/53 font mới có đủ 186 mã ký tự trong phép kiểm tra alphabet Latin + toàn bộ
chữ Việt có dấu NFC, với glyph có đường bao. Kiểm tra này không đồng nghĩa với
hỗ trợ mọi ngôn ngữ hoặc mọi kiểu shaping. Danh mục cũ chỉ có `name` và `file`;
danh mục mới giữ hai trường đó và bổ sung hợp đồng bên dưới.

Noto Emoji **đơn sắc**, bản gốc `NotoEmoji[wght].ttf`, phiên bản nội bộ 3.002,
có outline `glyf` và trục `wght` 300–700, mặc định 400. Một tệp variable chứa
các mức Light / Regular / Medium / SemiBold / Bold, không cần tạo năm font
static dẫn xuất. Nguồn này phục vụ khối 3D đơn sắc. Noto Color Emoji dạng
bitmap CBDT/CBLC không phải nguồn đường bao cho việc đùn khối.

Danh mục emoji **đơn sắc** có **3.789 chuỗi** fully-qualified đã được HarfBuzz xác minh và
đọc đường bao qua opentype. **155 chuỗi** còn lại trong tập Unicode Emoji 17.0
không đạt phép kiểm tra của font này, nên không đưa vào bộ chọn. Không tuyên bố
font hỗ trợ toàn bộ Unicode 17. Nhiều chuỗi có thể cùng glyph trong thiết kế
đơn sắc; `id` của emoji là chuỗi Unicode, không phải `glyphId`.

opentype.js **2.0.0** được lấy từ gói npm chính thức, kiểm tra SRI SHA-512 của
tarball rồi lưu nguyên các tệp phân phối. Không cần npm install để sử dụng
bundle cục bộ. Dependency Python phục vụ audit nằm riêng ở `.toolchain/python/`.

Đã bổ sung **harfbuzzjs 1.6.1/WASM, lõi HarfBuzz 14.4.0** và bộ đọc thực tế
`src/input/font-source.mjs`: kiểm tra hash, shaping, chuẩn hóa NFC, outline kín
và graph màu. Hướng dẫn API và giới hạn nằm trong `INPUT-CONTRACT.md`.

## Nguồn và cấu trúc

- Google Fonts: <https://github.com/google/fonts>, commit
  `5e35378e6bda803962ee6fd257e444a7d459660d`.
- Noto Emoji: <https://github.com/google/fonts/tree/5e35378e6bda803962ee6fd257e444a7d459660d/ofl/notoemoji>;
  giải thích các định dạng: <https://github.com/googlefonts/noto-emoji>.
- opentype.js: <https://github.com/opentypejs/opentype.js/releases/tag/2.0.0>;
  gói pin: <https://registry.npmjs.org/opentype.js/2.0.0>.
- Unicode: <https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt>.

| Đường dẫn từ gốc repo | Vai trò |
| --- | --- |
| `src/assets/assets-lock.json` | URL, revision, kích thước, SHA-256 của 106 tệp gốc; SRI gói npm |
| `src/assets/fonts/ttf/` | 53 tệp font chữ gốc, đủ biến thể của 30 họ |
| `src/assets/fonts/fonts-cat.json` | Mảng lựa chọn font chữ cho UI |
| `src/assets/fonts/{licenses,upstream}/<family>/` | OFL và METADATA.pb nguyên bản của 30 họ |
| `src/assets/emoji/ttf/NotoEmoji.ttf` | Font emoji variable gốc, đổi tên tệp cục bộ |
| `src/assets/emoji/fonts-cat.json` | Mảng lựa chọn font emoji, trục và các mức đậm |
| `src/assets/emoji/emoji-cat.json` | Bộ chọn biểu tượng theo nhóm/phân nhóm |
| `src/assets/emoji/collections.json` | Điểm vào UI: bộ màu và bộ đơn sắc |
| `src/assets/emoji/color/` | Đủ 8 font màu, artwork gốc, danh mục và hash lock riêng |
| `src/assets/emoji/{licenses,upstream}/` | OFL Noto, giấy phép Unicode và dữ liệu đầu vào gốc |
| `src/assets/opentype/dist/opentype.mjs` | Bundle ESM cho trình duyệt / Node |
| `src/assets/opentype/dist/opentype.js` | Bundle UMD / CommonJS |
| `src/assets/opentype/` | MIT, README, package metadata và bản minified/source map gốc |

Danh mục và báo cáo là dữ liệu sinh từ các tệp gốc. `.gitattributes` tắt chuyển
đổi newline dưới `src/assets/` để Git trên Windows giữ hash của giấy phép,
metadata và thư viện. Không sửa trực tiếp tệp vendor.

## Hợp đồng danh mục cho giao diện

`fonts/families-cat.json` gom 53 tệp thành 30 họ, với `fontIds` và
`defaultFontId`; UI không coi mỗi biến thể là một họ riêng. “Đủ họ” ở đây là
đủ biến thể của 30 họ đã chọn, không phải tải toàn thư viện Google Fonts.

`fonts/fonts-cat.json` và `emoji/fonts-cat.json` đều là mảng. Mỗi mục có:

- `id`: khóa ổn định, dùng lưu lựa chọn; `name`: nhãn UI; `family`: họ font.
- `file`: basename cũ; **`path`**: đường dẫn tương đối từ thư mục chứa JSON.
  Ví dụ `ttf/Inter.ttf`; dùng `new URL(entry.path, catalogURL)`, không ghép thêm
  `ttf/` vào `path`. `license.path` cũng tính từ thư mục chứa JSON.
- `style`, `weight`, `category`, `sampleText`: dữ liệu lựa chọn/xem trước.
  Category theo Google Fonts (`sans_serif`, `serif`, `display`, `handwriting`).
- `variable`, `axes[tag].{min,default,max}`, `defaultVariation`: luôn truyền
  toàn bộ `defaultVariation` khi lấy outline. Không mặc định mọi font có trọng
  lượng gốc 400; Merriweather có mặc định nội bộ khác với lựa chọn UI 400.
- `coverage.vietnamese` và `coverage.missingVietnamese`: chỉ có ở font chữ,
  đo theo bộ 186 ký tự của `tools/assets/build_catalogs.py`, chuẩn hóa NFC.
- `format`, `outlineFormat`, `unitsPerEm`, `glyphCount`, `fontRevision`,
  `internalVersion`, `bytes`, `sha256`, `source`, `license`: thông số và truy vết.
- Riêng font emoji có `weightPresets: [300, 400, 500, 600, 700]`.

`emoji-cat.json` là object có `schemaVersion: 1`, `fontId`, `fontSha256`,
`unicodeVersion`, `groups`, `count`, `excludedCount`, `items`. Nhãn tên emoji
và nhóm là tiếng Anh từ Unicode (`nameLanguage: en`), thuận tiện dịch ở tầng UI.
`groups[].name` khớp `items[].group`; thứ tự giữ theo Unicode. Mỗi item có
`id`, `emoji`, `name`, `codepoints`, `group`, `subgroup`, `emojiVersion`,
`glyphId`. Dùng `emoji` đầy đủ cho chọn/copy/search, không tách từng ký tự.

`glyphId` đã được HarfBuzz shape từ toàn bộ chuỗi (kể cả ZWJ, VS16, màu da,
cờ và keycap), gắn với đúng **fontSha256**. Thay font là phải dựng lại catalog.
Khi xuất outline một mục đã chọn, lấy glyph trực tiếp theo id đã xác minh:

```javascript
import { parse } from './src/assets/opentype/dist/opentype.mjs';

const catalogURL = new URL('./src/assets/emoji/fonts-cat.json', document.baseURI);
const [fontEntry] = await (await fetch(catalogURL)).json();
const buffer = await (await fetch(new URL(fontEntry.path, catalogURL))).arrayBuffer();
const font = parse(buffer);
const picker = await (await fetch(new URL('emoji-cat.json', catalogURL))).json();
if (picker.fontSha256 !== fontEntry.sha256) throw new Error('Font/catalog mismatch');
const item = picker.items.find(item => item.id === '1f1fb-1f1f3'); // Việt Nam
const outline = font.glyphs.get(item.glyphId).getPath(
  0, 0, 100, { hinting: false, variation: { wght: 400 } }, font
);
// Xử lý đóng contour, phân biệt lỗ và tessellation trước khi đùn khối.
```

Mẫu trên giả định trang ở gốc repo và chạy qua HTTP; ứng dụng sau này phải
điều chỉnh base URL/bundler, kiểm tra lỗi HTTP và phải xác minh hash byte
font bằng Web Crypto. Tải lười font đã chọn, không tải đồng thời cả thư viện.
Không dựa vào emoji của font hệ điều hành để đại diện chính xác nguồn 3D.

## Giới hạn tích hợp 3D đã kiểm chứng

Các font có thể đọc outline; **chưa có mesh 3D để kiểm tra**. Việc tạo mesh
vẫn cần shaping, kerning/mark positioning, phân loại contour ngoài/lỗ,
chuẩn hóa hướng, tessellation/overlap và kiểm tra mesh kín/manifold.

Hai điểm của opentype.js 2.0.0 phải xử lý ở tầng tích hợp:

1. `Glyph.getPath()` bỏ lệnh `Z` khi path chỉ tô màu. Kiểm tra đã xác nhận các
   contour vẫn có điểm đầu/cuối trùng nhau. Khi chuyển sang Shape/SVG/mesh,
   thêm thao tác đóng mỗi contour ở ranh giới `M` và cuối path, giữ nguyên lỗ;
   không suy rằng thiếu `Z` là font nguồn hỏng, hoặc nối hai contour với nhau.
2. `font.getPath(text)` chưa xử lý đủ GSUB. Với mẫu chữ Việt, **Bangers,
   Fruktur, Great Vibes, Inter, Merriweather, Nunito, Oswald** cùng một số kiểu
   nghiêng báo lookup chưa
   hỗ trợ. Không xóa GSUB hay tắt features để ép chạy. Pipeline chữ nên dùng
   HarfBuzz hoặc shaper đầy đủ, lấy glyph id + advance/offset rồi lấy outline
   bằng opentype. Emoji trong picker đã có id shape sẵn; văn bản tùy ý vẫn
   cần shaper lúc chạy. Audit hiện ghi 12 biến thể bị ảnh hưởng. Bộ đọc
   `src/input/font-source.mjs` đã dùng HarfBuzz/WASM để shape và lấy outline
   có `Z` trực tiếp; không còn chỉ dựa vào các mẫu glyph run cố định.

`docs/assets/shaping-samples.json` chứa glyph run HarfBuzz cho từng font chữ,
dùng kiểm chứng mẫu trong Node. Không dùng các mẫu cố định này để thay cho
shaper của văn bản tùy ý. Với glyph run, áp dụng cả advance và offset; hệ Y
font hướng lên còn path trả về từ opentype hướng xuống. Font variable cần
cùng tọa độ trục ở cả shaper và công cụ lấy outline.

## Tái lập và bảo trì

PowerShell, từ gốc repo (Python 3.10+ và Node 20+ đã có trên máy):

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260905-font-assets
python -B -m pip install --only-binary=:all: --target .toolchain/python -r tools/assets/requirements.txt --no-warn-script-location
python -B tools/assets/build_catalogs.py
./tools/assets/verify-all.ps1 -Seat codex
```

Các lệnh kiểm tra chạy **offline**, không sửa tài nguyên/danh mục. Log và ảnh
QA được ghi trong phòng review. Python kiểm tra SHA-256,
checksum toàn sfnt/từng bảng, cmap, tất cả outline mặc định, chữ Việt và
shaping toàn tập fully-qualified. Node đọc đúng bundle ESM vendored, thử
outline mọi glyph ở tọa độ UI, các mẫu trục min/max, glyph run chữ Việt và
mọi glyphId trong picker. Test kết thúc lỗi nếu bằng chứng/catalog lệch.
`build_color_catalogs.py` kiểm tra riêng các định dạng màu; chi tiết trong
`COLOR-EMOJI.md`. Công cụ đơn sắc không áp đặt điều kiện chỉ có `glyf` lên bộ màu.
Kiểm tra runtime đối chiếu 53 run JS với native HarfBuzz, NFC/NFD, 9.858 đường
bao chữ Việt, 46 tổ hợp biên trục variable, 5.225 dạng nhập ở mỗi font màu đầy
đủ và 3.953 graph màu/3.953 bitmap. resvg render tất cả 4.336 SVG ở 96 DPI,
Pillow giải mã cả 15.312 PNG; kiểm tra đường dẫn/cô lập cũng chạy cùng lượt.

Khôi phục tệp thiếu/sai hash từ đúng nguồn đã khóa:

```powershell
python -B tools/assets/sync_assets.py
python -B tools/assets/sync_color_assets.py
python -B tools/assets/sync_harfbuzz.py
```

Khi **chủ ý cập nhật** nguồn: sửa pins trong `sync_assets.py`, chạy
`python -B tools/assets/sync_assets.py --refresh-lock`, rồi
`./tools/assets/verify-all.ps1 -Seat codex -UpdateReports`.
Review thay đổi nguồn/hash/giấy phép và cả danh mục trước khi sử dụng.

Các bằng chứng nằm trong repo, không bị Git ignore: `initial-font-audit.json` (trước/sau),
`font-audit.json`, `opentype-audit.json`, `shaping-samples.json`,
`emoji-excluded.json`, `input-runtime-audit.json`, `artwork-render-audit.json`
và `readiness-audit.json`. Repo hiện chưa có commit. Bản sao font trước khi thay được giữ riêng trong
`tmp/reviews/codex/runs/20260905-font-assets/inputs/fonts-before/` trên máy
hiện tại, không đưa vào Git và không dùng làm tài nguyên sản phẩm.
