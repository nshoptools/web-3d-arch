# Bằng chứng đợt chuẩn bị phát hành 09-09-2026 (Hub)

Ảnh chụp bằng `tools/development/capture-ui.mjs` trên máy chủ phát triển HTTPS
(`tools/development/dev-serve.mjs`), Chromium headless, tài khoản thử `a`,
mẫu `docs/examples/hai-mau-co-lo.svg`. Bản đầy đủ (15 trạng thái × 1440/1024/390)
nằm trong phòng phiên `tmp/reviews/codex/runs/20260909-hub-release-r1/evidence/`
(`ui-before` chụp trên mã `610d635b`, `ui-after-r5` chụp trên mã sau đợt sửa).

| Ảnh | Trạng thái |
| --- | --- |
| `before-start-1440.png` / `after-start-1440.png` | Chưa mở dự án: trước là không gian làm việc đầy đủ với “Tạo dự án” lặp ở ba nơi; sau là màn hình bắt đầu (chọn loại sản phẩm, một nút Tạo, mở dự án đã lưu, mở từ gói). |
| `before-consent-1440.png` / `after-consent-1440.png` | Hộp xác nhận khi nhập SVG: trước liệt kê JSON máy và “Lỗi PROPOSAL_REQUIRED”; sau là câu tiếng Việt, chi tiết kỹ thuật gập lại. |
| `before-model-1440.png` / `after-model-1440.png` | Bước 2 sau khi dựng: trước hộp thoại xuất bật nhầm và overlay dày; sau một nút “Xuất file” trên thanh trên, overlay chỉ giữ chỉ số, khung xem và khối đang chọn. |
| `after-start-390.png` / `after-model-390.png` | Hai trạng thái trên ở 390 px, không tràn ngang. |

Số điều khiển nhìn thấy đo bằng `work/probe/chrome-count-probe.mjs` trên mã sau
đợt sửa: màn hình bắt đầu 12 nút (một nút “Tạo dự án”); không gian làm việc
ngay sau khi tạo dự án 28 nút. Bản audit Grok ngày 09-09 đếm 62 nút ở trạng thái
chưa có dự án trên mã `610d635b`.

## Kiểm đã chạy thật trên mã sau đợt sửa

| Bộ kiểm | Kết quả | Phòng phiên |
| --- | --- | --- |
| `npx tsc -p tsconfig.json` | đạt | — |
| Node: `tests/app/*.node.test.mjs` (10 tệp), `tests/domain`, `tests/storage/domain-adapter`, `tests/storage/package-roundtrip` | 89 đạt / 0 lỗi | `20260909-hub-release-r1` |
| `tests/app/run.ps1 -Browsers chromium` | 45 Node + 46 trình duyệt đạt | `20260909-hub-app-r6` |
| `tests/ui/export-consent/run.mjs` (Chromium, đủ nhóm) | 32 đạt | `20260909-hub-ui-consent-r2` |
| `tests/e2e/application.test.mjs` | Chromium đạt (`20260909-hub-e2e-r1`); Firefox và WebKit đạt khi chạy lại riêng (`20260909-hub-e2e-r2`) | — |
| Mất mạng → có lại mở đúng dự án | đạt (`work/probe/online-recovery-probe.mjs`) | `20260909-hub-release-r1` |

Hai bộ dàn dựng (`tests/app/stage.mjs`, `tests/app/run-browser.mjs`) được bổ sung
`src/contracts` và `src/printing/src` — trước đó phần trình duyệt của
`tests/app/run.ps1` không nạp được `src/app/index.mjs`. Hai ca trình duyệt còn
khẳng định câu tiếng Anh cũ và một bản mô phỏng chuyển đổi nguồn không đúng quy
tắc định danh đã được chỉnh theo hợp đồng hiện hành; không ca nào bị bỏ hay nới.

Gói website mới chưa tạo: xem [HANDOVER](../../HANDOVER.md), mục 09-09-2026.
