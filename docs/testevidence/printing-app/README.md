# Nối cấu hình in cá nhân

[Kết quả trên mã chính](main-verification.json): 33/33 đạt, không bỏ ca;
syntax/types đạt và các byte đầu vào không đổi trong lần chạy. Cả ba trình
duyệt dùng EngineClient/Worker thật và một Module chung. Bộ đọc Python riêng
đọc lại 12 tệp STL/3MF, gồm kiểm soát âm với đơn vị sai.

Cấu hình in lấy từ tài khoản hiện tại, kiểm lại seal/schema, lịch lớp thực,
vật liệu và slot/extruder. Cấu hình mẫu không được cài làm mặc định cho người
dùng. Có kiểm thay đổi cài đặt, profile hỏng, reset tài khoản, kết quả đến muộn
và giữ nguyên lease nguồn.

Các mô hình thử là hình giải tích có nhãn; quyền/chứng cứ cảnh trong bộ kiểm
được dựng có chủ đích. Kết quả này không chứng minh toàn ứng dụng, khả năng
slicer đích hoặc độ lắp vừa. 3MF theo máy hiện yêu cầu ý định xuất kiểm tra;
không biến profile nhập vào thành chứng nhận máy/slicer.

Cách chạy và đầu vào bền ở [hướng dẫn kiểm](../../printing-app/TESTING.md).
Danh sách `tests/printing-app/test-inputs.json` giới hạn việc chụp hash vào đúng
mã/fixture của bộ kiểm, không quét toàn thư viện tài nguyên của repo.
