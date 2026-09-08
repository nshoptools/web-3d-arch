# Kiểm lại UI consent

Codex điều phối đã tái hiện lỗi trước sửa, rồi sửa UI-R1-01–04 và kiểm lại trên
Chromium/Firefox/WebKit: 21 ca lifecycle mỗi engine đạt, 48 ca hồi quy mỗi engine
đạt; 10 kiểm Node và typecheck đạt. [verification.json](verification.json) giữ
hash đầu vào và kết quả. [Ca có thể chạy lại](../../../tests/ui/export-consent/README.md)
bao gồm bấm consent sau ABA trong cùng một React batch trước cập nhật DOM.

Scope là React/AppShell và public bridge có điều khiển. Không coi kết quả này
là kiểm backend/native, một vòng review độc lập mới hoặc sẵn sàng phát hành.
Bốn phát hiện UI-R1-05–08 còn thuộc gói sửa của Opus.
