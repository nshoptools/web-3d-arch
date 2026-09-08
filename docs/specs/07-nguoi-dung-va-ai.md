# Người dùng, cài đặt cá nhân và chi phí AI

Thuộc [đặc tả 1.0.1](README.md). Đây là yêu cầu hiện hành của chủ dự án ngày
2026-09-07, thay các câu “không có máy chủ ứng dụng” và “chủ quản lý chi phí AI”
trong tài liệu cũ. Các giá trị vận hành dưới đây là quyết định thiết kế ban đầu,
không phải hạn mức đã đo hoặc điều khoản của nhà cung cấp.

### ACC-01 — Nhóm kín và vòng đời thành viên

Một nhóm nội bộ, hai vai trò ứng dụng: **owner** và **member**. Owner cũng có
không gian cá nhân như member. Không đăng ký công khai. Owner tạo lời mời gắn
định danh đăng nhập, hết hạn sau 7 ngày, dùng một lần; được thu hồi/gửi lại.
Liên kết mời không tự tạo phiên đăng nhập. Dùng nhà cung cấp định danh có sẵn
qua redirect/OIDC; không tự xây kho mật khẩu trong v1. Định danh bền là user ID
nội bộ gắn `(issuer, subject)`, không dùng email hoặc tên hiển thị làm khóa dữ liệu.

Trạng thái: invited → active → suspended → active, hoặc active/suspended →
deleted. Người bị suspended/deleted không tạo phiên hoặc request dịch vụ mới.
Owner xem danh sách, đổi vai trò, đình chỉ, khôi phục, thu hồi phiên và xóa thành
viên qua thao tác có xác nhận; không xóa/hạ quyền owner cuối cùng. Chuyển quyền
owner cần xác thực lại và ghi audit. Bootstrap owner là thao tác triển khai có
kiểm soát, không endpoint công khai “người đầu tiên là admin”.

Session cookie Secure/HttpOnly, SameSite phù hợp redirect, hết hạn tuyệt đối
12 giờ và idle 60 phút; thay role/status tăng `authVersion` và kiểm tại server
trước mọi thao tác được bảo vệ. Request đã gửi tới provider trước khi thu hồi có
thể vẫn hoàn tất/tính phí; không gửi job mới, không tự retry job đó.

### ACC-02 — Ma trận quyền và sở hữu

| Thao tác | Member | Owner |
| --- | --- | --- |
| Quản lý thành viên, chính sách hệ thống | Không | Có |
| Đọc/sửa cài đặt, prompt, favorite, profile cá nhân | Của mình | Của mình |
| Thêm/đổi/xóa thông tin kết nối AI | Của mình | Của mình |
| Dùng AI, xem chi phí và kết quả riêng | Của mình | Của mình |
| Đọc/sửa/xóa dự án cá nhân | Của mình | Của mình |
| Xem audit quản trị và mức sử dụng hạ tầng tổng hợp | Không | Có, không chứa secret/prompt/ảnh |

Dự án và asset người dùng mặc định riêng tư; làm chung nhóm không tự chia sẻ
mọi dự án. V1 trao đổi qua gói xuất/nhập do người dùng chủ động, bản nhập có owner
mới và provenance nguồn, không chuyển API key hoặc ledger. Cộng tác cùng sửa,
link chia sẻ cloud và tổ chức nhiều nhóm là mở rộng có ACL riêng.

