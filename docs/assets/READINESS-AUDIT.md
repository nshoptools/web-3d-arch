# Rà soát nguồn đầu vào dựng/in 3D — 2026-09-05

Phạm vi: toàn bộ yêu cầu chuẩn bị font, Noto Emoji, opentype, quy tắc cô lập
và ba phòng review; bổ sung theo yêu cầu giữ đủ nguồn cho in nhiều màu.
Người thực hiện kiểm tra trong phiên này: Codex. Không có review của Grok/Opus
được giả lập hoặc tự ghi nhận chỉ vì đã tạo phòng cho họ.

## Những điểm trước đây đã hiểu hẹp hoặc kiểm tra chưa đủ

| Điểm trước đây | Điều đã sửa và xác minh |
| --- | --- |
| Coi nguồn emoji cho 3D chủ yếu là outline đơn sắc | Giữ đủ 8 font màu, COLRv1/CPAL, SVG, bitmap và font đơn sắc gốc |
| Dừng ở 31 tệp font có sẵn | Rà METADATA của 30 họ; tải thêm 22 biến thể, gồm 16 kiểu Be Vietnam Pro và 6 kiểu nghiêng của các họ khác |
| Coi bộ chọn fully-qualified là toàn bộ dạng nhập | Thêm 1.272 cách viết thay thế, 9 thành phần và danh mục toàn bộ SVG, gồm 137 artwork ngoài bộ chọn chuẩn |
| Liên kết cờ theo hai regional indicators, chưa đủ chuỗi tag | Bổ sung liên kết SVG cờ phẳng/PNG cho England, Scotland, Wales; chúng đã có nguồn gốc nhưng chưa được nối đủ trong danh mục |
| Chỉ giữ PNG 128px phục vụ preview | Bổ sung toàn bộ PNG 32/72/512 do upstream công bố và giữ đầy đủ PNG cờ |
| Tải opentype và ghi chú giới hạn shaping là đủ để bàn giao bộ đọc | Thêm HarfBuzz JS/WASM và API chạy được: hash, NFC, glyph/advance/offset, outline kín, paint graph màu và bitmap |
| Hash/checksum/XML hợp lệ là đủ bằng chứng tài nguyên dùng được | Render tất cả SVG bằng resvg, giải mã mọi PNG bằng Pillow, xem ảnh mẫu; thử runtime JavaScript trên toàn corpus |
| Quy tắc và chuyển TEMP chính đã bao quát cô lập | Bỏ ghế Codex mặc định, mã phiên tự sinh khó trùng; kiểm tra cả đường cache/toolchain lồng, từ chối junction và traversal |
| Tài liệu rời đã đủ hướng dẫn các ghế sau | Thêm hợp đồng đầu vào/chuyển đổi mm/vật liệu, một lệnh kiểm tra chung và báo cáo kiểm chứng liên kết bằng hash |

31 tệp ban đầu đúng là subset, đã được thay bằng byte gốc. Hash sau khi thay
của cả 31 vẫn giữ nguyên trong đợt mở rộng này; không convert/instantiate
font gốc. Tên tệp/id cũ vẫn dùng được. “Đủ font chữ” là đủ biến thể được công
bố trong METADATA của **30 họ đã chọn**, không tuyên bố đã tải mọi Google Font.

## Kết quả thực đo

- **19.829 tệp nguồn gốc**, tổng **306.233.293 byte**, được khóa nguồn/version/
  revision và hash; giấy phép riêng đi kèm. Git không đổi byte nguồn và không
  ignore tài nguyên, quy tắc hay khung phòng review.
- **53 font chữ / 30 họ**, đủ 186 ký tự alphabet/chữ Việt. opentype kiểm tra
  mọi glyph; HarfBuzz JS khớp native HarfBuzz ở 53 mẫu, NFC/NFD, 9.858 đường
  bao ký tự Việt và 46 tổ hợp biên trục variable.
