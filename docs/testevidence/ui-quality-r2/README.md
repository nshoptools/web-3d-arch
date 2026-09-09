# Bằng chứng đợt hoàn thiện sản phẩm lần hai 09-09-2026 (Hub)

Ảnh chụp bằng trình điều khiển Playwright của Hub trên máy chủ phát triển HTTPS
(`tools/development/dev-serve.mjs --port 5180`), Chromium headless, tài khoản thử
`a`, mẫu `docs/examples/hai-mau-co-lo.svg` và emoji 😀 của bộ Noto Color Emoji.
Ảnh “trước” chụp trên mã `1adf6d79`; ảnh “sau” chụp trên bản tích hợp của đợt
này. Bản đầy đủ (45 ảnh trước, 60 ảnh sau, aria snapshot) ở phòng phiên
`tmp/reviews/codex/runs/20260909-hub-quality-r2/evidence/hub-walk/`.

| Ảnh | Trạng thái |
| --- | --- |
| `before-empty-1440.png` / `after-empty-1440.png` | Dự án mới chưa có nguồn: trước là thanh trên hai hàng, toolbar mờ và bốn dải phủ trên thẻ bắt đầu; sau là thanh trên một hàng và khung chỉ có thẻ bắt đầu. |
| `before-consent-1440.png` / `after-consent-1440.png` | Xác nhận nhập SVG: trước là năm gạch đầu dòng kỹ thuật cùng bốn nút và thẻ bận “đang chạy”; sau mở bằng câu “Nhận hai-mau-co-lo.svg làm nguồn…”, hai nút, thẻ bận “chờ bạn trả lời”. |
| `before-model-1440.png` / `after-model-1440.png` | Bước 2 sau khi dựng: trước thanh trên hai hàng; sau một hàng 56 px, chỉ số “Kiểm mesh: đạt”. |
| `before-size-change-1440.png` / `after-size-change-1440.png` | Đổi cạnh dài 45 → 60: trước phải qua hộp “cập nhật nguồn sản phẩm” và ô số vẫn viền đỏ sau khi xong; sau áp dụng thẳng, mô hình dựng lại, không hộp thoại. |
| `before-materials-1440.png` / `after-materials-1440.png` | Khu Lớp màu: trước 11 hàng gồm vai của loại sản phẩm khác, nhãn vai lặp, khe cắt chữ; sau 7 hàng của móc khóa, phần còn lại gập, thẻ “Chưa chọn máy in” thay cho select khe tắt. |
| `before-export-1440.png` / `after-export-1440.png` | Khu Xuất file: trước máy in và ghi chú chiếm phần đầu, nút ZIP STL dưới fold; sau nhóm “Từ mô hình 3D” và “Từ nguồn và khung xem”, cài đặt gập theo từng đường xuất. |
| `before-emoji-1440.png` / `after-emoji-1440.png` | Emoji: trước Dựng 3D chỉ trả mã `PRODUCT_SOURCE_CONVERSION_REQUIRED`; sau đi qua hai bước có tên trên nút chính (chuyển raster, tách vùng màu) và ra mô hình 12 bộ phận. |
| `before-package-1440.png` / `after-package-1440.png` | Mở lại từ gói `.arch-project.zip` sau khi xóa dự án: trước mất mô hình, nguồn “chỉ xem”, dựng lại bị `PRODUCT_BINDINGS_STALE`; sau dự án về đúng mã cũ và mô hình được dựng lại ngay. |
| `before-drawer-390.png` / `after-model-390.png`, `after-drawer-390.png` | 390 px: trước toast đè hàng tab và lớp Khung xem che nửa mô hình; sau nhóm Khung xem gập, toast nằm trên tab và tự mất, ngăn kéo Thông số mở từ tab. |

## Kiểm đã chạy thật trên bản tích hợp

| Bộ kiểm | Kết quả | Phòng phiên / log |
| --- | --- | --- |
| `npx tsc -p tsconfig.json` | đạt | — |
| `tests/app/run.ps1 -Seat codex -Browsers chromium` | Node 0, types 0, browser 0 (đạt) | `20260909-hub-quality-r2-app` |
| Node: `tests/app/*.node.test.mjs`, `tests/storage/*.node.test.mjs`, `tests/domain`, `tests/product-app`, `tests/raster-adoption` với nhân canonical `report/build/20260908-internal` | đạt (các ca cần HTTP fixture đạt trong `run.ps1`; product-app 3 tệp và raster-adoption 5 ca đạt khi có `PRODUCT_APP_MODULE`/fixture) | `20260909-hub-quality-r2/evidence/tests/` |
| `tests/storage/package-roundtrip.node.test.mjs` (thêm ca khôi phục dưới mã cũ) | 3/3 đạt | cùng trên |
| `tests/ui/request-boundary/run.ps1 -Engines chromium` | đạt | `20260909-hub-quality-r2-rb` |
| `tests/ui/export-consent/run.mjs` (Chromium, đủ nhóm; harness mở các nhóm gập trước khi điền) | 32/32 đạt ở lần chạy `ec4` | `20260909-hub-quality-r2-ec4` |
| `tests/e2e/application.test.mjs` (Chromium, Firefox, WebKit) | đạt sau khi đổi nhãn nút chuyển raster trong test | `20260909-hub-quality-r2/evidence/tests/e2e-application.log` |

Chưa chạy: `tests/csg-controller/run.ps1` (input ghim candidate cũ, không kiểm cây
hiện tại), `tests/product-acceptance` (cần gói release ghim). Firefox/WebKit của
hai harness UI chưa chạy lại trong đợt này.

## Phản biện độc lập

- Grok 4.6 (xhigh), `tmp/reviews/grok/runs/20260909-grok-quality-r2/`: 14 phát hiện
  trên `1adf6d79` (13 tái hiện live), đối chiếu 14 hướng: đồng ý 10, sửa 3 (D1, D3,
  D10), bác 1 (D14 là công cụ). Vòng 2 trên bản tích hợp: `20260909-grok-quality-r2b`.
- Gemini 3.1 Pro (high), `tmp/reviews/gemini/runs/20260909-gemini-quality-r2/`: 3 phát
  hiện live (đều trùng D3/D6/D7), đồng ý 14/14 hướng. Vòng 2: `20260909-gemini-quality-r2b`.
- Bảng xử lý từng phát hiện và lý do các mục không sửa nằm ở
  `tmp/reviews/codex/runs/20260909-hub-quality-r2/reports/HUB-QUALITY-R2.md`.
