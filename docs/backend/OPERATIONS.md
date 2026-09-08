# Cấu hình và vận hành

Không có credential hardcode và không có owner tự sinh qua public endpoint.
CLI không nạp provider AI từ URL hoặc từ JSON. Mặc định lệnh serve không đăng
ký adapter; `BACKEND_AI_ADAPTERS=xai-imagine` bật adapter đã ghim trong source,
theo [AI-ADAPTERS](AI-ADAPTERS.md). User vẫn cần key, ngân sách và consent riêng.
`/auth/start` chỉ hoạt động khi đã cấu hình OIDC.

Mọi lệnh từ repo phải dot-source tools/project-env.ps1 đúng ghế/run.
CLI yêu cầu PROJECT_REVIEW_RUN, kiểm data/key output nằm trong phòng phiên,
từ chối symlink/junction và ghi đè key/backup/restore đang có. Ví dụ sau dùng
đúng phòng đã ủy quyền; không tạo tệp ngoài repo hoặc thay PATH.

## Khởi tạo có kiểm soát

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId backend-runtime
$BackendPackage = $env:PROJECT_ROOT
$env:BACKEND_DATA_DIR = Join-Path $env:PROJECT_REVIEW_RUN 'work/runtime/data'
$env:BACKEND_KEYS_FILE = Join-Path $env:PROJECT_REVIEW_RUN 'work/runtime/key-material/keys.json'
$env:BACKEND_POLICY_FILE = Join-Path $BackendPackage 'docs/backend/policy.example.json'
$env:BACKEND_ORIGIN = 'https://HOST-DA-DUOC-CAU-HINH'
$env:BACKEND_OWNER_ISSUER = 'ISSUER-CHINH-XAC-TU-IDP'
$env:BACKEND_OWNER_SUBJECT = 'SUB-CHINH-XAC-CHO-OIDC-CLIENT'

node (Join-Path $BackendPackage 'src/server/cli.mjs') generate-keys
node (Join-Path $BackendPackage 'src/server/cli.mjs') bootstrap
~~~

Thay các giá trị chỉ dẫn bằng cấu hình thật trước khi bootstrap; không dùng
email thay sub hoặc owner dùng chung giữa các issuer. Bootstrap từ chối khi
đã có bất kỳ user nào. Key generation dùng CSPRNG, file exclusive-create;
stdout chỉ có trạng thái, không có khóa. Không dùng lại bộ key fixture của tests.

policy.example.json là **giá trị đề xuất triển khai cần thẩm định**, không phải
benchmark/cost đã được user chấp nhận. Mọi quota bắt buộc có giá trị; policy
ghi DB với version=1 rồi owner thay bằng If-Match. Allowed providers rỗng, không
có ngân sách AI mặc định. Các trần tiền nếu thêm là micro-currency mỗi lượt/
ngày/tháng, không được so tiền với request/byte. Tài nguyên thiết kế vẫn là local.

BACKEND_KEYS_FILE nằm ngoài DB: map vaultKeys base64 32 byte/version,
activeVaultKey, csrfKey 32 byte, leasePrivateKey Ed25519 PKCS8 PEM.
File phải được secret manager/OS ACL cấp đúng dịch vụ; mode 0600 trong code
không là bằng chứng ACL Windows. Không bundle/copy file này vào UI/project export.
Host operator là trusted boundary; đây không phải E2EE chống operator.
Backup của DB không kèm khóa giải mã; operator phải quản lý backup khóa riêng.

## OIDC và serve

Chép `docs/backend/oidc.example.json` thành file cấu hình riêng trong phòng phiên rồi thay
issuer, authorizationEndpoint, tokenEndpoint, jwksUri, clientId, authMethod
bằng metadata chính thức đã xác minh cho một IdP/client. Đăng ký redirect URI
chính xác BACKEND_ORIGIN + /api/v1/auth/callback. Luồng này dùng RS256, code,
PKCE S256, nonce, state gắn browser; không popup và không password store.

authMethod hỗ trợ none, client_secret_post, client_secret_basic.
Nếu confidential client: truyền secret OIDC qua BACKEND_OIDC_CLIENT_SECRET.
Đây là client authentication của website, tuyệt đối không là AI key chung.
Không import discovery/endpoint của member; URL cấu hình bị pin, HTTPS/443,
không userinfo/query/fragment/IP literal. Dịch vụ DNS chọn public IPv4 đã kiểm,
pin IP vào connection, timeout DNS/HTTP và không theo redirect.
Không hỗ trợ IdP chỉ có IPv6, JWE, thuật toán ngoài RS256 hoặc refresh tokens.

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId backend-runtime
$BackendPackage = $env:PROJECT_ROOT
# Các BACKEND_* từ phần bootstrap phải được đặt lại nếu dùng shell mới.
$env:BACKEND_OIDC_FILE = Join-Path $env:PROJECT_REVIEW_RUN 'work/runtime/oidc.json'
$env:BACKEND_PORT = '0'
node (Join-Path $BackendPackage 'src/server/cli.mjs') serve
~~~

