# Phân xử vòng 2 — các phát hiện bổ sung

**Cập nhật sau sửa:** hai trigger gốc đã được kiểm lại độc lập trong
[vòng 3](../20260908-geometry-r3/README.md), kèm đối chứng root của parent.
Phần dưới lưu nguyên kết luận tại thời điểm R2; không phải trạng thái phát
hành hiện hành. R3 còn phát hiện vấn đề tích hợp xuất và giới hạn float32 mới.

Ngày 2026-09-08. Đánh giá độc lập ban đầu của ghế Codex dùng Astra/max,
CLI 0.153.4, fast feature tắt; model/effort đã được kiểm trong metadata phiên.
Không có telemetry về service tier của phản hồi máy chủ. Reviewer tự lập kết
luận trước khi đọc các phát hiện vòng1. Đối chiếu cuối vòng1 đã hoàn tất.

Parent đã tái hiện cả hai lỗi dưới đây bằng bản native biên dịch từ mã chính
sau hiệu đính vòng1. Kết luận là **accepted, chưa sửa, chặn phát hành**.

| ID | Mức độ | Trigger và bằng chứng parent | Yêu cầu sửa và nghiệm thu |
| --- | --- | --- | --- |
| CDX-MECH-R2-001 | P1 | Lỗ dây đeo trên thân40×30mm, baseH6, strapZ3, strapD4, strapCham0, topBevel bật, shape1, R2. Kết quả thành công và cho xuất; giao đường Z tại(19.5,0) chỉ còn[0,1], mất mái trên lỗ | Kiểm mái/sàn trên host cuối sau bevel/các phép cắt/phân vật liệu; phân biệt miệng bên có chủ ý. Ca lỗi không công bố mesh xuất; có đối chứng không bevel và bevel nhỏ; kiểm native/WASM bằng hình học thực |
| CDX-MECH-R2-002 | P1 | Nền12 lớp từ0, h0=.16 vàh=.2 tạo mặt tại2.36mm. Artwork4 lớp gắn tag128 nhưng reference0 được nhận, ra[2.36,3.12], dày.76mm. Đối chứng reference12 ra[2.36,3.16], dày.8mm | Giải datum/mặt thật và kiểm biên lịch lớp cho layers lẫn mm khai báo; không tự thay tag/reference. Bao gồm datum ngoài lưới, thân/bed text, recess/core và bands; giữ dữ liệu gốc và lỗi không công bố kết quả dở |

Reviewer cũng tái hiện mode mm khai báo sai datum/reference nhưng được chấp
nhận. Parent chưa chạy lại probe mm riêng; phần đó còn cần phép kiểm độc lập
khi nhận bản sửa. Hai ca layers nêu trên đủ chứng minh lỗi ràng buộc mặt/lớp.

Nietzsche phụ trách gói sửa cơ khí/lắp nguồn tiếp theo; Codex chính tích hợp,
kiểm lại và yêu cầu phản biện tiếp. Gói xuất hình cuối của Ohm và runtime sản
phẩm của Halley có phạm vi riêng. Không sửa kết quả kỳ vọng chỉ để bỏ qua lỗi.

Bản sửa vòng1 đã qua199 ca baseline,83 ca remediation và140 ca lắp nguồn trên
mỗi nền native/WASM,22 ca domain và3 ca hủy native. Oracle chéo kiểm2270 phần
mesh. Những kết quả này chứng minh các ca đã chạy; chúng không phủ hai trigger
mới và không chứng minh sản phẩm sẵn sàng phát hành hay chi tiết lắp vừa.

## Đóng đúng phạm vi các phát hiện vòng1

Codex chính chấp nhận kết quả sửa bảy phát hiện vòng1 trong phạm vi dưới đây,
dựa trên ca lỗi gốc/đối chứng của reviewer và bộ hồi quy native/WASM đã chạy
từ mã chính. Việc đóng này không bao gồm hai lỗi mới của vòng2.

| ID | Phân xử và căn cứ |
| --- | --- |
| MECH-R1-001 | Đã sửa cho Lego/Charm: các ca bevel/groove/charm gây mất thành bị từ chối, không công bố mesh; tổ hợp hợp lệ có đối chứng. Strap thuộc R2-001 còn mở. |
| MECH-R1-002 | Đã sửa việc âm thầm bỏ qua impOn: bật nhập mesh bị từ chối ở cả năm loại, field117 vẫn được giữ. Chưa chứng minh hỗ trợ nhập mesh/CSG. |
| MECH-R1-003 | Adapter đã giữ nguyên plateT1.5/datum2/reference35 trong record và bytes; datum mm lạ bị chặn. Executor lắp nguồn thuộc R2-002 còn mở. |
| MECH-R1-004 | Tie từ reference35 trả nearest+.1; hai lân cận1.499999 và1.500001 trả-.099999 và+.099999, khớp domain; không đổi hình nominal. |
| MECH-R1-005 | Váy40 lớp dùng datum1 bị chặn; datum11 đúng. Mặt nguồn và đáy váy được giữ riêng trong các trường hợp post/váy dài-ngắn. |
| MECH-R1-006 | topBevelSeg3.9 bị PARAMETER_INTEGER_REQUIRED trước ép kiểu; không có mesh. Có kiểm trường tắt và lưới lưu trữ. |
| MECH-R1-007 | Collar0/postD2=4 dựng được; đổi postD2 thành11 vẫn giữ input nhưng ARCH/1 giống byte và không sinh collar. |

Review hoàn tất với96 lần gọi native,27 WASM,9 kiểm domain và11 nhóm đo
hình học/parity; không tính123 lần gọi thành123 ca sản phẩm độc lập. Kết luận
độc lập được lưu trước khi đọc vòng1, SHA-256
`05dcee04018795378f0fe4a960dcb58eafbc48ee6969215a84e735ce00e87440`.
Manifest105 tệp của snapshot được review có SHA-256
`17f529ce6dd56c114347112e106eb2ffeb4063d72007506145cee9a7d6326e76`.
Các giá trị này nhận diện bằng chứng; không thay thế yêu cầu hồi quy bản sửa
tiếp theo và không chứng nhận Worker, slicer, coupon vật lý hoặc toàn sản phẩm.
