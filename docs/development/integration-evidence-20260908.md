# Bằng chứng tích hợp ngày 2026-09-08

Đây là kết quả kiểm các thành phần và một luồng ứng dụng ban đầu. Trạng thái
phát hành vẫn **chưa sẵn sàng**; các phép kiểm dưới đây không thay thế toàn bộ
[nghiệm thu sản phẩm](../specs/04-nghiem-thu.md).

| Phạm vi chạy từ mã chính | Kết quả thực | Giới hạn kết luận |
| --- | --- | --- |
| Lắp vùng nguồn, chữ và cơ khí | 140/140 native, 140/140 WASM; bridge 13/13 ở mỗi nền; binding domain 13/13 | Ca thành phần, chưa là năm sản phẩm hoàn chỉnh qua UI |
| Đối chiếu lắp nguồn | 140 cặp đạt; oracle độc lập kiểm 992 phần mesh; sai khác thể tích lớn nhất 1,82×10⁻¹² mm³, bounds/mặt cắt không khác | Chỉ corpus đã chạy; không chứng minh sai số tổng quát của nguồn bất kỳ |
| Raster trong runtime chung | Build native và WASM đạt; probe 12 họ fixture và 11 ca từ chối đạt | Chưa nối receipt chuyển màu và công thức sản phẩm qua ứng dụng |
| Controller | 17 test Node, typecheck và 9 ca browser đã chọn trên ba engine đạt | Chưa chứng minh chính sách online tương thích WebKit đang bổ sung |
| Xuất 3MF qua RPC Worker thực | Chromium, Firefox và WebKit đạt; core/Bambu được đọc lại; giữ nguyên lease sau xuất, lỗi và hủy | Chưa chứng minh G5/slicer/profile máy thật hoặc độ lắp vừa |
| SVG → chỉnh kích thước → dựng → undo → lưu/mở → STL | Đạt ở Chromium/Firefox/WebKit với UI Opus, host HTTPS, backend và Worker thực; kiểm thể tích STL bằng oracle độc lập | Công thức đùn SVG được tiêm riêng từ test; không phải công thức sản phẩm v1 |
| SVG → xác nhận raster → xóa bằng con trỏ → undo → lưu/mở | Chromium/Firefox/WebKit đạt với bộ sửa ảnh và mã hóa PNG Worker thực; byte gốc giữ nguyên, hash ảnh đổi rồi khôi phục, đúng một bước lịch sử | Công thức sản phẩm và receipt của raster/chữ vẫn đang nối |

Hai lỗi tích hợp đã được sửa: khung host cần chiều cao xác định để panel cuộn
bên trong; bộ mã hóa PNG phải nhận cả `Uint8Array` từ Worker sửa ảnh và
`Uint8ClampedArray` từ canvas. Không đổi oracle hoặc dữ liệu kỳ vọng để bỏ qua lỗi.

Playwright 1.63 trên WebKit thêm thẻ STYLE chứa `body {}` trong lúc chụp ảnh.
CSP của sản phẩm chặn thao tác đó. Test kiểm không có lỗi console/CSP trước
khi chụp, rồi kiểm riêng dấu vết chính xác của công cụ chụp; không nới CSP.

Harness WebKit cũng phải cho phép URL blob do đúng origin ứng dụng tạo, vì
Playwright đưa cả các yêu cầu ảnh này qua bộ lọc mạng. Lỗi chặn nhầm đã được
tái hiện và sửa; các origin ngoài vẫn bị chặn.

RPC Worker đã thêm kiểm dữ liệu bị caller sửa ngay sau khi gọi build/export.
Trước bản sửa, Worker nhận SVG đã bị thay thành chuỗi sai; sau bản sửa, cả ba
engine dựng và xuất đúng bản đầu. Dữ liệu không clone được hoặc còn trỏ vào
SharedArrayBuffer bị từ chối trước khi tác động job đang khởi tạo. Bộ kiểm cũng
xác nhận đường xuất tiếp theo vẫn dùng được và snapshot ban đầu không thay đổi.

Mã kiểm có thể chạy lại nằm ở `tests/e2e/application.test.mjs`,
`tests/kernel/printing-rpc.test.mjs`, `tests/app/` và
`src/kernel/source-assembly/tests/`. Runner của lắp nguồn dùng mã chính,
thư mục phiên mới và `ARCH_SOURCE_TEST_ID`, không cần bản mã riêng của người viết.

