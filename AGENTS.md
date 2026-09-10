# Quy tắc bắt buộc của web-3d-arch

Áp dụng cho mọi người và mọi ghế AI (Grok, Opus/Claude, Codex), ở mọi phiên
làm việc, kể cả triển khai, thử nghiệm và review. Đọc tệp này trước khi thao tác.

## Phân công phát triển

Theo chỉ đạo mới nhất ngày 2026-09-08, **ngừng sử dụng Opus**; không gọi mới,
tiếp tục, fork hoặc giao agent con Opus, kể cả khi hạn mức mở lại. Hub điều phối,
Grok tiếp nhận thiết kế/dựng giao diện; Codex phụ trách backend, nghiệp vụ,
nhân xử lý, thuật toán UI phức tạp, tích hợp và kiểm thử. Hub/Codex/Grok chủ động
phân chia lại khi cần và bố trí review độc lập với người triển khai. Giữ lại và
thẩm định phần Opus đã viết. Trước khi lập kế hoạch hoặc
triển khai, đọc [phạm vi và thứ tự khởi động](docs/development/README.md) để giữ
đúng phân công, hợp đồng tích hợp và các mốc đã thống nhất.

## Cô lập trong dự án

- Mọi tệp/thư mục do công việc tạo ra **phải nằm trong repo này**. Xác định gốc
  bằng vị trí `AGENTS.md`/`git rev-parse --show-toplevel`, không cố định ổ đĩa.
- Bao gồm bản tải về, bản sao, bản giải nén, script tạm, log, cache, screenshot,
  báo cáo, profile trình duyệt, dependency, môi trường ảo và worktree.
- Không ghi vào Desktop, Downloads, thư mục home, TEMP của máy, cache dùng chung,
  hoặc một repo bên cạnh. Không cài dependency toàn cục, không sửa PATH/cấu hình
  máy. Được đọc và chạy công cụ đã có; mọi đầu ra vẫn phải ở trong repo.
- Trước khi chạy công cụ có ghi tệp, dot-source `tools/project-env.ps1` với đúng
  ghế và mã phiên. Cấu hình cả thư mục output/profile riêng của công cụ nếu nó
  không dùng TEMP/cache từ môi trường. Không giả định biến môi trường là sandbox.
- Grok native trên Windows phải chạy qua `tools/reviews/start-grok.ps1`, kể cả
  khi tiếp tục phiên; launcher tự chuẩn bị môi trường ghế Grok. Đọc
  [quy trình cô lập Grok](docs/reviews/GROK-WINDOWS-ISOLATION.md). Không gọi raw
  `grok.exe`: `/tmp` viết cứng bỏ qua TEMP. Chỉ launcher được tạo alias tạm đã
  kiểm chứng trỏ vào repo; không tạo junction hoặc dọn `tmp` ở gốc ổ đĩa.
- Kiểm tra đường dẫn tuyệt đối sau khi resolve, kể cả symlink/junction. Không dùng
  liên kết trỏ ra ngoài để lách quy tắc. Nếu không thể giữ đầu ra trong dự án,
  dừng thao tác đó và báo nguyên nhân.
- Không tạo worktree ngoài repo. Nếu thật sự cần, dùng thư mục trong phòng của
  ghế, cấu hình ignore và tránh quét/lồng lại worktree. Không đụng SSH hay cấu hình
  Git cấp máy; tuân thủ hướng dẫn SSH cấp máy khi công việc có liên quan.

## Tổ chức

- `src/`: mã sản phẩm; `src/assets/{fonts,emoji,opentype,harfbuzz}/`: tài nguyên
  phân phối; `src/input/`: bộ đọc đầu vào cho ứng dụng.
- `tools/`: công cụ tái sử dụng, chia theo chức năng; `docs/`: tài liệu/bằng chứng
  cần giữ trong Git, chia theo chủ đề.
- `.toolchain/`: công cụ và dependency riêng của repo, không đưa vào Git.
- `tmp/reviews/{grok,opus,codex}/runs/<ma-phien>/`: phòng riêng cho mỗi ghế.
  Mỗi phiên có `inputs/`, `work/`, `evidence/`, `reports/`, `cache/`, `temp/`.
- `report/`: đầu ra phát triển có thể tái tạo, không đưa vào Git.
- Không rải tệp tạm ở gốc repo hoặc trong `src/`. Không dùng tên chung dễ ghi đè
  như `test2`, `final-final`. Đặt tên mô tả, gom theo phiên/chức năng, dọn có chọn lọc.
