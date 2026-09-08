/**
 * The personal printer-profile library (UI-C11, contract 0.3
 * `AppSnapshot.printerProfiles`).
 *
 * What this surface does: it shows the records the core published for the person
 * signed in, hands a picked file to `importFile(file, 'printer-profile')` byte
 * for byte, and sends the three `printer.profile-*` commands with the exact key
 * and settings revision the snapshot carries at the moment of the click.
 *
 * What it never does, and why each one would be a lie:
 *
 * - **Parse, hash or seal a profile.** The core owns the document, its schema
 *   and its hashes. The interface does not read a byte of it, so it cannot be
 *   the thing that decides a profile is well formed.
 * - **Confirm on the user's behalf.** A `confirmed: false` delete and an import
 *   both come back asking; the core's own `confirmation` opens the shared
 *   `ConfirmDialog` with the core's own retry. No id is guessed, no duplicate is
 *   replaced by default, no retry is rebuilt here.
 * - **Turn `valid` into `qualified`.** `qualified` is the literal `false` in the
 *   contract at this milestone. Every record here says so in the same words.
 * - **Promise the operating system saved anything.** A download is a command the
 *   core answered; where the bytes landed is not in the snapshot.
 * - **Fabricate a library.** A bridge that publishes no `printerProfiles` gets a
 *   sentence saying so, not an empty list and not a sample machine.
 *
 * Ownership is account-scoped on purpose. These records are personal settings,
 * not project data: they are readable with no document open, and an answer must
 * be dropped when the *account* moved, not when a project did. That is exactly
 * what `useRequestOwner(key, accountIdentity)` gives — passing the imported
 * function by reference is what switches the project fence off (see
 * `request-owner.ts:108`).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppCommand, Diagnostic, PrinterProfileView } from '../../contracts/app-bridge.ts'
import { useBridge, useResultHandler, useSnapshot } from '../core/bridge.tsx'
import { accountIdentity } from '../core/identity.ts'
import { useDroppedAnswerLog, useRequestOwner } from '../core/request-owner.ts'
import { ACCEPT_PRINTER_PROFILE, chooseFile } from '../core/file-dialog.ts'
import {
  findProfile,
  hexColour,
  invalidProfileCount,
  nozzleText,
  PROFILE_DOWNLOAD_TEXT,
  PROFILE_EMPTY_TEXT,
  PROFILE_NO_APPLY_TEXT,
  PROFILE_OUTSIDE_UNDO_TEXT,
  PROFILE_QUALIFIED_TEXT,
  PROFILE_SOURCE_HASH_TEXT,
  PROFILE_UNPUBLISHED_TEXT,
  PROFILE_WAITING_TEXT,
  profileBlockedText,
  profileLibraryState,
  profileReasonText,
  slotExtruderPairs,
} from '../core/printer-profile.ts'
import { Button } from '../components/Button.tsx'
import { DiagnosticItem } from '../components/Feedback.tsx'

/**
 * The kind of request, for the session log. Never the record it was about and
 * never the file that was picked: on a shared device this line can end up in
 * front of the next person to sign in (`identity.ts:90-96`).
 */
const ROW_WHAT = 'một thao tác trên thư viện hồ sơ máy in'
const IMPORT_WHAT = 'một lượt nhập hồ sơ máy in'

type RowAction = 'export' | 'original' | 'delete'

const ROW_ANNOUNCE: Record<RowAction, string> = {
  export: 'Đã gửi yêu cầu tải hồ sơ cho nhân.',
  original: 'Đã gửi yêu cầu tải tệp hồ sơ bạn đã nhập cho nhân.',
  delete: 'Nhân đã nhận lệnh xóa hồ sơ khỏi thư viện.',
}

function rejected(cause: unknown): Diagnostic {
  return {
    code: 'BRIDGE_CALL_REJECTED',
    severity: 'error',
    message: 'Lệnh không hoàn tất được.',
    detail: cause instanceof Error ? cause.message : String(cause),
  }
}

