# Hồ sơ thẩm định đặc tả web-3d-arch

Review độc lập ngày **2026-09-07**; ấn bản tự chứa ngày **2026-09-08**, tương ứng
[bộ đặc tả 1.0.1](../../specs/README.md). Đường cơ sở có tám tài liệu nội dung,
55 điều khoản, 30 quyết định và 40 chiến dịch/113 phép kiểm nghiệm thu dự kiến.
Mục tiêu là website nội bộ: owner quản lý thành viên, mỗi người tự cài đặt và
chi trả AI; kiến trúc có hợp đồng mở rộng xử lý và tạo tệp in 3D.

Các hồ sơ bên dưới trình bày nội dung, quyết định, dữ liệu kiểm và giới hạn
ngay trong bộ bàn giao. Mọi đầu vào cần tái kiểm đều nằm trong
[manifest dữ liệu bền](../../specs/source-manifest.json), gồm sáu tệp. Tài liệu
không yêu cầu khôi phục một phiên làm việc hay mở ghi chú soạn thảo để hiểu.

## Hồ sơ kiểm chứng

| Hồ sơ | Nội dung |
| --- | --- |
| [Thẩm định dữ liệu](source-audit.md) | Sáu đầu vào bền, phương pháp, 126 field, lỗi U1 và giới hạn |
| [Kết quả audit](source-audit.json), [audit thông số](parameter-audit.json) | Hash/parse/ZIP/XML và type/domain/step của dữ liệu đóng gói |
| [Phân loại mẫu 3MF](sample-qualification.json) | Mục đích cho phép/cấm; không có golden slicer đã được công nhận |
| [Người biên tập vòng 1](editor-round1.md) | Bản tổng hợp kết luận tự thu thập |
| [Opus vòng 1](opus-round1.md), [Grok vòng 1](grok-round1.md) | Bản biên tập 19 và 18 phát hiện, kèm cách xử lý |
| [Phân xử vòng 1](disposition-round1.md) | Chấp nhận, chấp nhận một phần hoặc bác bỏ bằng lý do cụ thể |
| [Opus vòng 2](opus-round2.md), [Grok vòng 2](grok-round2.md) | Bản biên tập tám phát hiện mỗi ghế |
| [Phân xử vòng 2](disposition-round2.md) | Logout, oracle, lịch lớp, CSG, policy/quotas và mapping 3MF |
| [Metadata ghế](seat-evidence.json) | Cấu hình yêu cầu, metadata quan sát và phần chưa xác minh |
| [Kết quả kiểm bàn giao](verification.json) | Baseline, audit và kiểm trong bản sao chỉ có đầu vào bền |
| [Manifest bàn giao](final-manifest.json) | Byte length và SHA-256 các tài liệu, test, fixture và công cụ hiện hành |

Các ghế tự kết luận trước khi người biên tập phân xử. Vòng hai là kiểm lại
độc lập những phần đã hiệu đính. Các báo cáo công bố tại đây là **bản tổng hợp
đã biên tập**, giữ ID phát hiện, nội dung và quyết định; không phải transcript
nguyên văn. Việc biên tập ngày 2026-09-08 không được tính thành một vòng review
mới hoặc một phê chuẩn bổ sung. Hash bàn giao định danh ấn bản hiện hành,
không khẳng định đây là toàn bộ byte mà các ghế đã đọc ở hai vòng trước.

## Cấu hình ghế và giới hạn

Áp [seat-config.json](../seat-config.json) và [SEAT-CONFIG.md](../SEAT-CONFIG.md)
ngày 2026-09-07; đối chiếu lại nguồn chính thức trước hai vòng. Không sửa cấu
hình toàn máy, không cài/nâng CLI. Mọi profile/cache/log của lượt này ở repo.

| Ghế | Yêu cầu | Quan sát thực | Kết luận cấu hình |
| --- | --- | --- | --- |
| Người biên tập Codex | gpt-6-astra, max, fast off | Phiên điều phối không có metadata đủ chứng minh effort/fast | Không tính là một review Codex đạt cấu hình |
| Opus | opus, ultracode, fast off | CLI 2.1.263; init/model chính claude-opus-5; fast off; cờ ultracode + env xhigh; toolset không có Workflow | Không xác minh đầy đủ Ultracode/workflows; không tính đạt cấu hình |
| Grok | grok-4.6, xhigh | Launcher/binary 1.0.13 đã pin; session reasoning_effort=xhigh; modelUsage grok-4.6-build | Chưa có bằng chứng tương đương tên -build với model yêu cầu; không tính đạt cấu hình |

Opus vòng 1 còn ghi modelUsage của `claude-haiku-4-5-20251001` ngoài model
chính; không giấu metadata phụ này hoặc coi mọi token đều từ Opus. Toolset vòng
đầu có WebFetch, nhưng dữ liệu hiện có chưa đủ gán chắc nguyên nhân auxiliary
usage; nhận xét cuối của ghế và evidence cấu hình được phân loại riêng.

Grok lượt khởi động đầu dừng `cancelled`, không được tính review hoàn tất;
lượt resume kết thúc `end_turn`. Người biên tập đã báo giới hạn cấu hình trước
review, không hạ cấu hình ngầm. Kết quả phản biện được dùng như nhận xét cần
thẩm định, **không tuyên bố ba ghế đã phê chuẩn đạt cấu hình**.

Nguồn đối chiếu: [Claude model/Ultracode](https://code.claude.com/docs/en/model-config),
[dynamic workflows](https://code.claude.com/docs/en/workflows),
[fast mode](https://code.claude.com/docs/en/fast-mode),
[Grok 4.6](https://docs.x.ai/developers/grok-4-6),
[Grok CLI](https://docs.x.ai/build/cli/reference),
[Codex models](https://learn.chatgpt.com/docs/models),
[Codex speed](https://learn.chatgpt.com/docs/agent-configuration/speed).
Fable mới có trong tài liệu nhưng quyền dùng thực tế/chế độ credit chưa được
xác minh; Ultra orchestration không tự được coi là nâng effort của cùng một
review Codex. Giữ cấu hình hiện hành, ghi điều chưa biết; không tự mua quyền dùng.

## Phạm vi kết luận

Kiểm tài liệu chứng minh tính nhất quán của ID, liên kết, dữ liệu đóng gói và
các suite đã triển khai. Không triển khai UI, nhân mesh, AI thật, adapter slicer
hoặc in thử trong đợt này. “Chính thức” xác định nơi quản lý yêu cầu, không cấp
chứng nhận sản phẩm. **40 chiến dịch/113 check sản phẩm vẫn unverified**.

O-01 toolchain/ABI, O-02 ngữ nghĩa thông số, O-03 đo vật thật, O-04 benchmark,
O-05 nhà cung cấp/vận hành và O-06 slicer/profile được định nghĩa đầy đủ trong
[sổ quyết định](../../specs/05-quyet-dinh-va-truy-vet.md). Mỗi cổng chỉ chặn phần
triển khai hoặc nhãn chất lượng phụ thuộc vào nó. Giới hạn cấu hình ghế vẫn
được giữ nguyên; không tuyên bố ba ghế đã phê chuẩn đạt cấu hình.
