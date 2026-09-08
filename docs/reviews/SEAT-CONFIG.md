# Cấu hình bắt buộc cho các ghế AI

Nguồn giá trị hiện hành: [seat-config.json](seat-config.json), cập nhật ngày
2026-09-08 theo yêu cầu của chủ dự án. Đây là cấu hình chung của dự án để
người hoặc công cụ gọi ghế đọc và áp dụng. Các CLI không tự nạp tệp JSON này;
launcher của dự án đọc nó rồi truyền model/effort thành cờ dòng lệnh.
Quy tắc áp dụng được dẫn từ [AGENTS.md](../../AGENTS.md).

| Ghế | Mô hình | Effort / chế độ | Chế độ nhanh |
| --- | --- | --- | --- |
| Codex | `gpt-6-astra` | `max` | Tắt |
| Opus / Claude — **ngừng gọi** | `opus` (lưu cấu hình) | `max` (lưu cấu hình) | Tắt |
| Grok | `grok-4.6` | `xhigh` | Theo lệnh bên dưới; chưa có yêu cầu riêng |

## Khi gọi hoặc tiếp tục một ghế

**Chỉ đạo mới nhất ngày 2026-09-08: không tiếp tục gọi hoặc sử dụng Opus.**
Opus đã hết hạn mức; Hub/Codex/Grok tự phân chia để tiếp tục hoàn thành dự án.
`invocations_enabled: false` chặn launcher trước khi chạy Claude. Không tự mở
lại khi quota reset; cần chỉ đạo mới của chủ dự án. Giữ nguyên hồ sơ lịch sử.
Các yêu cầu Max/Fast off sau đây chỉ là cấu hình được giữ nếu được phép dùng lại.

Với Opus, quy tắc áp dụng cho **mọi lượt gọi trong dự án**, gồm phát triển,
review, tiếp tục phiên cũ, fork và agent con. Effort Max và Fast off là ràng buộc
của chủ dự án, không được tự thay bằng chế độ khác theo chính sách nâng cấp.
Các prompt hoặc phiên lưu trước ngày cập nhật không ghi đè ràng buộc này.

1. Đọc cấu hình hiện hành trước mỗi đợt review, kể cả khi tiếp tục, fork hoặc
   giao review cho agent con. Người gọi phải truyền model, effort và thuộc tính
   cần thiết bằng thiết lập thật của công cụ; ghi chúng trong prompt là chưa đủ.
2. Chuẩn bị phòng riêng và môi trường theo [hướng dẫn review](../../tmp/reviews/README.md).
   Trước khi chạy CLI, đặt cả thư mục profile, log và cache của CLI trong repo.
   Các lệnh dưới đây chỉ thể hiện phần chọn cấu hình, không thay bước cô lập đó.
3. Đối chiếu cấu hình thực tế từ giao diện chọn model, thông tin phiên hoặc
   metadata của công cụ. Cấu hình của phiên đang mở, cờ dòng lệnh, biến môi trường
   và chính sách quản trị có thể ghi đè mặc định. Kiểm tra lại khi resume/fork.
4. Ghi model thực tế (kể cả model mà alias `opus` trỏ đến), effort, trạng thái
   fast mode, phiên bản công cụ, ngày cấu hình và bằng chứng trong báo cáo.
   Không tự nhận đã xác minh dựa trên tên ghế hoặc nội dung prompt.
5. Nếu không chọn được hoặc không xác minh được cấu hình yêu cầu, báo rõ ghế
   nào bị vướng và nguyên nhân trước khi review. Không âm thầm dùng model yếu
   hơn, giảm effort hoặc bật fast mode; không coi kết quả đó là review đạt cấu hình.

Quy tắc này không tự khởi chạy các ghế. Chỉ gọi ghế khi có nhiệm vụ được cho phép;
các ghế vẫn tuân thủ quy tắc review độc lập và phạm vi được giao.

## Áp dụng theo công cụ

### Codex

Chọn model `gpt-6-astra`, reasoning effort `max` và tốc độ Standard / Fast off
trong công cụ gọi ghế. Với CLI, phần chọn model và effort là:

```powershell
codex -m gpt-6-astra -c 'model_reasoning_effort="max"'
```

