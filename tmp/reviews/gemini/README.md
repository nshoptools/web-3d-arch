# Phòng Review của Gemini

Đây là không gian làm việc cô lập dành riêng cho các phiên review do **Gemini** thực hiện.

Theo hướng dẫn chung của dự án, mỗi phiên làm việc sẽ được khởi tạo trong một thư mục con thuộc `runs/`, với đầy đủ các thư mục cách ly: `inputs/`, `work/`, `evidence/`, `reports/`, `cache/`, và `temp/`.

## Khởi tạo phiên làm việc

Để bắt đầu một phiên làm việc mới bằng Gemini, hãy chạy script thiết lập môi trường:

```powershell
. ./tools/project-env.ps1 -Seat gemini -RunId <ma-phien>
```
Lệnh trên sẽ thiết lập các biến môi trường và tạo cấu trúc thư mục cần thiết để đảm bảo mọi đầu ra (cache, temp files, báo cáo) đều nằm trọn trong repo và không xung đột với các ghế khác.

Đọc thêm [Quy định về các phòng review độc lập](../README.md) để nắm rõ cách làm việc và cập nhật cấu hình theo dự án.