Server suy owner từ phiên đã xác minh. Mọi CRUD, list, tìm kiếm, thumbnail,
download, signed URL, job poll/cancel/result và credential lookup đều kiểm scope;
ID/UUID khó đoán không thay quyền. DB query và object store luôn gắn user ID.
Dedup hash không được tiết lộ asset người khác có tồn tại hay không. URL tải
tạm thời gắn tài nguyên/người nhận, TTL tối đa 5 phút; không log URL có chữ ký.
Các nguyên tắc phân quyền theo [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

### ACC-03 — Phạm vi cài đặt và thứ tự áp dụng

Bốn loại dữ liệu tách biệt: chính sách hệ thống (owner); mặc định cá nhân; snapshot
dự án; trạng thái giao diện trên thiết bị. Chính sách đặt miền cho phép/quota,
không ghi đè âm thầm giá trị cá nhân. Với dự án mới: mặc định sản phẩm → mặc định
cá nhân hợp lệ → preset được chọn. Với dự án đã lưu: snapshot dự án thắng mặc
định mới; áp profile/preset là lệnh tường minh có undo và xem phần thay đổi.

Policy mới làm giá trị cũ ngoài miền: giữ nguyên và gắn `policy-blocked`, chặn
tính năng phụ thuộc, hiện policy/giá trị/cách chọn lại. Không fallback provider,
không sửa snapshot hoặc rebuild tự động. Gỡ policy phục hồi khả năng dùng giá
trị cũ nếu còn hợp lệ. Policy không được ép nguồn thiết kế thay đổi âm thầm.

Thiết lập riêng gồm đơn vị hiển thị/ngôn ngữ/cỡ chữ, panel/phím tắt, máy/nozzle/
filament/lịch lớp, hồ sơ hiệu chuẩn, mẫu, font tự nạp, favorite/recent, prompt,
provider/model/giới hạn AI. Credential nằm ở kho riêng, không ở JSON cài đặt.
Giá trị UI trên thiết bị không làm đổi hình học dự án. Chọn màu/khe tay giữ
`origin=user`; áp preset không mang màu không được đặt lại màu/khe.

Mỗi setting khai `scope=system|user|device|project` và nơi giá trị có hiệu lực
đến từ đâu. Thư mục mirror/handle, trạng thái drawer theo màn hình và bộ offline
thuộc device; đơn vị, ngôn ngữ, tùy chọn thiết kế và kết nối AI thuộc user.
Hồ sơ hiệu chuẩn là dữ liệu user có thể đồng bộ nhưng pin đúng printer identity,
nozzle/vật liệu/slicer; không tự áp sang máy khác chỉ vì cùng tài khoản. Project
lưu snapshot profile/hash đã áp. Bản JSON cài đặt không chứa device handle,
secret hoặc định danh phiên; import không tự đổi owner hay quyền.

Local DB/OPFS phân vùng `userId + projectId + schemaVersion`; Web Lock writer
gắn `userId + projectId` trong origin, chung cho cả migration và mọi schema
version, để hai bản app không cùng ghi dự án. Tab sau của cùng dự án read-only.
Cùng user nhiều thiết bị dùng revision/ETag để đồng bộ
cài đặt; conflict giữ cả hai bản, cho chọn/merge và ghi provenance. V1 bắt buộc
đồng bộ cài đặt cá nhân, metadata tài khoản và cấu hình AI; cloud backup dự án
là tùy chọn theo DAT-02/STO-01, không tự tải file sáng tác lên khi đăng nhập.

Server cưỡng chế quota theo user cho tổng byte/số object cloud, kích thước
settings, byte upload/đồng bộ mỗi kỳ và rate/concurrency mọi endpoint bảo vệ,
kể cả không dùng AI. Giá trị thuộc policy triển khai có version; thiếu quota
thì không bật dịch vụ liên quan ở G4/O-05. Reservation upload/commit atomic,
tính cả dữ liệu đang stage; từ chối quá trần có mã/giá trị đã dùng và giữ dữ
liệu đã commit. Member xem mức dùng của mình, owner xem số liệu hạ tầng cần
quản lý theo user, không vì thế được đọc nội dung hoặc chi tiêu AI riêng.

### ACC-04 — Offline, đổi người dùng và vòng đời dữ liệu

Chỉ sau một lần login online thành công mới được tải bộ offline. Quyền mở lại
workspace offline tối đa 24 giờ từ lần xác minh online, gắn đúng user/thiết bị;
server không thể bảo đảm thu hồi tức thời khi thiết bị mất mạng. Hết hạn chỉ còn
cứu/xuất dữ liệu local hiện có và hướng dẫn đăng nhập; không mở phiên dịch vụ mới.
Không có AI, đồng bộ, thay role hoặc quản lý thành viên khi offline.

Lease có user/device/authVersion và mốc UTC/expiry do server ký. Trong phiên
dùng thời gian đơn điệu cộng mốc server; khi mở lại kiểm cùng wall clock và
mốc đã thấy gần nhất. Phát hiện đồng hồ lùi quá 5 phút hoặc lease không hợp lệ
thì chuyển cứu dữ liệu và yêu cầu xác minh online, không gia hạn theo đồng hồ
đã lùi. Đây là kiểm ở client có giới hạn: không chống người kiểm soát thiết bị
sửa code/kho local, không dùng lease làm xác thực API phía server.

Logout/switch user đóng Worker/job hiển thị, hủy handle, clear bộ nhớ UI và cache
riêng của user khỏi phiên truy cập; phản hồi muộn không được gắn vào user mới.
Chế độ thiết bị mặc định `private`: logout giữ byte local và đóng quyền truy
cập trong UI. `shared` do user chọn tường minh: trước khi xóa local phải kê
các dự án chưa có bản sao được xác nhận theo revision/hash. Chỉ xóa sau xuất/
sao lưu thành công hoặc xác nhận hai bước “xóa vĩnh viễn” có danh sách cụ thể;
không coi commit local là backup. Nếu chưa xử lý thì logout vẫn thu hồi phiên,
giữ byte riêng chờ đúng user đăng nhập lại; hết phiên/đình chỉ không tự purge.
Không tự xóa tệp xuất/mirror người dùng đã chọn trên đĩa. App shell/font công cộng có thể
dùng chung cache; API response, thumbnail và project riêng không vào cache chung.

Owner đình chỉ là cách thu hồi truy cập, không tự xóa dữ liệu. Xóa tài khoản có
màn kê tác động: ngừng job mới, thu hồi credential/session, xóa cloud cá nhân,
quy trình backup purge tối đa 30 ngày, audit tối thiểu giữ 90 ngày. Job đã chạy
giữ metadata kế toán tối thiểu theo chính sách này; secret xóa khỏi kho hoạt
động ngay, không sao lưu khóa plaintext. Người dùng tự thu hồi key tại provider
nếu cần vô hiệu hóa ngoài website. Không tuyên bố xóa từ xa bản đã tải.

### AI-01 — Từng người tự trả nhà cung cấp

V1 dùng **BYOK**: mỗi user tự tạo/quản lý tài khoản thanh toán và API key của
nhà cung cấp AI được hỗ trợ. Adapter có thể thêm OAuth riêng khi provider cho
phép đúng phạm vi/tính phí; không giả OAuth đăng nhập website cũng cấp quyền AI.
Chi phí AI được nhà cung cấp tính vào tài khoản của user đó. Chi phí hosting/
lưu trữ của website là ngân sách vận hành riêng, không đồng nghĩa phí AI.

Không có ví chung, tự bán lại credit hoặc tự dùng key của owner. Chưa cấu hình
key hợp lệ thì nút Tạo nêu “Kết nối AI của bạn”; các chức năng thiết kế vẫn dùng
được. Key hết tiền/quota/không có model báo chính xác, không đổi sang provider,
model hoặc key người khác. Tạo ảnh là ngoại lệ có truyền prompt/ảnh ra ngoài.

Owner chỉ chọn danh sách provider/endpoint được phép, trần hạ tầng và chính
sách bảo mật. User tự chọn provider/model/quality/size và hạn mức cá nhân trong
phạm vi ấy. Mỗi adapter khai model IDs/khả năng/image limits/giá và ngày lấy giá;
thay model không được thực hiện ngầm trên dự án/request đang chạy.

### AI-02 — Kho secret và biên tin cậy

User nhập key qua HTTPS tới backend cùng origin. Lưu mã hóa có xác thực bằng
key quản lý ngoài DB, kèm key version; dịch vụ proxy giải mã trong thời gian gửi
request. Mỗi credential có ownerId/providerId/endpointId/status/version; client
chỉ thấy nhãn, phần che và ngày kiểm tra. Không trả lại secret đầy đủ sau khi lưu.
Không lưu key trong localStorage, OPFS, IndexedDB, service worker, project ZIP,
prompt, telemetry, lỗi, URL, frontend bundle hoặc WASM. Reset/export cài đặt không
đụng key ngoài hành động quản lý kết nối tường minh.

Owner qua UI/API quản trị không đọc/dùng key của member; người vận hành máy chủ
có đặc quyền hạ tầng vẫn nằm trong biên tin cậy. Đây là mã hóa khi lưu, không
phải E2EE chống người vận hành. Rotation/revoke không sửa byte dự án. Provider
allowlist kiểm scheme/host/port/redirect, chặn SSRF/private metadata endpoints;
không nhận URL tùy ý rồi gắn key. Nguyên tắc vòng đời secret theo
[OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html).

### AI-03 — Giao dịch, hạn mức và retry

Mỗi lượt tạo có `operationId`, userId, credentialVersion, provider/model version,
project revision, hash payload và idempotency key; secret không nằm trong record.
Trạng thái chuẩn: prepared → reserved → submitted → running → succeeded/failed/
cancelled/unknown. Có thể bỏ running nếu provider trả đồng bộ. `unknown` dùng
khi đã gửi mà không biết provider có xử lý hay tính phí chưa.

Trước gửi: kiểm active membership và quyền credential, validation, user chấp
nhận dữ liệu/giá dự kiến, giữ chỗ ngân sách atomic theo user+currency+period.
Trần hiệu lực là thấp hơn giữa user và system **trong cùng đơn vị và kỳ**;
kiểm độc lập từng chiều tiền/currency, request, byte và concurrency. Vi phạm
bất kỳ chiều nào đều chặn, UI nêu đúng chiều; không so tiền với số request.
Không có ngân sách hợp lệ thì AI tắt. User đặt giới hạn mỗi lượt/ngày/tháng; trần hạ tầng có thể theo request,
concurrency/byte. Mặc định tối đa 1 job AI đang gửi/chạy mỗi user; admin có thể
nới bằng policy. Kỳ theo UTC, hiển thị quy đổi giờ local; giữ nguyên currency,
không cộng tiền khác currency nếu thiếu tỷ giá có nguồn/ngày.

Estimate có bảng giá/version, input/output được giới hạn và phần chưa biết.
Nếu không xác định được trần chi phí theo adapter thì chưa cho gửi tác vụ có
tính phí bằng adapter ấy. Ledger của app chỉ đo request qua app, không bao gồm
user dùng key nơi khác. Hóa đơn provider là số đối soát cuối; chưa lấy được chi
phí thật phải ghi estimated/pending, không ghi số 0 là thực tế.

Double-click/reload/reconnect/retry cùng operationId trả cùng job. Server giữ
dedup ít nhất 30 ngày và lưu trạng thái terminal lâu bằng ledger 90 ngày. Payload
khác trên cùng key bị từ chối. Retry ở giai đoạn chắc chắn chưa gửi được phép;
sau submitted chỉ retry bằng idempotency/status API provider đã kiểm. Provider
không có cơ chế ấy thì giữ unknown và reservation, cho kiểm tra/đối soát; bấm
“Tạo lượt mới” là ý định mới có cảnh báo có thể phát sinh phí lần nữa.

Hủy là best effort; không hứa hoàn tiền. Unknown giữ reservation trong **kỳ
phát sinh**, không chiếm slot job đang chạy và không chuyển trừ vào kỳ mới.
Sang kỳ mới giữ mục unresolved riêng để đối soát, nhắc trên trang Chi phí;
settlement muộn cập nhật đúng kỳ gốc. User đóng unknown phải ghi lý do: giữ
trần ước tính như nghĩa vụ chưa đối soát, không xóa nó để mở lại ngân sách kỳ
gốc, không đổi thành actual=0. Ledger/dedup hết thời gian lưu phải có tombstone
ngăn replay operation cũ. Commit result chỉ vào revision/user đã khai; dự án đã đổi thì đưa ảnh
vào khay kết quả để người dùng chọn áp, không ghi đè nguồn mới.

### AI-04 — Giao diện và nghiệm thu riêng tư

Menu tài khoản trên header mở Cài đặt cá nhân, Kết nối AI, Chi phí của tôi và
Đăng xuất. Owner có thêm Quản lý thành viên, Chính sách hệ thống; không tăng
sáu khu thiết kế thành các tab quản trị lẫn trong công cụ hình học. Mobile giữ
menu này trong header có tên truy cập được.

Lần đầu: login → cài đặt cá nhân → có thể bắt đầu thiết kế ngay; kết nối AI là
tùy chọn. Trang kết nối cho thêm/thay/xóa/kiểm tra key; kiểm tra không sinh ảnh,
nếu provider tính phí cho phép kiểm thì thông báo trước. Trang tạo cho thấy
provider/model, dữ liệu sẽ gửi, key đã che, ước tính/hạn mức, nút Tạo/Hủy và lịch
sử riêng. Thiếu mạng/key/credit/capability có lý do và đường sửa tương ứng.

Chi phí của tôi lọc thời gian/provider/job; tách estimated/actual/unknown và
reservation, liên kết request ID để tự đối soát. Owner chỉ thấy số request và
quota hạ tầng cần vận hành, không mặc nhiên thấy prompt/ảnh/chi tiêu cá nhân.
Nghiệm thu bắt buộc bằng ít nhất hai member và một owner, thử giả ownerId,
credentialId, jobId, thumbnail/download URL và callback đến sau logout.
