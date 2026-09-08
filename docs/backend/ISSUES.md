# Phạm vi còn mở — không phải kết luận release/review

Các mục dưới đây không được đánh dấu pass chỉ vì unit/integration tests đạt.
Backend và adapter đã tích hợp; phiên review độc lập Codex bị bộ lọc tự động
từ chối trước khi có kết luận. Chưa đạt G4 hoặc nghiệm thu toàn sản phẩm.

| ID | Yêu cầu/cổng | Trạng thái và việc còn cần |
| --- | --- | --- |
| B-01 | ACC-01, SEC-01, WEB-01, G4/O-05 | OIDC RS256 + PKCE đã chạy với IdP HTTP local ký token thật. Chưa có client/issuer/deployment/plan/region thực; phải pin metadata, đăng ký redirect và kiểm HTTPS/cookie/COI/reverse proxy ba browser, logout/expired session trên host. |
| B-02 | AI-01..04, SRC-03 | Adapter xAI đã tích hợp, bật tường minh; 58 test backend/adapter đạt trong cây dự án với transport kiểm soát. Chưa gọi inference/key thật hoặc đối chiếu hóa đơn. Xem AI-ADAPTERS.md và ADAPTER-ISSUES.md. |
| B-03 | SRC-03, LIM-01, AI-04 | B-03 candidate có stage ảnh riêng theo owner/session/project+hash, PNG8/JPEG baseline giải mã thật bằng worker giới hạn, thumbnail PNG thật, download riêng theo job/user và File binding tối thiểu. Xem IMAGE-API.md / IMAGE-CODEC.md. Chỉ xAI single-reference medium1k/2k theo hợp đồng/giá ghim; progressive/CMYK/EXIF/ICC/remote provider output và live inference vẫn chưa hỗ trợ hoặc chưa kiểm. Không gán mesh/fit/full-product pass. |
| B-04 | ACC-03..04, DAT-01..03, STO-01 | Controller UI/domain chưa nối: user/device/project schema chi tiết, snapshot/profile/hash áp dụng có undo, lưu OPFS/IndexedDB, writer lock, conflict merge UI, offline lease verify/rollback clock, user switch, private/shared logout và xóa local hai bước. Backend cung cấp scope/ETag/lease/context, không tự nhận client đã làm. Nested design/profile data cần validator domain của hợp đồng tích hợp. |
| B-05 | AI-03, EXT-05 | Candidate recovery có plan/check/apply nguyên tử, nghĩa vụ mất sau backup vào ngân sách thật, settlement actual vượt quote và bound bảo thủ, provenance/evidence riêng, hold theo coverage. Xem RECOVERY-API.md/RECOVERY-RUNBOOK.md và handoff. Parent còn kiểm/tích hợp; đối soát hóa đơn/cutover thật và release vẫn chưa nghiệm thu. Không sửa SQL để bỏ nghĩa vụ rồi bật AI. |
| B-06 | ACC-04, EXT-05, SEC-01 | Deletion loại secret/cá nhân khỏi DB hoạt động, tạo deadline backup purge 30 ngày; chưa chạy purge mọi bản sao thực hoặc chứng minh RPO24h/RTO8h/backup khóa/ACL Windows/restore hạ tầng. Cần runbook + phép đo ở host thật; audit giữ tối thiểu90 ngày. |
| B-07 | ACC-02..03, DAT-02/STO-01 | Cloud project backup là tùy chọn đang tắt (503). Không có cloud project CRUD/import/export/upload stage/object store. Job references là local tuple user+project+revision; result/download thuộc đúng user. Nếu mở cloud phải thêm ACL, atomic stage/head, hash, total byte/object/upload quota và conflict tests. |
| B-08 | ACC-03, O-04/O-05, EXT-05 | Node DatabaseSync + một writer process cho nhóm nhỏ; functional races đã kiểm. Chưa đo tải/bộ nhớ/DoS ở cấu hình thật, process scale-out/serverless/shared DB không hỗ trợ. Quota logical payload không đo SQLite/WAL/index/backup overhead. Cần trần dung lượng volume/log và endpoint pagination mở rộng khi tăng quy mô. |
| B-09 | Review/G4 | Phiên CLI độc lập xác minh Astra/max/Fast off và chạy lại 32 test của snapshot nền; sau đó bị bộ lọc Codex từ chối vì possible cybersecurity risk, không có kết luận review. Không tính test của worker hoặc phiên bị từ chối là review hoàn tất. |
| B-10 | ACC-01/AI-04 | Lời mời được tạo/revoke/resend token và liệt kê metadata; không có email transport. UI chuyển token một lần qua workflow mời được phê duyệt. Không tự gửi email hoặc tin nhắn. |
| B-11 | SEC-01/ACC-02 | Candidate runtime có scheduler trong foreground lifecycle: batch/cadence có giới hạn, expiry/purge ảnh B03, retention hiện có, orphan/unknown accounting, clock/DB-writer/restore-hold diagnostics và graceful drain settlement đã nhận. Xem RUNTIME-API.md / RUNTIME-RUNBOOK.md. Không tự retry AI; tombstone/nghĩa vụ chưa đối soát giữ lâu dài. Log rotation/backup purge mọi bản sao/offsite/ACL/tải/RPO-RTO thật vẫn do operator kiểm; không nhận review/deployment đạt chỉ từ tests. |

Mã và regression tests đã nằm trong src/server và tests/server. Trạng thái
tích hợp/release được cập nhật ở docs/development/PLAN.md.

