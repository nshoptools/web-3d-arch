# Cấu hình bắt buộc cho các ghế review

Nguồn giá trị hiện hành: [seat-config.json](seat-config.json), cập nhật ngày
2026-09-07 theo yêu cầu của chủ dự án. Đây là cấu hình chung của dự án để
người hoặc công cụ gọi ghế đọc và áp dụng; các CLI không tự nạp tệp JSON này.
Quy tắc áp dụng được dẫn từ [AGENTS.md](../../AGENTS.md).

| Ghế | Mô hình | Effort / chế độ | Chế độ nhanh |
| --- | --- | --- | --- |
| Codex | `gpt-6-astra` | `max` | Tắt |
| Opus / Claude | `opus` | `ultracode` | Tắt |
| Grok | `grok-4.6` | `xhigh` | Theo lệnh bên dưới; chưa có yêu cầu riêng |

## Khi gọi hoặc tiếp tục một ghế

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

Quy tắc này không tự khởi chạy các ghế. Chỉ gọi ghế khi có nhiệm vụ review được
cho phép; các ghế vẫn tuân thủ quy tắc review độc lập và phạm vi được giao.

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

Phần chọn cấu hình cho một phiên PowerShell:

```powershell
$env:CLAUDE_CODE_DISABLE_FAST_MODE = '1'
$env:CLAUDE_CODE_EFFORT_LEVEL = 'xhigh'
claude --model opus --effort ultracode
```

`ultracode` là chế độ của Claude Code: effort gửi tới model là `xhigh`, kèm
điều phối dynamic workflows. Không thay nó bằng `max`, `ultrathink` hoặc
`xhigh` đơn thuần. Không ghi `effortLevel: "ultracode"` vào settings hay
`CLAUDE_CODE_EFFORT_LEVEL=ultracode`; các vị trí đó không nhận giá trị này.
Cờ `--effort ultracode` cần Claude Code từ v2.1.203. Phải xác minh Ultracode
thực sự bật và workflows khả dụng; nếu workflows bị tắt, cờ này có thể chỉ
còn tác dụng đặt `xhigh`. Xem [model và Ultracode](https://code.claude.com/docs/en/model-config#adjust-effort-level)
và [tắt fast mode](https://code.claude.com/docs/en/fast-mode).

### Grok

Giữ đúng phần lệnh chọn cấu hình:

```powershell
grok -m grok-4.6 --effort xhigh
```

Truyền lại các giá trị này khi tiếp tục phiên. Không chỉ ghi model/effort vào
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
với review tốt hơn. Giữ yêu cầu tắt fast mode cho Codex và Opus cho đến khi
chủ dự án thay đổi yêu cầu đó. Không tự mua gói hoặc sửa cấu hình cấp máy.

Nếu chưa đủ bằng chứng hoặc chưa có quyền truy cập lựa chọn mới, giữ cấu hình
đang có hiệu lực và ghi rõ điều chưa xác minh; nếu cấu hình hiện hành cũng
không chạy được thì báo vướng mắc thay vì hạ cấu hình. Quy tắc kiểm tra áp dụng
khi bắt đầu đợt review; tài liệu này không tạo tiến trình theo dõi nền.

## Lịch sử

- 2026-09-07: lập mốc theo yêu cầu chủ dự án: Codex Astra/max, Opus/Ultracode,
  cả hai tắt fast mode; Grok 4.6/xhigh. Đối chiếu cú pháp với các nguồn chính
  thức được dẫn ở trên. Chưa chạy phiên suy luận của ba ghế để kiểm tra runtime.
