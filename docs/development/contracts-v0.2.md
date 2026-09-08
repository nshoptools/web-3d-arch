# Hợp đồng tích hợp UI 0.2

Ngày 2026-09-08. Kiểu chuẩn ở `src/contracts/app-bridge.ts`. Codex chịu trách
nhiệm controller, model, renderer và HTTP; Opus chịu trách nhiệm component UI.
Phiên bản này sửa những thiếu sót tìm thấy khi dựng UI và tích hợp backend.

| Quyết định | Hành vi đã chốt | Căn cứ |
| --- | --- | --- |
| UI-C01 | Capability dùng ID đã khai; thiếu capability luôn có lý do và không tự coi là hỗ trợ | ARC-01, UI-06 |
| UI-C02 | Hai nút áp khối nhập gửi cùng `mesh.apply`; snapshot giữ danh sách field chưa áp | UI-04 |
| UI-C03 | `viewport.action: center` là giữa bàn; khác với fit camera | UI-05 |
| UI-C04 | Controller công bố selection trong project; popup và bàn phím đọc cùng selection | VIEW-01 |
| UI-C05 | Settings/editor đọc lại qua snapshot; UI không coi state form là cài đặt đã lưu | ACC-03 |
| UI-C06 | Import/reset settings là lệnh riêng có xác nhận; core parse và giới hạn, không trộn secret | ACC-03 |
| UI-C07 | Yêu thích emoji là lệnh riêng theo collection/id; recent và prompt đã lưu thuộc settings | SRC-05, ACC-03 |
| UI-C08 | AI prepare không gửi provider; UI hiện quote, người nhận, dữ liệu, tài khoản và trần tiền rồi mới submit có consent | AI-02, AI-03 |
| UI-C09 | Exporter/controller chịu trách nhiệm tệp, kiểm chứng và download; UI chỉ liệt kê các đường xuất thực sự được công bố | OUT-01, OUT-02 |
| UI-C10 | Sổ chi phí có query/pagination và nghĩa estimated/actual/unknown, kỳ UTC, khoản chưa đối soát | AI-04 |
| UI-C11 | Library/storage công bố dung lượng ước lượng và backup gần nhất; xóa local phải dựa trên thông tin thực | DAT-01, ACC-04 |
| UI-C12 | `signIn` điều hướng OIDC cùng tab; nhận lời mời cũng qua OIDC. Không có mật khẩu website | ACC-01 |
| UI-C13 | Cỡ chữ có đơn vị mm/pt và giá trị hiển thị từ core | SRC-04 |
| UI-C14 | History công bố số undo/redo, byte và cờ rút ngắn | EDT-01 |
| UI-C15 | Vùng không sinh khối giữ trong bảng và có nguyên nhân từ core | MOD-02 |
| UI-C16 | XY/placement của chữ có trường số; core xử lý cả số và cử chỉ | SRC-04, UI-06 |

Mời thành viên dùng issuer/subject chính xác của OIDC client theo
[API tài khoản](../backend/API.md), không dùng email làm khóa định danh.
Lời mời tạo member; đổi vai trò là thao tác riêng có xác nhận và xác thực lại.
Link mời do chủ dự án chuyển cho người nhận; ứng dụng không tự gửi email.

API key chỉ sống tạm trong form cho đến khi gửi kết nối; UI không đưa key vào
settings, localStorage, project hoặc log. Tiền được core chuyển đổi từ chuỗi
decimal sang micro-currency chính xác; UI không tính tiền bằng số float.
Đổi nội dung/provider/model sau prepare làm quote UI mất hiệu lực. Submit giữ
đúng jobId/quoteHash, không tự tạo job mới khi retry hoặc mất phản hồi.

Những kiểu/capability được khai ở đây là hợp đồng, không phải bằng chứng tính
năng đã chạy. Trạng thái tích hợp và nghiệm thu theo [PLAN](PLAN.md).
