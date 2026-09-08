# Gói backend: đối soát chi phí và khôi phục có bằng chứng

Phạm vi triển khai do chủ dự án ủy quyền. Codex thực hiện; đây không phải review
độc lập. Đọc AGENTS, phân công, cấu hình ghế, đặc tả AI-03/AI-04/EXT-05 và
`docs/backend/OPERATIONS.md`, `ISSUES.md`, `ADAPTER-ISSUES.md` trước khi làm.

Mục tiêu là xử lý B-05 bằng công cụ vận hành có thể kiểm chứng. Backup cũ có thể
thiếu lượt gọi và chi phí phát sinh sau mốc sao lưu. Không thể suy rằng không có
bản ghi là không có chi phí. Không xóa `restore-ai-hold` bằng SQL hoặc nhập một
cờ `reconciled: true` rồi coi là đã đối soát.

## Phạm vi

1. Cung cấp quy trình **lập kế hoạch đối soát → kiểm bằng chứng → áp dụng nguyên
   tử** trong CLI hiện có, dưới cùng writer lock. Kế hoạch có version/hash,
   identity của bản restore và trạng thái ledger mà nó áp dụng. Khi DB đã đổi,
   kế hoạch cũ phải bị từ chối. Chạy lại cùng gói hợp lệ không tính chi phí hai lần.
2. Cho phép đối soát job `unknown` hoặc chi phí mới chỉ `estimated` bằng dữ liệu
   xác nhận của provider/operator. Giữ chính xác user, provider/credential,
   currency, request/operation ID và kỳ UTC gốc. Không coi thiếu actual là số 0,
   không xóa pending bằng thao tác đóng nhãn, không tự retry provider.
3. Khôi phục ledger sau backup phải tính cả bản ghi bị mất. Thiết kế cơ chế nhập
   phần thiếu hoặc mức chi phí bảo thủ có ràng buộc rõ với bằng chứng/kỳ/user,
   đưa nó vào kiểm ngân sách thật. Không chỉ thêm một dòng audit rồi mở AI.
   Tránh đếm lại phần đã có; không dùng ngân sách/user/key của chủ dự án thay cho
   thành viên. Phải ghi provenance của khoản hiệu chỉnh, giữ bất định còn lại.
4. Chỉ gỡ hold khi bộ kiểm chứng minh gói bao phủ đúng phạm vi cần khôi phục.
   Nếu dữ liệu/bằng chứng không đủ để làm điều đó, giữ hold và báo phần thiếu
   cụ thể. Phân biệt kiểm cấu trúc/hash/đối chiếu ledger bằng máy với sự thật trên
   hóa đơn do người vận hành xác minh; không tự nhận một JSON là xác minh provider.
5. CLI không in prompt, ảnh, khóa, token hoặc nội dung riêng không cần thiết.
   Bằng chứng vận hành nằm trong vùng dữ liệu riêng, có hash và giới hạn dung
   lượng; không đưa vào public manifest/bundle. Thay schema có migration, version
   restore/rollback và cập nhật runbook. Không thay cấu hình máy hoặc mở dịch vụ.

Ghi một thiết kế ngắn và API sớm trước khi triển khai để parent rà ranh giới.
Không cần cơ chế thanh toán hoặc thu tiền hộ. Không gọi AI/provider, truy hóa đơn
thật, gửi tin nhắn, chạy máy in hoặc tự gỡ hold trên dữ liệu ngoài fixture.

## Tiêu chí kiểm

- Ledger hai user, nhiều currency và kỳ cũ; settlement actual/estimated/unknown;
  replay, gói đổi nội dung, stale plan, evidence thiếu/sai hash và lỗi giữa bước
  ghi phải không làm sai số dư hay gỡ hold dở.
- Backup trước một lượt đã gửi; restore; gói đối soát bổ sung nghĩa vụ đã mất;
  lượt mới thực sự bị ngân sách chặn khi tính cả nghĩa vụ đó. Không chỉ assert
  bảng có dòng hoặc hold biến mất.
- Hold còn khi một phạm vi chưa đối soát. Kỳ UTC không bị chuyển theo thời điểm
  đối soát; đóng nhãn unknown không giải phóng tiền. Không tự gửi lại provider.
- Công cụ chạy lại dưới writer lock; không takeover lock của service còn chạy.
  stdout/stderr không lộ bí mật fixture. Kiểm các route AI sau khi phục hồi và
  chạy lại suite backend hiện có.
- Test/công cụ cần chạy lại được từ mã chính và phiên mới; không hardcode phòng
  của worker. Handoff gồm preimage/hash manifest, lệnh/kết quả thực, ca chưa đạt
  và hạn chế vận hành. Parent kiểm rồi mới tích hợp và ghi trạng thái.

Mỗi worker chỉ ghi phòng của mình. Không sửa UI hoặc mã chính của parent. Không
coi các phép thử synthetic là bằng chứng hóa đơn thật, RPO/RTO hay release G4.
