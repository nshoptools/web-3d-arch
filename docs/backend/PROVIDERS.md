# Provider interface và ledger

Runtime serve hiện không có adapter thật. TestProvider chỉ ở tests/server/
helpers.mjs, metadata.testOnly=true; Providers từ chối nó ngoài testOnly của
server test. Không có route bật test mode, không có env chọn mock provider,
không có key owner fallback. Người điều phối thêm adapter thật trong server
source đã thẩm định; không load code từ JSON/member/file dự án.

## Adapter được đăng ký

Constructor Providers nhận các object server-owned:

~~~js
{
  metadata: {
    id, version, endpointId, endpointUrl,
    models: [{ id, version, /* capabilities thực đã xác minh */ }],
    keyCheckCostMicros: 0, prices: { version, date, /* căn cứ giá */ }
  },
  quote(input) { /* đồng bộ, không network, trả bounded quote */ },
  async checkKey({ secret, signal }) { /* không sinh ảnh, chi phí xác minh = 0 */ },
  submit({
    jobId, operationId, idempotencyKey, credentialVersion,
    secret, input, quote, signal, running
  }) { /* Promise<ProviderResult>; chỉ gọi running khi đúng trạng thái */ }
}
~~~

Không dùng pseudo-code này như một adapter chạy thật. secret là Buffer mượn
trong bộ nhớ, thuộc đúng user/credential/version. Không giữ nó, log nó, đặt
vào Error/URL/requestId/output hoặc telemetry. Backend zero buffer khi kết
thúc, abort/timeout/stop. Buffer/string trong transport/provider nằm trong
trusted boundary, không tuyên bố secure erasure toàn bộ JS heap.

quote phải khai currency, maxCostMicros, maxOutputBytes, priceVersion, priceDate,
inputLimit, outputLimit, unknowns. Cần kiểm option/model, input/output bound,
reference image bytes, pixel/codec bounds và giá theo API/provider đã pin
**trước khi đăng ký adapter thật**. Quote không biết trần chi phí phải từ chối.
Bản mẫu trong test có giá nhân tạo, không là giá/khả năng một nhà cung cấp.

ProviderResult:
~~~js
{
  eventId, // duy nhất, ổn định cho cùng settlement
  state: 'succeeded' | 'failed' | 'cancelled',
  actualMicros: null | safeInteger,
  currency,
  requestId, // tùy chọn, ID kỹ thuật đã lọc
  errorCode, // tùy chọn, một mã trong allowlist
  artifact: { mediaType: 'image/png' | 'image/jpeg' | 'image/webp', bytes: Buffer }
}
~~~

Error allowlist: PROVIDER_AUTH, PROVIDER_CREDIT, PROVIDER_QUOTA,
PROVIDER_RATE_LIMIT, PROVIDER_MODEL_UNAVAILABLE, PROVIDER_REJECTED.
Không chuyển raw upstream errors về client. Khi không biết provider đã nhận
hay tính phí: throw/reject dẫn đến unknown, giữ pending cap, không retry.
Không báo actualMicros=0 trừ khi có xác nhận thực của provider.

Backend kiểm bounded output byte + magic và gắn artifact validation=unverified.
Đây chưa là kiểm decode/pixel/codec đầy đủ hoặc ảnh đã qua UI nghiệm thu.
Không có thumbnail generator, reference-image upload, hoặc remote URL fetch
cho ảnh trả về. Mỗi artifact có SHA-256, byte length, job/source/provenance;
không phải mesh 3D hoặc bằng chứng in được.

## Atomic reservation và giao hàng

1. Prepare lưu operationId/idempotency + canonical payload SHA-256, user,
   credentialVersion, adapter/model version, local project revision và quote.
   Dữ liệu chưa gửi ra ngoài.
2. Submit kiểm consent+quote hash+expiry, membership/session/authVersion,
   credential/status/version, allowlist và provider version.
3. BEGIN IMMEDIATE kiểm user/system money cùng currency+unit+UTC period;
   kiểm riêng request, byte, concurrency, byte/object stage. Mọi chiều phải đạt.
4. Reserved được commit. Ngay trước send, kiểm lại session/key/policy và giải mã.
   Submitted được ghi bền **trước** khi gọi adapter; lỗi/kill ở khe này được
   xử lý bảo thủ như unknown sau restart.
5. Provider đồng bộ có thể bỏ running. Mọi event có sequence từ DB.
   Settlement và publish artifact atomic; output storage quota không được
   xóa chi phí đã phát sinh.

Default concurrency 1, policy cho nới tới 10. Unknown không giữ active slot;
liability tiền và request/byte đã submitted vẫn ở kỳ gốc. Request count là các
generation qua app, không bao gồm key dùng ngoài app. Byte AI là bounded
logical input UTF-8 + output bytes, không là phép đo từng byte TCP/TLS overhead.
Không có currency conversion hoặc FX ngầm.

Same operation/key/payload → cùng job; khác payload/key collision → 409.
Đã submitted thì không có automatic retry. Bản này không có resend-safe/status
provider API đã xác minh; tạo ý định mới cần operation mới. Nếu có unknown,
submit mới cần acknowledgeAdditionalCharge=true; UI phải cảnh báo phí lặp.

Khi provider không gửi actual cost, terminal dùng estimated cap trong ngân
sách; actualMicros=null. Settlement tiếp theo có actual được phép cho cùng
terminal state, không publish artifact lần hai. Event ID trùng/payload khác
bị từ chối. Unknown settlement muộn cập nhật đúng day/month/currency gốc;
đóng unknown chỉ ghi reason riêng, không mở lại ngân sách.

## Cancel, revoke, callback và UI

Trước send: cancelled/release. Sau send: best effort abort + unknown/pending.
Logout chỉ thu hồi phiên đó; role/status/revoke-all thu hồi toàn user; key
replace/disable thu hồi các job đúng credential. Dữ liệu đã gửi vẫn có thể được
provider xử lý/tính phí. Không fallback sang key/provider/model khác.

Không có generic webhook HTTP. Adapter đáng tin gọi AI.settle(providerId,
jobId, ProviderResult); caller phải xác minh signature/status API, recipient,
request ID, replay và resource bounds theo provider trước khi thêm webhook
chuyên biệt. Browser/member không thể gọi boundary này qua HTTP. Test thực
hiện late settlement ngay trong adapter hoặc qua boundary server-only.

Callback không phụ thuộc cookie còn sống: kết quả thuộc user/revision ban đầu,
originSessionId ban đầu và luôn ở tray. Account deleted: chỉ giữ kế toán, bỏ ảnh.
Account suspended/logout: giữ kết quả riêng; không cho session cũ truy cập.
Controller kiểm current user + sessionId/generation trước hiển thị hoặc áp; dữ
liệu late không được gắn vào người vừa đăng nhập.

Sau 90 ngày terminal, maintenance chuyển dedup sang tombstone bền ngăn replay.
Pending unknown không bị dọn bằng lịch. Backup restore bật AI hold cho đến khi
có đối soát đáng tin với provider; xem OPERATIONS.md và B-05.

