# Bằng chứng đợt phát hành vòng 3 (10-09-2026)

Chắt lọc từ phòng Hub `tmp/reviews/codex/runs/20260910-hub-release-r3/` (không đưa vào Git).
Cách chạy: `tools/development/dev-serve.mjs`, Chromium Playwright headless 1440×900, mẫu
`docs/examples/hai-mau-co-lo.svg`, tài khoản thử nghiệm. “Trước” là `48e69abc`, “sau” là commit
của đợt này trên `main`.

| Tệp | Nội dung |
| --- | --- |
| `before-size-change-strip-1440.png` / `after-size-change-strip-1440.png` | Đổi cạnh dài 45 → 40 mm. Trước: dựng lại thành công vẫn hiện “Một vấn đề cần xem — CANCELLED” (lệnh cũ bị lệnh mới chiếm nhân). Sau: không còn dải. |
| `before-save-during-build-1440.png` / `after-save-during-build-1440.png` | Bấm “Lưu dự án” trên thẻ bận trong lúc dựng lại. Trước: lượt kiểm mesh bị hủy (“chưa kiểm”), ba lỗi CANCELLED, ô số báo “Đã hủy thao tác”. Sau: kiểm mesh “đạt”, không lỗi, dự án đã lưu. |
| `before-webgl-off-1440.png` / `after-webgl-off-1440.png` | Chromium `--disable-3d-apis`. Trước: toàn bộ giao diện biến mất (ngoại lệ `WEBGL_UNAVAILABLE` không được bắt). Sau: giao diện còn nguyên, khung 3D trống có lý do, STL/ZIP/SVG vẫn xuất được. |
| `release-kernel-3mf-failure.json` | Với nhân gói 08-09, sau khi cổng 3MF mở (F-01 đã sửa), lệnh xuất 3MF Bambu thất bại `LIB3MF_TRANSACTION`, chi tiết native `READBACK_VERTICES`. |
| `dev-kernel-3mf-exported-1440.png` | Cùng luồng với nhân dựng lại từ nguồn hiện tại (kèm dung sai đọc lại trong `arch3mf.cpp`): tệp 3MF tải về, không lỗi. Nhân này chưa nghiệm thu; không phải gói phát hành. |
| `dev-kernel-3mf-readback.json` | Đọc lại 3MF bằng Python stdlib: 4 đối tượng lưới + assembly, đơn vị mm, `displaycolor` ba vật liệu đúng màu trên giao diện, `extruder` từng phần = khe, `filament_colour` theo khe, thể tích từng phần khớp ZIP STL (2.443,72 / 320,0 / 268,8 mm³). |
| `orientation-mark-top-right.svg` | Mẫu bất đối xứng của Hub: ô xanh `#0099cc` ở **góc trên phải**, ô cam `#ee7733` ở **góc dưới trái**. |
| `before-orientation-top-view-1440.png` / `after-orientation-top-view-1440.png` | “Nhìn từ trên” của mô hình dựng từ mẫu đó. Trước: xanh ở **dưới phải** (lật dọc so với nguồn). Sau: xanh ở **trên phải**, đúng nguồn. |
| `orientation-stl-readback.json` | Đọc lại ZIP STL bằng Python stdlib, trọng tâm theo diện tích từng khe. Trước: xanh `y = −5,625 mm`, cam `y = +5,625 mm`. Sau: xanh `y = +5,625`, cam `y = −5,625`; biên, số tam giác và transform xuất (đơn vị) không đổi. |
| `orientation-3mf-readback.json` | Cùng mẫu bất đối xứng, xuất 3MF Bambu bằng **nhân dựng lại** (nhân gói không xuất được 3MF). Đọc lại: màu đúng ba vật liệu trên giao diện, ô xanh ở `y +2,25…+9,0 mm` (trên) và `x 13,5…20,25` (phải), ô cam ở `y −9,0…−2,25` (dưới) và `x −20,25…−9,0` (trái) — khớp nguồn. |
| `after-3mf-failure-strip-1440.png` | Dải cảnh báo sau khi bộ ghi 3MF của gói 08-09 từ chối: câu tiếng Việt + “Mã chi tiết: READBACK_VERTICES” thay cho mã máy trần (Grok G-R3-02 đã sửa). |
| `webkit-storage-probe.json` | Vì sao bộ kiểm trình duyệt hỏng ở WebKit: phiên và `deviceId` bình thường ở cả ba engine; ở bản WebKit này `navigator.storage.getDirectory()` ném `UnknownError` nên ứng dụng từ chối mở kho (cố ý, để không tách dữ liệu ra hai nơi). Không phải kết luận về Safari thật. |
| `webkit-store-refusal-1440.png` | Chính màn hình người dùng thấy ở WebKit: trang bắt đầu mở bình thường, bấm “Tạo dự án” thì bị từ chối kèm câu giải thích mới. |
| `legacy-converted-source-canvas-1440.png` / `legacy-converted-raster.json` | Dự án cũ có SVG đã chuyển thành raster bằng bản trước (fixture của ghế Codex): điểm ảnh đã lưu bị lật và khung xem nguồn cho thấy điều đó, nhưng mô hình và ZIP STL dựng ra **đúng như bản cũ vẫn dựng** (ô xanh `y +11,25…+18 mm`). |
| `dev-kernel-3mf-prusa-slicer-info.txt` | PrusaSlicer 2.9.6 `--info` đọc đủ bốn đối tượng, `manifold = yes`, thể tích khớp (bộ đọc thứ ba, không phải slicer đích). |

Kiểm tự động của đợt: typecheck; 125 ca Node (`tests/app`, `tests/storage`, `tests/printing-app`,
`tests/domain`); `tests/app/run.ps1` Chromium (Node/types/browser đều 0). Ca hồi quy mới:
`tests/app/save-during-job.node.test.mjs`, `tests/printing-app/composition.test.mjs`, ca thêm trong
`export-controls`, `package-roundtrip`, `source-adoption.cases`.

Chưa kiểm: slicer đích (Bambu Studio, SnapmakerOrca), in thử, Firefox/WebKit trong đợt này.