export function PrinterProfileLibrary() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const handleResult = useResultHandler()
  // '' as the key: this surface has one import in flight at a time, so the
  // serial alone decides supersession, and the account decides ownership.
  const owner = useRequestOwner('', accountIdentity)
  const logDropped = useDroppedAnswerLog()

  const [pending, setPending] = useState(false)
  const [refusal, setRefusal] = useState<Diagnostic | null>(null)
  const [moved, setMoved] = useState<string | null>(null)

  const state = profileLibraryState(snapshot)
  const library = snapshot.printerProfiles
  const blockedReason = library && !library.enabled ? profileBlockedText(library) : null
  // No library published means no command can be honestly sent from here.
  const importReason =
    library === undefined
      ? state === 'waiting'
        ? PROFILE_WAITING_TEXT
        : PROFILE_UNPUBLISHED_TEXT
      : blockedReason

  const importProfile = useCallback(async () => {
    if (pending) return
    // One ticket for the whole act, taken *before* the chooser opens. The
    // picker is a modal the interface does not control, and a person can sign
    // in as somebody else while it is up: a file picked in one account must not
    // be filed into another's settings, so the ticket is checked once before
    // anything is sent and again when the answer lands.
    const ticket = owner.begin()
    const file = await chooseFile(ACCEPT_PRINTER_PROFILE)
    // Cancelling the chooser changes nothing and is not an event worth
    // reporting: no command was sent and none was refused.
    if (!file) return
    const before = owner.claim(ticket)
    if (before !== 'owner') {
      logDropped(before, IMPORT_WHAT)
      setMoved(
        'Tài khoản hoặc lượt nhập đã đổi trong lúc hộp chọn tệp còn mở, nên giao diện không gửi ' +
          'tệp nào cả. Chọn lại tệp nếu bạn vẫn muốn nhập.',
      )
      return
    }
    setMoved(null)
    setRefusal(null)
    setPending(true)
    try {
      // The File goes across exactly as the platform handed it over: no read,
      // no parse, no hash, no rename. The purpose string is what tells the core
      // which reader to use.
      const result = await bridge.importFile(file, 'printer-profile')
      const claim = owner.claim(ticket)
      if (claim !== 'owner') {
        logDropped(claim, IMPORT_WHAT)
        return
      }
      // The shared handler logs the refusal and, when the core asked for
      // confirmation, opens the core's own dialog with the core's own retry.
      // The toast stays off because the reason is shown right here, under the
      // button that caused it.
      handleResult(result, { toastOnError: false, success: 'Nhân đã nhận tệp hồ sơ.' })
      if (!result.ok && !result.confirmation) setRefusal(result.diagnostic)
    } catch (cause) {
      const claim = owner.claim(ticket)
      if (claim !== 'owner') {
        logDropped(claim, IMPORT_WHAT)
        return
      }
      const diagnostic = rejected(cause)
      handleResult({ ok: false, diagnostic }, { toastOnError: false })
      setRefusal(diagnostic)
    } finally {
      // A busy flag is a statement about this control, not a claim about the
      // answer, so it is always released.
      setPending(false)
    }
  }, [bridge, handleResult, logDropped, owner, pending])

  return (
    <section
      className="card fc-border stack"
      data-printer-profiles={state}
      data-printer-profiles-count={library ? library.items.length : 'none'}
      data-printer-profiles-revision={library ? library.settingsRevision : 'none'}
    >
      <div className="row">
        <h4 className="grow" style={{ margin: 0, fontSize: 'var(--fs-label)' }}>
          Thư viện hồ sơ máy in của bạn
        </h4>
        {library ? (
          <span className="chip chip--muted fc-border">{library.items.length} hồ sơ</span>
        ) : null}
        {library && invalidProfileCount(library) > 0 ? (
          <span className="chip chip--warn fc-border">
            {invalidProfileCount(library)} hồ sơ lỗi
          </span>
        ) : null}
      </div>

      <p className="muted" style={{ margin: 0 }}>
        Hồ sơ là tệp riêng của bạn, nằm trong cài đặt cá nhân. Nhân đọc, kiểm và giữ tệp; giao
        diện không mở, không sửa và không tự tạo hồ sơ máy nào.
      </p>
      <p className="muted-3" style={{ margin: 0 }} data-printer-profiles-noapply>
        {PROFILE_NO_APPLY_TEXT}
      </p>

      <Button
        icon="upload"
        data-printer-profile-import
        disabledReason={importReason}
        onClick={() => void importProfile()}
      >
        {pending ? 'Đang gửi tệp cho nhân…' : 'Nhập hồ sơ máy in (JSON)'}
      </Button>
      <p className="muted-3" style={{ margin: 0 }}>
        Giao diện chỉ chọn tệp rồi chuyển nguyên byte cho nhân. Nhân kiểm nội dung và hỏi lại
        trước khi lưu; đóng hộp xác nhận là không lưu gì cả. {PROFILE_OUTSIDE_UNDO_TEXT}
      </p>

      {moved ? (
        <div className="diag diag--warning fc-border" role="status" data-printer-profile-import-moved>
          <div className="diag__msg">{moved}</div>
        </div>
      ) : null}
      {refusal ? (
        <div className="stack" role="alert" data-printer-profile-import-error={refusal.code}>
          <DiagnosticItem diagnostic={refusal} />
        </div>
      ) : null}

      {state === 'waiting' ? (
        <div className="empty" data-printer-profiles-note="waiting">
          <strong className="empty__title">Đang chờ nhân xác định phiên</strong>
          <p className="muted" style={{ margin: 0 }}>
            {PROFILE_WAITING_TEXT}
          </p>
        </div>
      ) : null}

      {state === 'unpublished' ? (
        <div className="empty" data-printer-profiles-note="unpublished">
          <strong className="empty__title">Tính năng chưa khả dụng ở bản dựng này</strong>
          <p className="muted" style={{ margin: 0 }}>
            {PROFILE_UNPUBLISHED_TEXT}
          </p>
        </div>
      ) : null}

      {blockedReason ? (
        <div className="diag diag--warning fc-border" data-printer-profiles-note="blocked">
          <div className="diag__head">
            <span className="diag__sev">Thư viện đang bị chặn</span>
          </div>
          <div className="diag__msg">{blockedReason}</div>
          <div className="diag__detail">
            Các bản ghi bên dưới (nếu có) vẫn được hiển thị để bạn đọc; mọi nút đều đóng cho tới
            khi nhân mở lại thư viện.
          </div>
        </div>
      ) : null}

      {state === 'empty' ? (
        <div className="empty" data-printer-profiles-note="empty">
          <strong className="empty__title">Thư viện trống</strong>
          <p className="muted" style={{ margin: 0 }}>
            {PROFILE_EMPTY_TEXT}
          </p>
        </div>
      ) : null}

      {library && library.items.length > 0 ? (
        <ul className="list-reset stack">
          {library.items.map((profile) => (
            <ProfileRow key={profile.key} profile={profile} blockedReason={blockedReason} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * One record. The library's `settingsRevision` is deliberately *not* a prop:
 * every command reads it back from the live snapshot at the moment of the
 * click, so a number captured at render can never be the one that goes out.
 */
function ProfileRow({
  profile,
  blockedReason,
}: {
  profile: PrinterProfileView
  blockedReason: string | null
}) {
  const bridge = useBridge()
  const handleResult = useResultHandler()
  const owner = useRequestOwner('', accountIdentity)
  const logDropped = useDroppedAnswerLog()
  const [pending, setPending] = useState<RowAction | null>(null)
  const [refusal, setRefusal] = useState<Diagnostic | null>(null)
  const [moved, setMoved] = useState<string | null>(null)

  // A refusal is about the record as it was published. When the core
  // republishes *this record* differently the old sentence is no longer about
  // what is on screen, so it goes.
  //
  // `settingsRevision` is deliberately not part of this. It is a library-wide
  // number: importing or deleting any other profile moves it, and clearing a
  // refusal on that would erase the reason a person is still reading because
  // something unrelated happened elsewhere in the list. What the core said
  // about this row stays until this row changes.
  //
  // `moved` survives on purpose even when the record does change: it is a
  // statement *about* that republication, and wiping it on the very change it
  // reports would leave a click that did nothing and said nothing.
  const stamp = JSON.stringify([
    profile.label,
    profile.id,
    profile.machine,
    profile.slicer,
    profile.slicerVersion,
    profile.nozzleDiametersMm,
    profile.slotExtruders,
    profile.filamentTypes,
    profile.filamentColors,
    profile.profileHash,
    profile.sourceHash,
    profile.valid,
    profile.reason ?? null,
    profile.importedFileAvailable,
  ])
  const seenStamp = useRef(stamp)
  useEffect(() => {
    if (seenStamp.current === stamp) return
    seenStamp.current = stamp
    setRefusal(null)
  }, [stamp])

  const send = useCallback(
    async (action: RowAction) => {
      if (pending) return
      // Read the row back by key from the live snapshot before sending. A list
      // that moved under an open card must not turn this click into a command
      // about a different record, and the interface does not guess a
      // replacement. The revision sent is the one published *now*, never one
      // captured at render.
      const live = findProfile(bridge.getSnapshot(), profile.key)
      if (!live) {
        setMoved(
          'Hồ sơ này không còn trong thư viện nhân đang công bố, nên không có lệnh nào được gửi. ' +
            'Giao diện không đoán hồ sơ thay thế từ một dòng đã đổi.',
        )
        return
      }
      if (action === 'original' && !live.profile.importedFileAvailable) {
        setMoved(
          'Nhân không còn giữ tệp bạn đã nhập cho hồ sơ này, nên không có lệnh nào được gửi.',
        )
        return
      }
      const command: AppCommand =
        action === 'delete'
          ? {
              type: 'printer.profile-delete',
              key: live.profile.key,
              settingsRevision: live.settingsRevision,
              // The interface never sends a confirmed delete on its own. The
              // core answers with the change list, and the user's answer to
              // *that* is what comes back as the core's own retry.
              confirmed: false,
            }
          : {
              type: 'printer.profile-export',
              key: live.profile.key,
              settingsRevision: live.settingsRevision,
              original: action === 'original',
            }
      setMoved(null)
      setRefusal(null)
      setPending(action)
      const ticket = owner.begin()
      try {
        // Dispatched at the bridge rather than through the shared runner: that
        // runner's fence includes the open document, and these records are
        // account-scoped settings that outlive any project. The account fence
        // this row applies is the one that matters here.
        const result = await bridge.dispatch(command)
        const claim = owner.claim(ticket)
        if (claim !== 'owner') {
          logDropped(claim, ROW_WHAT)
          return
        }
        handleResult(result, { toastOnError: false, announce: ROW_ANNOUNCE[action] })
        if (!result.ok && !result.confirmation) setRefusal(result.diagnostic)
      } catch (cause) {
        const claim = owner.claim(ticket)
        if (claim !== 'owner') {
          logDropped(claim, ROW_WHAT)
          return
        }
        const diagnostic = rejected(cause)
        handleResult({ ok: false, diagnostic }, { toastOnError: false })
        setRefusal(diagnostic)
      } finally {
        setPending(null)
      }
    },
    [bridge, handleResult, logDropped, owner, pending, profile.key],
  )

  const reason = profileReasonText(profile)
  const slots = slotExtruderPairs(profile)
  const nozzles = nozzleText(profile)
  const busyReason = pending ? 'Đang chờ nhân trả lời thao tác trước trên hồ sơ này.' : null
  const exportText = pending === 'export' ? 'Đang gửi yêu cầu…' : 'Tải hồ sơ (JSON)'
  const originalText = pending === 'original' ? 'Đang gửi yêu cầu…' : 'Tải đúng tệp bạn đã nhập'
  const deleteText = pending === 'delete' ? 'Đang chờ nhân hỏi lại…' : 'Xóa khỏi thư viện'

  return (
    <li
      className="card fc-border"
      style={{ padding: 10 }}
      data-printer-profile={profile.key}
      data-printer-profile-valid={profile.valid ? 'true' : 'false'}
      data-printer-profile-qualified="false"
      data-printer-profile-imported-file={profile.importedFileAvailable ? 'true' : 'false'}
      data-printer-profile-id={profile.id ?? ''}
    >
      <div className="export-name profile-name" data-printer-profile-name>
        {profile.label}
      </div>

      <div className="export-chips profile-chips">
        <span className={`chip ${profile.valid ? 'chip--ok' : 'chip--warn'} fc-border`}>
          {profile.valid ? 'nội dung hợp lệ' : 'nội dung không hợp lệ'}
        </span>
        {/* Never derived from `valid`: contract 0.3 types this field as the
            literal false, and a parsed file is not a printed one. */}
        <span className="chip chip--warn fc-border" data-printer-profile-qualified-chip>
          chưa qua slicer/bản in
        </span>
        {profile.id === null ? (
          <span className="chip chip--muted fc-border">hồ sơ không ghi ID</span>
        ) : (
          <code className="diag__code">ID {profile.id}</code>
        )}
      </div>

      <dl className="profile-facts" data-printer-profile-facts>
        <div className="profile-fact">
          <dt className="muted-3">Máy in trong hồ sơ</dt>
          <dd className="export-meta profile-meta" data-printer-profile-machine>
            {profile.machine || '— hồ sơ không ghi tên máy'}
          </dd>
        </div>
        <div className="profile-fact">
          <dt className="muted-3">Slicer và phiên bản</dt>
          <dd className="export-meta profile-meta" data-printer-profile-slicer>
            {profile.slicer || '— không ghi'}
            {profile.slicerVersion ? ` · phiên bản ${profile.slicerVersion}` : ' · không ghi phiên bản'}
          </dd>
        </div>
        <div className="profile-fact">
          <dt className="muted-3">Đường kính nozzle</dt>
          <dd className="export-meta profile-meta" data-printer-profile-nozzle>
            {nozzles || '— hồ sơ không công bố đường kính nozzle'}
          </dd>
        </div>
        <div className="profile-fact">
          <dt className="muted-3">Khe → đầu in</dt>
          <dd className="export-meta profile-meta" data-printer-profile-slots={slots.length}>
            {slots.length === 0
              ? '— hồ sơ không công bố ánh xạ khe → đầu in'
              : slots.map((pair) => `Khe ${pair.slot} → đầu in ${pair.extruder}`).join(' · ')}
          </dd>
        </div>
        <div className="profile-fact">
          <dt className="muted-3">Loại filament</dt>
          <dd className="export-meta profile-meta" data-printer-profile-filament-types>
            {profile.filamentTypes.length === 0
              ? '— không ghi'
              : profile.filamentTypes.join(' · ')}
          </dd>
        </div>
        <div className="profile-fact">
          <dt className="muted-3">Màu filament</dt>
          <dd className="export-meta profile-meta" data-printer-profile-filament-colors>
            {profile.filamentColors.length === 0 ? (
              '— không ghi'
            ) : (
              <span className="profile-colours">
                {profile.filamentColors.map((colour, index) => {
                  const hex = hexColour(colour)
                  return (
                    <span key={`${index}-${colour}`} className="profile-colour">
                      {/* Decorative only. The raw string the core published is
                          printed next to it, so a vendor colour name is never
                          replaced by a guess. */}
                      {hex ? (
                        <span
                          className="profile-swatch fc-border"
                          aria-hidden="true"
                          style={{ background: hex }}
                        />
                      ) : null}
                      {colour}
                    </span>
                  )
                })}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="stack" style={{ gap: 2 }}>
        <span className="muted-3">Hash hồ sơ đã chuẩn hóa</span>
        <span className="export-hash profile-hash" data-printer-profile-hash={profile.profileHash ?? ''}>
          {profile.profileHash ?? '— nhân chưa công bố hash cho bản ghi này'}
        </span>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        <span className="muted-3">Hash nguồn ghi trong hồ sơ</span>
        <span
          className="export-hash profile-hash"
          data-printer-profile-source-hash={profile.sourceHash ?? ''}
        >
          {profile.sourceHash ?? '— hồ sơ không ghi hash nguồn'}
        </span>
        <span className="muted-3">{PROFILE_SOURCE_HASH_TEXT}</span>
      </div>

      <p className="muted-3" style={{ margin: 0 }} data-printer-profile-qualified-note>
        {PROFILE_QUALIFIED_TEXT}
      </p>

      {/* A record the core refused stays on screen with its reason: the point of
          showing it is that the person can download it and fix it. One bad row
          never takes the others down with it. */}
      {reason ? (
        <div
          className={`diag diag--${profile.valid ? 'info' : 'error'} fc-border`}
          data-printer-profile-reason
        >
          <div className="diag__msg export-warn profile-warn" data-printer-profile-warning>
            {reason}
          </div>
        </div>
      ) : null}

      {/* Three buttons that read the same on every row need the record's name in
          their accessible name. That name has to *contain* the words on the
          button, or speaking them stops working: "click Tải hồ sơ (JSON)" has to
          match something (WCAG 2.5.3, Label in Name). So each label is built
          from the visible text — including while the button is waiting, when the
          visible text changes — and the record's name is added after it. */}
      <div className="row">
        <Button
          size="small"
          icon="download"
          aria-label={`${exportText} — hồ sơ đã chuẩn hóa của ${profile.label}`}
          disabledReason={blockedReason ?? busyReason}
          reasonHidden={Boolean(busyReason) && !blockedReason}
          onClick={() => void send('export')}
        >
          {exportText}
        </Button>
        <Button
          size="small"
          icon="download"
          aria-label={`${originalText} — tệp của hồ sơ ${profile.label}`}
          data-printer-profile-original
          disabledReason={
            blockedReason ??
            (profile.importedFileAvailable
              ? busyReason
              : 'Nhân không còn giữ tệp bạn đã nhập cho hồ sơ này.')
          }
          reasonHidden={Boolean(busyReason) && profile.importedFileAvailable && !blockedReason}
          onClick={() => void send('original')}
        >
          {originalText}
        </Button>
        <Button
          size="small"
          icon="trash"
          variant="danger"
          aria-label={`${deleteText} — hồ sơ ${profile.label}`}
          disabledReason={blockedReason ?? busyReason}
          reasonHidden={Boolean(busyReason) && !blockedReason}
          onClick={() => void send('delete')}
        >
          {deleteText}
        </Button>
      </div>
      <p className="muted-3" style={{ margin: 0 }}>
        “Tải đúng tệp bạn đã nhập” lấy lại tệp bạn đã đưa vào, không phải bản gốc do nhà cung cấp
        phát hành. {PROFILE_DOWNLOAD_TEXT}
      </p>

      {moved ? (
        <div className="diag diag--warning fc-border" role="status" data-printer-profile-moved>
          <div className="diag__msg">{moved}</div>
        </div>
      ) : null}
      {refusal ? (
        <div className="stack" role="alert" data-printer-profile-error={refusal.code}>
          <DiagnosticItem diagnostic={refusal} />
        </div>
      ) : null}
    </li>
  )
}
