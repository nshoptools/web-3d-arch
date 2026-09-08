# Tổng hợp phản biện: Grok — vòng 2

Bản tổng hợp biên tập ngày 2026-09-08 từ nhận xét độc lập ngày 2026-09-07.
Các vấn đề và quyết định được trình bày đầy đủ tại đây; đây không phải nguyên
văn một lượt trả lời của ghế và không phải một vòng phê chuẩn mới. Điều khoản
hiện hành ở [bộ đặc tả](../../specs/README.md); [metadata ghế](seat-evidence.json)
ghi cấu hình đã quan sát và giới hạn chưa xác minh. Review không thay kiểm
thử ứng dụng, slicer hoặc bản in.

| ID | Vấn đề | Kết luận và xử lý |
| --- | --- | --- |
| G2-01 | Lịch lớp đầu không gắn được vào field `bamLopIn` / chip mm | Chấp nhận. GEO-02 một schedule project, field layers có datum/mốc; cờ bamLopIn trong danh mục không tự là schema mới; chip dùng cùng lịch — AT-021.2/4 |
| G2-02 | Nhánh lưới 3D × slab 2,5D chưa có hợp đồng boolean | Chấp nhận. GEO-04 định nghĩa import-as-part/union/subtract, mesh-scene, target metric/tie-break, vật liệu/orphan và no silent voxel; v1 cho cả năm loại — AT-040.1–5 |
| G2-03 | Cửa xuất 3MF / mapping khe không cùng một registry | Một phần, bác cho phép project 3MF sai tham chiếu. MATERIAL_SLOT_MISMATCH chặn gói máy hỏng; diagnostic phải hợp semantics định dạng, dùng trung tính hoặc remap tường minh. Tách structural check với slicer G5 — AT-013.2/3, AT-014.3 |
| G2-04 | Oracle trên giấy, copy-paste trên 39 ca | Chấp nhận. Mỗi check có method/tool/threshold/readiness riêng; ca analytic pin corpus/hash, 184 mm², seam 10 mm, volume CSG. Thư viện/version chưa có ghi unverified — AT-020, AT-040, test specification |
| G2-05 | Migration `impVox` / Z: một chỗ cấm quy đổi, một chỗ bắt phải có | Làm rõ. Migration không đồng nghĩa ánh xạ số; impVox replace-capability giữ nguồn, yêu cầu tolerance mới. Datum Z và các field chưa đủ ngữ nghĩa vẫn ở O-02 — AT-009.3, AT-036.2 |
| G2-06 | Mẫu U1 6 extruder / 4 filament chưa bị loại khỏi đường “hai slicer” | Chấp nhận. sample-qualification.json nêu mapping invalid, geometry twin, uses được/cấm; U1 lỗi nằm forbidden golden. Chưa có approved slicer golden — AT-013.2/3, AT-037.2 |
| G2-07 | Registry v1 vs bảy nút xuất mang tên hãng | Chấp nhận phần làm rõ. Registry có bảy export ID v1 trong build; module test ở artifact kiểm, không tải code từ project; component mới hợp lệ khi tương tác mới cần nó — AT-034.1/2 |
| G2-08 | `layerH` enum chuỗi vs first-layer lấy từ profile: hai nguồn lịch không có luật xung đột | Chấp nhận. Đổi máy/profile có diff schedule, giữ override có cảnh báo capability, xác nhận/undo; adapter dùng snapshot project — AT-021.3, AT-037.3 |
