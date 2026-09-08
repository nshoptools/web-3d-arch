# Quyết định kỹ thuật và phần parent cần phân xử

Phạm vi: MOD-01/02/03, GEO-02/03/04, catalog 1.0.1. Các quyết định dưới đây đã
được thể hiện trong code/test của worker; chúng chưa sửa spec gốc hay đóng O-02
cho toàn bộ hình học. Căn cứ đầu vào và SHA-256 ở [catalog-provenance.json](catalog-provenance.json).

| ID | Quyết định triển khai | Lý do và giới hạn |
| --- | --- | --- |
| DW-01 | Giữ 126 ID gốc, 11 group; thêm meshJoinTolerance và strapTolerance. impVox/strapSeg chỉ migration. | Không xóa chức năng hay giả vờ control cũ còn tác dụng. 13 control khối nhập gồm 10 field + file + 2 nút chung lệnh, không phải 13 tham số. |
| DW-02 | Miền min/max giữ catalog; quantum lưu số đo 0.000001 (mm: 1 nm), UI increment tách biệt. Count/index giữ grid nguyên catalog. | GEO-02 yêu cầu decimal chính xác. Bước slider không phải độ phân giải input/máy. clr=0.05 giữ nguyên; UI ±0.02 tương đối giá trị hiện tại. Parent cần chấp nhận chính sách input này trước binding. |
| DW-03 | Grammar decimal-only: dấu phẩy/chấm đều là dấu thập phân; không grouping, exponent, suffix; nhận .05/+0,05 và whitespace đầu/cuối. | 1,234 và 1.234 đều là 1.234 theo grammar công bố, không phải 1234. Mixed/repeated separators, số lẻ quá 6 chữ số khác 0, NaN/Infinity đều từ chối; trailing zero thừa không mất thông tin số. Mọi parse giữ Number có spelling canonical tương đương, toán dùng BigInt nm; không tuyên bố Float64 binary chứa hữu hạn mọi thập phân. |
| DW-04 | Mọi giá trị Z legacy giữ nominal-mm ban đầu; không đọc bamLopIn để suy layers. | D-09/D-29/GEO-02. baseH/plateT/artH/... được chuyển chỉ với datum, referenceLayer, rounding và commit chấp nhận. pinD=1.7, socketD=5.5, collarH=1.85 được giữ. Đây là đường bảo toàn trước O-02, không phải tuyên bố mọi Z cuối cùng phải mm. |
| DW-05 | Datum bed chỉ cho referenceLayer=0; feature cần semantic ID + global referenceLayer. Layers là khoảng z(start+n)-z(start). | Nêu rõ mặt tham chiếu; module không xác nhận feature tồn tại hay alignment của mặt. Trung tâm strapZ/legoRanhZ, rimOver, mesh impZ không được layers. Nominal không có datum thì deviation unverified/datum-required; không chọn datum mặc định. |
| DW-06 | Schedule version 1, SHA-256 canonical, firstLayerHeight và layerHeight có source user/profile riêng, profileId. Regular 0.08–0.30, first layer >0 và <=1 mm. | Regular dùng miền spec, cho 0.25 dù không là chip catalog. Trần first-layer 1 mm là bound lưu trữ đề xuất của worker, chưa là capability slicer. Default 0.20/0.20 nguồn user là lựa chọn baseline khi tạo snapshot; parent nên truyền profile thật khi đã chọn. |
| DW-07 | ringH=0 legacy chuyển {heightMode:auto,mode:body-height}; explicit mm=0 bị từ chối. | Catalog chỉ chứng minh cần auto enum; tham chiếu baseH là đề xuất kỹ thuật hợp nghĩa cho móc. Resolver thuần đọc baseH/schedule, không sinh solid. Parent xác nhận datum/eyelet formula trước kernel. skirtH=0 và legoRanhZ=0 thiếu chứng cứ auto nên giữ nominal/coordinate 0 với blocker. |
| DW-08 | impVox không có map số. 0.25 mm lưu provenance, replacement mặc định unselected. | GEO-04/correction catalog: voxel cell khác mesh surface-error bound. meshJoinTolerance selected là request có capability ID/version, vẫn unsupported tới khi kernel/ledger/oracle được kiểm. Không đổi 0.25→0.25. |
| DW-09 | strapSeg migration dùng bound sagitta của full circle, inscribed regular polygon, radius=strapD/2; chỉ đề xuất khi convention được xác nhận. | E = r(1-cos(pi/n)). Dùng rational π interval và alternating Taylor sums 8/7 term, floor/ceil ra nm tạo enclosure bảo thủ. Signed deviation inward. Không áp cho ellipse/nonuniform scale, slot, chamfer hay generator cũ chưa rõ. User chấp nhận mới chọn tolerance; không snap tới budget. |
| DW-10 | Common khi áp cả 5 sản phẩm; còn lại lưu theo product. Auto preset tính lại khi chuyển; user giữ. | Tránh trộn baseH móc với baseH dây, đồng thời size/offset/artMode thủ công theo scope chung được giữ. ringOn=false trong preset lego/charm giữ provenance nhưng không kích hoạt field keychain. Parent cần xác nhận quy tắc scope này cho binding. |
| DW-11 | Bảy constraint quan hệ chỉ kiểm điều kiện nominal cần thiết; geometry/fit không pass. | Outside>inside, base>depth, tab>=neck, mouth>=cavity. Không bịa min roof printable, kinematics, fit adjustment, clearance radial/diameter hay strength. RELATIONAL_CONSTRAINTS là nguồn chung của evaluator và field metadata. |
| DW-12 | Không giải nghĩa dữ liệu lạ; giữ nguyên raw/read-only thay vì parse mất digits rồi overwrite. | JSON parser phát hiện duplicate/prototype keys, exact numeric spelling, accessor/cycle; node/depth/UTF-8 size budget công bố. Unknown enums/fields ở version hiện hành cũng read-only. Source byte encoding do parent giữ; schema text/region/material chi tiết còn mở. |
| DW-13 | Preview/commit re-evaluate command + hash/revision; undo dùng snapshot và tạo transaction nghịch. | Stale preview/history hoặc rejected batch giữ state cũ. Hash là integrity identity, không chữ ký/xác thực. Parent áp ngân sách history và lưu bền, module không claim transaction xuyên storage. |

