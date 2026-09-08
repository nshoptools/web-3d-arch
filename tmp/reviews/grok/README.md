# Phòng Grok

Chỉ Grok ghi trong `runs/` của phòng này. Đọc `../../../AGENTS.md` và
`../README.md`; dùng `-Seat grok` với `tools/project-env.ps1`.

Trên Windows bắt buộc dùng `tools/reviews/start-grok.ps1`; launcher tự chuẩn bị
môi trường ghế Grok. Cách gọi, tiếp tục phiên và kiểm chứng ở
[GROK-WINDOWS-ISOLATION.md](../../../docs/reviews/GROK-WINDOWS-ISOLATION.md).
Không gọi trực tiếp `grok.exe` hoặc bật native subagents/worktree.
