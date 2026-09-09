# Giữ dữ liệu tạm của Grok trong dự án trên Windows

Grok trên Windows phải được gọi qua [start-grok.ps1](../../tools/reviews/start-grok.ps1).
Launcher chuyển thư mục `/tmp` viết cứng của Grok vào phòng của phiên, đồng thời
đặt home, lịch sử phiên, đăng nhập, log và cache của Grok trong repo.
Chỉ đặt `TEMP`, `TMP`, `TMPDIR` bằng `project-env.ps1` chưa sửa được lỗi này.

Đã kiểm chứng ngày **2026-09-07** với Grok **1.0.13**, build **5e9a58528b76**,
Windows, SHA-256:

```text
bf43dc75f5478a106eab1e86d422c963e4dbe9666cf14dab363733d27bf1e672
```

Kiểm chứng lại ngày **2026-09-09** với Grok **1.0.24**, build **68e414c661e3**
(binary tự cập nhật lúc 12:56 cùng ngày), SHA-256
`4dc9038205649ec377ae37e09661e6083ee0a9776b2cc3019e7fc8dc74236ef5`: phép thử
native cùng bộ kiểm (`verify-grok-isolation.ps1 -NativeGrok`, phòng
`tmp/reviews/codex/runs/20260909-hub-grok-verify`) đạt; chưa đối chiếu từng dòng
mã nguồn upstream của bản này, chỉ xác nhận cơ chế chuyển hướng vẫn giữ dữ liệu
trong repo. Bản ghi trong
[grok-isolation-verification.json](grok-isolation-verification.json).

Danh sách binary được phép chạy nằm trong
[grok-runtime.json](../../tools/reviews/grok-runtime.json).
Đổi binary phải kiểm chứng lại; đổi model/effort theo
[cấu hình ghế](SEAT-CONFIG.md), không khóa vào mốc hiện tại.

## Nguyên nhân và những điểm cần sửa trong ghi chú ban đầu

