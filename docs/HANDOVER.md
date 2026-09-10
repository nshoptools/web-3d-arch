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
`evidence/ui-after-r5`, `evidence/ui-after-r6`, `evidence/grok-fixes-r6`) và bản
chắt lọc ở [testevidence/ui-release-r1](testevidence/ui-release-r1/README.md).

Phản biện độc lập Grok (`tmp/reviews/grok/runs/20260909-grok-ux-r1/reports/REVIEW.md`)
nêu 16 phát hiện; Hub sửa 15 (đáng chú ý: mở dự án đã lưu dựng lại mô hình ngay
vì mô hình không được lưu cùng dự án; lỗi nạp module của worker khi mất mạng
thành mã có câu và tự thử lại; drawer đóng khi đổi bố cục/vào bước 2; thanh trên
hai hàng ở ≤720; hộp xác nhận gom vai theo loại sản phẩm; id nội bộ rời khỏi
màn hình chính; tệp không phải ảnh bị từ chối ngay khi thả/dán) và giữ F-15 có
lý do. Bảng đối chiếu và kiểm lại ở `reports/HUB-RELEASE-R1.md` trong phòng phiên Hub.

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

## Cập nhật 09-09-2026 — đợt hoàn thiện sản phẩm lần hai (Hub; Grok và Gemini phản biện)

Mã trên `main` sau `1adf6d79` (đợt này, xem `git log`). Những gì đổi và vì sao:

- **Ảnh hoặc emoji đi tới được mô hình.** Trước đây chọn emoji rồi Dựng 3D chỉ ra
  mã lỗi, nút chuyển raster biến mất sau lần chuyển đầu và không có lối tách vùng
  màu. Nay nút hành động chính ở bước 1 tự đổi thành “Chuyển sang ảnh raster để
  sửa” rồi “Tách vùng màu để dựng” (cùng lệnh `source.convert`, mỗi bước một xác
  nhận); gợi ý ở khung và bảng công cụ gọi đúng tên nút; hộp xác nhận chuyển đổi
  và tách vùng viết tiếng Việt. Sau tách vùng, nhân dựng mô hình ngay.
- **Mở từ gói `.arch-project.zip` trả lại đúng dự án.** Gói được đặt lại dưới mã
  dự án gốc khi mã đó trống hoặc chỉ còn bản ghi xóa (mọi ràng buộc nguồn, biên
  nhận và chuẩn bị raster gắn với mã dự án nên vẫn hợp lệ; bản sao mã mới trước
  đây không dựng được vì `PRODUCT_BINDINGS_STALE`). Dự án còn sống thì mở bản
  trong thư viện và nói rõ; bản ghi cũ không đọc được mới tạo bản sao và cảnh báo.
  Mở từ danh sách hoặc từ gói đều dựng lại mô hình ngay.
- **Sửa thông số hoặc màu áp dụng thẳng.** Hộp xác nhận chỉ mở khi có quyết định
  (nhập/chuyển nguồn, tách vùng màu, đổi loại, dùng chữ làm hình, chọn mặt/khe);
  dòng đầu nói việc vừa làm (tệp nào, nguồn gì). Thẻ bận khi chờ trả lời ghi
  “chờ bạn trả lời”, không “đang chạy”.
- **Giao diện.** Thanh trên một hàng 56 px ở >1180; khung bước 1 gọn (ba dải gập,
  cột công cụ, điều khiển khung ở góc, không lớp phủ khi chưa có nguồn); nhóm
  Khung xem bước 2 gập mặc định ở ≤1180; toast tự mất, gộp trùng, xóa khi đổi dự
  án, nằm trên hàng tab ở điện thoại; khu Lớp màu chỉ hàng của loại sản phẩm; khu
  Xuất nhóm theo việc với cài đặt gập; tên khối và vật liệu bằng tiếng Việt; mã
  lỗi có câu; thư viện nói rõ ghi tự động và đánh dấu Lưu.

Bằng chứng trong `tmp/reviews/codex/runs/20260909-hub-quality-r2/` (ảnh
`evidence/hub-walk`, kiểm `evidence/tests`, báo cáo `reports/HUB-QUALITY-R2.md`)
và bản chắt lọc ở [testevidence/ui-quality-r2](testevidence/ui-quality-r2/README.md).
Phản biện độc lập vòng 1 trên `1adf6d79`: Grok
`tmp/reviews/grok/runs/20260909-grok-quality-r2/` (14 phát hiện) và Gemini
`tmp/reviews/gemini/runs/20260909-gemini-quality-r2/` (3 phát hiện, 14 hướng); vòng
2 trên bản tích hợp: `20260909-grok-quality-r2b` và `20260909-gemini-quality-r2b`.

