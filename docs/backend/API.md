# HTTP contract v1

Registry xAI bật tường minh; model/options/price provenance, job.providerUsage
và mã lỗi provider theo [AI-ADAPTERS.md](AI-ADAPTERS.md). SQLite schema 3.

Base /api/v1. JSON UTF-8. Method không có route trả 404 NOT_FOUND.
Không redirect API sang trang login khi hết phiên: trả 401.
Không CORS; Host phải bằng host/port của BACKEND_ORIGIN; forwarded headers
không là nguồn danh tính. Bên proxy phải giữ Host và chỉ mở dịch vụ qua HTTPS.

Mọi mutation dùng Content-Type: application/json, Origin bằng origin cấu hình,
X-CSRF-Token lấy từ /me và cookie phiên. GET cũng từ chối Origin khác và
Sec-Fetch-Site cross-site/same-site. Ngoại lệ duy nhất cho redirect từ IdP:
GET /auth/callback được bảo vệ bằng state một lần + browser cookie + nonce/PKCE.
POST /auth/start chưa có phiên chỉ cần cùng origin; khi có phiên còn hạn
phải có CSRF. Cookie stale không khóa người dùng khỏi luồng đăng nhập lại.

Tất cả response có no-store/private, nosniff, no-referrer, CORP same-origin,
COOP same-origin, COEP require-corp, CSP default-src none/frame-ancestors none,
HSTS. UI navigation/assets/SW cần tự triển khai và kiểm các header tương ứng.
Response có X-Request-Id, và sau xác thực có X-User-Id/X-Session-Id.
Không đưa response API, redirect hay ảnh riêng vào cache công cộng.

Dữ liệu không nhận field lạ tại các envelope có schema. userId/ownerId/role
không được nhận từ JSON cá nhân. UUID là ID có kiểm scope, không là quyền truy cập.
Byte upload có giới hạn policy; không nhận nén HTTP; JSON depth bị chặn;
__proto__/prototype/constructor bị từ chối. Các string không bị cắt đuôi.

## JSON/lỗi chung

~~~json
{"error":{"code":"QUOTA_EXCEEDED","details":{"dimension":"money-day","currency":"USD","unit":"micro","period":"2026-09-08","used":60,"requested":60,"limit":100},"requestId":"server-generated-uuid"}}
~~~

details không phải trường bắt buộc. Không trả exception/stack/provider message.
Quota trả đúng dimension, used/requested/limit và kỳ/currency nếu liên quan.
401 AUTH_REQUIRED/SESSION_INVALID; 403 OWNER_REQUIRED/REAUTH_REQUIRED/
CSRF_REJECTED/ORIGIN_REJECTED/POLICY_BLOCKED; 404 NOT_FOUND cho ID ngoài scope;
400 cho confirmation/JSON sai; 409 conflict/trạng thái/version nghiệp vụ; 410 OPERATION_RETIRED;
413 BODY_TOO_LARGE/QUOTA_EXCEEDED; 415 content type/encoding; 422 capability,
key hoặc ngân sách chưa sẵn; 428 IF_MATCH_REQUIRED; 429 quota/rate/concurrency;
502 upstream; 503 cấu hình/kho secret/restore hold/cloud chưa sẵn; 500 lỗi nội bộ.

Settings, policy, budget trả ETag dạng "rN". PUT cần If-Match: "rN", gồm dấu
ngoặc kép. Settings chưa lưu là revision 0. Conflict settings đã commit riêng
hai bản; lỗi 409 SETTINGS_CONFLICT trả id, revision hiện tại, current, incoming.
Client phải giữ input khi bất kỳ write nào thất bại. Không tự retry mutation
không idempotent khi mất phản hồi.

## Tài khoản và OIDC