Port 0 dùng OS-assigned; stdout báo address=127.0.0.1, port, pid, aiEnabled=false.
Ở host thực, cấu hình port riêng và reverse proxy HTTPS cùng origin, Host được
bảo toàn. Không expose trực tiếp cổng loopback; không dùng forwarded headers
để giả user. UI/navigation/assets/Service Worker do controller/host tích hợp.

CLI có writer.lock exclusive theo data dir. Chỉ hỗ trợ **một process backend**
trên một DB. Không cluster/serverless replica dùng chung DB; BEGIN IMMEDIATE/
WAL bảo vệ transaction nhưng concurrency/admission và OIDC flows còn trong
process. Restart hủy auth flow và đổi job đã gửi thành unknown; không tự retry.
Nếu process chết đột ngột, lock cố ý còn. Operator phải xác minh PID đã dừng
và đúng data dir trước khi xóa đúng lock; không tự takeover hoặc kill theo tên.

## Khóa và bảo trì

Thay API key của user: PUT credential → version tăng/unchecked → check tường
minh. Job cũ trước gửi bị hủy; đã gửi chuyển unknown và yêu cầu abort. Hủy không
bảo đảm provider không tính phí. Disable giữ ciphertext đã rebind AAD theo
version mới nhưng không cho reenable ngầm; replace/check để kết nối lại.
Revoke xóa ciphertext khỏi bảng hoạt động; user tự revoke ở nhà cung cấp nếu cần.

Master key rotation: thêm version mới vào key file, đặt activeVaultKey, giữ đủ
version cũ để đọc. Dừng serve, chạy rewrap-vault, sau đó mới loại key cũ khỏi
bộ đang dùng khi đã xét các backup. Toàn bộ rewrap là một transaction; giữ
credentialVersion, không đổi key provider. Thử restore backup trước khi hủy
master key cũ. Lệnh không in plaintext:

~~~powershell
node (Join-Path $BackendPackage 'src/server/cli.mjs') rewrap-vault
node (Join-Path $BackendPackage 'src/server/cli.mjs') maintenance
~~~

maintenance giữ terminal ledger ít nhất 90 ngày tính từ update cuối, audit ít
nhất 90 ngày, dọn phiên/counter cũ và giữ tombstone operation/idempotency lâu
dài. Unknown/pending không tự hết hạn, không tự đóng hoặc xóa reservation.
Tombstone không giữ prompt/ảnh/key. CLI maintenance vẫn yêu cầu writer.lock khi service đã dừng; B-11 bổ sung scheduler có batch giới hạn trong chính foreground serve. Xem RUNTIME-API.md và RUNTIME-RUNBOOK.md: restore hold chặn mutation, clock/DB-writer failures có diagnostic; shutdown chờ settlement ảnh đã nhận đang decode. Không cài lịch máy, không retry AI hoặc tự xác nhận backup purge.

## Backup và restore

~~~powershell
$env:BACKEND_BACKUP_FILE = Join-Path $env:PROJECT_REVIEW_RUN 'work/backups/backup-UNIQUE.sqlite'
node (Join-Path $BackendPackage 'src/server/cli.mjs') backup

$env:BACKEND_RESTORE_FILE = $env:BACKEND_BACKUP_FILE
$env:BACKEND_DATA_DIR = Join-Path $env:PROJECT_REVIEW_RUN 'work/restores/restore-UNIQUE'
node (Join-Path $BackendPackage 'src/server/cli.mjs') restore
~~~

Dùng SQLite backup API, quick_check/FK check, đích mới và không copy database
đang mở bằng filesystem. CLI khóa service cho thao tác vận hành. Restore mở
đích mới, revoke tất cả sessions/invites, tăng authVersion; service recovery
giữ submitted/running thành unknown. Settings/metadata được giữ.

Backup cũ có thể thiếu job đã gửi sau mốc backup. Restore đặt **AI hold bền
trong DB**, owner đổi policy vẫn không mở AI. Candidate B-05 bổ sung CLI
recovery-status/plan/check/apply dưới writer lock; xem [runbook](RECOVERY-RUNBOOK.md)
và [hợp đồng](RECOVERY-API.md). Chỉ gỡ hold trong cùng transaction với nghĩa vụ
đã đối soát khi phạm vi/bằng chứng khớp; phần thiếu giữ hold. Không xóa hold
bằng SQL. Sự thật hóa đơn và cutover vẫn do operator xác minh; tests synthetic
không thay thế bằng chứng ấy. Đăng nhập/settings vẫn hoạt động.

Test đã đo một backup/restore SQLite nhỏ trong phòng phiên. Chưa chứng minh
RPO 24h/RTO 8h, backup offsite/encrypted transport, lịch sao lưu, restore toàn
hạ tầng hoặc xóa toàn bộ bản backup trong 30 ngày. Khi xóa account, API tạo
deletion_tasks có deadline, không giả status hoàn tất. Audit không chứa prompt/
ảnh/key; các file access log bên reverse proxy cũng phải lọc URL/query/token
và có retention riêng đã kiểm trước G4.