Review độc lập cơ khí đã chạy 82 ca và đưa ra 2 P1, 5 P2. Phân xử và điều kiện
đóng từng mục ở [hồ sơ review](../reviews/20260908-mechanics/README.md). Bản sửa
chưa được chấp nhận chỉ dựa trên báo cáo của người triển khai.

Các phần còn chặn nghiệm thu gồm nối nguồn/công thức sản phẩm, đóng các phát hiện
cơ khí, kiểm tài khoản/AI và khôi phục vận hành, bảy đường xuất đúng ngữ nghĩa,
kiểm trải nghiệm toàn ứng dụng, review lại và bằng chứng slicer/in theo từng cổng.

## Kiểm bổ sung sau tích hợp chính sách phiên và hiệu đính cơ khí

Chính sách phiên đã qua25test Node,42test browser và160assertion lưu trữ từ
mã chính. WebKit OPFS vẫn là capability unavailable do readback0byte; IDB được
kiểm riêng. Chính sách online chỉ tồn tại trong bộ nhớ, dùng trao đổi HTTPS mới
và ràng buộc đúng user/device/session; có kiểm trước mutation/CAS và chờ xóa
trạng thái riêng khi mất quyền. Đây không phải cam kết thu hồi quyền tức thời
khi không có một yêu cầu mạng mới.

Luồng sửa ảnh đầy đủ sau thay chính sách đạt Firefox/WebKit. Chromium gặp lỗi
Worker script `ERR_BLOCKED_BY_RESPONSE` ở bốn lần chẩn đoán, sau đó hai lần
chạy đạt có/không có CDP. Chưa có nguyên nhân hoặc bản sửa đã chứng minh cho
lỗi gián đoạn đó; vẫn giữ mở. Không dùng các lần chạy đạt để xóa lỗi cũ.

Hiệu đính cơ khí vòng1 được biên dịch/kiểm trong một phiên mới từ mã chính:
199ca baseline,83ca remediation và140ca lắp nguồn trên mỗi nền native/WASM;
22ca domain và3ca hủy native. Oracle chéo kiểm2270part, sai lệch volume tối đa
1.8189894035458565e-12mm³, bbox/section bằng0. Reviewer độc lập vòng2 vẫn tìm
ra lỗi mái lỗ dây đeo và ràng buộc datum/lớp của artwork; parent tái hiện cả hai.
Xem [phân xử R2](../reviews/20260908-mechanics/R2-ADJUDICATION.md).

Ba file adapter chữ/catalog/service đã được đưa vào mã chính. Root Worker có
`textOperation`, dùng cùng Module/allocator/generation với hình học. Bộ kiểm
`tests/kernel/text-rpc.test.mjs` đạt3engine: tiếng Việt và preview thực, chụp
input trước async, nguồn sai không đổi lease mô hình cũ, hủy trong lúc tải font
không thay Worker và giữ hash mô hình. Bộ đóng gói Worker chuyên dụng tắt HTML
module-preload của Vite; không tạo DOM giả trong Worker. Renderer fallback màu
WebKit và luồng adapter/controller/sản phẩm đầy đủ chưa được chứng minh ở đây.

UI4 đã bàn giao77file và1606kiểm browser mock đạt. Parent chưa đưa UI4 vào
main; Opus đang sửa tiếp hai lỗi về identity/token của nháp và đường phục hồi
ảnh lỗi ở UI5. Kiểm mock vẫn có phạm vi riêng với ứng dụng thực.

### Tích hợp nguồn, sản phẩm và đối soát tiếp theo

- Text adapter từ mã chính:45 ca Node và14 core đạt;46 ca adapter và14 core trên mỗi Chromium/Firefox/WebKit đạt. WebKit dùng MessagePort renderer thay thế trong phép thử thành phần; cổng này chưa nối ở composition root.
- Opaque raster RPC qua Worker chính:3 trình duyệt đạt; kiểm thể tích nguồn832mm³ với lỗ thật, bản sao graph không sửa được nguồn, phê duyệt sai bị chặn, registry không đổi generation/hủy job khác, hủy/reset và proxy cũ không chạm Worker mới. Lần đầu phát hiện Worker đánh rơi error.code; đã giữ mã lỗi có kiểu và chạy lại đạt.
- Product runtime:30 tệp bàn giao được kiểm SHA/preimage và tích hợp, giữ các hook chữ/raster/printing hiện có. Bản native/WASM chính build đạt;5 default+20 SVG+20 raster+4 ca đặc biệt native và8 nhóm Node/WASM đạt. Ma trận Worker đang chạy; R2 hình học vẫn mở.
- Cả9 ca RPC chữ/raster/3MF đã qua ba trình duyệt trên bản nhân có product runtime; không coi đây là nghiệm thu toàn ứng dụng.
- Controller nhận18 tệp hợp đồng/triển khai/test và hunk formats cho xuất theo từng prerequisite. Bộ35Node/30browser trên mã chính đang chạy. Alignment trước đó29Node/types và6FF/WebKit đạt; Chromium3 ca lỗi UnknownError ở project.create trước khi vào nguồn, đang kiểm nhân quả với độ dài profile.
- B05 nhận22 delta sau kiểm preimage/SHA, gồm8 tệp sản phẩm backend. Schema4 và quy trình plan/check/apply có kiểm nghĩa vụ mất sau backup;80 ca tự kiểm của worker đạt, bộ chính đang chạy. Chưa có chứng minh hóa đơn/cutover/ACL/RPO/RTO hoặc kết luận review backend độc lập.