| Method /path | JSON vào | JSON ra / semantics |
| --- | --- | --- |
| GET /health | — | apiVersion, status, identityConfigured, capabilities (không chứa danh tính). |
| POST /auth/start | {deviceId:UUID, inviteToken?:string, reauth?:boolean} | {authorizationUrl}; set cookie __Host-arch_oidc, TTL 10 phút. Navigate cùng tab tới URL. |
| GET /auth/callback?state=…&code=… | query từ IdP | Xác minh token RS256; 303 Location: /; set __Host-arch_sid. Không trả code/token qua JSON. |
| GET /me | — | user:{id,role,status,authVersion}, sessionId, csrfToken, deviceId, absoluteExpiresAt, idleExpiresAt, serverTime. Timestamps epoch ms UTC. |
| POST /logout | {} | {loggedOut:true,oldSessionId,localDataAction}; thu hồi phiên, hủy job thuộc phiên theo best effort, hủy auth flow, clear hai cookie. |
| POST /offline/lease | {deviceId:UUID} đúng device của phiên | {lease:{kid,payload,signature},publicKey:JWK,serverTime}. Ed25519 ký chuỗi payload base64url; payload chứa type,userId,deviceId,authVersion,issuedAt,expiresAt. TTL 24 giờ. |
| GET /policy | — | policy có version, xem được bởi member để giải thích giới hạn. |

SID là token ngẫu nhiên 256 bit; DB chỉ giữ SHA-256; không có kho mật khẩu.
Cookie Secure/HttpOnly/SameSite=Lax/Path=/; absolute 12h và idle 60m cưỡng chế
server, không dựa vào Max-Age ở client. authVersion/active status được kiểm ở
mỗi request và kiểm lại sau đọc body/await liên quan trước khi commit.
Đăng nhập, reauth, switch cấp sessionId mới. Chuyển vai trò cần luồng reauth
max_age=0/prompt=login và auth_time mới; quyền nhạy cảm có TTL 5 phút.

## Quản trị — owner, không có quyền đọc dữ liệu riêng

| Method /path | JSON vào | JSON ra / semantics |
| --- | --- | --- |
| GET /owner/users | — | {users:[{id,issuer,subject,role,status,authVersion}]}. |
| GET /owner/invites | — | {invites:[{id,user_id,expires,consumed,revoked}]}, tối đa 500 lời mời mới nhất; không có token/hash. |
| POST /owner/invites | {issuer,subject,confirm:"invite"} | 201 {inviteId,userId,inviteToken,expiresAt}. Token chỉ hiện lần này, DB giữ hash. |
| POST /owner/invites/:id/revoke | {confirm:"revoke:<inviteId>"} | {revoked:true}. |
| POST /owner/invites/:id/resend | {confirm:"resend:<inviteId>"} | Lời mời mới; token cũ vô hiệu; vẫn cùng userId. Không tự gửi email. |
| GET /owner/users/:id/deletion-impact | — | counts settings/artifacts/credentials, backupPurgeDays:30, auditRetentionDays:90, downloadedCopiesRevocable:false. |
| POST /owner/users/:id | {action,confirm:"<action>:<userId>",role?} | User sau thay đổi. action=suspend/restore/delete/revoke-sessions/role. role=owner/member chỉ khi action=role. |
| PUT /owner/policy | Policy JSON, If-Match | Policy version tăng; audit; không sửa settings/snapshot cũ. |
| GET /owner/audit | — | {events:[{id,actor_id,target_id,action,at}]}, tối đa 500 mới nhất; giữ ít nhất 90 ngày. |
| GET /owner/infrastructure | — | userId, byte/object/stage và số request AI qua app; không tiền/prompt/ảnh/key/label. |
| GET /owner/deletion-tasks | — | deadline và trạng thái backup purge chưa được xác nhận. |

Mời gắn **chính xác issuer + subject của OIDC client**; không dùng email làm
khóa. Lời mời không đăng nhập trước xác minh IdP, hết hạn đúng 7 ngày và dùng
một lần. UI có thể chuyển token bằng fragment rồi POST body; không log link.
Không có public register/bootstrap/reset-password.

Active owner cuối không được delete, suspend hay demote. Suspend giữ dữ liệu.
Delete loại settings/conflicts/budget/ảnh khỏi kho hoạt động, xóa ciphertext,
thu hồi sessions, chặn gửi mới; job đã gửi chỉ giữ metadata kế toán tối thiểu.
Không cam kết đã purge backup hoặc tệp tải về: xem ISSUES.md.

## Settings và usage

Settings write: {schemaVersion:1,values:{…},resolveConflictId?:UUID}.
GET trả schemaVersion, revision, values, scopes, provenance, blocked.
scopes mỗi setting có scope=user/source=user-default; provenance ghi source,
baseRevision, at và conflict đã giải quyết.