Vòng 2 của hai ghế trên bản tích hợp `79315627` (worktree riêng, máy chủ 5280/5380
do Hub chạy): Grok đi lại toàn bộ luồng live, ghi 8 phát hiện vòng 1 `fixed`, 5
`partly`, không hồi quy, và nêu 4 mục mới; Hub sửa cả 4: hộp xác nhận có đề xuất
đã hết hiệu lực tự đóng thay vì mời thử lại; phép kiểm lưới chạm watchdog thành
vấn đề cần xem thay vì làm hỏng lệnh đã tạo mô hình; một xác nhận cho mỗi bước
chuyển nguồn (cập nhật sản phẩm sau đó áp dụng thẳng khi không có quyết định, nên
emoji còn ba xác nhận); lượt từ chối được xóa khỏi dải khi lệnh cùng loại thành
công; toast khi mở gói của dự án còn sống nói đúng việc; nhóm in xếp đường xuất
đạt kiểm lên đầu; thẻ nguồn emoji ghi “Emoji 😀”. Gemini vòng 2 chỉ chạy live
được luồng SVG → dựng → Thông số → Xuất (ghi rõ trong báo cáo), F1–F3 `fixed`,
không phát hiện mới. Grok kiểm lại có trọng tâm (vòng 2c, bản `2233a6d7`): emoji
ba xác nhận, bấm Áp dụng hai lần không kẹt, luồng SVG/gói đều đứng; còn bốn mục
nhỏ (lượt từ chối cũ chưa rời dải khi lệnh kết thúc qua hộp xác nhận, chuẩn bị
nền kiểm lưới lại vô hạn sau watchdog, ghi chú gói sống sót sau khôi phục, nhãn
giai đoạn `complete`) — Hub sửa cả bốn và tự kiểm lại live. Chi tiết:
`reports/HUB-QUALITY-R2.md` mục 7.

Chưa làm: gói website mới (lý do như trên); `tests/csg-controller/run.ps1` không
chạy được trên cây hiện tại vì input ghim candidate cũ (luồng CSG được `tests/e2e`
kiểm thay); bộ nghiệm thu `tests/product-acceptance` chưa chạy lại (cần gói
release đã ghim). Máy chủ phát triển nay có đồng hồ chạy thật (`tools/development/dev-serve.mjs`),
tránh “phiên hết hạn” giả sau 5 phút.

## Cập nhật 10-09-2026 — đợt phát hành vòng 3 (Hub; Codex và Grok phản biện)

Hub thẩm định ba báo cáo chỉ đọc (`report/audit-readonly/pro/…22-26-36`, `grok/…22-26-36`,
`grok/…13-02-57`) trên `48e69abc` bằng mã và luồng live, rồi sửa những mục còn đúng
(bảng phân xử: `tmp/reviews/codex/runs/20260910-hub-release-r3/reports/HUB-RELEASE-R3.md`;
bằng chứng chắt lọc: [testevidence/ui-release-r3](testevidence/ui-release-r3/README.md)):

- **3MF chặn vì khóa phiên lệch (F-01)**: settings authority đưa `epoch`, project context
  đưa `epoch:generation`, adapter in so bằng tuyệt đối → mọi 3MF `PRINTING_CONTEXT_STALE`.
  Nay một khóa chung (`applicationSessionKey`).
- **Lưu hủy việc đang chạy (F-02)**: `project.save` hủy build/nhập/xuất và bỏ đề xuất đang
  chờ dù thiết kế không đổi; live: kiểm mesh về “chưa kiểm”. Nay chỉ thay đổi thiết kế mới
  hủy; lưu ghim lại đề xuất vào đầu mới; nhận nguồn sống sót qua Lưu.
- **Dải “vấn đề” sau mỗi lần dựng lại**: lệnh đổi thông số bị lệnh mới chiếm nhân trả
  `CANCELLED` như lỗi. Mã hủy/thay thế nay là thông tin (ở nhật ký), ô số không báo lỗi.
- **Mốc “đã xem” (F-06)** theo `sequence` của chẩn đoán thay vì độ dài danh sách quay vòng.
- **Dãy mặt cắt (F-05)**: giá trị lệch lưới bước được giữ, cảnh báo cạnh trường và đường
  xuất từ chối `EXPORT_SECTION_STEP` trước khi dựng (không chặn theo từng phím).
- **Cứu hộ (F-03.2)**: gói lồng giữ vì thiếu dữ liệu không còn bị bỏ khi gói ngoài đầy đủ.
- **Không có WebGL (R-01)**: giao diện không còn biến mất; khung 3D báo lý do, dựng/xuất
  hình học vẫn dùng được.
