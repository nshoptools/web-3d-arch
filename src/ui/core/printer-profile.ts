/**
 * Pure readings of the personal printer-profile library (UI-C11).
 *
 * Contract 0.3 publishes `AppSnapshot.printerProfiles` as an *additive* member:
 * a bridge that does not carry it is an older bridge, not an empty library, and
 * the interface may not invent a fallback profile for it. Everything here
 * answers a question the snapshot already carries an answer to; nothing parses a
 * profile document, hashes bytes, or decides whether a machine is qualified.
 *
 * Two claims this module refuses to make, because the contract does not support
 * either of them:
 *
 * - **`valid` is not `qualified`.** `PrinterProfileView.qualified` is typed as
 *   the literal `false`, and the record document says why: a file that parses is
 *   not a file that has been sliced or printed. So the qualification sentence is
 *   a constant here, never derived from `valid`.
 * - **`sourceHash` is not proof of the vendor's bytes.** It is a hash the
 *   imported document states about itself. The imported file the core kept is
 *   *the file this person imported*, and the wording says exactly that.
 */
import type {
  AppSnapshot,
  PrinterProfileLibraryView,
  PrinterProfileView,
} from '../../contracts/app-bridge.ts'

/**
 * What the library is right now, as one word.
 *
 * `waiting` and `unpublished` are both "the snapshot carries no library", and
 * they are not the same fact. While the session is still being decided the core
 * has not yet said *whose* library this would be; once it has, an absent member
 * means this build does not publish one. Reporting the first as the second
 * would tell a signed-in user their build lacks a feature it may well have.
 */
export type ProfileLibraryState = 'waiting' | 'unpublished' | 'blocked' | 'empty' | 'ready'

export function profileLibraryState(snapshot: AppSnapshot): ProfileLibraryState {
  const library = snapshot.printerProfiles
  if (library === undefined) {
    return snapshot.session.status === 'checking' ? 'waiting' : 'unpublished'
  }
  if (!library.enabled) return 'blocked'
  return library.items.length === 0 ? 'empty' : 'ready'
}

export const PROFILE_WAITING_TEXT =
  'Nhân chưa xác định xong phiên đăng nhập, nên chưa biết đây là thư viện của ai. ' +
  'Giao diện chờ nhân công bố, không dựng danh sách tạm.'

export const PROFILE_UNPUBLISHED_TEXT =
  'Bản dựng này chưa công bố thư viện hồ sơ máy in cá nhân trong snapshot. ' +
  'Giao diện không tạo hồ sơ mẫu để lấp chỗ trống, và không có nút nào ở đây gửi được lệnh.'

export const PROFILE_EMPTY_TEXT =
  'Thư viện của bạn chưa có hồ sơ nào. Nhập một tệp hồ sơ JSON để nhân kiểm và lưu vào cài đặt cá nhân.'

/**
 * The reason a blocked library gives, with a stated fallback when it gives none.
 *
 * A `reason` of `""` — or of nothing but spaces — has to take that fallback too.
 * Every caller reads this sentence as "the library is shut", so returning an
 * empty string would say the opposite of what `enabled: false` means: the
 * banner would disappear and every button would open again.
 */
export function profileBlockedText(library: PrinterProfileLibraryView): string {
  const written = library.reason?.trim()
  return (
    written ||
    'Nhân đang không mở thư viện hồ sơ máy in cho phiên này và không nêu lý do cụ thể.'
  )
}

/**
 * The one sentence every record carries. `qualified` is the literal `false` in
 * contract 0.3, so this is a statement of the contract, not a reading of a row.
 */
export const PROFILE_QUALIFIED_TEXT =
  'Chưa qua slicer và chưa qua bản in. Nhân kiểm nội dung tệp, việc đó không chứng minh ' +
  'hồ sơ đã cắt lớp được hay in vừa.'

export const PROFILE_SOURCE_HASH_TEXT =
  'Hash nguồn là con số ghi bên trong hồ sơ. Nó không tự chứng minh bạn đang giữ byte gốc ' +
  'của nhà cung cấp; tệp nhân giữ lại là đúng tệp bạn đã nhập.'

export const PROFILE_DOWNLOAD_TEXT =
  'Tải về là một yêu cầu gửi cho nhân. Giao diện không biết hệ điều hành đã lưu tệp ở đâu, ' +
  'hay đã lưu chưa.'