Mã nguồn chính thức gọi `ensure_session_dir(Path::new("/tmp"), session_id)`.
Đường bắt đầu bằng dấu phân cách nhưng thiếu tên ổ đĩa được Windows giải theo
gốc ổ của **thư mục làm việc của tiến trình**. Vì vậy, chạy từ ổ D có thể tạo
`D:\tmp\sessions\<session-id>`, dù các biến temp đã trỏ vào repo.
Xem [mã Grok tại revision đã đối chiếu](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-workspace/src/session/tool_config.rs#L357)
và [quy tắc đường dẫn Windows](https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats).
Revision nguồn công khai này dùng để đối chiếu cơ chế; không khẳng định nó là
đúng revision dùng để build binary nêu trên.

Khi đo trong PowerShell, vị trí của provider (`Get-Location`) và cwd của tiến
trình (`[IO.Directory]::GetCurrentDirectory()`) có thể khác nhau. Launcher dùng
`ProcessStartInfo.WorkingDirectory` để đặt cwd thật cho tiến trình con. Phép thử
đối chiếu **đủ UUID phiên**, không suy từ tiền tố UUID hoặc số chuỗi `/tmp`
trong binary. Cơ chế này dành cho executable Windows native; MSYS2/Cygwin có
quy tắc dịch đường riêng, phải kiểm chứng riêng.

Thư mục scratch có thể chứa sản phẩm của công cụ, không được coi là rác vô hại
chỉ vì một lần đo thấy rỗng. Lịch sử phiên dưới `GROK_HOME` là dữ liệu khác;
điều đó không chứng minh rằng xóa toàn bộ `C:\tmp` hoặc `D:\tmp` là an toàn.
Các cách xóa hàng loạt hoặc tạo junction tại gốc ổ đĩa trong bản ghi chú cũ
đã được loại khỏi quy trình. Không có thao tác dọn dữ liệu ngoài repo trong
bản sửa này.

## Cách khởi chạy bắt buộc

Yêu cầu Windows, PowerShell 7 và Grok đã cài sẵn. Chạy từ gốc repo trong một
tiến trình PowerShell mới, để môi trường riêng của Grok không lưu lại trong
terminal đang dùng:

```powershell
pwsh -NoProfile -File ./tools/reviews/start-grok.ps1 -RunId 20260907-grok-review
```

Launcher tự dot-source `project-env.ps1 -Seat grok`, đọc model/effort từ
`docs/reviews/seat-config.json` và truyền cờ thực tế cho Grok. Mốc hiện hành
là `-m grok-4.6 --effort xhigh`, kèm `--no-subagents`. Không gọi `grok.exe`
trực tiếp trong dự án trên Windows, kể cả để bắt đầu lại một phiên.

Để chạy không tương tác, chuẩn bị prompt trong repo rồi dùng:

Khi nhiệm vụ đã được chủ dự án cho phép thực hiện tự động, có thể truyền
`-ApproveTools` để dùng `--always-approve`. Cờ này không mở rộng phạm vi nhiệm vụ
hoặc cho phép ghi ngoài repo; chỉ tránh chờ xác nhận tool cho công việc đã giao.

```powershell
pwsh -NoProfile -File ./tools/reviews/start-grok.ps1 -RunId 20260907-grok-review -Mode Print -PromptFile tmp/reviews/grok/runs/20260907-grok-review/inputs/review.md -MaxTurns 30 -TimeoutSeconds 1800
```

`PromptFile` tương đối được tính từ gốc repo. Khi tiếp tục, giữ nguyên `RunId`
và thêm `-Resume <UUID-đầy-đủ>`. Mỗi run giữ chữ ổ đã chọn trong
`work/grok-drive.json` để cwd của lịch sử phiên ổn định. Nếu chữ ổ đó đang
được phiên khác sử dụng, launcher dừng; đóng phiên liên quan hoặc dùng run mới,
không tự tháo ổ của công cụ khác.

`-Mode Version`, `-Mode Help`, `-Mode Inspect` và `-Mode Models` cũng dùng môi
trường này. `Models` liệt kê model khả dụng qua CLI đã cô lập, không gửi suy luận.
`reports/grok-launch.json` ghi hash binary, model/effort **được yêu cầu**, cwd
và exit code; đây chưa phải bằng chứng model thực tế đã xử lý một bài review.
Vẫn phải kiểm chứng metadata phiên theo [SEAT-CONFIG.md](SEAT-CONFIG.md).

## Đường dẫn thực tế

Gọi `R` là gốc repo, `S` là `R\tmp\reviews\grok\runs\<RunId>`.
Launcher chọn một chữ ổ trống từ Z đến Q, ví dụ Z, và ánh xạ tạm ổ đó vào
`S\work\grok-drive`. Mọi thư mục vật lý được tạo nằm trong repo:

| Đường Grok dùng | Đích vật lý |
| --- | --- |
| Cwd `Z:\project` | `R`, qua một junction nằm trong `S\work\grok-drive` |
| `/tmp/sessions/<UUID>` → `Z:\tmp\sessions\<UUID>` | `S\work\grok-drive\tmp\sessions\<UUID>` |
| `/var/tmp` → `Z:\var\tmp` | `S\work\grok-drive\var\tmp` |
| `TEMP`, `TMP`, `TMPDIR` | `S\temp` |
| `GROK_HOME`, `GROK_AUTH_PATH` | `S\cache\grok\home`, tệp `auth.json` bên trong |
| `GROK_WORKSPACE_HOME`, `GROK_LOG_FILE` | `S\cache\grok\workspace`, `S\evidence\grok.log` |
| `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` | `S\cache\grok\profile` và các thư mục con |

Cache của npm, Python và các công cụ khác kế thừa `project-env.ps1`.
Cấu hình output/profile riêng vẫn bắt buộc với công cụ không đọc các biến đó.

Ánh xạ dùng `DefineDosDevice`, không sửa registry, PATH hay binary và không tạo
`C:\tmp`/`D:\tmp`. Đây là tên ổ tạm **trong phiên đăng nhập Windows**, có thể
được tiến trình khác cùng phiên đăng nhập nhìn thấy; không phải ổ riêng chỉ
một tiến trình biết. Xem [API DefineDosDevice](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-definedosdevicea).

Launcher kiểm tra đích vật lý, từ chối junction/symlink không mong đợi trên
đường output, khóa độc quyền từng run và không lấy chữ ổ đang có người dùng.
Junction `project` là ngoại lệ có kiểm tra, chỉ trỏ lại chính repo. Không quét
theo liên kết trong `tmp/`, tránh vòng lặp quay về repo.

Khi kết thúc hoặc lỗi, Windows job dừng tiến trình con còn lại, launcher gỡ
riêng junction và ánh xạ đúng đích đã tạo, không xóa nội dung phiên. Nếu launcher
bị kết thúc cưỡng bức, lần gọi lại cùng run xử lý ánh xạ sót sau khi lấy được khóa
và đối chiếu chính xác đích. Nếu đích đã thay đổi thì dừng để kiểm tra, không
xóa đệ quy hoặc gỡ ánh xạ lạ.

## Đăng nhập và giới hạn vận hành

Nếu chưa có đăng nhập trong run, launcher đọc tệp đăng nhập hiện có và **sao chép**
vào `cache/grok/home/auth.json`; token refresh ghi vào bản trong run.
Không trỏ `GROK_AUTH_PATH` về tệp gốc vì Grok có thể cập nhật tệp đó.
`-NoAuthImport` bỏ bước sao chép; nếu dùng `GROK_AUTH` có sẵn trong môi trường,
Grok vẫn có thể đọc nó. Launcher không in thông tin đăng nhập.
Nội dung run được Git ignore, nhưng cache/log vẫn có thể chứa dữ liệu nhạy cảm:
không thêm cưỡng bức vào Git hoặc đính kèm nguyên phòng phiên vào báo cáo.
Xem [phạm vi cấu hình Grok](https://docs.x.ai/build/settings) và
[cơ chế lưu auth](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-shell/src/auth/manager.rs).

Tự cập nhật bị tắt bằng `GROK_DISABLE_AUTOUPDATER=1`. Các override kế thừa có thể
đổi config/output hoặc chạy auth helper cũng bị loại khỏi tiến trình con.
Không chạy installer của hãng trong phiên review vì nó có thể ghi home/PATH.

Native subagents bị tắt và launcher không cung cấp chế độ worktree: những đường
khởi chạy này có thể tạo Grok con với cwd đã chuẩn hóa về ổ thật, làm mất cơ chế
chuyển hướng `/tmp`. Khi được phép gọi thêm ghế, mỗi ghế cần launcher và run
riêng. Trong shell của Grok, dùng `PROJECT_ROOT` và `PROJECT_REVIEW_RUN` tuyệt
đối khi gọi script, không tự gọi Grok mới từ đường repo trên ổ thật.

**Đây là chuyển hướng đường dẫn, không phải sandbox hệ điều hành.** Nó xử lý
lỗi `/tmp` đã đo và các vị trí dữ liệu được cấu hình của bản Grok đã kiểm chứng.
Một lệnh shell ghi rõ đường ngoài repo, công cụ bỏ qua biến môi trường, MCP/plugin
có output riêng hoặc binary mới đổi cơ chế vẫn có thể vượt phạm vi. Tuân thủ
`AGENTS.md`; nếu không kiểm soát được đầu ra thì dừng công cụ đó.
Phép thử dưới đây không phải giám sát mọi lần ghi trên toàn máy.

## Kiểm chứng và nâng cấp

Từ gốc repo, người kiểm chứng dùng **phòng của chính mình**:

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260907-grok-temp-isolation
./tools/reviews/verify-grok-isolation.ps1 -NativeGrok
./tools/verify-project-env.ps1
```

Đổi `Seat`/`RunId` theo người thực hiện. Phép thử cần Python native đã cài sẵn,
không cài thêm dependency. Bỏ `-NativeGrok` chỉ kiểm tra phần chuyển hướng và
vòng đời tiến trình; chưa đủ để chấp nhận một build Grok.

Phép thử native chỉ gửi ACP `initialize` và `session/new`, **không gửi prompt
suy luận**. Nó lấy UUID đầy đủ do Grok trả về, kiểm tra thư mục cùng UUID nằm
trong run, không có tại `C:\tmp`, `D:\tmp` hoặc gốc ổ thật chứa repo, đồng thời
kiểm tra tệp đăng nhập gốc không đổi. Kiểm tra bổ sung gồm ghi tệp `/tmp` từ
tiến trình native, alias repo, exit code, timeout, dừng tiến trình cháu giữ stdout,
khóa run, dọn ánh xạ, khôi phục
run bị ngắt và từ chối traversal/junction lạ.

Kết quả đã chắt lọc: [grok-isolation-verification.json](grok-isolation-verification.json).
Log thô và thông tin phiên nằm trong `evidence/` của run, không đưa vào Git.

Khi Grok phát hành binary mới:

1. Đọc thay đổi nguồn chính thức về cwd, scratch, auth, updater và tiến trình con.
   Xác định trước rằng phép thử vẫn giữ đầu ra trong repo; không chạy thử mù
   một binary chưa hiểu cách ghi dữ liệu. Không nới hash whitelist để né lỗi.
2. Nếu cơ chế vẫn tương thích, chạy kiểm chứng trong run mới, gồm `-NativeGrok`,
   và kiểm tra launcher với `-Mode Version` sau khi chấp nhận hash mới.
3. Chỉ cập nhật `grok-runtime.json`, bằng chứng và tài liệu cùng lượt khi kết quả
   đạt. Nếu upstream sửa đúng đường temp, ưu tiên bỏ workaround sau khi kiểm chứng
   lại đường dữ liệu và mọi chế độ được cho phép.
4. Model/effort có lựa chọn mạnh hơn được cập nhật riêng theo `SEAT-CONFIG.md`.
   Không suy rằng tăng model hoặc tăng số phiên bản tự bảo đảm cô lập đường ghi.

Hướng dẫn và tệp bằng chứng trong thư mục này mô tả đầy đủ cơ chế, điều kiện
kiểm chứng và giới hạn của launcher; không cần tài liệu soạn thảo bổ sung.