## Cổng còn mở

- **Clearance**: clr, charmClr, legoHoDu, gap chưa chốt một phía/toàn bề rộng.
  Khe dương là thêm khoảng trống; không thực hiện công thức offset/bù máy.
- **Datum/height mode**: từng blocker trong field-dispositions; feature reference
  phải resolve bằng scene hiện hành, phát hiện orphan. Các mode noi/chim/phang/phang2,
  band/core/rim và zero skirt cần công thức trước geometry.
- **Tolerance kernel**: O-01/O-02 cần capability thực, version/ledger, oracle.
  CSG target contact/material/orphan theo GEO-04 chưa nằm trong worker domain này.
- **strapSeg convention**: công thức bound được kiểm với oracle số độc lập, nhưng
  lịch sử generator chưa chứng minh số cạnh mang nghĩa full circle equal-angle.
  Ø4/n18 cho upper 0.030385 mm; vượt export 0.004 và mating 0.001.
- **Source xử lý**: smooth/minA/denoise/eps/tension còn mapping thuật toán/đơn vị.
  Resolution raster không đi vào cơ khí. Gate nguồn được đề xuất từ nghĩa;
  parent cần xác nhận luồng vector/rasterization của UI.
- **Dữ liệu ngoài catalog**: nội dung chữ, vùng, màu/khe/role/block overrides
  được giữ lossless JSON, chưa có schema nghiệp vụ chi tiết hoặc lệnh chỉnh riêng.
  Auto-sizing switch/bore, CSG và reset material cần command riêng từ parent/core.
- **Fit/hardware**: mọi preset là ứng viên; O-03/O-06 chưa coupon/raw measurements/
  slicer profile evidence. Thay layer height không chứng minh độ cao bản in.
- **Runtime UI/browser**: kiểm Node và VM không Node globals; chưa browser thật,
  Worker messaging, a11y input hay adapter persistence.

## Cấu hình ghế

Đã đọc seat-config.json và SEAT-CONFIG.md. Caller báo inherited GPT-6 Astra,
effort max. Công cụ spawn không phơi fast/service-tier; không tự xác minh được.
Đây là implementation theo ủy quyền, không review độc lập, không nhận kết quả
là review đạt cấu hình. Không gọi ghế khác hoặc kiểm/cập nhật cấu hình máy.