Các key user cho phép: units(mm|in), language, fontSize(10..48), designDefaults,
printerProfiles, calibrationProfiles, presets, uploadedFontReferences, favorites,
recent, savedPrompts, aiSelection, shortcuts, panelPreferences. aiSelection:
{providerId,modelId,modelVersion,quality?,size?}. Không có credential trong settings.
Giới hạn số record: profiles/calibrations 50, presets 20, font references 8,
favorites 4096, recent 27, prompts 30. Calibration phải khai printerIdentity,
nozzle, material, slicer, profileHash; validation/áp vào domain là bước tích hợp riêng.

| Method /path | JSON vào | Ra |
| --- | --- | --- |
| GET /settings | — | Settings + ETag. |
| PUT /settings | Settings write + If-Match | Settings; 409 giữ cả hai bản khi revision lệch. |
| GET /settings/conflicts | — | {conflicts:[{id,baseRevision,current,incoming,created}]} tối đa 100. |
| DELETE /settings/conflicts/:id | {confirm:"discard:<id>"} | {discarded:true}, scope cá nhân. |
| GET /settings/export | — | Chỉ {schemaVersion:1,values}, không device/session/credential/ledger. |
| POST /settings/import | {mode:"merge"|"replace",confirm:"import:<mode>",document:{schemaVersion:1,values}} + If-Match | Merge nông theo key, hoặc replace tường minh; cùng conflict semantics. |
| POST /settings/reset | {confirm:"reset-settings"} + If-Match | values={}, giữ credential và ledger. |
| GET /me/usage | — | bytes,stagedBytes,objects,quotas,sync theo kỳ ngày UTC. |

Sync đếm UTF-8 accepted settings/AI payload/budget và key+label khi gửi kết nối.
Storage đếm nội dung user settings/conflict/credential/budget/job/ảnh và reservation
stage; số byte này không phải kích thước vật lý SQLite/WAL/index/backup.
Quota từ chối không làm mất dữ liệu đã commit. Http rate/concurrency áp dụng
cả các endpoint cá nhân ngoài AI.

## Credential và ngân sách cá nhân

| Method /path | JSON vào | Ra |
| --- | --- | --- |
| GET /ai/providers | — | Metadata adapter có version/models/prices/capability và allowed; mặc định rỗng, có xAI khi operator bật adapter. |
| GET /ai/credentials | — | {credentials:[{id,providerId,endpointId,label,masked,status,version,lastChecked}]} chỉ của mình. |
| POST /ai/credentials | {providerId,endpointId,label,key} | 201 metadata; status=unchecked, version=1; tối đa 16 record/user. |
| PUT /ai/credentials/:id | {key,label,version} | Replace, version tăng, cần kiểm lại; job cũ bị hủy/unknown theo giai đoạn. |
| POST /ai/credentials/:id/check | {version} | Chỉ adapter có phép kiểm cost=0 đã khai; không sinh ảnh; trả status/lastChecked, không key. |
| POST /ai/credentials/:id/disable | {version,confirm:"disable:<id>"} | disabled; muốn hoạt động lại phải replace/check tường minh. |
| DELETE /ai/credentials/:id | {version,confirm:"revoke:<id>"} | revoked, ciphertext=null; không tự thu hồi key tại provider. |
| GET /ai/budget | — | {revision,money:[MoneyLimit]} + ETag. |
| PUT /ai/budget | {money:[MoneyLimit]} + If-Match | Budget mới. [] tắt tạo mới. Không xóa ledger/reservation. |

MoneyLimit = {currency:"USD",perOperationMicros:1000000,perDayMicros:10000000,
perMonthMicros:50000000}. Mỗi đơn vị micro = 10^-6 của currency đó, integer an toàn
0..10^12. Không nhận float, không đổi currency. Đây là ví dụ schema, không phải
hạn mức đã được người dùng chấp nhận. Phải có cả ba user limit >0 cho currency
adapter. Trần system cùng currency/đơn vị/kỳ lấy min; request/byte/concurrency
kiểm độc lập. Kỳ ngày/tháng UTC; UI quy đổi hiển thị.

## Job và kết quả

