# Kế hoạch và trạng thái bàn giao

Cập nhật 08-09-2026 theo yêu cầu ưu tiên sớm bàn giao của chủ dự án. Mã sản phẩm đã đóng băng để tạo bản dùng thử nội bộ; **chưa nghiệm thu đầy đủ v1**. Điểm bắt đầu vận hành là [hướng dẫn bàn giao](../HANDOVER.md). [Đặc tả](../specs/README.md) vẫn giữ nguyên phạm vi, không hạ yêu cầu để đổi nhãn kết quả.

## Phạm vi và phân công

Website dùng cho nhóm kín: owner quản lý thành viên; từng người quản cài đặt, kết nối và chi phí AI riêng. Nhân hình học chạy trong Worker/WASM; các hợp đồng module/job/artifact có version để mở rộng chức năng in 3D.

Hub điều phối; Codex chịu backend, nghiệp vụ, hình học, thuật toán UI phức tạp và tích hợp; Grok tiếp nhận UI. **Không gọi hoặc tự tiếp tục Opus**, kể cả khi quota reset. Các phần đã viết được giữ và thẩm định theo bằng chứng.

## Đã tích hợp vào bản đóng gói cuối

- UI hai bước, luồng xác nhận và ngữ cảnh tài khoản/dự án; bố cục mới được ghép với các sửa thuật toán của Codex.
- Nguồn raster/vector/chữ, tọa độ nguồn và giao dịch xác nhận datum; chữ làm nguồn thực sự tạo dữ liệu nguồn, không chỉ đổi nhãn.
- Xuất hình học qua scene được kiểm, đề nghị điều kiện hóa float32 cần xác nhận. Các trường hợp không đạt phải giữ nguồn và không công bố mesh một phần.
- Sửa xuất JSON cài đặt cá nhân, gồm đổi tài khoản trong khi phản hồi đang chờ. Hai kiểm HTTP/SQLite thực đạt lại sau tích hợp nguồn cuối.
- Sửa ZIP cứu hộ lấy cùng một thế hệ dữ liệu; 25 kiểm lưu trữ đạt, WebKit OPFS không khả dụng và dùng IDB fallback đã kiểm.
- Hai lỗi phản biện guard cơ khí đã sửa có phạm vi; 40 mẫu thông thường và các ca gốc/đối chứng đạt native/WASM. Bộ bổ sung còn 18/22 assertion, được ghi rõ.
- TypeScript của mã cuối đạt. Build WASM canonical có Printing, không test fixture, kết thúc exit0; toàn bộ dependency riêng của run đã được kiểm hash. Bản Worker đã biên dịch và ba luồng UI cuối được ghi riêng trong biên bản bàn giao.

Các số kiểm trên có phạm vi thành phần riêng, không cộng lại thành tỷ lệ nghiệm thu toàn sản phẩm. [Inventory yêu cầu](RELEASE-COVERAGE.md) giữ các chiến dịch chưa hoàn tất; [state.json](state.json) giữ các mốc và pin máy đọc được.

## Cập nhật sau kiểm tích hợp mới

225 tệp CSG, guard cơ khí, NFD, raster/nguồn màu và sửa xuất/lưu đã được tích hợp có kiểm hash. Bốn luồng CSG trên UI/controller/Worker/HTTP thực đạt, gồm lưu/mở lại/dựng lại/xuất và undo/redo. Một emoji COLRv1 đã dựng thành công trên cặp sản xuất. [Biên bản và phân xử độc lập](../reviews/20260908-csg-closure/README.md) giữ bằng chứng tự chứa. Checkpoint 190 tệp trước đó là lịch sử, không còn mô tả tình trạng mã hiện tại.

Gói dùng thử cũ giữ nguyên trong lúc tạo gói mới từ mã đã tích hợp. Không gán bằng chứng nguồn mới cho gói cũ. TypeScript và năm phép kiểm JS tập trung đạt; cặp sản xuất được build lại bằng lệnh canonical trước đóng gói.

## Đợt chuẩn bị phát hành 09-09-2026 (Hub, Grok phản biện)