## Kiểm lại sau tích hợp sản phẩm, controller và khôi phục

Ngày 2026-09-08: bản chính backend schema4 đạt 80/80 kiểm thử, kiểm cú pháp và hash mã trước/sau đều đạt. Các ca gồm đối soát nghĩa vụ chi phí sau restore; đây là kiểm thử tích hợp, chưa phải kết luận phản biện độc lập. Controller đạt 35 kiểm Node, kiểm kiểu và 10 ca chọn lọc trên mỗi Chromium/Firefox/WebKit; hợp đồng discard, mô hình cũ và điều kiện xuất được kiểm cùng các ca nhập/sửa/chuyển nguồn.

Runtime sản phẩm: build native và WASM chung đạt; 8 nhóm Node và 46 mô hình trên mỗi ba engine đạt. Bộ đối chiếu hình học độc lập đọc dữ liệu đã chụp ở sáu mục tiêu native/WASM/trình duyệt đều đạt: native-product 25 mô hình/135 part; native-raster-product 20 mô hình/110 part; node-wasm-product 40 mô hình/220 part; browser-product/chromium 45 mô hình/245 part; browser-product/firefox 45 mô hình/245 part; browser-product/webkit 45 mô hình/245 part. Các ca xác minh lỗ và biên chung bằng hình học/lineage. Không cộng các lượt chạy cùng fixture thành số sản phẩm được hỗ trợ. Hai lỗi P1 R2 vẫn mở theo [phân xử](../reviews/20260908-mechanics/R2-ADJUDICATION.md).

## Nguồn, UI5, ảnh AI và hai nguyên nhân lỗi harness đã xác định

Ngày2026-09-08, sau các mốc lịch sử phía trên: UI5 nhận31thay đổi sản phẩm từ manifest78tệp, kiểm kiểu đạt. Luồng HTTPS thực SVG/dựng/sửa bằng con trỏ/undo/lưu/mở lại/STL đạt Chromium32.9s, Firefox94.9s và WebKit99.1s. Công thức SVG của phép thử vẫn là phạm vi tích hợp ban đầu, chưa thay nghiệm thu toàn bộ sản phẩm.

Chẩn đoán có kiểm soát trên Chromium153.0.8010.12/Playwright1.63: cùng dữ liệu và mã, profile dài lỗi6/6, profile ngắn đạt6/6, đảo thứ tự giữ kết quả. Đường MANIFEST của LevelDB259ký tự đạt,260lỗi UnknownError,259đạt lại. Runner dùng profile ngắn và kiểm trần240trước chạy. Worker HTTPS bị chặn trước khi host nhận yêu cầu với context.ignoreHTTPSErrors, có/không route; chỉ ngoại lệ SPKI của chứng thư kiểm thử cụ thể khắc phục được, đảo thứ tự vẫn tái hiện. Chứng thư không có trong danh sách vẫn bị từ chối. Không nới CSP/COI sản phẩm hoặc trust máy. Parent chạy lại Node/types và3ca nguồn mỗi3engine đạt. Kết luận chỉ đóng hai nguyên nhân harness đã chứng minh trên bộ trình duyệt này.

Text/color root RPC đạt3engine: tiếng Việt, COLRv1😀 và👩🏽‍💻 thực, giữ mô hình cũ, hủy hợp tác, khởi tạo bị hủy không ảnh hưởng phiên thay thế. WebKit thiếu canvas2D Worker dùng MessagePort riêng đã ràng buộc request; không tạo canvas DOM; font/port được giải phóng khi Worker chết. Bộ tests/kernel/text-rpc.test.mjs giữ regression.