POST /ai/jobs dùng Idempotency-Key là UUID và JSON:
~~~json
{
  "operationId":"11111111-1111-4111-8111-111111111111",
  "credentialId":"22222222-2222-4222-8222-222222222222",
  "modelId":"id-from-registered-adapter",
  "modelVersion":"pinned-version",
  "projectId":"33333333-3333-4333-8333-333333333333",
  "projectRevision":"local-revision-or-hash",
  "prompt":"Nội dung user chọn gửi",
  "options":{"quality":"supported-value","size":"supported-value"}
}
~~~

Prompt tối đa 4.000 grapheme, options chỉ quality/size. Reference images chưa có
adapter thực, không nhận arbitrary URLs/base64/field ngoài hợp đồng. Prepare
chỉ validate/lưu và lấy quote, không gửi nội dung cho provider.
Ra 201 {job,reused:false}, hoặc 200 cùng job cho replay khớp. operationId và
idempotency key đều scoped theo user, cùng key khác payload trả 409. Tombstone
trả 410 vĩnh viễn sau khi ledger/dedup record được dọn.

Job có id,operationId,ownerId (server suy),credentialId/Version,providerId,
endpointId,adapterVersion,modelId/Version,projectId/Revision,originSessionId,
payloadHash,quote,quoteHash,state,sequence,createdAt,updatedAt,submittedAt,
accounting,cancelRequested,requestId,errorCode,resultDisposition:"tray",artifacts.
Không chứa plaintext key. Quote có currency,maxCostMicros,maxOutputBytes,
priceVersion/Date,inputLimit,outputLimit,unknowns,adapter/model version,expiresAt,
dataToSend,recipient; TTL 10 phút.

| Method /path | JSON vào | Ra |
| --- | --- | --- |
| POST /ai/jobs | Envelope trên + Idempotency-Key | Prepare hoặc replay job. |
| POST /ai/jobs/:id/submit | {quoteHash,consent:true,acknowledgeAdditionalCharge?:true} | 202 {job}; atomic reserve, kiểm lại quyền/key/policy, gửi tối đa một lần. Replay trả trạng thái hiện tại, kể cả terminal. |
| POST /ai/jobs/:id/cancel | {} | {job}; trước gửi cancelled/release; sau gửi unknown/best effort, có thể tính phí. |
| POST /ai/jobs/:id/close-unknown | {reason:string} | {job}; giữ nguyên cap/liability ở kỳ gốc, không actual=0. |
| GET /ai/jobs/:id | — | {job}. |
| GET /ai/jobs/:id/input | — | {input}, prompt chỉ đúng chủ; null sau xóa dữ liệu. |
| GET /ai/jobs/:id/events | — | {events:[{seq,state,at}]}, seq tăng theo DB commit. |
| GET /ai/jobs hoặc /ai/costs | ?from=epochMs&to=epochMs&providerId=&jobId=&state=&limit=1..100&after=jobId | {jobs,nextCursor,unresolved,scope}. from inclusive/to exclusive, theo createdAt. unresolved mọi kỳ được trả riêng. |
| GET /ai/artifacts/:id | — | Metadata byteLength/hash/mediaType/jobId, thumbnailAvailable:false. |
| GET /ai/artifacts/:id/download | — | Byte ảnh, attachment; bắt buộc phiên và quyền cá nhân. |
| POST /ai/artifacts/:id/download-ticket | {} | {url,expiresAt}, TTL 5 phút; chữ ký gắn artifact/user/session/authVersion. URL vẫn cần cookie đúng user. |
| GET /ai/artifacts/:id/download?ticket=… | — | Như download, kiểm thêm chữ ký/expiry/audience. |
| GET /ai/artifacts/:id/thumbnail | — | 422 THUMBNAIL_UNSUPPORTED cho chủ; 404 cho người khác. |
| /cloud/* | — | 503 CLOUD_PROJECTS_DISABLED sau kiểm quyền. |
| /ai/callback và webhook tự do | — | 404; không có generic callback công khai. |

accounting: currency,unit:"micro",day,month,estimatedMicros,actualMicros(null nếu
chưa biết),basis(none|pending|estimated|actual),reservedMicros,unresolved,
closedReason. Estimated terminal vẫn giữ cap trong phép kiểm ngân sách, dù
reservedMicros=0. Unknown giữ pending reservation ở kỳ phát sinh và giải phóng
slot active. Xem PROVIDERS.md để đối soát muộn, restart và retention.
