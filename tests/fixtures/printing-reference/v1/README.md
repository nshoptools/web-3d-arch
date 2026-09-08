# Fixture in 3D — phiên bản 1

Ba tệp trong thư mục này là đầu vào bền vững của bộ kiểm. Chỉ dùng nội bộ;
không đưa vào bundle sản phẩm khi chưa xác minh quyền phân phối.
[Manifest](manifest.json) ghi ID, byte length, SHA-256, mục đích và giới hạn.

| Tệp | Dùng để kiểm | Trạng thái |
| --- | --- | --- |
| [bambu-project.3mf](bambu-project.3mf) | Đọc gói project, geometry và metadata Bambu | Chưa roundtrip slicer/in |
| [u1-inconsistent-slots.3mf](u1-inconsistent-slots.3mf) | Từ chối mapping extruder 1–6 khi chỉ có 4 filament | Mapping invalid; cấm làm golden U1 |
| [printer-beds.json](printer-beds.json) | Parse 1.057 record, kế thừa và polygon bàn in | Danh mục tham khảo, chưa chứng nhận máy |

Hai gói 3MF có cùng payload mesh gồm 6 object, 78.928 vertex, 157.824 triangle;
đó là một ca geometry và hai ca adapter. SHA-256 của payload
3D/Objects/object_1.model là
`67faa754111f2b0504e66b10897a60e10d09d2e5e121c54d7a1f735e7cad3265`.
Không xem CRC/index/edge count là chứng minh manifold, khả năng slice hoặc fit.

Metadata bàn in tự khai PrusaSlicer 2.9.6; generator/revision và quyền upstream
chưa được xác minh. Mục có polygon chỉ chứng minh dữ liệu khai hình dạng, không
chứng minh máy đó đang được ứng dụng hỗ trợ. Parser phải đọc dữ liệu tại đây;
không chạy đường generator hoặc G-code ghi trong metadata.

Tái kiểm bằng tools/reviews/audit-spec-sources.py sau khi chuẩn bị project-env.
Kết quả được phân biệt theo cấu trúc, mapping, mesh, slicer và vật in.
