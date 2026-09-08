# Phân xử vòng kiểm bản sửa

Hai ghế đánh giá độc lập cùng một bản đặc tả, không đọc kết luận của nhau.
Bảng dưới trình bày đủ nội dung cần xử lý, liên kết tới điều khoản hiện hành. [Opus](opus-round2.md) và [Grok](grok-round2.md) mỗi ghế trả tám nhận
xét. Bảng dưới là hiệu đính **sau** hai báo cáo; không giả ghế đã phê chuẩn mọi
câu sửa. Bộ cuối có 55 điều khoản và 113 check thuộc 40 chiến dịch.

| ID | Quyết định và phần sửa | Phép kiểm liên quan |
| --- | --- | --- |
| O2-01 | Chấp nhận rủi ro mất dữ liệu. ACC-04 private giữ byte; shared kê backup theo revision/hash, chỉ xóa khi backup hoặc xác nhận xóa cụ thể; hết phiên không purge | AT-031.1/2 |
| O2-02 | Chấp nhận. Oracle phương pháp/ngưỡng riêng, check có ID/verdict, requirements.testChecks liên kết hai chiều; công cụ chưa triển khai vẫn unverified | QA-04, AT-039.1/4 và 113 check |
| O2-03 | Một phần. AI-03 kiểm từng chiều cùng đơn vị/kỳ; unknown giữ nghĩa vụ kỳ gốc, không trừ kỳ mới/chiếm running slot. Không dùng TTL để tự xóa nghĩa vụ chưa đối soát | AT-033.2/4/5 |
| O2-04 | Chấp nhận. Policy-blocked giữ giá trị gốc, chặn capability, không fallback/rebuild ngầm; gỡ policy phục hồi khả năng | AT-007.3 |
| O2-05 | Chấp nhận. Server quota cloud/settings/stage/rate/concurrency theo user, bắt buộc policy trước G4/O-05; không tự bịa hạn mức tiền | AT-030.3 |
| O2-06 | Chấp nhận. ARC-01 giới hạn local geometry ở v1; remote về sau qua ADR/consent/quota/execution adapter | AT-019.2, AT-034.3 |
| O2-07 | Một phần. Lease server-signed, monotonic trong phiên, phát hiện lùi quá 5 phút; công bố không chống người kiểm soát client sửa code/kho. Không nhận một wall clock local là nguồn auth tin cậy | AT-031.4 |
| O2-08 | Một phần và sửa sâu hơn. Store theo user/project/schema; **writer lock theo user/project xuyên schema**, để migration và hai bản app không cùng ghi. Không dùng schemaVersion làm cách né khóa | AT-015.3 |
| G2-01 | Chấp nhận. GEO-02 một schedule project, field layers có datum/mốc; cờ bamLopIn trong danh mục không tự là schema mới; chip dùng cùng lịch | AT-021.2/4 |
| G2-02 | Chấp nhận. GEO-04 định nghĩa import-as-part/union/subtract, mesh-scene, target metric/tie-break, vật liệu/orphan và no silent voxel; v1 cho cả năm loại | AT-040.1–5 |
| G2-03 | Một phần, bác cho phép project 3MF sai tham chiếu. MATERIAL_SLOT_MISMATCH chặn gói máy hỏng; diagnostic phải hợp semantics định dạng, dùng trung tính hoặc remap tường minh. Tách structural check với slicer G5 | AT-013.2/3, AT-014.3 |
| G2-04 | Chấp nhận. Mỗi check có method/tool/threshold/readiness riêng; ca analytic pin corpus/hash, 184 mm², seam 10 mm, volume CSG. Thư viện/version chưa có ghi unverified | AT-020, AT-040, test specification |
| G2-05 | Làm rõ. Migration không đồng nghĩa ánh xạ số; impVox replace-capability giữ nguồn, yêu cầu tolerance mới. Datum Z và các field chưa đủ ngữ nghĩa vẫn ở O-02 | AT-009.3, AT-036.2 |
| G2-06 | Chấp nhận. sample-qualification.json nêu mapping invalid, geometry twin, uses được/cấm; U1 lỗi nằm forbidden golden. Chưa có approved slicer golden | AT-013.2/3, AT-037.2 |
| G2-07 | Chấp nhận phần làm rõ. Registry có bảy export ID v1 trong build; module test ở artifact kiểm, không tải code từ project; component mới hợp lệ khi tương tác mới cần nó | AT-034.1/2 |
| G2-08 | Chấp nhận. Đổi máy/profile có diff schedule, giữ override có cảnh báo capability, xác nhận/undo; adapter dùng snapshot project | AT-021.3, AT-037.3 |

Grok không đọc được ZIP binary bằng toolset của ghế: nhận xét metadata 3MF của
ghế là kiểm nhất quán văn bản, **không** lần kiểm mesh độc lập thứ hai. Người
biên tập có audit stdlib ZIP/XML riêng, nhưng cũng không nhận đó là mesh oracle
toàn diện. Metadata caller thu được bổ sung `current_model_id=grok-4.6` và
`reasoning_effort=xhigh`; modelUsage vẫn là `grok-4.6-build`. Giới hạn tương đương
tên model còn nguyên, dù effort đã có chứng cứ thực tế.

Opus vòng 2 chỉ có modelUsage claude-opus-5, init fast off, CLI 2.1.263. Điều
này bổ sung phần ghế không tự xem được CLI/fast, nhưng không làm workflows trở
nên khả dụng. Không tuyên bố cấu hình Ultracode đã đạt.

Sau hiệu đính không còn các mâu thuẫn P1 được nhận ở hai vòng chưa có cách xử
lý trong tài liệu hoặc cổng kiểm cụ thể. Đây là kết luận biên tập có phạm vi,
không phải chứng minh không còn lỗi chưa phát hiện. Test sản phẩm/field schema
chi tiết, toolchain, slicer, thực nghiệm và review đạt cấu hình còn cần trước
các cổng phát hành tương ứng.