- Nút “Mở” vô hiệu trên dự án đang mở; chi tiết lỗi của bộ ghi native đi tới chẩn đoán.

**Phát hiện mới, chưa phát hành được: bộ ghi 3MF của gói 08-09 từ chối mọi mô hình thật.**
Sau khi cổng mở, xuất 3MF Bambu thất bại `LIB3MF_TRANSACTION: READBACK_VERTICES`: lib3MF ghi
tọa độ dạng chữ 6 chữ số thập phân, còn `validateWritten` trong
`src/printing/src/native/arch3mf.cpp` đòi bằng tuyệt đối với float32 (108/487 tọa độ của mẫu
không qua được; fixture hai hộp chỉ có tọa độ nguyên nên chưa từng lộ). Nguồn native đã sửa
(dung sai 2e-6 mm). Hub dựng lại WASM từ nguồn hiện tại (`tools/kernel/build.ps1 -Target wasm
-Printing`, cây phụ thuộc pin từ phiên `20260908-printing-wave2`) và lắp gói **chỉ để kiểm
chứng** (`work/dev-package` trong phòng Hub, không có biên lai): 3MF xuất được, đọc lại bằng
Python và PrusaSlicer đúng màu/khe/hình học (xem testevidence). Nhân đó **chưa qua nghiệm thu
hình học** (mechanics/final-scene/product-source/CSG) nên chưa được đóng gói; gói 08-09 vẫn là
bản dùng thử và **không xuất được 3MF nhiều màu**. ZIP STL theo khe và STL union của gói 08-09
đọc lại đúng hình học, đơn vị mm và bảng màu/khe.

Còn mở sau đợt này: nghiệm thu và đóng gói nhân mới (kể cả thứ tự khe cho vùng màu nhận từ
nguồn: nhân dựng lại gán khe 1/2 ngược với nhân gói cho cùng SVG — cần kiểm tính tất định);
tên vật liệu/phần trong 3MF là mã nội bộ (`adopted:1`, `source:slab:…`), chưa phải tên trên
giao diện; F-03.1 (nhập cứu hộ chỉ mang tài sản của manifest được chọn) và F-04 (khôi phục
dưới ID mới không dựng được) giữ nguyên có lý do; hạn mức ZIP cứu hộ 128 MiB nhỏ hơn tổng
asset cho phép; cây `.toolchain/clipper2-derived` lệch pin (`unified-pins.json`) khiến
`src/printing/tools/prepare.ps1` không chạy từ toolchain.

Phản biện độc lập trên commit của đợt: Codex (`tmp/reviews/codex/runs/20260910-codex-release-r3`)
và Grok (`tmp/reviews/grok/runs/20260910-grok-release-r3`, binary 1.0.25 chấp nhận sau bộ kiểm
cô lập). Cả hai nộp báo cáo: Codex 10 phát hiện (2 mức P1), Grok 4 (1 mức P1). Cả hai xác
nhận độc lập rằng gói 08-09 không xuất được 3MF, trùng phát hiện của Hub.

**Vòng sửa sau phản biện** (bảng phân xử từng mục ở mục 5–6 của báo cáo Hub):

- **Raster mà chính ứng dụng dựng từ SVG bằng bản trước (Codex R3B-C01, P1) — đã sửa.** Bản
  dựng ảnh cũ lấy mẫu viewport Y-xuống như thể Y-lên, nên **điểm ảnh đã lưu bị lật**; đường dựng
  cũ không phản chiếu nên hai lỗi triệt tiêu nhau và mô hình khớp bản vẽ. Phản chiếu số điểm ảnh
  đó bây giờ sẽ lật ngược một dự án cũ đang đúng. Nay đúng loại ảnh đó **không** được đặt khung:
  nhận ra bằng chính bản ghi của lượt chuyển đổi (`source.metadata.preview.frame`), vì chỉ khung
  ghi sau bản sửa mới nêu trục nguồn. Ảnh nhập vào không có bản ghi đó, còn chữ/emoji ghi affine
  điểm‑ảnh‑sang‑nguồn chứ không phải khung, và cả hai đều dựng xuôi nên vẫn được đặt như thường.
  Hồi quy: ca «a raster the old renderer derived from an SVG keeps the model it always built».
  Codex phản biện lại bản sửa này và **đóng** mục đó: dựng cùng state bằng mã trước và mã sau cho
  mesh trùng **SHA-256** của mảng đỉnh/tam giác/bảng phần, kể cả với một raster cũ đã **sửa tay**
  rồi phân vùng lại và đóng gói bằng mã cũ. **Còn mở**: nếu ai đó sửa metadata **ngoài** luồng ứng
  dụng (xóa `preview.frame`, hoặc xóa riêng `sourceAxis`) thì bản dựng lật lại; nên đổi quy tắc
  thành “ảnh do chính ứng dụng dựng mặc định là quy ước cũ trừ khi bản ghi nêu trục mới”, tức thêm
  điều kiện “dẫn xuất (`rasterPreparation.input.origin`) mà thiếu `preview.frame`”.
