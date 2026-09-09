# Bằng chứng đợt chuẩn bị phát hành 09-09-2026 (Hub)

Ảnh chụp bằng `tools/development/capture-ui.mjs` trên máy chủ phát triển HTTPS
(`tools/development/dev-serve.mjs`), Chromium headless, tài khoản thử `a`,
mẫu `docs/examples/hai-mau-co-lo.svg`. Bản đầy đủ (15 trạng thái × 1440/1024/390)
nằm trong phòng phiên `tmp/reviews/codex/runs/20260909-hub-release-r1/evidence/`
(`ui-before` chụp trên mã `610d635b`, `ui-after-r5` sau đợt sửa đầu, `ui-after-r6` sau khi sửa theo phản biện Grok).

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

## Vòng phản biện Grok (`20260909-grok-ux-r1`) và sửa theo phản biện

Grok chạy thật luồng cốt lõi trên Chromium tại `ec90bb5b` và nêu 16 phát hiện
(4 cao: overlay bận tiếng Anh/UUID, mở lại không có mô hình, lỗi nạp module sau
khi có mạng lại, drawer che mô hình ở 720/390). Hub đối chiếu từng mục, sửa 15,
giữ 1 (F-15, hủy qua hộp thoại là đường được chỉ định). Bảng đối chiếu đầy đủ:
`tmp/reviews/codex/runs/20260909-hub-release-r1/reports/HUB-RELEASE-R1.md`.

| Ảnh | Trạng thái sau khi sửa |
| --- | --- |
| `r6-consent-overlay-1280.png` | Hộp xác nhận nhập nguồn gom vai theo loại sản phẩm, không mã màu hex; overlay bận nói “Chờ bạn xác nhận nguồn và mặt chuẩn · đang chạy”, mã việc gập lại. |
| `r6-reopened-model-1280.png` | Lưu → tải lại trang → Mở: mô hình được dựng lại từ bản lưu, vào thẳng bước 2. |
| `r6-workspace-390.png` / `r6-model-390.png` | 390 px: thanh trên hai hàng (91 px), drawer đóng khi đổi bố cục và khi vào bước 2, khung xem là vùng lớn nhất. |
| `r6-export-followup-1280.png` | Thẻ “Đã tải về … dự án chưa được lưu” nằm trên danh sách đường xuất. |

Kiểm chạy lại trên mã sau vòng này: typecheck đạt; 89 ca Node đạt;
`tests/app/run.ps1` Chromium 45 Node + 46 trình duyệt (`20260909-hub-app-r7`);
harness xuất/xác nhận 32 ca (`20260909-hub-ui-consent-r3`); Chromium, Firefox, WebKit đều đạt (phiên `20260909-hub-e2e-r5`, chạy riêng trên mã cuối, chứng chỉ tổng hợp sinh trong phòng phiên). Phiên r3 trước đó lỗi vì worker gói `import()` bằng chuỗi biến nên bundler không phát chunk — đã sửa giữ chuỗi cố định; r4 Chromium lỗi vì chứng chỉ nằm ngoài phòng phiên (môi trường chạy, không phải mã), Firefox/WebKit đạt;
probe 14 phát hiện Grok (`work/probe/grok-findings-probe.mjs`, kết quả
`evidence/grok-fixes-r6/findings-probe.json`, 0 lỗi trang); probe mất mạng/có lại
mở đúng dự án, dải cảnh báo trống.

Gói website mới chưa tạo: xem [HANDOVER](../../HANDOVER.md), mục 09-09-2026.
