# API 1 / unified Module ABI 2

`src/index.mjs` xuất `export3MFCore(request, module)` và
`export3MFProject(request, module)`. `module` là existing kernel Module ABI 2 đã khởi tạo. Package 0.2.0 không
tạo thêm WASM instance. `createUnifiedPrinting(module)` dùng cùng heap.

```js
const printing = createUnifiedPrinting(existingModule);
// Build thành công đã cấp primary lease. Không acquire lần nữa.
const lease = printing.adoptPrimaryLease(snapshotId, generation);
const result = await printing.exportSnapshot3MF(lease, request, {format:'project'});
// result.bytes: nonshared Uint8Array owned by JS, safe to transfer.
// metadata: SHA-256/byteLength/mediaType/manifest. report giữ qualification vector.
```

Snapshot request thay trường `mesh` bên dưới bằng:
`parts: {id,name,materialId,partIndex}[]`. partIndex 0-based ánh xạ đủ và duy nhất
mọi part ARCH/1; màu của material opaque phải khớp RGBA snapshot. Geometry unit
là mm theo ARCH/1; không có transform thêm. Profile, schedule, sourceHashes và
revision giữ nguyên contract của API flat.

`adoptPrimaryLease` chuyển quyền sở hữu primary có sẵn và không acquire.
`acquireReaderLease` tạo đúng một reader nếu UI còn giữ primary. Mỗi token chỉ
được consume bởi exportSnapshot3MF hoặc releaseLease đúng một lần. Export
tự release trong finally cả khi fail; caller không release lại. Nếu adopt/acquire
thất bại, caller vẫn chịu trách nhiệm lease mà nó đang giữ. describeLease chỉ
trả scalar metadata, không copy mesh; dùng trước khi token bị consume.

Đường flat `export3MFCore(request, existingModule)` và
`export3MFProject(request, existingModule)` vẫn hỗ trợ request sau. Nó clone
flat buffers rồi stage vào cùng Module; dùng snapshot API để tránh bản copy này.

Request (không có defaults ngầm):

```ts
type Sealed<T> = { payload: T; sha256: string }; // SHA-256 of canonical(payload)
type Request = {
  schemaVersion: 1; purpose: "inspection"; revision: string;
  mesh: {
    state: "complete"; revision: string; unit: "mm";
    vertices: number[] | Float64Array; // flat x,y,z, already placed in print coordinates
    faces: number[] | Uint32Array;    // flat index triples; no winding repair
    facePartIds: string[];            // one ID for every triangle
    parts: { id: string; name: string; materialId: string }[];
  };
  materialTable: {
    schemaVersion: 1;
    materials: { id: string; name: string; type: string; color: string;
                 slot: number; extruder: number }[];
  };
  printerProfile: Sealed<PrinterProfile>;
  schedule: Sealed<Schedule>;
  sourceHashes: { id: string; sha256: string }[];
};
```

`PrinterProfile` có `schemaVersion=1`, `id`, `adapterId`,
`slicer:{id,version}`, `printer:{model,nozzleDiametersMm,slotExtruders,
bedPolygonMm,maxZMm}`, `settings` JSON literal đã resolve,
`source:{id,sha256}`, `rights: internal-testing|user-provided|redistributable`.
Settings giữ nguyên preset người dùng; process preset X1C trong mẫu P1S không bị đổi.
Profile hash chứng minh tính bất biến của snapshot; source hash do caller cung cấp
không tự chứng minh quyền phân phối hay nguồn byte mà exporter chưa nhận.

`Schedule`: `schemaVersion=1`, `kind=constant-first-regular`,
`profileId`, `profileHash`, `firstLayerHeight`, `layerHeight`,
`origin:{firstLayerHeight:user|profile,layerHeight:user|profile}`.
Mọi giá trị là mm. Regular height được đối chiếu min/max trong snapshot nozzle.
Adaptive schedule chưa hỗ trợ. z(12) là 2.36 mm với .16/.20 và 2.45 mm với .25/.20;
nominal geometry không bị snap. API không đọc defaults cá nhân hoặc network.

Material ID bền; slot/extruder là số nguyên **1-based**. Core material indices là
0-based và được chuyển sang property IDs riêng của lib3MF. Polymer phải khớp
`filament_type` của slot trong profile. Chỉ màu opaque #RRGGBB / #RRGGBBFF.
Cùng slot + cùng polymer + cùng màu được hợp nhất, manifest giữ mọi alias; cùng
màu ở slot khác vẫn là vật liệu khác. Cấm cùng slot nhưng màu/polymer xung đột.
Bambu recipe này chặn hơn 4 slot (giới hạn candidate, không tuyên bố giới hạn máy);
U1 cần đúng 4 slot ánh xạ hoán vị tới 4 đầu phun 0.4 mm.