Bộ raster bền đạt25nhóm Node và25nhóm mỗi3Worker, có callback dựng sản phẩm/hủy/retire và typecheck trực tiếp adapter. Sau đó compositor nguồn được kiểm bằng tests/kernel/source-composition.test.mjs: SVG/chữ/emoji màu/PNG thật, đề xuất dựng ảnh và phân vùng riêng, sửa byte hoặc renderer bị từ chối, xác nhận khác dự án bị chặn, giữ raw/font/outline/ảnh đầu khi chuyển đổi, lease cũ không khởi động Worker mới;3engine đạt. Trình nhận nguồn ở phép thử này là fixture dùng validator thật, chưa chứng minh cả lịch sử/lưu/UI. Chính sách alpha128 được khai rõ và cần xác nhận đề xuất phân vùng.

B03 backend nhận36delta sau kiểm81tệp, schema5, giữ nguyên codec JPEG vendor và giấy phép. Main112/112 kiểm HTTP/SQLite/PNG/JPEG/reference/thumbnail/artifact/cancel/late result/restore đạt; kiểm cú pháp và mã trước/sau ổn định. Người dùng, IdP và provider là dữ liệu thử cục bộ; không suy ra hóa đơn, quyền tài khoản AI thật hay review độc lập.

Hiệu đính R2 nhận33tệp sau xác minh toàn bộ seal5754tệp; exporter hình cuối nhận43tệp và7hook nhỏ. Nhân chính đã đổi kiểm ngữ nghĩa thành mechanics3/source2, metadata lưu riêng hai version. Build và kiểm lại root đang tiến hành; báo cáo worker chưa đóng hai P1.

## Kết quả tiếp theo: R3, UI6, thư viện và vận hành

Các trạng thái “đang chạy/chưa đóng” phía trên là lịch sử của từng mốc. Hiện
hai trigger R2 đã qua kiểm lại của reviewer độc lập. R3 phát hiện assembly gate,
revision và khai báo kiểu; parent sửa, build native/WASM và kiểm2 nhóm WASM,
6 nhóm RPC trên3 engine đạt. Chi tiết và hash ở
[phân xử R3](../reviews/20260908-geometry-r3/README.md). STL float32 của clicky
mặc định vẫn bị chặn đúng chính sách và cần xử lý trước nghiệm thu đường đó.

Backend B11 tích hợp24 tệp bền sau kiểm97 tệp ứng viên;136/136 kiểm trên mã
chính đạt, cú pháp và hash mã trước/sau ổn định. Source adoption đạt45 Node,
types và6 ca trình duyệt chọn lọc. Bộ chung printing/raster/text/compositor
đạt12 nhóm trên3 engine với mechanics3/source2 và alpha mặc định128.

Opus UI6 đạt2767 kiểm MockBridge trên3 engine. Parent đã tích hợp20 thay đổi
giao diện, rồi sửa các thuật toán quyền công bố kết quả: File khác byte không
chung danh tính chỉ vì trùng metadata; đổi tài khoản/dự án A→B→A không hồi sinh
yêu cầu; đóng nơi gọi hoặc sửa prompt chặn cả kết quả lẫn rejection đến muộn.
10 kiểm Node, types và41 kiểm React trên mỗi3 engine đạt trên đúng hash mã
chính. Ba lỗi r1 được giữ làm bằng chứng âm trong
[hồ sơ giao diện](../testevidence/ui-request-boundary/README.md).

Thư viện nguồn tích hợp1762 tệp bền, có62 font,7751 mục xem trước,4336 artwork
và nguồn/giấy phép riêng. Main17 kiểm Node và types đạt; giải mã16913 PNG thật,
đóng gói21391 asset duy nhất và21 kiểm mỗi3 engine đạt. Kiểm nguồn font không
được suy thành chất lượng mesh. Audit input và readiness được cập nhật sau
phép đo thật, giữ lỗi báo cáo cũ và kiểm strict lại; nguồn vendor không đổi.

Ba nhóm kiểm đề xuất hình học dùng root WASM thật với clicky/autoSize,
size28 và offset0 đạt: không công bố mesh giả, chỉ xác nhận đúng ticket/head,
lưu một bước lịch sử rồi dựng lại; bỏ/đổi tham số/đổi payload không áp dụng
đề xuất cũ. Store CAS và source binding là fixture Node có khai rõ, không
thay bằng chứng tích hợp trình duyệt/sản phẩm còn thiếu.
