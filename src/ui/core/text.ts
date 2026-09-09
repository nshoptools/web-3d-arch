/**
 * Presentation-level text helpers. Nothing here validates a domain value or
 * converts a unit — the core owns both. Numeric strings are passed through
 * untouched so a comma decimal separator reaches the bridge as typed.
 */

/** Vietnamese-friendly fold: strip diacritics, normalise đ/Đ, lower-case. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
}

/** Every whitespace-separated word of the query must appear in the haystack. */
export function matchesAllWords(haystack: string, query: string): boolean {
  const q = fold(query)
  if (!q) return true
  const hay = fold(haystack)
  return q.split(/\s+/).every((word) => hay.includes(word))
}

export function joinLabels(parts: (string | null | undefined | false)[], sep = ' · '): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(sep)
}

/**
 * Formats a number for display only. Never used to feed a value back into a
 * command: the raw string the user typed is what the bridge receives.
 */
export function formatNumber(value: number, maxFractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: maxFractionDigits }).format(value)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${formatNumber(bytes / 1000, 1)} kB`
  return `${formatNumber(bytes / 1_000_000, 2)} MB`
}

export function formatDateTime(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

/** Masks a secret for display. The full value never leaves the entry form. */
export function maskSecret(value: string): string {
  if (value.length <= 4) return '••••'
  return `${'•'.repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`
}

export const VERDICT_LABEL = {
  pass: 'đã kiểm đạt',
  fail: 'kiểm không đạt',
  unverified: 'chưa kiểm',
  unsupported: 'chưa hỗ trợ',
} as const

/** The verdict after a label that already says what was checked ("Kiểm mesh: đạt"). */
export const VERDICT_SHORT = {
  pass: 'đạt',
  fail: 'không đạt',
  unverified: 'chưa kiểm',
  unsupported: 'chưa hỗ trợ',
} as const

export const VERDICT_TONE = {
  pass: 'ok',
  fail: 'err',
  unverified: 'muted',
  unsupported: 'muted',
} as const

export const SEVERITY_LABEL = {
  info: 'Thông tin',
  warning: 'Cảnh báo',
  error: 'Lỗi',
} as const

/**
 * A sentence for the refusal codes the core sends most often.
 *
 * The controller's `diagnostic()` sets `message` to the error *code*, so without
 * this table the user reads `MODEL_REQUIRED` in a toast and hears it in the
 * assertive live region. This is presentation only: the code is still logged
 * verbatim, still shown on the diagnostic card, and still carried as the detail
 * of the toast. Nothing here changes what the core said — it only says it in
 * words, and a code the table does not know keeps the core's own message.
 */
export const DIAGNOSTIC_TEXT: Record<string, string> = {
  PROJECT_REQUIRED:
    'Chưa có dự án nào đang mở, nên nhân không nhận lệnh này. Tạo hoặc mở một dự án trước.',
  PROJECT_LOCKED:
    'Kho dữ liệu của dự án đang không cho ghi: có thể một tab khác đang giữ quyền ghi, hoặc phiên đã hết hạn.',
  MODEL_REQUIRED:
    'Chưa có mô hình đã dựng để mở bước 2. Bấm “Dựng 3D”; nhân tự chuyển sang bước 2 khi dựng xong.',
  VISIBLE_MODEL_STALE:
    'Mô hình đang hiển thị thuộc bản dựng cũ so với bản sửa hiện tại. Dựng lại để mở lại đường xuất này.',
  SOURCE_REVISION_CONFLICT:
    'Dự án hoặc ảnh nguồn đã đổi sau khi bạn bắt đầu thao tác, nên nhân từ chối thay vì áp nét lên ảnh khác.',
  MATERIAL_SELECTION_REQUIRED:
    'Công cụ này cần một màu vật liệu đang được chọn. Chọn một ô màu trong bảng công cụ rồi vẽ lại.',
  SOURCE_CONVERSION_REQUIRED:
    'Nguồn hiện tại chưa được chuyển thành ảnh raster nên chưa sửa được. Dùng nút chuyển nguồn trên khung ảnh.',
  EDITING_ADAPTER_REQUIRED: 'Bản dựng này chưa có bộ xử lý sửa ảnh nguồn.',
  GEOMETRY_CAPABILITY_REQUIRED: 'Bản dựng này chưa công bố năng lực dựng hình học.',
  STALE_CONFIRMATION:
    'Đề xuất này đã cũ: dữ liệu nhân đo được lúc đề xuất đã đổi. Thao tác lại để lấy đề xuất mới.',
  PROPOSAL_OUTPUT_CHANGED:
    'Kết quả nhân tính lại không còn khớp với thứ đã đề xuất, nên nhân không áp dụng.',
  PROPOSAL_REQUIRED: 'Nhân cần bạn xác nhận trước khi thực hiện.',
  CONFIRMATION_REQUIRED: 'Lệnh này cần một bước xác nhận tường minh.',
  ACCESS_CHANGED: 'Phiên hoặc quyền truy cập đã đổi giữa chừng, nên nhân hủy lượt này.',
  AUTH_REQUIRED: 'Cần một phiên đăng nhập đang hợp lệ và có mạng.',
  STALE_JOB: 'Lượt xử lý này thuộc một trạng thái cũ nên nhân bỏ qua kết quả.',
  EXPORT_UNSUPPORTED: 'Đường xuất này không nằm trong danh sách nhân đang mở.',
  CANCELLED: 'Lượt xử lý đã bị hủy.',
  // The export reasonCodes contract 0.3 names. They arrive in
  // `ExportOption.reasonCode` next to a readable `reason`; this table is only
  // the fallback for a build that sent the code without the sentence.
  NO_SNAPSHOT: 'Chưa có bản dựng hoàn tất nào để xuất từ đó.',
  STALE_REVISION:
    'Mô hình đã dựng thuộc bản sửa cũ hơn dự án hiện tại, nên đường xuất cần mô hình khớp bản sửa đang đóng.',
  UNAPPLIED_MESH_EDIT: 'Khối nhập còn thay đổi chưa được Áp dụng vào dự án.',
  UNSUPPORTED_EXPORTER: 'Bản dựng này chưa đăng ký đường xuất hoặc định dạng đó.',
  EXPORT_REQUIREMENT_CHANGED:
    'Điều kiện của đường xuất này đã đổi trong lúc nhân đang chạy, nên nhân không công bố kết quả.',
  // Proposal lifecycle (contract 0.3 `proposal.discard`).
  APPROVAL_IN_PROGRESS:
    'Nhân đã bắt đầu áp dụng đề xuất này, nên không rút lại được nữa. Chờ nhân trả lời lượt áp dụng.',
  UNKNOWN_PROPOSAL: 'Đề xuất này không còn hiệu lực ở nhân.',
  // Import refusals: the kernel names the format problem; the person needs the
  // sentence that says which kinds of file are accepted.
  RASTER_UNSUPPORTED_FORMAT:
    'Tệp này không phải ảnh PNG, JPG hay WebP mà ứng dụng đọc được. Chọn một ảnh, một tệp SVG hoặc một lưới STL/OBJ.',
  RASTER_DECODE_FAILED: 'Ảnh này bị hỏng hoặc dùng cách mã hóa mà ứng dụng không đọc được.',
  RASTER_SOURCE_LIMIT: 'Ảnh vượt giới hạn kích thước tệp nên bị từ chối trước khi ghi; dự án giữ nguyên.',
  RASTER_DIMENSION_LIMIT: 'Ảnh có kích thước điểm ảnh vượt giới hạn nhân xử lý được.',
  RASTER_PIXEL_LIMIT: 'Ảnh có quá nhiều điểm ảnh so với giới hạn của nhân.',
  SOURCE_KIND: 'Tệp này không thuộc loại nguồn ứng dụng nhận (ảnh, SVG, chữ, emoji hoặc lưới).',
  SOURCE_CONVERSION_UNSUPPORTED: 'Nguồn hiện tại không chuyển được sang dạng đó.',
  SOURCE_FILE_TYPE:
    'Tệp này không phải ảnh PNG, JPG, WebP, tệp SVG hay lưới STL/OBJ, nên không được nhận làm nguồn.',
  MESH_UNSUPPORTED_FORMAT: 'Tệp lưới này không phải STL hay OBJ mà ứng dụng đọc được.',
  // The engine runs in a worker that fetches parts of itself on demand.
  ENGINE_MODULE_UNAVAILABLE:
    'Không tải được một phần của nhân xử lý, thường vì mất mạng giữa chừng. Khi có mạng lại, thao tác tiếp theo sẽ tự tải lại.',
  ENGINE_INIT_TIMEOUT: 'Nhân xử lý không khởi động kịp. Thử lại thao tác; nếu vẫn vậy, tải lại trang.',
  ENGINE_CRASH: 'Nhân xử lý bị dừng đột ngột. Thao tác tiếp theo sẽ khởi động lại nhân.',
  CORE_UNAVAILABLE: 'Trình duyệt này không cấp bộ nhớ dùng chung cho nhân xử lý, nên chưa dựng được mô hình.',
  JOB_BUSY: 'Nhân đang chạy một việc khác. Chờ xong hoặc bấm Hủy trong khung xem rồi thử lại.',
  // Each adapter names its own cancellation; to a person they are one sentence.
  SOURCE_SVG_CANCELLED: 'Lượt dựng ảnh SVG đã bị hủy vì có thao tác mới hoặc phiên thay đổi.',
  RASTER_CANCELLED: 'Lượt xử lý ảnh đã bị hủy vì có thao tác mới hoặc phiên thay đổi.',
  PRODUCT_CANCELLED: 'Lượt cập nhật sản phẩm đã bị hủy vì có thao tác mới hoặc phiên thay đổi.',
  MESH_CANCELLED: 'Lượt xử lý khối nhập đã bị hủy vì có thao tác mới hoặc phiên thay đổi.',
  GENERATED_BASE_CANCELLED: 'Lượt dựng đế đã bị hủy vì có thao tác mới hoặc phiên thay đổi.',
  PREPARATION_BUSY: 'Nhân đang bận chuẩn bị dữ liệu. Thử lại sau vài giây.',
  // Product pipeline refusals: what stopped, and what to do next.
  PRODUCT_SOURCE_CONVERSION_REQUIRED:
    'Nguồn này chưa được tách thành vùng màu nên chưa dựng được. Bấm nút bước tiếp trên thanh trên (“Chuyển sang ảnh raster để sửa”, rồi “Tách vùng màu để dựng”) và xác nhận từng bước.',
  SOURCE_SVG_REGIONS_REQUIRED:
    'Nguồn chưa có vùng màu đã xác nhận nên chưa dựng hay xuất SVG được. Bấm nút bước tiếp trên thanh trên và xác nhận để nhân tách vùng màu.',
  RASTER_SEGMENTATION_APPROVAL_REQUIRED:
    'Ảnh raster cần được tách vùng màu và bạn xác nhận kết quả trước khi dựng mô hình.',
  SOURCE_NUMERIC_OUTLINES_UNAVAILABLE:
    'Nguồn này chưa có đường viền số để dựng. Chuyển sang ảnh raster để sửa và tách vùng, hoặc chọn nguồn SVG.',
  PRODUCT_TEXT_OUTLINES_UNAVAILABLE:
    'Chữ chưa dựng được vì nguồn hiện tại là ảnh raster chưa tách vùng. Chuyển nguồn sang ảnh raster và xác nhận trước, hoặc bỏ chữ.',
  PRODUCT_UPDATE_BINDINGS_BLOCKED:
    'Nhân không gắn được vùng màu và vật liệu cho thay đổi này. Mở nhật ký để xem chi tiết; dự án giữ nguyên.',
  PRODUCT_DATUM_PROPOSAL_BLOCKED:
    'Nhân không chốt được mặt chuẩn cho thay đổi này với lịch lớp hiện tại. Đổi chiều cao lớp hoặc dày đế rồi thử lại; dự án giữ nguyên.',
  PRODUCT_DATUM_PROBE_BLOCKED: 'Nhân chưa dò được mặt chuẩn cho thay đổi này. Dự án giữ nguyên.',
  PRODUCT_ADOPTION_BLOCKED: 'Nhân không nhận được nguồn này cho sản phẩm. Mở nhật ký để xem lý do; dự án giữ nguyên.',
  PRODUCT_ADOPTION_DECISION_REQUIRED: 'Nguồn này cần bạn quyết định cách gắn vùng màu trước khi nhận.',
  PRODUCT_TRANSACTION_RETIRED: 'Thay đổi này bị hủy vì dự án hoặc phiên đã đổi trong lúc chuẩn bị. Thao tác lại.',
  MESH_WATCHDOG:
    'Phép kiểm lưới không trả lời kịp, nên kết quả kiểm của mô hình này là “chưa kiểm”. Mô hình vẫn xem và xuất được; dựng lại để kiểm lại.',
  PRODUCT_PROPOSAL_CONSUMED: 'Đề xuất này đã được dùng hoặc đã hủy. Thao tác lại để lấy đề xuất mới.',
  PRODUCT_TEXT_SOURCE_FRAME_UNSUPPORTED:
    'Khối chữ đặt bên cạnh mô hình đang nằm ngoài vùng nhân hỗ trợ (tọa độ âm). Đưa vị trí X, Y về giá trị không âm.',
  PRODUCT_TEXT_ABSOLUTE_BASE_WIDTH_UNAVAILABLE: 'Bản dựng này chưa hỗ trợ đế chữ có bề rộng riêng. Đặt “Rộng đế chữ” về 0.',
  PRODUCT_REGION_HEIGHT_INACTIVE:
    'Chiều cao riêng của vùng chỉ có tác dụng khi kiểu hoạ tiết là Nổi và “Tách màu theo tầng cao” đang bật.',
  TEXT_REQUIRED: 'Chưa có nội dung chữ để dùng làm hình.',
  MESH_REPLAY_COMMIT_REQUIRED: 'Khối nhập cần được áp dụng lại trước khi dựng.',
  BUILD_PREVIEW_REQUIRED: 'Chưa có bản dựng xem trước để chốt.',
  SOURCE_BOTTOM_SUPPORT_MUST_MATCH_FOOTPRINT:
    'Kiểu hoạ tiết Chìm cần mặt đáy trùng với đường bao của hình; nhân từ chối dựng. Chọn kiểu Nổi hoặc Phẳng.',
  CHAMFER_MOUTH_EDGE_BUDGET: 'Hình quá chi tiết cho phần vát của loại sản phẩm này; nhân từ chối dựng. Giảm chi tiết hoặc tăng kích thước.',
  GROOVE_EDGE_RESOURCE_LIMIT: 'Hình quá chi tiết cho rãnh ngàm; nhân từ chối dựng. Giảm chi tiết hoặc tăng kích thước.',
}

/**
 * What the busy overlay says a job is doing. The core keeps short keys for the
 * stages it owns (tests and the log depend on them); a person reads a sentence.
 * A stage the table does not know is already a sentence from the core.
 */
export const JOB_STAGE_TEXT: Record<string, string> = {
  build: 'Dựng mô hình 3D',
  export: 'Tạo tệp xuất',
  'export receipt': 'Tạo biên lai xuất',
  import: 'Nhận tệp nguồn',
  source: 'Nhận nguồn',
  preview: 'Chuẩn bị mô hình để xem',
  'geometry confirmation': 'Chờ bạn xác nhận thông số hình học',
  'source confirmation': 'Chờ bạn xác nhận nguồn',
  'Source and datum confirmation': 'Chờ bạn xác nhận nguồn và mặt chuẩn',
  'Prepare product update': 'Chuẩn bị cập nhật sản phẩm',
  'Apply product update': 'Áp dụng thay đổi và dựng lại',
  'Prepare source datums': 'Chuẩn bị mặt chuẩn cho nguồn',
  'Probe explicitly selected face': 'Dò mặt đã chọn',
  'edit-source': 'Sửa ảnh nguồn',
  'raster-prepare': 'Chuẩn bị ảnh raster',
  'worker-build': 'Nhân đang dựng hình',
  'qualify-snapshot': 'Kiểm tra mô hình',
  'qualify-union': 'Kiểm tra khối ghép',
  'qualify-whole-union': 'Kiểm tra toàn bộ khối ghép',
  'export-validate': 'Kiểm tra tệp xuất',
  running: 'Nhân đang chạy',
  'shape-run': 'Dựng chữ',
}

export const JOB_STATE_TEXT: Record<string, string> = {
  running: 'đang chạy',
  cancelling: 'đang hủy',
}

export function jobStageText(stage: string): string {
  return JOB_STAGE_TEXT[stage] ?? stage
}

export function jobStateText(state: string): string {
  return JOB_STATE_TEXT[state] ?? state
}

/** The sentence to show a person, with the core's own message as the fallback. */
export function diagnosticText(code: string, message: string): string {
  return DIAGNOSTIC_TEXT[code] ?? message
}

/* --------------------------------------------------------------- account */

const OPAQUE_IDENTIFIER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What to call the signed-in person. The core publishes `name` as whatever the
 * identity provider gave it, which for a synthetic or minimal account is the
 * opaque subject or the internal id. An identifier is never a name on screen:
 * fall back to the e-mail, then to the role.
 */
export function userLabel(user: { id: string; name: string; email: string; role: 'owner' | 'member'; subject?: string } | null): string {
  if (!user) return 'Tài khoản'
  const name = user.name?.trim() ?? ''
  if (name && name !== user.id && name !== user.subject && !OPAQUE_IDENTIFIER.test(name)) return name
  if (user.email) return user.email
  return user.role === 'owner' ? 'Chủ nhóm' : 'Thành viên'
}
