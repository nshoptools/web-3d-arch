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
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(parsed)
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
