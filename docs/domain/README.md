# Domain v1 — hợp đồng tích hợp

Module đã tích hợp vào mã dự án; binding vào giao diện và kiểm trình duyệt còn đang thực hiện. Runtime nằm trong
`src/domain/*.mjs`: ESM thuần, không dependency, không I/O, không DOM/Node globals.
`index.mjs` là entry point. Node 24.19.0 và một realm VM không có Node globals đã
được dùng để kiểm; chưa chạy trình duyệt thật.

- `schema.mjs`: 126 ID gốc + 2 ID thay thế, 11 group, 5 preset, validation,
  dependency/applicability, constraints và metadata UI tách riêng.
- `decimal.mjs`: parse dấu phẩy/chấm, exact arithmetic theo 1 nm và rounding tường minh.
- `layers.mjs`: schedule có version/hash/source từng giá trị, datum, khoảng lớp, preview migration.
- `project.mjs`, `transactions.mjs`: snapshot theo loại, preview/diff/commit/undo.
- `migration.mjs`: dry-run catalog, impVox giữ provenance, bound strapSeg.
- `persistence.mjs`: mở/serialize snapshot, giữ nguyên text lạ version/field ở chế độ chỉ đọc.
- `field-dispositions.json` là bảng thực thi đầy đủ; `field-dispositions.md` là bảng đọc nhanh.
- `mode-default-dispositions.json` ghi từng giá trị trong cả 5 preset.
- `examples.json` có snapshot/preview minh họa; không phải dữ liệu geometry đã kiểm.

## Gọi từ bridge

```js
import {
  createProject, previewCommand, commitPreview, undoTransaction,
  effectiveValues, FIELD_SCHEMA, fieldAvailability,
} from './src/domain/index.mjs';

const state = createProject({
  product: 'keychain', sourceKind: 'svg',
  content: { source: { id: 'src:1', hash: 'source-hash' }, text: [], regions: [],
    overrides: { roles: {}, regions: {}, blocks: {} } },
});
const proposal = previewCommand(state, {
  id: 'parameters.set',
  args: { changes: [
    { id: 'size', value: '55,2' },
    { id: 'baseH', value: { heightMode: 'mm', mm: '2,4' } },
  ] },
});
// UI hiển thị proposal.diff/effects; bridge chỉ commit proposal đã được chấp nhận.
const committed = commitPreview(state, proposal);
const next = committed.ok ? committed.state : state;
const switched = previewCommand(next, {
  id: 'product.switch', args: { product: 'clicky' },
});
// Undo transaction trả một transaction nghịch; undo transaction nghịch là redo.
const back = committed.ok ? undoTransaction(next, committed.transaction) : null;
```

`previewCommand` không đổi đầu vào. Thành công trả candidate bất biến, diff JSON
Pointer, effects theo field (giá trị/ẩn-hiện/mm/lệch schedule), hash trước/sau.
`commitPreview` kiểm lại hash, revision và tính lại command; preview cũ hoặc bị sửa
không commit. Mọi lệnh thất bại trả `ok:false`, `state` đúng tham chiếu cũ,
`issues`; candidate lỗi nếu có chỉ phục vụ `proposedDiff`. Validation thấp hơn
ném `DomainError` với code/details, không ép kiểu boolean/enum.

`parameters.set` áp cả danh sách rồi kiểm constraint trạng thái cuối.
`parameters.reset` chỉ xóa origin user của ID được chọn.
`parameter.convert-to-layers` bắt buộc `binding` và `rounding`.
`schedule.set` đánh dấu chiều cao được sửa là user; `profile.apply` giữ từng
override user và báo khác biệt so với lịch profile. Chọn profile không chứng minh
tương thích slicer. Field `layerH` chỉ là alias `schedule.layerHeight`; setter
thông số không tạo thêm nguồn sự thật.

`effectiveValues` trả cả giá trị đang bị dependency/source gate ẩn.
`fieldAvailability` trả lý do product/source/dependency/capability và luôn giữ
giá trị. Năm gate trình bày (bước, gọn, lọc, hàng, gập) thuộc UI; metadata ở schema
không xóa state khi ẩn. `impOn/impOp/transforms/meshJoinTolerance` áp cả 5 loại
theo GEO-04. UI không dùng `input step=0.02` làm validity grid cho clr:
`stepFieldValue('clr', 0.05, +1)` trả 0.07, nhập 0.05 vẫn hợp lệ.

## Snapshot và ownership

`kind=web-3d-arch.project-domain`, `schemaVersion=1` là version subdocument
của worker này; parent ánh xạ vào hợp đồng project/bridge của main, không thay version
hợp đồng main bằng version này. `parameters.common` chứa field áp cả năm loại,
`parameters.byProduct[productId]` giữ field riêng. Mỗi entry có
`origin=auto|user`, `value`. Preset auto được tính theo loại đích; common user
và mọi product user được giữ. Inactive product có thể xung đột với lịch mới:
chỉ khi kích hoạt thì kiểm quan hệ chéo của loại ấy; xung đột từ chối chuyển loại,
cho UI diff/lựa chọn, không tự sửa.

`content` là payload JSON được giữ nguyên qua các command hiện có: source,
text, regions, color/slot/role/block overrides và metadata do parent sở hữu.
Nó chỉ được kiểm an toàn cấu trúc JSON; schema chi tiết chữ/vùng/material/fit chưa
được worker này xác nhận. Hãy đưa nguồn, chữ và lựa chọn tay vào snapshot cùng
transaction hoặc giữ reference bất biến trong bridge. `provenance.modeDefaults`
giữ toàn bộ preset tham khảo, kể cả ringOn=false không áp cho lego/charm.

Undo-ready ở đây là transaction chứa snapshot trước/sau và revision tăng đơn điệu.
Parent sở hữu history stack, ngân sách 20 transaction/24 MiB, dedup blob,
journal/OPFS/IDB và commit bền. Module không tự cắt lịch sử hay ghi storage.

## Đọc dữ liệu cũ

Mở file bằng `openProjectDocument(originalJsonText)`. Kết quả editable chứa
state đã kiểm. Với version/schedule/enum/field lạ hoặc số sẽ mất chữ số,
kết quả read-only giữ nguyên `raw`. `serializeProjectDocument(opened)` trả lại
đúng text đó. Duplicate/prototype key là rejected, vẫn giữ raw để sửa/backup.
Không đưa read-only/rejected envelope vào state có thể chỉnh.
Bảo toàn ở cấp JS text; BOM/encoding và byte nguồn file do parent giữ.

`planLegacyMigration(raw, schedule)` nhận
`{catalogVersion:"1.0.1",product,values:{...}}`, chỉ đề xuất. Plan giữ raw/hash,
từng giá trị gốc và vấn đề unresolved. Không áp cả proposedValues trực tiếp:
field riêng phải vào đúng product scope; thay thế chưa chọn và ID lạ phải được
giải quyết. Không suy origin auto chỉ vì giá trị bằng default. Dữ liệu v2 trong
catalog là version cấu trúc của catalog; không phải project version 2.

## Chạy lại

Từ repo root, trước mỗi process ghi:

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId domain-check
node --experimental-vm-modules --test --test-reporter=tap ./tests/domain/*.test.mjs
node ./tmp/reviews/codex/runs/domain-check/work/domain/tests/domain/write-evidence.mjs
```

Cờ experimental chỉ cho test realm ESM của Node; runtime sản phẩm không dùng
`node:vm`. Không có mesh/backend/UI hay chứng cứ in/fit trong phần này.
