# Tổng hợp phản biện: Grok — vòng 1

Bản tổng hợp biên tập ngày 2026-09-08 từ nhận xét độc lập ngày 2026-09-07.
Các vấn đề và quyết định được trình bày đầy đủ tại đây; đây không phải nguyên
văn một lượt trả lời của ghế và không phải một vòng phê chuẩn mới. Điều khoản
hiện hành ở [bộ đặc tả](../../specs/README.md); [metadata ghế](seat-evidence.json)
ghi cấu hình đã quan sát và giới hạn chưa xác minh. Review không thay kiểm
thử ứng dụng, slicer hoặc bản in.

| ID | Vấn đề | Kết luận và xử lý |
| --- | --- | --- |
| G-01 | Tính đầy đủ của bộ nghiệm thu | Chấp nhận — Hoàn thiện nghiệm thu, truy vết, matrix và báo cáo |
| G-02 | Polygon trước boolean và curves nguồn | Chấp nhận — GEO-01/02 giữ curves nguồn, polygon trước boolean có bound; không chỉ polygon lúc xuất |
| G-03 | Graph màu và clip | Chấp nhận — VEC-01 graph màu/clip/transform; manufacturing conversion có chấp nhận |
| G-04 | Catalog tài nguyên có kiểm | Chấp nhận — Catalog/lock và INPUT-CONTRACT quản lý tài nguyên; giữ đủ font nguồn nguyên bản |
| G-05 | Cấu hình JS và gói 3MF | Một phần — Hai JS settings và hai gói 3MF là fixture bền riêng biệt. Parse hoặc đếm key không chứng minh roundtrip; OUT-01 quy định mức kiểm. |
| G-06 | Shared memory và host nội bộ | Một phần — WEB-01 chẩn đoán thiếu COI/SAB và cứu dữ liệu; cài đặt cá nhân không đồng nghĩa tự vận hành host |
| G-07 | AI do từng người chi trả | Chấp nhận — ACC/AI riêng, người dùng trả nhà cung cấp qua key của chính mình |
| G-08 | CSG giữa slab và lưới nhập | Chấp nhận có cổng — CSG mesh hợp lệ, metric chọn đích/tie-break và migration impVox phải chốt O-02; input hở không tự voxel/repair |
| G-09 | Budget tính toán và nhiễu raster | Một phần — Budget tính toán tách nhiễu raster và độ chính xác vật in; không nhận µm thành độ chính xác tổng hoặc ép một resolution slicer phổ quát |
| G-10 | Shaper và hợp đồng đầu vào | Chấp nhận — HarfBuzz đã vendor; thay shaper phải chứng minh tương đương đầy đủ |
| G-11 | Commit lưu trữ và tính tái lập | Chấp nhận — STO-01 một head commit atomic và canonical geometry; byte deterministic có điều kiện |
| G-12 | Registry mở rộng | Chấp nhận — EXT registry/job/artifact/adapter, mở rộng khỏi slab khi cần |
| G-13 | Công cụ, camera và tương thích slicer | Chấp nhận — Bảy công cụ; camera ≠ print transform; tương thích slicer theo version/test |
| G-14 | Ngữ nghĩa danh mục thông số | Một phần — Danh mục 126 field chứa đủ số ứng viên, còn ngữ nghĩa/dependency và migration ở O-02; không snap Z hoặc clearance ngầm. |
| G-15 | Corpus làm căn cứ tỷ lệ đạt | Chấp nhận — Mọi tỷ lệ đạt phải có corpus/hash và record thực thi; fixture lỗi có expected rejection, không đổi thành golden. |
| G-16 | Spike toolchain và Clipper2 export interface | Một phần, bác một mệnh đề — O-01 spike toolchain là cần. Bác câu Clipper2 không có C export chính thức: upstream có clipper.export.h, dẫn nguồn trong [sổ quyết định](../../specs/05-quyet-dinh-va-truy-vet.md) |
| G-17 | 3MF Core và metadata slicer | Một phần — Phân biệt Core/project metadata và reader độc lập; 3MF Core là nền của adapter, chưa thêm nút xuất thứ tám ngoài yêu cầu v1 |
| G-18 | Resolution, arc fitting và đo vật in | Một phần — Pin profile, kiểm resolution/arc-fitting/compensation qua slicer. Không ép tắt arc fitting toàn cục hoặc lấy toolpath làm đo vật in |

Các nhận định thiếu bảng thông số hoặc thiếu gói 3MF đã được bác:
danh mục 126 field và các fixture đều có trong repository. Riêng nhận định
Clipper2 không có C export cũng bị bác bằng header chính thức. Những kết
luận đó không được dùng làm căn cứ thiết kế.