export const PROFILE_NO_APPLY_TEXT =
  'Thư viện này chỉ nhập, xem, tải và xóa. Chọn một hồ sơ ở đây không đổi máy in đang chọn, ' +
  'không đổi chiều cao lớp hay khe vật liệu của dự án, và giao diện không tự khớp hồ sơ với ' +
  'máy theo tên.'

export const PROFILE_OUTSIDE_UNDO_TEXT =
  'Xóa hoặc thay một hồ sơ là thay đổi cài đặt cá nhân: nó không nằm trong lịch sử hoàn tác ' +
  'của dự án. Hồ sơ đã đổi thì kết quả chuẩn bị in dựa trên nó cần được kiểm lại.'

/**
 * The record as it is *now*, read straight from the bridge before a command is
 * sent. A list that moved under an open card must not turn a click into a
 * command about a different record, and the interface does not guess a
 * replacement — the same rule `ExportReceipts` applies to a receipt id.
 */
export function findProfile(
  snapshot: AppSnapshot,
  key: string,
): { profile: PrinterProfileView; settingsRevision: number } | null {
  const library = snapshot.printerProfiles
  if (!library) return null
  const profile = library.items.find((item) => item.key === key)
  if (!profile) return null
  return { profile, settingsRevision: library.settingsRevision }
}

/**
 * Slot → extruder, as pairs, in the order the core published them.
 *
 * The array index is presented as the slot ordinal because that is the only
 * reading the contract's own wording ("khe → đầu in") supports, and slots are
 * numbered from 1 everywhere else in this interface (`MaterialsSection`). The
 * extruder number is passed through untouched: the interface does not know
 * whether the core counts extruders from 0 or from 1, so it does not renumber
 * them. See `reports/API-QUESTIONS.md` §1.
 */
export function slotExtruderPairs(
  profile: PrinterProfileView,
): { slot: number; extruder: number }[] {
  return profile.slotExtruders.map((extruder, index) => ({ slot: index + 1, extruder }))
}

/**
 * Nozzle diameters as one readable list.
 *
 * Every number is printed exactly as the core published it. A fixed number of
 * decimals would make the interface state a diameter the core did not send —
 * 0.0001 shown as "0", 0.4499 shown as "0,45" — and this is the surface whose
 * whole point is that a record the core *refused* can be read to find out what
 * is wrong with it. `String` is the shortest text that reads back as the same
 * number, so nothing is added and nothing is lost. No unit is converted: the
 * contract names this field in millimetres and that is the only unit printed.
 */
export function nozzleText(profile: PrinterProfileView): string {
  if (profile.nozzleDiametersMm.length === 0) return ''
  // Each diameter belongs to one extruder — "phần tử i của nozzleDiametersMm là
  // đường kính đầu in i+1" — so each one is printed with the extruder it belongs
  // to. A bare list would read as a set of nozzles that could stand in for one
  // another, which is exactly the reading the arbitration rules out.
  return profile.nozzleDiametersMm
    .map((value, index) => `Đầu in ${index + 1}: ${String(value)} mm`)
    .join(' · ')
}

/**
 * A colour string the browser can paint as-is.
 *
 * The two forms the record document states for a valid profile, and only those:
 * `#RRGGBB` and `#RRGGBBFF`, where the trailing `FF` is opaque alpha
 * (`printer-profile-ui-decisions.md`, "Filament"). A three-digit form is not one
 * of them, and a name such as "Galaxy Black" is a vendor string, not a colour
 * this interface may guess at. Any other alpha is not admitted either: painting
 * `#RRGGBB80` would blend the filament with whatever this interface happens to
 * have behind it and show a colour the record does not state. The raw string is
 * rendered next to the swatch either way, so a value that gets no swatch is
 * still fully readable.
 */
const HEX_COLOUR = /^#(?:[0-9a-f]{6}|[0-9a-f]{6}ff)$/i

export function hexColour(value: string): string | null {
  const trimmed = value.trim()
  return HEX_COLOUR.test(trimmed) ? trimmed : null
}

/** How many records the core is refusing, for a count next to the group title. */
export function invalidProfileCount(library: PrinterProfileLibraryView): number {
  return library.items.filter((item) => !item.valid).length
}

/**
 * The sentence for a record the core refused. `reason` is optional in the
 * contract, so the fallback names the situation rather than inventing a cause.
 */
export function profileReasonText(profile: PrinterProfileView): string | null {
  const written = profile.reason?.trim()
  if (written) return written
  return profile.valid ? null : 'Nhân báo hồ sơ này không hợp lệ nhưng không nêu lý do cụ thể.'
}