Trong CLI, dùng `/fast off` và kiểm tra `/fast status` trước khi giao việc.
Với giao diện/API điều phối, truyền model và effort tương ứng, đồng thời kiểm
tra điều khiển tốc độ của chính giao diện đó. Nếu công cụ không có khả năng
chọn hoặc xác minh tốc độ, không mặc nhiên kết luận fast mode đã tắt.
Xem [cấu hình Codex](https://learn.chatgpt.com/docs/config-file/config-reference)
và [điều khiển tốc độ](https://learn.chatgpt.com/docs/agent-configuration/speed).

### Opus / Claude

**Đang ngừng. Không thực thi các lệnh Opus.** Phần dưới lưu cách cấu hình cho
trường hợp được chủ dự án cho phép sử dụng lại sau này.

Luôn dùng [launcher Opus của dự án](../../tools/agents/start-opus.ps1), kể cả
khi tiếp tục phiên cũ. Launcher cô lập profile/cache/log và áp dụng:

```powershell
$env:CLAUDE_CODE_DISABLE_FAST_MODE = '1'
$env:CLAUDE_CODE_EFFORT_LEVEL = 'max'
# Phần chọn cấu hình bên trong launcher; không chạy CLI trực tiếp:
claude --model opus --effort max
```

Launcher đặt `fastMode: false`, `ultracode: false` trong settings của lượt gọi,
đồng thời ép biến môi trường nêu trên và cờ `--effort max`. Không ghi
`effortLevel: "max"` vào settings: Claude Code không nhận `max` ở cấu hình
lưu bền; phải dùng CLI hoặc biến môi trường. Giá trị môi trường `max` cũng
áp dụng cho agent con và ngăn chế độ Ultracode dùng lại cấu hình `xhigh` cũ.

Launcher từ chối chạy nếu JSON không yêu cầu đúng `max` và `fast_mode: false`.
Khi resume, launcher áp dụng lại toàn bộ cờ và môi trường, không tin cấu hình
effort đã lưu. Hồ sơ `launch.json` ghi cấu hình yêu cầu, biến môi trường,
phiên bản/hash CLI và lệnh thực tế; vẫn phải kiểm chứng metadata runtime.
Chính sách quản trị có thể giới hạn effort, nên không coi cờ dòng lệnh là
bằng chứng model đã thực thi đúng Max. Nếu bị giới hạn, báo rõ thay vì tự hạ
cấu hình hoặc chấp nhận review như đã đạt yêu cầu.

Đối chiếu ngày 2026-09-08 với [model và effort](https://code.claude.com/docs/en/model-config#adjust-effort-level)
và [tắt Fast mode](https://code.claude.com/docs/en/fast-mode). Các hồ sơ lịch sử
vẫn giữ effort đã thực sự yêu cầu/chạy; chúng không phải cấu hình cho lượt mới.

### Grok

Trên Windows, dùng launcher đã xử lý đường `/tmp` viết cứng, từ gốc repo:

```powershell
pwsh -NoProfile -File ./tools/reviews/start-grok.ps1 -RunId 20260907-grok-review
```

Launcher tự chuẩn bị môi trường ghế Grok và truyền cấu hình hiện hành
`-m grok-4.6 --effort xhigh`, kèm `--no-subagents`. Khi tiếp tục dùng cùng
`RunId`, thêm `-Resume <UUID-đầy-đủ>`; xem [cô lập Grok trên Windows](GROK-WINDOWS-ISOLATION.md)
về chế độ không tương tác, hash binary và giới hạn subagents/worktree.
Không gọi raw `grok.exe` rồi chỉ đặt TEMP để thay cho launcher.

Không chỉ ghi model/effort vào
`.grok/config.toml` của repo rồi cho rằng đã có hiệu lực: cấu hình cấp dự án
của Grok giới hạn ở MCP, plugin và quyền. Xem [CLI](https://docs.x.ai/build/cli/reference)
và [phạm vi cấu hình](https://docs.x.ai/build/settings).

## Cập nhật khi có lựa chọn mạnh hơn

Đây là mốc cấu hình hiện tại, không phải danh sách khóa vĩnh viễn. Trước mỗi
đợt gọi review, kiểm tra thông tin chính thức và khả năng sử dụng thực tế của
model, effort, chế độ và thuộc tính mới cho từng ghế.

Khi xác minh có lựa chọn mới mạnh hơn cho công việc review và dùng được trên
công cụ/tài khoản hiện có, cập nhật ngay `seat-config.json`, bảng và hướng dẫn
trong tệp này cùng một lượt; ghi ngày, nguồn và lý do vào lịch sử bên dưới.
Không tự suy rằng một tên mới, phiên bản mới hoặc chế độ nhanh hơn đồng nghĩa
với review tốt hơn. Giữ yêu cầu tắt fast mode cho Codex và Opus và giữ Effort Max
cho mọi lượt Opus cho đến khi chủ dự án thay đổi chính ràng buộc đó. Không tự
chuyển Opus về Ultracode theo quy tắc nâng cấp. Không tự mua gói hoặc sửa cấu
hình cấp máy.

Nếu chưa đủ bằng chứng hoặc chưa có quyền truy cập lựa chọn mới, giữ cấu hình
đang có hiệu lực và ghi rõ điều chưa xác minh; nếu cấu hình hiện hành cũng
không chạy được thì báo vướng mắc thay vì hạ cấu hình. Quy tắc kiểm tra áp dụng
khi bắt đầu đợt review; tài liệu này không tạo tiến trình theo dõi nền.

## Lịch sử

- 2026-09-08, chỉ đạo sau cùng: ngừng Opus do hết hạn mức; không gọi lại hoặc tự
  tiếp tục khi quota reset. Hub/Codex/Grok tiếp nhận công việc. Launcher chặn
  bằng `invocations_enabled: false`; giữ Max/Fast off như cấu hình lịch sử.

- 2026-09-08: theo yêu cầu mới của chủ dự án, đổi mọi lượt Opus tiếp theo sang
  Max, tiếp tục tắt Fast mode. Đồng bộ JSON, launcher, AGENTS, CLAUDE và brief
  dùng lại; launcher chặn cấu hình trái yêu cầu. Giữ nguyên bằng chứng các lượt
  Ultracode trước thời điểm thay đổi. Nguồn cú pháp: tài liệu Claude Code ở trên.

- 2026-09-07: áp dụng launcher Windows cho Grok, giữ model 4.6/effort xhigh;
  kiểm chứng thư mục phiên bằng ACP trên binary 1.0.13, không gửi suy luận.
  Cấu hình model thực tế của một bài review vẫn cần được xác minh riêng.
- 2026-09-07: lập mốc theo yêu cầu chủ dự án: Codex Astra/max, Opus/Ultracode,
  cả hai tắt fast mode; Grok 4.6/xhigh. Đối chiếu cú pháp với các nguồn chính
  thức được dẫn ở trên. Chưa chạy phiên suy luận của ba ghế để kiểm tra runtime.