Đã tích hợp trên `main` sau `610d635b`: thiết kế lại shell (màn hình bắt đầu /
không gian làm việc, một hành động chính, trợ giúp trên thanh trên, panel nguồn
gập nhóm, overlay 3D gọn), câu tiếng Việt cho hộp xác nhận nhập nguồn và mọi
lý do do bộ điều khiển công bố, các sửa dữ liệu F1–F4 (bản lưu trước, xung đột
CAS, khóa sau khi ghi bền, thư viện đọc lại) và RO-01–RO-04 (gói cứu hộ lồng
nhau, dán sau hộp thoại, chọn công cụ làm cũ mô hình, mất mạng mở lại dự án).
Kiểm đã chạy thật: typecheck; 89 ca Node (app/domain/storage, gồm
`data-safety` và `package-roundtrip`); `tests/app/run.ps1` 45 Node + 46 trình
duyệt Chromium; harness UI xuất/xác nhận 32 ca Chromium; `tests/e2e`
Chromium/Firefox/WebKit đạt; ảnh 15 trạng thái × 3 bề rộng.

Sau phản biện Grok (`20260909-grok-ux-r1`, 16 phát hiện): sửa 15 mục — overlay
bận và dải cảnh báo bằng câu tiếng Việt (mã việc/mã lỗi gập lại), mở dự án đã
lưu dựng lại mô hình ngay, lỗi nạp module worker khi mất mạng có mã và tự thử
lại, job chuẩn bị bị hủy không lên dải cảnh báo, sự kiện `online` lặp được gộp,
drawer đóng khi đổi bố cục/vào bước 2, thanh trên hai hàng ở ≤720 (UI-06 cập
nhật), hộp xác nhận gom vai theo loại sản phẩm, id thông số/xuất rời màn hình
chính, tên mặc định theo loại, thả tệp khi có hộp thoại bị chặn, tệp không phải
ảnh bị từ chối với câu rõ; giữ F-15 (hủy qua hộp thoại là đường được chỉ định).
Kiểm lại: typecheck, 89 ca Node, `tests/app` r7, harness xuất/xác nhận r3, e2e,
probe 14 phát hiện và probe mất mạng đều đạt (chi tiết trong phòng phiên Hub).

Chưa làm và vì sao: gói website mới chưa tạo được (biên lai nhân r4 ghim
`tools/kernel/build.ps1` bản cũ; nhân dựng bằng script hiện tại chưa nghiệm
thu); nghiệm thu G4 trên gói hợp nhất, OIDC/HTTPS thật, 3MF/slicer, CSG tổng
quát, chữ NFD/COLRv1 giữ nguyên trạng thái các cổng riêng. Hai điểm phản biện
mức thấp ghi nhận chưa sửa: `JOB_BUSY` có thể làm mất đề xuất xuất đã xác nhận
(`src/app/jobs.mjs` resume); `secret.fill(0)` khi hủy/timeout có thể chạy song
song với provider (`src/server/ai.mjs`).

## Đợt hoàn thiện lần hai 09-09-2026 (Hub; Grok và Gemini phản biện)

Đi lại toàn bộ luồng như người dùng trên `1adf6d79` (phòng
`tmp/reviews/codex/runs/20260909-hub-quality-r2`, 45 ảnh), viết 14 hướng D1–D14,
giao cả hai ghế phản biện độc lập rồi sửa: luồng ảnh/emoji tới mô hình (nút
chính tự đổi theo bước nguồn), khôi phục gói dự án dưới mã gốc và dựng lại khi
mở, sửa thông số/màu không qua hộp xác nhận, thẻ bận “chờ bạn trả lời”, thanh
trên một hàng, khung bước 1 gọn, nhóm khung xem gập mặc định ở ≤1180, toast tự
mất/gộp/xóa theo dự án, khu Lớp màu theo loại sản phẩm, khu Xuất theo việc, tên
khối/vật liệu và mã lỗi bằng tiếng Việt, thư viện nói rõ ghi tự động. Hai ghế
đồng ý 13/14 hướng; Grok bác D14 (đồng hồ dev-serve là công cụ, không phải UI)
và sửa D1/D3/D10 theo hướng đã áp dụng; Gemini đồng ý cả 14.

Vòng 2 trên bản tích hợp: Grok 8 `fixed` / 5 `partly` / 4 mục mới (đều đã sửa:
hộp đề xuất hết hiệu lực tự đóng, watchdog kiểm lưới thành vấn đề cần xem, một
xác nhận mỗi bước chuyển nguồn, dải xóa lượt từ chối cũ, toast mở gói đúng việc);
Gemini live một phần, F1–F3 `fixed`, không mục mới.