`normalizeSettings` / `remapProfile` là đề xuất chuyển slot tường minh, không
commit dự án. Matrix lấy hàng/cột theo source slot; multiple lấy block cố định;
nozzle/extruder và array fixed không đổi theo số filament. Mảng chưa có schema
được giữ nguyên cho snapshot không đổi và **chặn remap**. Không coi schema này
đã phân loại đầy đủ 582/549 key. Caller phải áp đề xuất bằng lệnh có diff/undo;
lịch cũ gắn profile hash cũ sẽ bị từ chối cho đến khi có snapshot lịch mới.

C ABI 1 ở `src/native/arch3mf.h`: create → add materials → add parts →
metadata/attachments → finish → copy bytes → destroy. Native Core dùng cùng
validator và lib3MF writer/reader. JS adapter thêm metadata hãng rồi đọc lại gói
cuối bằng `arch3mf_validate_output`; native host muốn adapter cần cùng recipe.
C++ không nhận/execute JS, G-code, path máy hay profile defaults.

Mỗi context là một giao dịch. Pointer đầu vào borrowed chỉ trong call; output do
context sở hữu, chỉ valid tới destroy/lỗi. Không free pointer bằng allocator khác.
Public JS sao chép trước await và sao chép byte đầu ra trước giải phóng context.
Một context mỗi job trong Worker kernel hiện có; host kiểm job/revision khi nhận
kết quả. Snapshot bridge chỉ borrow synchronous. Host serialize runtime calls và
không release lease đang export. Không có cancellation giữa native writer call;
host có thể chặn trước dispatch hoặc bỏ kết quả lỗi thời, vẫn trả lease. Việc
terminate Worker chung phải do parent điều phối vì nó hủy cả runtime/UI readers.
Không có stream xuất dở hoặc publish một phần.

Giới hạn: tổng ≤1M vertices, 2M faces, 128 parts, 64 material records trước
normalization; |coordinate|≤10,000 mm; conversion double→float error ≤0.001 mm.
Không có transform chưa bake, surface mesh, transparency, adaptive layers,
triangle painting hoặc extension bắt buộc ngoài production trong reader subset.
ZIP/ZIP64 ≤64 MiB archive, ≤256 entry, ≤64 MiB/entry, ≤128 MiB inflated total,
ratio≤1000. XML depth≤32, ≤2.2M elements, no DTD/entities; JSON≤2 MiB/depth32.

Luôn kiểm indices/finite/degenerate/duplicate faces, edge incidence + orientation,
connected cycle ở vertex link, thể tích dương từng component; kiểm lại sau ghi.
Readback đối chiếu cả material name/color/property IDs, assembly references và
identity transform ở từng component/build item với giao dịch gốc.
Không chứng minh general self-intersection/inter-part overlap/union/bed exclusion,
source shaping hoặc physical fit. Những mục này giữ unverified. Parent chịu
trách nhiệm identity/ACL, assembly-view/unapplied edits, scene-level validation,
bed placement, revision gating và capability registry. Không gửi mesh đến mạng.

## C ABI bổ sung

Header `src/native/arch3mf.h` vẫn báo printing ABI 1; runtime.h của main vẫn ABI 2.
Exact symbol list: `cmake/unified-exports.json` (gồm malloc/free của Module chung).
Header `src/native/kernel_bridge.h` khai:

```c
uint32_t arch3mf_kernel_abi_version(void); /* 2 */
int32_t arch3mf_add_snapshot_part(void *context, uint32_t snapshot,
  uint32_t generation, uint32_t part_index, const char *name, uint32_t material);
int32_t arch3mf_add_part_range(void *context, const char *name,
  const double *xyz, uint32_t vertices, const uint32_t *triangles,
  uint32_t faces, uint32_t vertex_base, uint32_t material);
```

Snapshot call kiểm registered handle, packed format/generation, offset alignment,
count/bounds; range call rebase global index về part-local khi nạp vào lib3MF.
C++ không acquire/release snapshot, không giữ pointer sau call. All C exceptions
được bắt vào lỗi context; context output bị vô hiệu khi lỗi. Native chỉ free qua
API tạo nó, không free Rust snapshot hoặc lib3MF output bằng allocator khác.
