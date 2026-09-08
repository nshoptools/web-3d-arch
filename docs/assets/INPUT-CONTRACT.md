# Hợp đồng đầu vào cho dựng và in 3D

Giữ nguồn, hash, chuỗi Unicode, thông số biến thể và phép chuyển đổi ở mỗi
bước. Font/artwork 2D chưa chứa độ dày, bảng vật liệu hay mesh của vật in.

## Đọc chữ và emoji

`src/input/font-source.mjs` dùng harfbuzzjs/WASM trong repo. Mẫu này dành cho
trang chạy từ gốc dự án qua localhost/HTTPS; khi dùng bundler phải giữ đúng
base URL và tệp WASM cạnh bundle HarfBuzz.

```javascript
import { createFontSource } from './src/input/font-source.mjs';
async function get(url, kind) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${url}`);
  return response[kind]();
}
const catalogURL = new URL('./src/assets/fonts/fonts-cat.json', document.baseURI);
const catalog = await get(catalogURL, 'json');
const entry = catalog.find(font => font.id === 'inter');
const source = await createFontSource(
  await get(new URL(entry.path, catalogURL), 'arrayBuffer'), entry
);
const run = source.shapeRun('Tiếng Việt', {
  language: 'vi', direction: 'ltr', variations: {wght: 600}
});
```

`shapeRun()` nhận **một run cùng font/script/hướng**, mặc định LTR và `vi`.
Ứng dụng phải chia dòng, xử lý bidi/script/font fallback rõ ràng trước đó.
Hàm chặn xuống dòng, tab, bidi control, surrogate lỗi, glyph thiếu và trục
ngoài phạm vi. Không thay ký tự thiếu bằng hình hộp hoặc font hệ thống ngầm định.

Trong Worker của ứng dụng, dùng cùng module nhân thay vì khởi tạo allocator
HarfBuzz thứ hai:

```javascript
import { initializeHarfBuzz } from '../../src/input/harfbuzz-engine.mjs';
import { createFontSourceWithHarfBuzz } from '../../src/input/font-source-core.mjs';
const hb = await initializeHarfBuzz(engine); // module Emscripten đã khởi tạo, ABI 2
const source = await createFontSourceWithHarfBuzz(fontBytes, entry, hb);
```

Đường import điều chỉnh theo vị trí module gọi. `fontBytes` phải là byte nguồn
đã kiểm hash; `entry` giữ cùng catalog và variation. Wrapper dẫn xuất có
[provenance](../development/harfbuzz-binding.json); không sửa bản vendor gốc.
Kết quả shape/outline/variation đã so trên 53 tệp font với bộ đọc độc lập;
memory growth và paint graph được kiểm ở Worker ba browser. Điều này không
thay các bước chia run, bố trí chữ, chuyển màu và kiểm mesh dưới đây.

Kết quả giữ `originalText`, `text` chuẩn hóa NFC, `glyphId`, `cluster`,
`xAdvance/yAdvance`, `xOffset/yOffset`, vị trí `x/y` đã cộng offset. `cluster`
tính theo **UTF-16 code unit của text sau NFC**. Với font chữ/đơn sắc, `outline`
gồm các lệnh `M/L/Q/C/Z` kín. Với font màu, lấy hình qua API màu bên dưới.

Tọa độ là **font units, Y hướng lên**. Đặt outline tại `(glyph.x, glyph.y)`
đúng một lần; không cộng offset lần hai. Đổi sang mm theo kích thước người
dùng chọn, phân biệt em-size với chiều cao phần mực. Giữ cùng variation ở
shaper và bộ lấy outline; chuyển hệ Y nhất quán, giữ contour ngoài và lỗ.

`createEmojiLookup(catalog, aliases, components)` tra **đúng một token**, giữ
chuỗi gõ ban đầu và nối về mục chuẩn. Không cắt ZWJ, modifier, cờ/tag hay FE0F
từng ký tự. FE0E yêu cầu hiển thị chữ không được tự chuyển sang emoji. Ứng dụng
vẫn cần bộ tách grapheme/emoji sequence cho văn bản; lookup không thay bước đó.
Với bộ đơn sắc phải kiểm tra mục tồn tại trong catalog đơn sắc trước khi dùng.

## Đọc nguồn màu

`source.colorPaint(glyphId)` yêu cầu font COLRv1. Kết quả giữ thứ tự:

- Push/pop transform, ma trận `[xx, yx, xy, yy, dx, dy]`.
- Clip outline glyph hoặc hình chữ nhật và pop clip.
- Solid, linear/radial/sweep gradient, color stops và extend mode.
- Push group/pop group với compositing mode gốc.

RGBA có 8 bit/kênh, chưa premultiply; gradient nội suy trong không gian
premultiplied theo COLR. Clip glyph dùng nonzero winding, góc sweep là radian.
Enum extend/composite theo HarfBuzz, được xuất từ bundle. Không bỏ transform,
clip hay group khi chuyển sang vùng màu nhìn thấy. Đã thử đủ 3.953 nguồn
emoji/thành phần của font COLRv1 đầy đủ; nguồn hiện dùng solid, linear/radial
gradient và compositing. Callback sweep chưa có ca thực tế trong bộ nguồn này.

`source.bitmap(glyphId)` yêu cầu font CBDT/CBLC, trả PNG và extents; chưa có
outline vùng màu. Cần vector hóa có đối chiếu nếu chọn bitmap làm hình học.
API màu từ chối kiểu nguồn sai và ảnh nhúng không hỗ trợ, không trả bản chuyển
đổi mất màu. Bộ đọc này chưa phải bộ rasterize graph màu hay bộ xuất mesh.

Với SVG, đọc viewBox, width/height/đơn vị, transform, style, fill-rule, clip/
mask, gradient, filter và thứ tự lớp. Preview dùng 96 DPI: cờ GU/US-VT khai báo
mm và không dùng được với renderer đặt DPI bằng 0. Độ phân giải preview không
phải độ chính xác tessellation hay kích thước in. Hai SVG cờ có raster nhúng
và ba SVG cờ có foreignObject được đánh dấu; không quảng bá là vector thuần.

SVG, COLRv1 và PNG là các sản phẩm nguồn riêng. Dùng cùng nguồn cho preview
và chuyển đổi khi cần khớp chính xác; không mặc định chúng trùng hình/pixel.
Giữ các độ phân giải PNG gốc, không phóng PNG nhỏ rồi gọi là bản nguồn lớn.

## Điều kiện trước khi xuất tệp in

1. Chuyển đường cong theo sai số **mm**, giữ contour/lỗ/phần rời như dấu tiếng
   Việt. Xử lý self-intersection, overlap, boolean/union; không nối contour
   rời chỉ để tạo một polygon.
2. Chọn kích thước, độ dày nền, độ nổi và cách nối/đỡ phần rời. Đối chiếu chi
   tiết tối thiểu với nozzle, lớp in và vật liệu đã chọn.
3. Xác định vùng vật liệu nhìn thấy từ màu/gradient/alpha. Ghi bảng màu và phép
   giản lược; không tự đổi nhiều màu thành một màu. Các khối theo vật liệu
   cần khít và tránh giao nhau không chủ ý.
4. Kiểm tra mesh kín, manifold, hướng mặt, thể tích dương, mặt suy biến và
   đơn vị. Xuất định dạng giữ cấu trúc vật liệu, ví dụ 3MF hoặc các khối tách
   riêng theo quy ước slicer; một STL đơn lẻ không mang bảng vật liệu màu.
5. Mở slicer kiểm tra kích thước/vật liệu/lớp và in thử mẫu đại diện.

Đây là tiêu chí của ứng dụng sẽ xây dựng, chưa được triển khai hay chứng minh
bằng một lần in thật trong phiên chuẩn bị nguồn. Các audit hiện giữ
`meshValidated: false`; tính hợp chuẩn của font không thay phép kiểm tra vật in.
