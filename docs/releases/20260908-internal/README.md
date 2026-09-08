# Bàn giao bản dùng thử nội bộ — 08-09-2026

**Đã đóng gói và mở bản dùng thử; chưa nghiệm thu toàn bộ v1.** [Cách mở và chạy lại website](../../HANDOVER.md) có lệnh launcher, SVG mẫu và điều kiện triển khai thật.

## Gói được bàn giao

| Mục | Giá trị |
| --- | --- |
| Gói website | `report/release/20260908-internal/` |
| Build cần giữ cho preview | `report/build/20260908-internal/` |
| Input launcher | `report/preview/20260908-internal/input.json` |
| Release manifest SHA-256 | `720e815fbb0b5817b3a3a66918114393b0b60542ff73cd3e8b825d22d279a898` |
| Prepared manifest SHA-256 | `029689a4e449e5f2137094090050ed3f50f6a9ea34423456df8fc5eeb41494f6` |
| Input SHA-256 | `3ee43aa58efddfb937886696ec1b965cb44196988bf0a239dff02584aa65677b` |

Gói có 21.647 tệp, 21.414 tài nguyên public, khoảng 375 MB cả runtime. Frontend thực được biên dịch từ 290 tệp nguồn đã chụp; Worker/WASM cùng thư viện nguồn, giấy phép và backend schema 5 được ràng buộc bằng hash. Mã sản phẩm được đóng băng trước build.

## Kiểm chứng trên chính gói này

[Biên bản cuối và danh mục tệp bằng chứng](final-verification.json) giữ ba luồng qua UI, HTTPS, SQLite, Worker/WASM thực:

| Luồng | Kết quả |
| --- | --- |
| SVG → móc khóa → mô hình 3D → STL | Đạt; 3 bộ phận, 1.900 tam giác, kích thước danh nghĩa 48 × 32 × 3,2 mm. Đọc lại tọa độ hữu hạn, topology và receipt gắn đúng dự án/bản sửa. |
| Cài đặt cá nhân → xuất JSON | Đạt khi chưa mở dự án; tải lại đúng giá trị tài khoản từ backend. |
| Dự án → ZIP cứu hộ | Đạt; đủ selected manifest và nguồn gốc, CRC/kích thước/SHA khớp; cùng dự án/bản sửa với receipt STL. |

Điều phối viên kiểm lại hash các bằng chứng, đọc STL, ZIP và đối chiếu receipt. Không có lỗi page/console trong lượt ba luồng đạt; hai fetch nền bị abort được giữ trong log. Mẫu STL này không phát sinh proposal float, nên ba luồng cuối không được tính là đã kiểm nhánh consent đó. Đây là Chromium có cửa sổ và danh tính OIDC tổng hợp cục bộ. Lượt headless trước đó timeout 10 giây ngay khi mở trang, chưa chạy ca nào; giữ nguyên log. Lượt kiểm lại giữ các deadline gốc và không chứng minh đã sửa nguyên nhân chậm.

[Ảnh mô hình thực](three-flows/ACTUAL-MODEL.png), [STL đã tải](three-flows/keychain.stl) và [ZIP cứu hộ đã tải](three-flows/final-rescue.arch-project.zip) là đầu ra của ca thử, chưa có chứng nhận slicer hoặc fit vật lý.

Các kiểm khác có phạm vi riêng: Worker đã biên dịch đạt trên Chromium/Firefox/WebKit; HTTPS shell đạt; 42 ca UI tập trung đạt trên ba engine; hai ca settings HTTP/SQLite đạt lại sau tích hợp; 25 ca lưu trữ đạt và WebKit dùng IDB fallback. Bằng chứng gốc ở [danh mục chọn lọc](evidence-pins.json) và [hồ sơ UI](../../testevidence/ui-handover/parent-verification.json). Không cộng các số này thành tỷ lệ nghiệm thu toàn sản phẩm.

Chuyển vị trí build từng làm lệch hash liên kết plan do đường dẫn input riêng thay đổi. Điều phối viên phát hiện và sửa đúng hai tệp metadata; tất cả tệp public/runtime giữ nguyên. [Biên bản đối chiếu](evidence/plan-binding-correction.json) giữ preimage và kết luận; các seal prepared cũ không dùng cho launcher hiện hành.

## Giới hạn chưa đóng

- Tích hợp CSG tổng quát với controller/lịch sử vẫn khóa; [candidate và bước tích hợp](../../pending/imported-csg/README.md) được lưu bền.
- Một số chữ NFD/font/overlay, toàn luồng COLRv1 → dựng sản phẩm và nghiệm thu đầy đủ các chức năng/trình duyệt còn thiếu.
- Guard cơ khí có miền hỗ trợ bảo thủ. [Phản biện và phân xử](../../reviews/20260908-curved-products-r1/README.md) cùng [giới hạn cụ thể](../../curved-products/GUARD-RESOLUTION.md) giữ hai lỗi gốc đã sửa và bộ bổ sung chỉ đạt 18/22 assertion.
- Chưa cấu hình HTTPS/OIDC/owner thật, chưa gọi AI trả phí. Preview không dùng làm hệ thống tài khoản thật của nhóm.
- Chưa đủ kiểm tài nguyên/độ trễ, review phát hành cuối, slicer/profile đích và fit vật lý. Review backend độc lập trước đây không có kết luận sau khi bị bộ lọc tự động từ chối.

Theo yêu cầu sớm bàn giao, không mở thêm chiến dịch phát triển trong đợt này. Website preview được để chạy cho người dùng; đóng cửa sổ preview sẽ dừng các dịch vụ thử nghiệm của lượt đó. [Kế hoạch và phần việc còn lại](../../development/PLAN.md) giữ nguyên nghĩa vụ của đặc tả v1.