- **Hình bị lật dọc so với nguồn (Codex R3-C02, P1) — đã sửa tận gốc.** Nhân phân giải SVG
  theo viewport của SVG (X phải, **Y xuống**) và dựng ngữ cảnh raster theo lưới điểm ảnh
  (cũng Y xuống), còn mọi tầng sau — vỏ SVG của chữ, biên xem trước, `source_assembly`, xuất
  mặt cắt — là hệ chế tạo **Y lên**; không chỗ nào lật một lần, nên ảnh SVG/raster ra ngược
  còn chữ thì đúng. Nay biên ngữ cảnh sản phẩm đặt mỗi ngữ cảnh hình nguồn vào hệ chế tạo
  bằng chính API khung nguồn của nhân với đúng một phép phản chiếu `[1,0,0,-1,0,heightMm]`;
  danh tính vùng vẫn tính trên lease chưa đặt nên dự án cũ không phải gán lại vùng; vỏ chữ
  không đụng tới. Xem trước lúc nhập khai báo trục nguồn nên ảnh nguồn, mô hình và tệp xuất
  cùng hướng. **Dự án đã lưu sẽ dựng lại theo hướng đã sửa** (khác mô hình cũ của chính nó —
  đó là nội dung bản sửa); màu và ràng buộc vùng không phải gán lại; tệp đã xuất trước đây
  giữ hướng cũ và nên xuất lại. Hồi quy: `tests/product-source/manufacturing-frame.test.mjs`.
- **Đổi nguồn sang emoji trên dự án đã dựng thì mất nút tách màu (Codex R3-C07)** — bước còn
  thiếu nay đọc từ ràng buộc của chính nguồn hiện hành (`project.source.conversion`), không
  từ số vật liệu của mô hình cũ.
- **Cảnh báo lúc nhận mesh không có `sequence` nên mất khỏi dải (Codex R3-C09)**; mọi chẩn
  đoán nay đi qua `record()`.
- **Byte fixture đổi khi checkout trên Windows (Codex R3-C10)**: `.gitattributes` giữ
  `tests/fixtures/**` nguyên byte. Thuộc tính mới **không tự ghi lại** tệp đã nằm sẵn trong một
  bản checkout cũ; bản checkout nào còn CRLF thì chữa bằng
  `git reset HEAD -- tests/fixtures && git checkout -- tests/fixtures` (kiểm bằng kích thước:
  Bambu 43.485 byte, U1 25.487 byte).
- **Dải hiện mã máy `LIB3MF_TRANSACTION` (Grok G-R3-02)**: có câu tiếng Việt và in thêm chi
  tiết native để gửi kèm khi báo lỗi. **Mở gói trùng thư viện (G-R3-03)** là kết cục hợp lệ,
  chuyển khỏi dải sang nhật ký.
- Không sửa, có lý do: **hủy do người dùng** vẫn ở mức thông tin (G-R3-04 — thẻ bận biến mất
  đã là phản hồi); **kiểm mesh của emoji chạm watchdog 120 s** (Codex R3-C08) là hiệu năng,
  giữ làm điều kiện chặn phát hành cho luồng emoji; **F-03.1** vẫn là bất đồng còn lại với
  Codex, ghi rõ thay vì bỏ qua.

Hai bộ kiểm hỏng sẵn, **không** được làm xanh bằng cách sửa kỳ vọng, mỗi bộ có đối chứng
chứng minh đã hỏng trước vòng này: `tests/product-source` (`native-refusals.json` ghim theo
nhân `f13bdd2b…`, nhân hiện tại dựng được các ca text/emoji nên danh sách chặn rỗng) và
`tests/source-svg-export` ca 14 (`PRODUCT_ADOPTION_DECISION_REQUIRED` thay vì
`PRODUCT_MATERIAL_ID_CONFLICT`; hỏng y hệt khi hoàn nguyên `src` về `48e69abc`, tức trước toàn
bộ đợt này). Cả hai phải xử lý trước khi đóng gói nhân mới.

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
