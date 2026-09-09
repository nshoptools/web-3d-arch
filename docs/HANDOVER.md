# Bàn giao website nội bộ

Bản ngày **08-09-2026** là bản dùng thử nội bộ từ mã sản phẩm thực tế: giao diện, backend/SQLite, Worker/WASM và thư viện nguồn. **Chưa nghiệm thu đầy đủ v1 hoặc triển khai cho nhóm bằng tài khoản thật.** [Biên bản bàn giao](releases/20260908-internal/README.md) ghi gói, hash, ba luồng cuối đã đạt và những giới hạn; [kế hoạch hiện hành](development/PLAN.md) giữ phần việc còn lại.

## Mở bản dùng thử trên máy này

Tại gốc repo, dùng PowerShell 7:

```powershell
$PreviewRun = 'preview-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
& ./tools/preview/start.ps1 -RunId $PreviewRun -InputPath ./report/preview/20260908-internal/input.json -Label website
```

Launcher kiểm đúng gói đã bàn giao rồi mở một cửa sổ Chromium riêng, đã đăng nhập bằng thành viên thử nghiệm cục bộ. Dữ liệu, profile, log và khóa thử nghiệm nằm trong phòng của `PreviewRun` thuộc repo. Không cần đăng nhập tài khoản AI để xem và thử luồng dựng/xuất. Việc kiểm tệp trước khi mở cửa sổ có thể mất vài phút trên máy này.

Đây là danh tính OIDC và chứng chỉ tổng hợp dùng cho thử nghiệm cục bộ. Chưa có cấu hình IdP/HTTPS/owner thật cho lần bàn giao này; không dùng các khóa hoặc thành viên thử nghiệm để triển khai cho nhóm. Cửa sổ Chromium riêng có phiên đăng nhập của nó; trình duyệt khác không tự có phiên này.

Thử luồng thông thường: tạo dự án móc khóa → nhập [SVG mẫu hai màu có lỗ](examples/hai-mau-co-lo.svg) → xác nhận các đề nghị thay đổi nếu có → dựng mô hình → kiểm mô hình → xuất STL. Cài đặt cá nhân có xuất/nhập JSON; bản sao cứu hộ tải dữ liệu dự án đã lưu. Mỗi mã PreviewRun mới tạo danh tính và kho thử nghiệm mới. Trước khi đóng, tải bản sao để nhập lại công việc ở lượt chạy tiếp theo. Đóng cửa sổ preview để dừng dịch vụ; launcher ghi kết quả dọn dẹp trong phòng chạy.

## Cập nhật 09-09-2026 — đợt chuẩn bị phát hành của Hub

Mã giao diện và bộ điều khiển đã đổi so với gói 08-09 (xem `git log` sau
`610d635b`): màn hình bắt đầu riêng khi chưa mở dự án, thanh trên chỉ còn một
nút hành động chính, hộp xác nhận nhập nguồn viết bằng câu tiếng Việt, và các
sửa dữ liệu (gói cứu hộ không phình khi nhập lại, dán khi có hộp thoại không
chạy ngầm, chọn công cụ vẽ không làm mô hình thành cũ, mở lại dự án khi mạng có
lại). Bằng chứng ảnh trước/sau và kết quả kiểm nằm trong
`tmp/reviews/codex/runs/20260909-hub-release-r1/` (ảnh: `evidence/ui-before`,
`evidence/ui-after-r5`) và bản chắt lọc ở [testevidence/ui-release-r1](testevidence/ui-release-r1/README.md).

Chạy giao diện hiện tại từ mã nguồn (không cần đóng gói lại) bằng máy chủ phát
triển HTTPS loopback với chứng chỉ tổng hợp trong repo:

```powershell
node tools/development/dev-serve.mjs --port 5180
```

Mở `https://127.0.0.1:5180/__dev/login?as=a` (chấp nhận cảnh báo chứng chỉ;
Playwright dùng `ignoreHTTPSErrors`). Ảnh các trạng thái tiêu biểu chụp bằng
`node tools/development/capture-ui.mjs --out <phòng phiên>/evidence/ui`.

**Gói website mới chưa được tạo.** Bộ kiểm build (`tools/application/cli.mjs
prepare`) từ chối vì biên lai build nhân canonical (r4, 08-09) ghim
`tools/kernel/build.ps1` ở bản cũ; bản script hiện tại (kèm tích hợp
CSG/derived-guard) dựng ra một nhân khác (`module-hub-r1`, chưa qua nghiệm thu
hình học). Trước khi đóng gói lại phải chọn một trong hai: nghiệm thu nhân mới
theo đúng các bộ kiểm nhân (mechanics/final-scene/product-source/CSG), hoặc
khôi phục script đã ghim cho gói. Gói 08-09 vẫn chạy được như hướng dẫn trên,
nhưng không chứa giao diện mới.

## Những gì cần giữ

| Vị trí | Nội dung |
| --- | --- |
| `report/release/20260908-internal/` | Gói website bất biến để chạy và kiểm hash; không sửa trực tiếp tệp trong gói |
| `report/build/20260908-internal/` | Đầu ra build kèm danh mục đã pin, dùng kiểm lại preview |
| `report/preview/20260908-internal/input.json` | Liên kết gói/build cùng các SHA-256 chính xác cho launcher |
| `src/`, `tools/`, `tests/`, `docs/` | Mã nguồn, công cụ, phép kiểm và đặc tả cần giữ trong Git |

`report/` là đầu ra tái tạo, được loại khỏi Git. Giữ các thư mục trong bảng khi sử dụng bản đã đóng gói; xóa chúng thì phải build lại. Việc đọc đặc tả và phát triển từ mã nguồn không cần giữ các đầu ra này. Hướng dẫn tạo lại gói ở [công cụ build ứng dụng](application-build/TESTING.md); không ghép WASM mới với giao diện của gói cũ.

## Điều kiện để đưa lên dịch vụ thật

Dùng [RUNBOOK phát hành](release/RUNBOOK.md), [mẫu cấu hình operator](release/operator.example.json) và [vận hành backend](backend/OPERATIONS.md). Cần origin/chứng chỉ HTTPS, đăng ký OIDC với callback `<origin>/api/v1/auth/callback`, issuer/sub của owner và chính sách vận hành thực. Công cụ `tools/release/cli.mjs` kiểm gói và tạo cấu hình đã niêm phong; `tools/release/operator.mjs` khởi tạo/kiểm backend và chạy host.

Owner quản thành viên; mỗi người quản settings và kết nối AI riêng, tự chi trả sử dụng AI của mình. Chưa thử gọi AI trả phí trong bàn giao này. Các capability chưa nghiệm thu tiếp tục khóa; chưa có nhãn chứng nhận slicer hay lắp vừa vật lý.

Các thiếu hụt còn lại gồm tích hợp CSG tổng quát, một số nguồn chữ/overlay/COLRv1, nghiệm thu toàn bộ phạm vi trên trình duyệt đích và phản biện phát hành cuối. Bản sửa guard cơ khí có [giới hạn độ phân giải được công bố](curved-products/GUARD-RESOLUTION.md). Các bước này vẫn là công việc phải hoàn tất trước khi công bố đạt toàn bộ đặc tả.



Lần kiểm bổ sung cuối ngày: bản sửa chữ NFD và tích hợp CSG nằm trong [ứng viên được lưu bền](pending/csg-integration-20260908/README.md). Ca CSG trên giao diện chưa qua chốt hình học; những thay đổi này chưa nằm trong bản dùng thử ở trên.
