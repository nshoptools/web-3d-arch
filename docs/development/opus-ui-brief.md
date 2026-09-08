# Giao việc Opus: giao diện đợt đầu

Ngày 2026-09-08. Chủ dự án giao Opus phát triển giao diện; Codex điều phối,
triển khai backend/nhân/thuật toán, kiểm tra và tích hợp. Đây là nhiệm vụ viết
mã thật có nguyên mẫu chạy được, không chỉ viết đề xuất thiết kế.

## Tài liệu và ranh giới

Đọc AGENTS.md, docs/development/README.md, docs/reviews/seat-config.json và
SEAT-CONFIG.md; đặc tả 01, 02 toàn bộ; phần người dùng/AI 07; 06 danh mục
thông số; ARC-01/EXT. Hợp đồng giao nhận là src/contracts/app-bridge.ts v0.1.
Nếu cần sửa hợp đồng, ghi đề xuất có ví dụ vào report, không tự sửa file gốc.

Chỉ ghi trong tmp/reviews/opus/runs/20260908-ui-wave1. Trước mỗi shell ghi,
dot-source tools/project-env.ps1 -Seat opus -RunId 20260908-ui-wave1. Tất cả
output, profile, cache, browser, file tạm và subagent nếu có phải nằm trong
phòng phiên; không dùng Desktop/TEMP/home ngoài repo, không cài toàn cục.
Code bàn giao đặt ở work/ui/src/ui; demo/mock riêng work/ui/src/dev; báo cáo
ở reports. Chỉ đọc root src/assets, không thay/copy lại catalog hoặc font gốc.
Không sửa backend/geometry/main package/config/manifest. Không dùng ghế khác
ngoài Opus; nếu dùng Workflow thì các agent viết UI dùng model opus, effort
xhigh với fast off, cùng phạm vi cô lập. Không dùng native worktree.

## Nền thực thi

React 19.2.8 + TypeScript 7.0.2 + Vite 8.2.2, đã pin ở package.json gốc.
Dependency đặt trong .toolchain/app-runtime/node_modules và đường node_modules
trong repo; không tự đổi version/cài ngoài repo. Tạo ứng dụng demo Vite riêng
trong work/ui; copy hợp đồng vào work/ui/src/contracts để import ../contracts.
Giữ nguyên byte contract và ghi SHA khi bàn giao. Npm/Node tìm dependency qua
các thư mục cha tới repo. Dev port riêng 5182, bind 127.0.0.1; không --open.
Build output phải ở phòng phiên. Codex sẽ gắn bridge thật và viewport thật.

## Đầu ra giao diện

Export mountApp(element: HTMLElement, bridge: AppBridge): () => void từ
src/ui/index.tsx. React dùng snapshot + subscribe có cleanup; state UI riêng
cho khu đang mở, tìm kiếm, ngăn kéo, focus và form. Không lặp tính hình học,
validation miền nghiệp vụ, history, ledger hoặc persist secret trong UI.
Stage gọi bridge.attachViewport(host) và cleanup; các lớp phủ/nút/công cụ do
Opus dựng. Import File/clipboard/drop, chọn emoji/font, điều khiển tham số,
đổi loại, lưu/mở, undo/redo, export, login/settings/AI/admin đều qua bridge.
Một command thất bại phải hiện diagnostic; confirmation phải hiện diff rồi
người dùng chọn, không tự xác nhận. Giữ text input khi lỗi, không snap số ngầm.

Thực hiện đầy đủ bố cục tối theo spec02: hai bước/sáu khu, rail desktop/mobile,
panel gập, thanh việc tiếp theo, stage, tiến độ/hủy, trạng thái rỗng/lỗi, tìm
nhanh, bảng màu, nhóm thông số, popup chữ và settings. 7 công cụ2D phải có ID/
phím/toggle đúng; chỉ dispatch, thuật toán gesture do bridge/viewport đảm nhiệm.
Chữ ở hai vị trí dùng cùng component; đủ 8 thông số và hai công tắc độc lập.
Cài đặt cá nhân, BYOK của chính user và owner quản thành viên phải có đường UI.
Mọi nút khả dụng phải tạo hành vi có thể quan sát; capability chưa hỗ trợ có
lý do rõ. Không có nút chết, toast thành công giả hoặc cảnh báo mất sau 1 frame.
AI chỉ gửi khi bấm Tạo; luôn hiện provider/tài khoản/chi phí unknown đúng nghĩa,
chống double-click ở UI; secret chỉ tồn tại tạm trong form và xóa khi hoàn tất.
Không dùng raw SVG innerHTML từ file người dùng; preview qua img URL của bridge.

## Tiêu chí nghiệm thu trước bàn giao

1. TypeScript strict qua, build demo qua, không error console hoặc React key warnings.
2. Sáu khu/hai bước có nội dung và mọi trạng thái rỗng/bận/cancel/lỗi/read-only/
   signed-out/expired/user/owner được kích hoạt bằng mock scenario có nhãn demo.
3. Dùng được 320px, 720px, 1023px, 1180px, 1400px và desktop lớn; 200% text zoom;
   không scroll ngang ngoài vùng canvas chủ đích, không che nút Hủy/export/dialog.
4. Keyboard: tab order/focus thấy được, Escape, focus trap và restore dialog,
   aria labels/live regions, skip link, shortcuts không cướp IME hoặc ô nhập.
5. Contrast thật theo spec; reduced-motion/forced-colors, disabled có lý do;
   target tối thiểu, cảnh báo không chỉ phân biệt bằng màu.
6. Cùng field/text/material gọi cùng contract; state hidden giữ giá trị; nhập
   dấu phẩy giữ raw string cho core; UI không tự tính mm/layers bằng lịch lớp giả.
7. Mock chỉ phục vụ demo/test và mang nhãn rõ. Không báo product/mesh/fit passed.
8. Báo cáo liệt kê file, cách run/build/typecheck, scenarios đã kiểm và issue
   còn mở. Bằng chứng quan sát phải thực chạy; đừng tự nhận có browser nếu chưa có.

Tự rà soát lỗi sau viết, chạy build/typecheck và sửa trước bàn giao. Codex sẽ
chạy trải nghiệm bằng trình duyệt thực, kiểm tích hợp và review độc lập tiếp.