Kiểm đã chạy thật trên bản cuối: typecheck; `tests/app/run.ps1` Chromium
(Node/types/browser đều 0); Node app/storage/product-app/domain/raster-adoption
với nhân canonical; `tests/ui/export-consent` và `tests/ui/request-boundary`
Chromium; `tests/e2e` ba engine (test đổi nhãn nút chuyển raster; giao diện giữ
nhãn “Chế độ chung của Xóa, Đường cắt và Khung cắt”). Chi tiết và số liệu trong
`reports/HUB-QUALITY-R2.md` của phòng Hub.

## Đợt phát hành vòng 3 10-09-2026 (Hub; Codex và Grok phản biện)

Thẩm định ba báo cáo audit chỉ đọc trên `48e69abc` bằng mã và luồng live; sửa các mục còn
đúng (khóa phiên 3MF, Lưu không hủy việc đang chạy, dải hủy/thay thế thành thông tin, mốc
“đã xem” theo sequence, cảnh báo lưới bước mặt cắt, giữ gói cứu hộ lồng, cô lập lỗi WebGL,
nút Mở); phát hiện và sửa trong nguồn native lỗi đọc lại 3MF (`READBACK_VERTICES`) làm gói
08-09 không xuất được 3MF cho mô hình thật; kiểm chứng bằng nhân dựng lại (không đóng gói).
Chi tiết ở [HANDOVER](../HANDOVER.md) và
[testevidence/ui-release-r3](../testevidence/ui-release-r3/README.md).

Sau phản biện của hai ghế, sửa tiếp: hình SVG/raster bị **lật dọc** so với nguồn (nhân phân
giải theo Y xuống, hệ chế tạo là Y lên; nay biên ngữ cảnh sản phẩm đặt khung một lần bằng API
khung nguồn của nhân); bước còn thiếu của nguồn đọc từ ràng buộc của chính nguồn hiện hành nên
đổi sang emoji trên dự án đã dựng không còn kẹt; mọi chẩn đoán đi qua `record()`; byte fixture
giữ nguyên khi checkout trên Windows; dải chẩn đoán có câu tiếng Việt và chi tiết native cho
lỗi ghi 3MF; mở gói trùng thư viện chuyển khỏi dải. Giữ nguyên có lý do: hủy do người dùng ở
mức thông tin, watchdog kiểm mesh của emoji (điều kiện chặn), F-03.1.

## Phần còn thiếu trước phát hành đủ v1

1. Sửa trực tiếp vector theo mm chưa có adapter. Codex đang đóng khoảng trống này; sửa raster có xác nhận không được tính là đã làm vector.
2. Ca Inter NFD overlay lưu từ cohort cũ đang được kiểm lại; không gọi toàn bộ chữ NFD hoặc COLRv1 là chưa chạy. Chế độ CSG tự chọn khối chạm nhiều nhất chưa triển khai; đích tường minh/thân duy nhất đã có kiểm.
3. Nghiệm thu G4 trên đúng gói hợp nhất còn thiếu một số luồng tài khoản/BYOK, trợ năng, offline, crash và tài nguyên. Các thiếu bằng chứng được phân biệt với lỗi đã tái hiện; không cộng assertion thành tỷ lệ hoàn tất.
4. Mở cho nhóm cần HTTPS/OIDC và owner thật. Preview dùng danh tính thử nghiệm; chưa xác nhận gọi AI trả phí. Review backend độc lập trước đó bị bộ lọc tự động từ chối, không có kết luận độc lập và không thử lại đường bị chặn.
5. Slicer/profile đích và fit vật lý có cổng riêng; không dùng việc thiếu coupon để chặn SVG/STL/PNG độc lập hợp lệ.

## Bằng chứng phản biện

[Hình học vòng 4](../reviews/20260908-geometry-r4/README.md), [UI xuất](../reviews/20260908-ui-export-r1/README.md), [checker mesh](../reviews/20260908-mesh-checker-r1/README.md) và [guard cơ khí cong](../reviews/20260908-curved-products-r1/README.md) có phạm vi và giới hạn riêng. Hai lỗi guard được chấp nhận sau tái hiện trên đúng dependency canonical; không mặc nhiên nhận kết luận của reviewer hoặc self-test của người sửa.

Mốc tiếp theo sau bàn giao là đóng các thiếu hụt trên theo đặc tả và chạy nghiệm thu/đánh giá phát hành tương ứng. Bản dùng thử hiện tại không tự mở các cổng G4–G6.