- Chỉ xóa đầu ra do mình tạo; kiểm tra đích trong repo trước khi xóa/move đệ quy.
  Không xóa hoặc ghi đè công việc của người khác.

## Junction đệ quy trong `tmp/reviews` — bẫy khi đóng gói

Test `SEC-01` tại `tests/host/https.test.mjs:91` **cố ý** tạo junction trỏ ngược
từ web root về thư mục cha của chính nó — `symlinkSync(f.root, join(f.webroot,
'escape'), 'junction')` — để kiểm chứng `createHost()` từ chối manifest thoát ra
ngoài web root. Vì `webroot = root/public-build`, đường dẫn thành vòng lặp vô hạn
`public-build/escape/public-build/escape/...`. Fixture sinh bằng
`mkdtempSync(join(run, 'evidence', label + '-'))` (`tests/host/helpers.mjs:22`)
và **không có bước dọn**, nên mỗi lượt chạy SEC-01 để lại thêm một bộ vĩnh viễn
trong `evidence/` của phiên đó.

**Junction này là fixture bảo mật bắt buộc — không xóa nó khỏi test.**

- `tar.exe` của Windows (bsdtar/libarchive) coi junction là thư mục thật và **đi
  xuyên qua** nó. Ngày 2026-09-10 một lệnh `tar -czf … -C <repo> .` đã lặp 8 tầng,
  cho ra gói 3,31 GB mà 88,9% là rác đệ quy và **không chứa một file mã nguồn nào**
  (`src/` chỉ còn đúng một entry thư mục rỗng), rồi chết vì đường dẫn vượt giới hạn.
  Đường dẫn sâu nhất đo được 1.388 ký tự, so với giới hạn 260 của Windows.
- Không đóng gói hay sao chép cây làm việc bằng `tar`, `zip`, `robocopy` hoặc trình
  backup. Dùng `git archive`, `git bundle` hoặc `git clone`: git không đi vào thư
  mục đã ignore nên miễn nhiễm, và `tmp/reviews/*/runs/*` đã nằm trong `.gitignore`.
- Nếu buộc phải duyệt cây, loại trừ reparse point: `robocopy /XJ`,
  `tar --exclude=./tmp`, hoặc bỏ qua thư mục có thuộc tính `ReparsePoint`.
- Đếm reparse point bằng lệnh đi xuyên (`dir /al /s`) cho số **sai lệch rất lớn**,
  vì cùng một junction bị liệt kê lại ở mỗi tầng lồng — cách đó từng báo 583 trong
  khi số thật là 22. Phải duyệt thủ công và không đi xuyên. Thực trạng 2026-09-10:
  22 junction thư mục toàn repo, trong đó 4 `escape` đệ quy thuộc 2 phiên cũ.
- Xóa junction chỉ gỡ liên kết, không đụng dữ liệu đích, và không ảnh hưởng test
  (mỗi lượt chạy tự tạo fixture mới). Nhưng nó sẽ xuất hiện lại ở lượt SEC-01 kế
  tiếp: đây là dọn dẹp một lần, không phải bản vá.
- Hai junction sau là hạ tầng hợp lệ, **không được xóa**:
  `node_modules` → `.toolchain/app-runtime/node_modules` và
  `src/printing/node_modules` → `.toolchain/printing-js/node_modules`.

## Cấu hình ghế review — bắt buộc và có cập nhật

Trước khi gọi, tiếp tục hoặc fork bất kỳ ghế review nào (kể cả agent con),
người gọi và ghế nhận việc phải đọc [cấu hình hiện hành](docs/reviews/seat-config.json)
và [cách áp dụng, kiểm chứng, nâng cấp](docs/reviews/SEAT-CONFIG.md).
Phải chọn đúng model, effort/chế độ và trạng thái fast mode bằng thiết lập
thực tế của công cụ, kiểm tra lại trước khi review và ghi bằng chứng trong báo cáo.
Không chỉ ghi tên model vào prompt, không âm thầm dùng mặc định hoặc hạ cấu hình.
Nếu công cụ không hỗ trợ hoặc không xác minh được cấu hình, báo rõ vướng mắc
trước khi review; không nhận kết quả là review đạt cấu hình.

Cấu hình không khóa vĩnh viễn: trước mỗi đợt review, kiểm tra nguồn chính thức
và khả năng sử dụng thực tế; khi xác minh có model, effort hoặc thuộc tính mới
mạnh hơn, cập nhật cấu hình cùng ngày, nguồn và lý do theo hướng dẫn trên.
Quy tắc này không tự cho phép khởi chạy ghế khác hoặc sửa cấu hình cấp máy.

