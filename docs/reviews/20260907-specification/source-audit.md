# Thẩm định dữ liệu đóng gói

Ấn bản ngày **2026-09-08**. Sáu đầu vào bền được định danh bằng ID, đường dẫn,
byte length và SHA-256 trong [manifest](../../specs/source-manifest.json).
Chúng gồm danh mục 126 thông số, hai cấu hình slicer, hai gói 3MF và danh mục
bàn in. Mỗi tệp cần thiết để tái lập bằng chứng đều có trong repository.

Dữ liệu tham khảo không phải căn cứ chính xác tuyệt đối. Audit thành công chỉ
chứng minh các điều được đo bên dưới; quy tắc thiết kế nằm trong đặc tả và các
cổng kiểm chứng. Lỗi đã biết vẫn được giữ như ca thử âm, không sửa mẫu để tạo
ấn tượng mọi đầu vào đều hợp lệ.

## Phương pháp và cách tái lập

- Kiểm byte length/SHA-256 của toàn bộ sáu tệp; thiếu tệp bắt buộc là lỗi đóng gói.
- JSON: parse, phát hiện khóa trùng và số không hữu hạn. Cấu hình JS chỉ được
  trích một JSON literal; không import/eval và không thực thi G-code.
- Danh mục: đủ ID duy nhất, type/domain/step của default; kiểm tương tự các giá
  trị trong năm modeDefaults có sẵn. Chưa chứng minh dependency hay công thức hình học.
- 3MF: giới hạn ZIP, đường dẫn/entry/CRC, XML, hash payload, số object/vertex/
  triangle, index và incidence cạnh theo chỉ số, bounds và metadata. Không giải
  nén ra đĩa, không mở slicer, không chạy máy in.
- Kiểm riêng mẫu U1 còn thể hiện lỗi tham chiếu filament 5/6. Đây là xác nhận
  phát hiện âm; không phải kết quả tương thích slicer đạt.

Kết quả cụ thể ở [source-audit.json](source-audit.json),
[parameter-audit.json](parameter-audit.json) và [verification.json](verification.json).
Từ gốc repo, với Python 3.10+ và PowerShell 7 đã cài:

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId audit-permanent-inputs
python -B ./tools/reviews/audit-spec-sources.py
```

[Script audit](../../../tools/reviews/audit-spec-sources.py) dùng Python stdlib.
Nó chỉ đọc các đường dẫn bền trong manifest và ghi báo cáo vào phòng của lần
chạy đã cấu hình. Exit 0 nghĩa các phép audit khai báo đạt; exit 1 khi thiếu,
đổi byte, parse lỗi hoặc ca âm không còn thể hiện lỗi dự kiến. Không tự dựng lại
input thiếu, không cài dependency, không dùng log của phiên trước làm đầu vào.

## Phát hiện và hệ quả

| ID đầu vào / phép đo | Kết quả và giới hạn | Hệ quả chính thức |
| --- | --- | --- |
| `parameters-core-v1` | 126 field: 94 slider, 22 checkbox, 10 select; đủ năm bộ giá trị theo sản phẩm | [Danh mục đầy đủ](../../specs/parameters-reference.json) là dữ liệu ứng viên; O-02 chặn sinh schema trước thẩm định ngữ nghĩa |
| Nhóm Khối nhập | 10 field dữ liệu + hai vị trí cùng lệnh Áp dụng + một input file = 13 control | Tổng 129 control không đồng nghĩa 129 tham số hình học |
| `printer-beds-reference-v1` | 1.057 record; metadata tự khai PrusaSlicer 2.9.6; chưa có khóa nguồn upstream được xác minh | Cần revision/license, polygon, vùng cấm, Z và kiểm slicer trước promote profile |
| `bambu-settings-v1` | 582 key; version 02.08.02.60; printer P1S 0.4 nhưng tên print settings có X1C; mảng khác độ dài | Không suy máy từ một nhãn, không resize mọi mảng cùng độ dài |
| `u1-settings-v1` | 549 key; version 2.2.1; bốn nozzle 0.4 và bốn filament | Cấu hình literal chưa là gói 3MF hoặc bằng chứng roundtrip |
| First layer trong hai cấu hình | Bambu 0,16 mm; U1 0,25 mm; lớp thường 0,20 mm | GEO-02 dùng layer schedule; không mặc định mọi Z=n×h |
| Hai đầu vào `project-3mf` | Mỗi gói có sáu mesh object, 78.928 vertex, 157.824 triangle; index hợp lệ, mỗi indexed edge có incidence 2 | Chưa kiểm vertex manifold, self-intersection, thể tích giao hoặc fit |
| Payload `3D/Objects/object_1.model` | Hai gói cùng hash `67faa754111f2b0504e66b10897a60e10d09d2e5e121c54d7a1f735e7cad3265` | Một ca hình học, hai ca adapter; không tính hai oracle hình học độc lập |
| `u1-project-invalid-slots-v1` | Metadata tham chiếu extruder 1–6; bảng project chỉ khai bốn filament/nozzle | Mapping nội bộ invalid; cấm làm golden U1, cần remap có bằng chứng hoặc mẫu sạch |
| `bambu-project-reference-v1` | Chưa có roundtrip/slice/print đã xác minh | Chỉ là mẫu tham khảo adapter, không là golden đã phê chuẩn |

Không suy số filament từ số nozzle cho mọi máy: một đầu in có thể đổi nhiều
filament. Phát hiện U1 dựa trên bảng filament của chính gói và metadata tham
chiếu. Chưa mở slicer nên không kết luận nó sẽ crash, tự remap hoặc in sai theo
một cách cụ thể. [Phân loại mẫu](sample-qualification.json) ghi đầy đủ việc dùng
được phép và bị cấm.

## Bảo toàn và giới hạn

Byte của fixture được giữ cố định theo manifest. Manifest cấu hình slicer có
metadataRevision 2: thay phần mô tả nguồn và phạm vi sử dụng, không đổi hai JSON
literal. Các dữ liệu in 3D nằm trong corpus printing-reference-v1 riêng. Không
sửa fixture lỗi thành kỳ vọng mới tại chỗ; mẫu sạch cần phiên bản, provenance
và phép kiểm độc lập.

Quyền phân phối upstream, kích thước phần cứng, số máy thực sự hỗ trợ, tính đúng
hình học và fit vật in chưa được chứng minh bằng parse. Dữ liệu chỉ dùng nội bộ
cho phát triển/kiểm thử, không tự đưa vào bundle website. Mọi tỷ lệ hỗ trợ hoặc
kết luận in thành công phải có corpus, version và evidence riêng. O-01–O-06 và
G1–G6 giữ các phép đo còn thiếu; kết quả audit không tự đóng các cổng đó.
