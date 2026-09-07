# Quy tắc bắt buộc của web-3d-arch

Áp dụng cho mọi người và mọi ghế AI (Grok, Opus/Claude, Codex), ở mọi phiên
làm việc, kể cả triển khai, thử nghiệm và review. Đọc tệp này trước khi thao tác.

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