**Opus hiện bị ngừng theo yêu cầu mới nhất của chủ dự án.** Launcher chặn mọi
lượt gọi; không tự mở lại vì quota được làm mới hoặc chính sách nâng cấp.
Chỉ khi chủ dự án cho phép sử dụng lại, ràng buộc cấu hình đã ghi trước đó mới
được áp dụng: **mọi lượt gọi trong dự án**
(triển khai, review, tiếp tục, fork và agent con) bắt buộc dùng **Effort Max,
Fast mode tắt**. Luôn khởi chạy qua `tools/agents/start-opus.ps1`; không gọi CLI
trực tiếp để bỏ qua cấu hình/cô lập của launcher. Không tự đổi sang Ultracode
hoặc effort khác theo quy tắc nâng cấp; chỉ thay ràng buộc này khi chủ dự án
đưa ra yêu cầu mới. Phiên cũ phải được áp dụng lại Max/Fast off khi tiếp tục.

## Review độc lập

Đọc `tmp/reviews/README.md`. Mỗi ghế chỉ ghi trong phòng mình, tự thu thập bằng
chứng và tự kết luận trước khi đọc kết luận ghế khác. Không tự khởi chạy ghế khác
chỉ vì có phòng review. Review không mặc nhiên cho phép sửa mã sản phẩm.

## Font, emoji và thư viện

- Giữ byte gốc từ nguồn chính thức, pin revision/version, lưu SHA-256 và giấy phép
  riêng. Không thay bản gốc bằng font subset từ Google Fonts CSS, bản convert,
  font đã instantiate, hoặc tài nguyên từ CDN không pin phiên bản.
- Bản dẫn xuất nếu cần phải ở thư mục riêng, ghi công cụ, tham số và nguồn; không
  ghi đè font gốc. Tuân thủ giấy phép đi kèm từng tài nguyên.
- Danh mục phải khớp tệp, có id ổn định, đường dẫn tương đối, thông số biến thể và
  khả năng hỗ trợ thực đo. Không gán hỗ trợ tiếng Việt/emoji chỉ từ tên font.
- Với họ font đã chọn, giữ đủ biến thể trong METADATA chính thức; variable
  phải giữ các trục và phạm vi. “Đủ font” không chỉ là đủ những tên tệp đã có.
  Bộ chọn emoji, cách nhập thay thế, thành phần emoji và artwork ngoài Unicode
  có danh mục riêng; không bỏ dữ liệu chỉ vì nó không có trong bộ chọn chính.
- Font có outline chỉ là nguồn hình học. Khi dựng 3D phải xử lý shaping, dấu,
  contour rỗng/lỗ, hướng đường bao, giao cắt và kiểm tra mesh. Bitmap emoji không
  phải outline để đùn khối. Emoji ZWJ/modifier/flag phải xử lý cả chuỗi.
- Dự án có mục tiêu dựng/in 3D nhiều màu. Giữ cả nguồn Noto Emoji đơn sắc và màu.
  Không giới hạn bộ tài nguyên theo khả năng của một parser. Với nguồn màu,
  giữ SVG, COLRv1/CPAL (hình dạng, màu, lớp, gradient/transform/compositing) và
  bản bitmap gốc. Bitmap có thể phục vụ preview hoặc vector hóa có kiểm chứng;
  không tự bỏ nguồn màu vì `opentype.getPath()` không đọc đầy đủ nó.
- UI chọn bộ emoji qua `src/assets/emoji/collections.json`. Không âm thầm dùng
  glyph đơn sắc, font hệ điều hành hoặc ảnh placeholder thay cho màu của nguồn.
  Khi chuyển màu sang các vùng vật liệu phải giữ bản gốc, ghi phép giản lược
  màu/gradient, xử lý giao nhau/lớp và kiểm tra mesh; tài nguyên 2D chưa phải mesh.
- Sau khi đổi assets chạy các kiểm tra trong `docs/assets/README.md`; cập nhật
  danh mục và bằng chứng cùng lượt, không chỉ sửa nhãn `verified`.
- Đọc `docs/assets/INPUT-CONTRACT.md` trước khi phát triển dựng/in 3D. Dùng bộ
  đọc đã kiểm chứng hoặc chứng minh bộ thay thế tương đương; không bỏ dấu,
  shaping, lớp màu, gradient, clip hay lỗ để tránh giới hạn thư viện.
