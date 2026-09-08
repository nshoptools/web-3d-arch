# Phân công và phạm vi khởi động phát triển

Cập nhật **2026-09-08** theo phân công của chủ dự án và yêu cầu ghi lại phạm vi
đã trao đổi. Chỉ đạo mới nhất: ngừng Opus, Hub/Codex/Grok chủ động tiếp tục.
Tài liệu này là căn cứ bàn giao công việc giữa các phiên. Yêu cầu
sản phẩm theo [đặc tả chính thức](../specs/README.md); điều kiện đi tiếp theo
[lộ trình G0–G6](../specs/08-mo-rong-va-lo-trinh.md).

## Phân công hiện hành

Chỉ đạo sau cùng ngày 2026-09-08 thay phân công UI trước đây: không gọi hoặc
sử dụng Opus nữa, kể cả tự tiếp tục khi quota reset. Giữ phần đã viết làm đầu
vào thẩm định. Hub điều phối tiến độ/phạm vi/cổng phát hành; Grok tiếp nhận UI;
Codex chịu tích hợp và chất lượng. Có thể phân chia lại giữa ba vai trò này
để hoàn tất dự án, vẫn tách người triển khai và người phản biện độc lập.

| Phạm vi | Phụ trách | Trách nhiệm |
| --- | --- | --- |
| Giao diện và trải nghiệm sử dụng | **Grok** | Thiết kế và dựng bố cục, thành phần hiển thị, tương tác thông thường, responsive, bàn phím và trợ năng |
| Mô hình và hành vi dự án | **Codex** | Dữ liệu dự án, ngữ nghĩa/validation thông số, lệnh, lịch sử/undo, lưu và khôi phục |
| Nhân xử lý và thuật toán phức tạp | **Codex** | Xử lý ảnh/vector/chữ, hình học, mesh, xuất tệp, Worker/WASM và thuật toán tương tác phức tạp của giao diện khi có |
| Backend | **Codex** | Tài khoản, phân quyền, cài đặt cá nhân, kết nối AI, cô lập dữ liệu và kiểm soát chi phí từng người |
| Hợp đồng tích hợp | **Codex chủ trì, Grok phối hợp** | Codex định nghĩa dữ liệu/lệnh/kết quả; Grok góp yêu cầu tương tác và nối giao diện theo cùng hợp đồng |

Thuật toán do Codex thực hiện có thể chạy trong trình duyệt. Trong v1, nhân hình
học chạy cục bộ qua Worker/WASM; backend cung cấp dịch vụ mạng cho tài khoản,
cài đặt, AI và lưu cloud trong phạm vi đặc tả. Chạy hình học từ xa về sau cần
hợp đồng mở rộng, quyền và chi phí theo ARC-01/EXT-02.

Grok quản lý trạng thái trình bày và input thiết bị; giao diện gửi lệnh và hiển
thị trạng thái/kết quả từ nhân. Codex quản lý trạng thái nghiệp vụ, phép tính,
validation và lịch sử dự án. Các phép boolean, offset, shaping, dò vùng,
tessellation hoặc sửa mesh thuộc nhân. Hợp đồng cụ thể theo
[ARC-01](../specs/03-ky-thuat.md).

## Thứ tự bắt đầu

### 1. Chuẩn bị hợp đồng và nền tích hợp

Codex xác định dữ liệu dự án, lệnh từ UI, kết quả trả về, tiến độ, hủy, lỗi và
cách công bố capability đã hỗ trợ. Codex cùng Grok thống nhất khung ứng dụng,
cách build và ranh giới module. Lựa chọn thư viện/toolchain phải có phép thử
tương ứng trước khi khóa theo O-01.

Đầu ra cần có: hợp đồng có version, ví dụ dữ liệu/lệnh/kết quả và dữ liệu mô
phỏng để Grok làm UI. Khi thay hợp đồng, cập nhật cả ví dụ, bên gọi, bên xử lý
và phép kiểm liên quan.

### 2. Thiết kế UI và kiểm chứng nhân song song

**Grok:** dựng nguyên mẫu tương tác cho hai bước/sáu khu vực theo
[đặc tả giao diện](../specs/02-giao-dien.md). Bao gồm trạng thái rỗng, đang xử lý,
hủy, lỗi, cài đặt cá nhân và tài khoản. Dữ liệu mô phỏng sử dụng đúng hợp đồng
tích hợp; kết quả xem trước mô phỏng phải được nhận biết là mô phỏng.

**Codex:** kiểm chứng chuỗi công cụ native rồi Worker/WASM; chốt ngữ nghĩa thông
số theo từng nhóm ở O-02 trước khi nối nhóm đó vào nhân. Mốc G1 là SVG có lỗ và
các vùng chung biên đi tới mesh/STL, có oracle hình học độc lập. G1 đạt rồi G2
kiểm cùng nhân trên web, gồm ownership bộ nhớ, hủy, COI và lưu/khôi phục theo
tiêu chí đã đặc tả. Việc chuẩn bị UI, tài khoản mô phỏng và schema có thể tiến
hành song song.

### 3. Ghép một luồng sử dụng hoàn chỉnh nhỏ

Luồng tích hợp đầu tiên: **nhập SVG → đổi kích thước/độ dày → xem kết quả →
undo → lưu và mở lại → xuất STL**. Grok phụ trách phần giao diện; Codex nối nhân,
nghiệp vụ, lưu trữ và exporter. Luồng dùng xử lý thật, có đường xử lý lỗi và hủy.
Đây là mốc tích hợp ban đầu; phạm vi v1 tiếp tục theo G3–G6 và toàn bộ đặc tả.

## Điều kiện trước khi mở ứng dụng cho nhóm

Website dùng nội bộ; owner quản lý thành viên. Sau đăng nhập, mỗi người tự cấu
hình và tự chi trả AI qua kết nối riêng. Tài khoản, phân quyền, cô lập dữ liệu,
settings và BYOK được chuẩn bị từ đầu, kiểm đầy đủ trước G4/mở cho nhóm sử dụng.
Hợp đồng chi tiết ở [người dùng và AI](../specs/07-nguoi-dung-va-ai.md).

Kiểm slicer/profile ở G5 và kiểm bản in/fit ở G6 có evidence và phạm vi riêng.
Các điểm mở O-01–O-06 trong [sổ quyết định](../specs/05-quyet-dinh-va-truy-vet.md)
chặn đúng phần phụ thuộc. Khả năng mở rộng xử lý/tạo tệp in 3D phải được giữ qua
ranh giới module, job/artifact, version và adapter ngay từ nền kiến trúc.

## Mốc hiện trạng khi ghi nhận

Đặc tả 1.0.1 đã qua hai vòng phản biện Opus/Grok và phân xử. Có 55 yêu cầu,
40 chiến dịch/113 phép kiểm sản phẩm dự kiến. Theo
[hồ sơ kiểm chứng ngày 2026-09-08](../reviews/20260907-specification/verification.json),
11 kiểm tra tài liệu/bộ đọc đầu vào đạt; các phép kiểm sản phẩm chưa thực thi.
Cấu hình thực tế của các ghế review còn phần chưa xác minh đầy đủ, đã công bố
trong [hồ sơ thẩm định](../reviews/20260907-specification/README.md).

Đủ cơ sở bắt đầu nền móng và thiết kế UI theo thứ tự trên. Khi bàn giao mỗi phần,
ghi rõ yêu cầu đã làm, thay đổi hợp đồng, phép kiểm/evidence và phần còn mở.
Thay đổi phân công phải cập nhật tài liệu này theo chỉ đạo mới của chủ dự án.
