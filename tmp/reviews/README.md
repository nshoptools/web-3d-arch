# Các phòng review độc lập

**Chỉ đạo hiện hành ngày 2026-09-08: ngừng sử dụng Opus.** Hub/Codex/Grok
tiếp tục dự án. Không gọi, tiếp tục, fork hoặc giao agent con Opus; không tự
khởi động lại khi quota reset. Giữ phòng/bằng chứng Opus cũ để thẩm định.

Trước khi gọi hoặc tiếp tục một ghế, đọc [cấu hình model/effort hiện hành](../../docs/reviews/seat-config.json)
và [quy tắc áp dụng, kiểm chứng, cập nhật](../../docs/reviews/SEAT-CONFIG.md).
Người gọi phải áp dụng cấu hình thật trong CLI/giao diện/công cụ điều phối;
ghế review ghi cấu hình đã xác minh vào báo cáo. Không âm thầm dùng mặc định
hoặc hạ cấu hình. Kiểm tra lựa chọn mới mạnh hơn trước mỗi đợt review theo
quy tắc cập nhật, không coi cấu hình hiện tại là cố định vĩnh viễn. Riêng Opus,
yêu cầu chủ dự án ngày 2026-09-08 bắt buộc **Max / Fast off cho mọi lượt gọi**,
kể cả triển khai và tiếp tục phiên cũ; không tự đổi ràng buộc này khi nâng cấp.
Dùng `tools/agents/start-opus.ps1` để áp dụng cấu hình và cô lập thực tế.

| Ghế | Phòng ghi riêng |
| --- | --- |
| Gemini | `gemini/runs/<ma-phien>/` |
| Grok | `grok/runs/<ma-phien>/` |
| Opus / Claude | `opus/runs/<ma-phien>/` |
| Codex | `codex/runs/<ma-phien>/` |

Từ gốc repo, bắt đầu phiên PowerShell bằng:

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260905-font-assets
```

Thay ghế và mã phiên tương ứng. Lệnh tạo sáu thư mục trong phiên và chuyển
TEMP/cache về đó. Dot-source lại trong mỗi tiến trình PowerShell mới.

Riêng Grok native trên Windows, khởi chạy bằng `tools/reviews/start-grok.ps1`;
launcher tự gọi `project-env.ps1 -Seat grok`. Đọc
[quy trình cô lập Grok](../../docs/reviews/GROK-WINDOWS-ISOLATION.md) trước khi
chạy: chỉ đổi TEMP không giữ được đường `/tmp` viết cứng trong repo.

| Thư mục của phiên | Nội dung |
| --- | --- |
| `inputs/` | Phạm vi, revision/hash đầu vào, bản chụp cần đối chiếu |
| `work/` | Script/thử nghiệm, bản tải về và bản giải nén tạm |
| `evidence/` | Output kiểm tra, log, screenshot gắn với phát hiện |
| `reports/` | Kết luận theo mẫu `docs/reviews/REVIEW-TEMPLATE.md` |
| `cache/` | Cache riêng của công cụ |
| `temp/` | TEMP/TMP/TMPDIR của tiến trình |

Mỗi ghế tự đọc cùng phạm vi và xác minh độc lập. Không ghi/xóa trong phòng ghế
khác, không dùng chung cache hay hồ sơ trình duyệt, không đọc kết luận của họ
trước khi hoàn thành kết luận của mình. Các port/server nếu dùng phải riêng.
`.toolchain/` chứa dependency dùng chung đã pin; khi review chỉ đọc bộ này.
Nếu cần thử phiên bản khác, tạo môi trường trong `work/` của phiên mình và
trỏ công cụ/cache về đó, không thay dependency làm ảnh hưởng ghế đang review.
Ghi revision hoặc hash khi repo chưa có commit, cùng lệnh và exit code.
Phát hiện phải có vị trí, tác động và bằng chứng; không khẳng định đã chạy kiểm
tra nếu chưa chạy. Review chỉ đọc mã sản phẩm trừ khi được giao sửa.

Hướng dẫn và khung `runs/.gitkeep` không bị ignore, sẵn sàng đưa vào Git.
Nội dung từng phiên được ignore.
Bằng chứng cần lưu lâu dài được chắt lọc vào `docs/reviews/` hoặc `docs/assets/`.
Khung thư mục là quy ước phối hợp, không phải sandbox quyền hệ điều hành.
