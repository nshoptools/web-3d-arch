# Kiểm thử của web-3d-arch

**Cần `tests/` ở gốc repo.** Đây là nơi lưu test tự động, fixture nhỏ và kịch bản
nghiệm thu có thể chạy lại trong Git. `tools/` giữ chương trình chạy/đo dùng lại;
`docs/` giữ đặc tả, giải thích và bằng chứng chắt lọc; `tmp/reviews/` giữ đầu ra của
một lần chạy. Không dùng phòng review tạm làm nơi duy nhất lưu regression test.

| Đường dẫn | Dùng cho |
| --- | --- |
| `specification/` | Kiểm ID yêu cầu/quyết định/check, tính tự chứa và hash fixture bền |
| `contracts/` | Hành vi public của bộ đọc đầu vào hiện có |
| `fixtures/corpus-v1/` | Corpus nguồn nhỏ bất biến, expectation độc lập; chưa phải kết quả mesh |
| `fixtures/slicer-profiles/v1/` | Hai mẫu cấu hình người dùng; chỉ parse JSON, không chạy JS/G-code |
| `fixtures/printing-reference/v1/` | Hai gói 3MF và danh mục bàn in; có hash và nhãn lỗi/giới hạn |
| `acceptance/` | Kịch bản nghiệm thu dự kiến, trạng thái unverified đến khi chạy thật |
| `tools/tests/run.ps1` | Runner tạo môi trường, log, exit code và summary trong phòng phiên |
| `tools/tests/verify-self-contained.ps1` | Tạo bản sao chỉ có đầu vào bền, chạy baseline và audit để kiểm tính độc lập |

Khi có triển khai thật mới thêm `unit/`, `integration/`, `e2e/`, `regression/`,
`oracles/` theo nội dung. Không tạo nhiều thư mục rỗng hoặc dựng framework frontend/
Rust chưa được chọn. Native Rust có thể giữ unit test trong module theo chuẩn
ngôn ngữ; test xuyên thành phần/corpus của sản phẩm vẫn tập trung tại đây.

## Chạy hiện tại

Từ gốc repo, PowerShell 7 và Node 20+ đã có trên máy:

```powershell
./tools/tests/run.ps1 -Seat codex -RunId 20260907-spec-tests -Suite baseline
```

`baseline` = hai suite **đã triển khai** `specification` và `input`; chọn riêng
bằng `-Suite specification` hoặc `-Suite input`. Runner tự dot-source project-env.
Kết quả nằm trong `tmp/reviews/<seat>/runs/<run>/evidence/` và `reports/`.
Baseline pass chỉ chứng minh các ca đó, **không** chứng minh UI/mesh/in 3D.
Runner trả 0=ca đã chọn chạy đạt, 1=fail, 2=không chạy được vì thiếu tool/điều kiện.
Không tự bỏ ca rồi trả 0. Kịch bản acceptance chưa có implementation không nằm
lén trong baseline; trạng thái của chúng được báo riêng trong summary.

Kiểm khả năng tái lập bằng bản sao chỉ có đầu vào bền (cần thêm Python 3.10+):

```powershell
./tools/tests/verify-self-contained.ps1 -Seat codex -RunId permanent-proof-01
```

Runner này sao chép các cây tài liệu/test/công cụ, bộ đọc font và đúng tài nguyên
vendor cần cho baseline vào một thư mục mới trong phòng phiên. Nó kiểm không có
cây dữ liệu tạm, cache hoặc Git trước khi chạy. Bản sao tự tạo thư mục đầu ra
riêng sau đó. Mỗi lần dùng RunId mới; không xóa hoặc ghi đè bản sao đã có. Kết quả
`self-contained-summary.json` ghi exit code và hash manifest/script đã thực thi.

Các kiểm chứng asset/input đầy đủ hiện có tiếp tục ở vị trí cũ:

```powershell
./tools/assets/verify-all.ps1 -Seat codex -RunId 20260907-asset-check
```

Không di chuyển/chép lại logic audit để làm đẹp cấu trúc. Đổi assets vẫn phải chạy
đúng [quy trình tài nguyên](../docs/assets/README.md); baseline không thay thế nó.
Test này chỉ dùng Node built-in và tài nguyên vendor, không npm install/global,
không mạng, không đụng browser dùng thật, không sửa file trong `src/`.

## Quy tắc thêm test và fixture

Mỗi test có invariant hoặc lỗi thực cần bắt, ID yêu cầu/ca ở đặc tả, input và oracle
rõ, kết quả deterministic nếu có thể. Không chỉ lặp công thức của implementation.
Dùng tên hành vi `*.test.mjs`; sau này framework khác theo runner riêng. Ca lỗi
phải kiểm không commit dở, không chỉ kiểm có exception. Property/fuzz có seed và
reproducer được giữ trong corpus regression riêng.

Fixture nhỏ và có quyền dùng; không chép cả thư viện font vào tests. Tham chiếu
nguồn ở `src/assets/` bằng path/hash/lock khi cần. Manifest có SHA-256, bytes,
nguồn, license/quyền, purpose, expectation và phương pháp oracle. Corpus v1 đóng
băng; thêm v2 hoặc regression case, không cập nhật expected tự động để biến test
đỏ thành xanh. Source SVG/lưới nhân tạo dùng kích thước giải tích kiểm độc lập.
Corpus nhỏ được tạo ở đây chỉ là **hạt giống**, chưa phủ toàn bộ định dạng/ca in.

Giữ nguyên fixture gốc, dẫn xuất riêng với recipe; mẫu có provenance chưa được
xác minh ghi rõ. Hai cấu hình slicer có quyền phân phối chưa chốt chỉ dùng nội bộ,
không tự đưa vào bundle/website. File `.js` mẫu phải trích literal JSON có kiểm
cấu trúc, **không import/eval/vm thực thi**. G-code trong nó không được gửi ra máy in.

Test không ghi snapshot/report/cache vào tests hoặc src. Dùng project-env đúng
ghế/run ở mọi process mới; browser profiles/downloads/screenshots và tool runtime
có cấu hình riêng trong run. Không dò chương trình ngoài phạm vi; oracle/slicer
ngoài phải được truyền đường dẫn/version. Không xóa đầu ra của ghế khác. Fixture
sạch không chứa token, profile người dùng hoặc dữ liệu riêng tư không cần thiết.

Quy tắc pass/fail/unverified/unsupported, độc lập oracle và cổng phát hành theo
[nghiệm thu](../docs/specs/04-nghiem-thu.md).