- **62 tệp font tổng cộng**: 53 chữ + 1 Noto Emoji đơn sắc + 8 Noto màu.
  opentype.js 2.0.0 và harfbuzzjs 1.6.1 được lưu đầy đủ bản phân phối gốc.
- **3.944 emoji màu chuẩn**, **1.272 dạng nhập thay thế**, **9 thành phần**;
  cả 5.225 dạng shape được ở hai font màu đầy đủ. JS lấy được 3.953 graph
  COLRv1 và 3.953 bitmap. Bộ đơn sắc hỗ trợ **3.789**, ghi rõ **155** mục thiếu.
- **4.336 SVG** render thành công ở 96 DPI, **15.312 PNG** giải mã đầy đủ;
  không có ảnh trống trong phép kiểm tra. Contact sheet đại diện đã được xem.
  Có 2 SVG cờ nhúng raster và 3 SVG cờ có foreignObject, được đánh dấu rõ.
- **Ba phòng review** độc lập có hướng dẫn/khung phiên. Bộ môi trường kiểm
  tra 22 biến đường dẫn và chặn thiếu ghế, traversal, junction lồng trong cache.

Phép thử render phát hiện cần đặt DPI rõ ràng: SVG cờ GU và US-VT dùng đơn
vị mm; cấu hình renderer mặc định DPI=0 gây lỗi kích thước. Đặt 96 DPI xử lý
đúng bản nguồn mà không sửa byte. Đây là lỗi cấu hình bộ đọc, không phải SVG
nguồn hỏng. SVG/PNG/COLRv1 là các sản phẩm nguồn riêng, chưa có phép so sánh
khẳng định chúng trùng pixel; không dùng tuyên bố đó để đồng nhất hình học.

## Bằng chứng và cách chạy lại

Từ gốc repo:

```powershell
./tools/assets/verify-all.ps1 -Seat codex
```

Thay ghế khi Grok/Opus tự review. Quy trình chạy offline; kết quả phiên nằm
trong `tmp/reviews/<seat>/runs/<id>/`. Bằng chứng bền vững:

- [Trước/sau 31 font](initial-font-audit.json), [font](font-audit.json),
  [opentype](opentype-audit.json).
- [Nguồn và cấu trúc màu](color-emoji-audit.json),
  [render artwork](artwork-render-audit.json),
  [runtime JavaScript/WASM](input-runtime-audit.json).
- [Báo cáo tổng hợp có hash danh mục/bằng chứng](readiness-audit.json).

Phiên thực hiện: `tmp/reviews/codex/runs/20260905-readiness-audit/`.
Ảnh đại diện: `evidence/artwork/contact-sheet.png`; số liệu từng ảnh:
`reports/artwork-render-details.json`. Nội dung phiên được ignore; các báo
cáo ở docs và khung phòng không bị ignore. Tại thời điểm rà soát, repo chưa
có commit; không khẳng định các thay đổi đã được commit/push.

## Mức sẵn sàng được xác nhận

**Đủ nguồn và bộ đọc đầu vào để phát triển ứng dụng dựng 3D chữ/hình nhiều
màu trong phạm vi trên.** Danh mục có thể phục vụ UI chọn họ, biến thể, emoji
và artwork; font/ảnh gốc được giữ để các bước chuyển đổi có thể đối chiếu.

Chưa có ứng dụng bố cục văn bản/bidi hoàn chỉnh, bộ chuyển SVG/COLRv1 thành
vùng vật liệu, mesh 3D, bộ xuất 3MF hoặc profile máy in/slicer. Chưa in mẫu
vật lý. Những phần đó thuộc giai đoạn xây dựng ứng dụng và phải đạt các
điều kiện trong [INPUT-CONTRACT.md](INPUT-CONTRACT.md). Không thay kiểm tra
mesh/kích thước/chi tiết in bằng nhãn “font chuẩn”; báo cáo giữ
`meshValidated: false` và `physicalPrintTested: false`.
