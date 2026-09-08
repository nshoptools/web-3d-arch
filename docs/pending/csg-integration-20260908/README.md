# Ứng viên tích hợp CSG và sửa nguồn chữ — 08-09-2026

**Chưa ghép vào mã sản phẩm hoặc bản dùng thử. Chưa đạt phát hành.** Gói này giữ toàn bộ phần việc đang chờ để có thể tiếp tục từ mã nguồn trong repo. Bản dùng thử hiện hành theo [hướng dẫn bàn giao](../../HANDOVER.md).

`candidate.zip` chứa 190 tệp thay đổi dưới `files/`, gồm importer STL/OBJ, nhân CSG, kết nối controller, nguồn nền để dựng lại, chốt cơ khí, bản sửa chữ NFD và phép thử. Đây là delta của mã nguồn, không phải gói website chạy được. `manifest.json` ghi SHA-256, kích thước và preimage từng đích; preimage null đòi hỏi đích chưa tồn tại. `evidence.zip` giữ kết quả có phạm vi, mẫu lỗi và kết luận phản biện. SHA của hai ZIP nằm trong manifest.

Khi tiếp tục, tạo cây ứng viên trong phòng làm việc đã cô lập, có các tệp không đổi từ repo. Kiểm SHA của ZIP và **toàn bộ preimage trước khi chép bất kỳ đích nào**; từ chối nếu khác và rebase có kiểm chứng. Chép đúng mục `files/<path>` theo manifest, không giải nén đè trực tiếp vào mã sản phẩm. Dependency và thư viện nguồn vẫn theo pin/giấy phép của repo; bộ Three đi kèm là sáu tệp gốc MIT đã ghi nhận, không phải cài đặt Three tổng quát. Không cần giữ phòng làm việc đã tạo ra gói để đọc hoặc khôi phục delta này.

## Kết quả đã kiểm

- Tích hợp native và WASM kết thúc thành công. Module thử nghiệm có TestFixtures, không Printing; **không được phát hành module này**.
- Năm ca root: hai phép trừ và một phép hàn hợp lệ công bố được; hàn khối tách rời bị từ chối trước đề nghị; phép giao vi phạm datum bị chặn. Mô hình cha được giữ nguyên. Bản trước đã nhận sai khối tách rời; mẫu đó được giữ trong evidence.
- Cùng SVG số và request ghi nhận từ chữ `Vie\u0323\u0302t Nam`: root trước bị `SUPPORT_REGULARIZATION_BOUND`, root sau tạo 9 phần và giữ 12 contour. Chốt 2 nm không tăng. Đây là replay nguồn số trong module kết hợp, chưa phải một lượt nhập chữ mới qua trình duyệt.
- Năm kiểm controller nhỏ về bàn giao quyền sở hữu đề nghị và định tuyến thông số đạt; TypeScript đạt. Các kiểm này không thay cho luồng người dùng thật.
- Chromium + HTTP/SQLite thực dựng mô hình SVG, tải STL 1.900 tam giác và đọc lại được. Đã nhập STL bổ sung, chọn đơn vị/đích/vật liệu, giữ head trước xác nhận. Khi chấp nhận đề nghị đầu tiên, bước CSG trả `MESH_POST_CSG_OR_TOPOLOGY_BLOCKED`. **Chưa tới xác nhận thứ hai, commit CSG, xuất, lưu/mở hoặc undo/redo CSG.** Hai ca OBJ/hủy chưa chạy trong lần chốt này.

## Điểm phải giải quyết tiếp

1. Giữ và phân biệt báo cáo chốt native với checker tam giác ở lỗi trên; xác định mẫu cắt vi phạm điều kiện sản phẩm hay chốt từ chối quá rộng. Không bỏ chốt chỉ để phép thử qua.
2. Bộ chọn thân chính hiện có thể mơ hồ khi thân và vòng treo cùng role/group. Ca thực tế dùng semantic ID đầy đủ. Cần ánh xạ đích có bằng chứng và hoàn tất nghiệm thu reapply/undo/replay.
3. `them`/thêm rời và tự chọn khối chạm nhiều nhất chưa được triển khai. UI ứng viên báo giới hạn cho thêm rời, không đổi mặc định trong đặc tả. Sai số tổng thể, năm sản phẩm và những ca tiếp xúc còn phải được kiểm theo GEO-04.
4. Sau khi đóng lỗi, chạy lại đúng luồng controller, phản biện phần sửa, build module sản xuất có Printing và không TestFixtures, rồi tạo gói mới để nghiệm thu. Giữ nguyên gói dùng thử đã bàn giao.

[Phân xử phản biện](REVIEW-ADJUDICATION.md) phân biệt lỗi được tái hiện, sửa đã có và kết luận chưa đủ bằng chứng. Phạm vi v1 và các cổng phát hành không thay đổi.
