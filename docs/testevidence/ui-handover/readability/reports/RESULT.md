# Kết quả kiểm UI tập trung

**PASS: 33 extra + 9 readability; tổng 42 ca, 0 lỗi.** Chromium, Firefox và WebKit đều hoàn tất; không có page error, console error hay request ngoài origin.

UI-R1-05/K02 Escape, UI-R1-06/K03 lý do control bị khóa, UI-R1-07/K04 mô tả đơn vị/giới hạn, UI-R1-08/V02 nhãn ở 1280/14, 1280/28 và 320/28 đều pass trên cả ba engine.

[Extra results](../../20260908-ui-final-extra/evidence/extra-final/results.json) · [Readability results](../evidence/readability-final/results.json) · [Summary và SHA bằng chứng](summary.json). Screenshot/metrics nằm cùng thư mục evidence của từng nhóm.

Mã UI và contracts giống nhau giữa hai capture; main còn khớp capture lúc ghi báo cáo: **true**. Runner xác nhận hash snapshot và đóng server/browser sau cả hai nhóm. Không sửa production, assertion, SETTINGS hay consent. Không chạy lifecycle/followup.

Harness riêng chỉ thêm selector extra-only và dùng context.newPage() theo chỉ đạo; xem reports/harness-adaptation.json trong mỗi run. Keyboard K05 ban đầu bị dừng trước ca đầu tiên để chuyển ưu tiên, không được tính pass.

Đây là kiểm triển khai UI React thật với DeferredBridge điều khiển. Không phải configured independent review, native/backend hay nghiệm thu site đã đóng gói. Không phát hiện regression UI05–08 trong phạm vi các ca đã chạy.
