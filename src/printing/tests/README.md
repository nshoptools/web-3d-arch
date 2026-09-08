# Unified printing implementation regressions

Chạy tools/test.ps1 theo [BUILD](../docs/BUILD.md). Mọi output/profile/cache trong
ownrun; browser dùng route allowlist trên loopback 127.0.0.1 và chặn origin khác.

| Kiểm wave2 | Kết quả/phạm vi |
| --- | --- |
| unified-native.rs | 3 exports từ main kernel, generation rejection, primary và reader lifetime, HB version 14.4.0; native static |
| contracts + wasm-node | 13 nhóm node:test: API flat trong unified Module, invalid mesh/material/U1, lịch .16/.20 và .25/.20, multicolor normalization, ZIP/XML hostile |
| unified-checks + unified-node | 7 nhóm: injected Module, HB shaping, heap growth, lease/error/repeat, adapters, actual arch_build_svg cube |
| unified-browser | 7 nhóm × Chromium 153.0.8010.12 / Firefox 155.0 / WebKit 26.6; một WASM instantiation mỗi Worker |
| unified-oracle.py | 19 output từ native/Node/browser; trimesh, bounds/volume/area/topology và oracle lỗ |
| oracle.py | 8 output regression flat API qua cùng Module |
| verify-schema.ps1 | 27 output, Core XSD gốc + System.Xml 10.0.11 |
| source/static/package audits | toàn bộ source pins, 473 pthread compile commands, C++ exceptions, ar timestamps, native PE imports, bundle không chứa fixture |

Native hole: outer 20×10 trừ 4×4, dày 2 → V368/A520/Euler0.
Seam: hai part 10×10×2 → tổng V400/A560.
T-junction: 10×10×2 và hai part 10×5×2 → V400/A600.
Production SVG cube 10 mm → V1000/A600.
27 tệp là những lượt xuất lặp tập hình giải tích, không phải 27 oracle độc lập.

Fixture bền tests/fixtures/{printing-reference,slicer-profiles}/v1 được parse
ZIP/JSON literal, không eval JS/G-code. U1 inconsistent-slots: 6 part references/
4 slots là negative. Hai 3MF reference chia sẻ geometry nên chỉ là một nguồn.
Test profile/Inter font là input nội bộ của harness, không đi vào production.

Các harness native DLL/browser standalone và slicer trong package được giữ từ
wave1 để đối chiếu; không chạy trong runner wave2 và không cộng lại vào số pass.
U1 CLI không chạy; Bambu wave1 giữ hai analytic dry slice đã khai. Không full
G5/G6/physical fit, general intersection, production UI gate hoặc importer pass.
