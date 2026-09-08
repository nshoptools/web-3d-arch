# Phản biện độc lập nhân cơ khí — mốc tích hợp đầu tiên

Nhiệm vụ được chủ dự án ủy quyền: tự kiểm chứng tính đúng đắn toán học và
hành vi cơ khí trong bản đầu vào đã khóa. Đây là review chức năng/hình học,
không phải review tài khoản, bí mật, mạng hoặc an ninh backend.

Run `20260908-mechanics-review-r1`, chỉ ghi trong phòng Codex của run này.
Đọc AGENTS.md, cấu hình ghế hiện hành, SEAT-CONFIG.md và hướng dẫn review trước
khi thao tác. Cấu hình thực: gpt-6-astra/max, fast off; kiểm metadata phiên và
effective-features trước khi review. Nếu không xác minh được, công bố giới hạn
và không nhận đây là review đạt cấu hình. Không mở agent/ghế khác. Không đọc
kết luận hay báo cáo của người viết hoặc reviewer khác trước khi tự kết luận.

Đầu vào: `inputs/frozen/src/kernel/mechanics`, `src/domain`, `docs/specs`
và `inputs/source-manifest.json`. Các tài liệu API/ADR là mô tả để đối chiếu,
không phải bằng chứng pass. Không đọc v1-acceptance.json/md hoặc báo cáo triển
khai trong phòng khác. Nguồn/dependency chung trong `.toolchain` chỉ đọc.
Dot-source môi trường đúng run ở mỗi tiến trình PowerShell; build native và
mọi probe/oracle phải ở work/evidence của run. Có thể sao chép nguồn đã khóa
vào work để thêm probe riêng; không sửa mã sản phẩm hoặc bản frozen.

Tập trung các bất biến có thể làm sai tệp in: đơn vị/layer schedule, fit và
tolerance, giao/tiếp xúc các phần, lỗ/vòng/đảo, hướng/volume/manifold, ý nghĩa
126 thông số, clicky/lego/strap/charm/keychain, các đường thất bại/hủy và việc
không xuất mesh dở. Phân biệt sản phẩm hoàn chỉnh với prepared-source/slab
test fixture; không tính fixture đạt là chứng minh nguồn đã tích hợp. Kiểm
ngưỡng thực tế, trường hợp biên và ít nhất một oracle giải tích hoặc bộ đọc
độc lập; không chỉ chạy lại bộ test hiện có.

Build recipe ở `src/kernel/mechanics/tools/build.ps1` có thể chạy từ bản
frozen với `-RunId 20260908-mechanics-review-r1 -Target native`; nó tìm gốc
qua tools/development/env.ps1 và đặt output riêng. Cố gắng chứng minh/loại
trừ từng nghi vấn bằng repro. Không nới tolerance hoặc đổi expected để pass.

Bàn giao reports/review.md và findings.json: phạm vi/hash/cấu hình đã xác
minh, lệnh và exit code, từng phát hiện có vị trí, input tái hiện, expected
và actual, tác động tới yêu cầu, mức độ nghiêm trọng và hướng sửa. Nêu rõ
phần không kiểm được; kết luận dựa trên bằng chứng, không đếm phiếu. Parent
sẽ phân xử độc lập và kiểm lại sau sửa; reviewer không tự chứng nhận phát hành.
