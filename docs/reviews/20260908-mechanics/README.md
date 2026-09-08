# Phản biện cơ khí và phân xử ngày 2026-09-08

Kết luận: **cần sửa**, chưa chứng nhận phát hành. Ghế Codex độc lập kiểm bản
native ABI 2 và adapter thông số, tự tạo 82 ca cùng oracle tam giác/số nguyên.
Các phép kiểm này không bao gồm ứng dụng, WASM, slicer hay bản in vật lý.

Cấu hình đã đối chiếu ở CLI và metadata phiên: `gpt-6-astra`, effort `max`,
Codex CLI 0.153.4, tính năng fast mode tắt và service tier yêu cầu `default`.
Metadata phiên không có telemetry service tier phía máy chủ; không suy diễn
thêm từ giá trị trống. Nguồn chính thức và khả năng runtime đã được kiểm trước
đợt; chế độ `ultra` được runtime mô tả là thêm điều phối task, chưa có bằng chứng
là mức suy luận sâu hơn cho một ghế phản biện độc lập.

57 tệp đầu vào đóng băng giữ nguyên hash sau review. Codex điều phối đã đọc
ca tái hiện và đối chiếu các nhánh xử lý trong mã; phân xử dưới đây dựa trên
hành vi và yêu cầu GEO-02/03/04, MOD-03, ABI-01, EXP-02. Người triển khai phải
sửa và kiểm lại; số ca đạt trước đó không đóng các phát hiện này.

| ID | Mức | Phân xử và căn cứ | Điều kiện đóng |
| --- | --- | --- | --- |
| MECH-R1-001 | P1 | Chấp nhận. Kiểm envelope lỗ Lego dùng footprint trước cắt; vát/rãnh sau đó có thể mở thành lỗ mù. Ca thân rộng 39 mm, cao 2 mm, lỗ sâu 1,8 mm, vát 1,5 mm: ở Z=1,75 mặt ngoài tới X=18,25 nhưng lỗ tới khoảng X=18,45. Ca charm chốt rộng cũng có hiện tượng này. Topology từng part sạch không chứng minh đúng công năng. | Kiểm thành/mái và vùng gắn trên solid cuối, gồm tương tác vát/rãnh/hollow/cross-cut; vùng flexure mở có chủ ý phải được mô tả riêng. Ca lỗi bị chặn hoặc có đề xuất rõ; ca sát biên hợp lệ vẫn dựng được. |
| MECH-R1-002 | P1 | Chấp nhận. Native catalog gán mask `1` cho nhóm `imp*` trong khi domain cho cả năm loại. Kiểm `b(impOn)` vì thế bỏ qua yêu cầu ở clicky, strap, lego, charm; kết quả giống hệt tắt import. | Đồng bộ phạm vi; khi chưa có executor phải trả unsupported cả năm loại. Khi tích hợp executor, chứng minh thêm/hàn/trừ thực sự dùng mesh và không bỏ qua thông số. |
| MECH-R1-003 | P2 | Chấp nhận trong phạm vi hợp đồng. Nhánh heightMode=mm chỉ giữ giá trị, bỏ datum/referenceLayer khỏi record native. Giá trị nominal vẫn 1,5 mm; chưa có bằng chứng mesh tự snap. | Giữ và kiểm datum/reference tùy chọn trong mm, đồng nhất binding nguồn và từ chối datum không tồn tại. |
| MECH-R1-004 | P2 | Chấp nhận. Native nearest ties-to-even dùng parity endpoint toàn cục; domain dùng số lớp từ reference. Với reference=35, lớp 0,2 mm và độ dày 1,5 mm, domain chọn 8 lớp, native gợi ý 7. | Dùng chính sách số nguyên chung, parity của span, kiểm datum/reference; so hai phía ở tie và hai lân cận. Không tự sửa chiều cao mm. |
| MECH-R1-005 | P2 | Chấp nhận. `source:body.bottom` được dùng ở cả đáy nguồn Z=8 và đáy váy Z=0. Nhánh height chỉ so tag truyền vào nên nhận layer reference sai nghĩa. | Một datum chỉ resolve một mặt; thêm datum đáy váy riêng và kiểm tọa độ Z thực. |
| MECH-R1-006 | P2 | Chấp nhận, ảnh hưởng caller native. `topBevelSeg=3.9` qua kiểm range rồi bị cast thành ba bậc; adapter domain đã chặn ca này. | Native kiểm integer/quantum theo catalog trước tính toán/cast, trả invalid và không mesh; không làm tròn yêu cầu. |
| MECH-R1-007 | P2 | Chấp nhận. Khi collarH=0, kiểm hốc vẫn dùng min(r1,r2) và kiểm support của cổ không được sinh. postD1=5,7; postD2=4; hốc 4,2×1,45 mm nằm trong trụ thực nhưng bị từ chối. | Kiểm từng đoạn trụ thực sự tồn tại và khoảng Z giao hốc; giá trị phần tắt không chặn quan hệ hình học của phần còn lại. |

Các mục trên đang mở. Ghế triển khai cơ khí nhận sửa sau khi đóng băng phần lắp
nguồn; điều phối giữ quyền chấp nhận hoặc yêu cầu sửa tiếp sau kiểm lại độc lập.

Các giới hạn cần tiếp tục kiểm:

- Tiếp xúc cạnh/điểm giữa các part không được suy thành scene manifold. Cần
  kiểm giao, contact, vertex-link và union toàn scene theo từng đường xuất.
- Prepared slab tổng hợp không chứng minh SVG, chữ, màu hay bốn kiểu hoa văn.
  Phải chạy đầu vào thật qua bộ lắp nguồn và kiểm dấu vết/contacts.
- Sai số vòng tròn cục bộ chưa là error bound tổng hoặc chứng nhận fit vật lý.
- Giá trị lưu khác zero với tag auto-body-height cần siết canonical validation;
  review không chứng minh nó gây sai geometry ngoài ngữ nghĩa auto.

Hồ sơ [findings.json](findings.json) giữ mô tả, cấu hình, phạm vi và kết quả
quan sát. Các đường evidence của phiên trong hồ sơ chỉ là provenance của lần
đo; điều kiện sửa và ca tái hiện cần thiết đã được ghi đầy đủ ở đây và trong
record phát hiện, không cần tài liệu ý tưởng hoặc dữ liệu tạm để hiểu yêu cầu.
