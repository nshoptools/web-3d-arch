import type { ContextStamp } from '../core/request-context.ts'
import { useState } from 'react'
import type { AppCommand, Diagnostic } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useRunCommand, useSnapshot, useRequestContext } from '../core/bridge.tsx'
import { useUi, useUiActions } from '../core/ui-state.tsx'
import { COMMANDS, GESTURE_ROWS, TOOLS_2D, VIEW_ACTIONS, type CommandDef } from '../core/registry.ts'
import { Button } from '../components/Button.tsx'
import { Dialog } from '../components/Dialog.tsx'
import { DiagnosticItem, DiagnosticList } from '../components/Feedback.tsx'
import { formatBytes, formatDateTime, VERDICT_LABEL } from '../core/text.ts'
import {
  exportPrerequisite,
  exportReasonText,
  PREREQUISITE_LABEL,
  PREREQUISITE_NOTE,
} from '../core/project-state.ts'
import { CONFIRM_ACCEPTED, confirmEffect } from './confirm-effect.ts'

const BUSY_REASON = 'Đang chờ nhân trả lời lượt xác nhận này.'
const DISMISS_BUSY_REASON = 'Đang báo nhân bỏ đề xuất này.'

/**
 * Codes the core answers `proposal.discard` with, as contract 0.3 names them.
 * They are matched on the code, not on the sentence, and each one means a
 * different thing for the dialog on screen.
 */
const APPROVAL_IN_PROGRESS = 'APPROVAL_IN_PROGRESS'
const STALE_CONFIRMATION = 'STALE_CONFIRMATION'
const UNKNOWN_PROPOSAL = 'UNKNOWN_PROPOSAL'

/**
 * A command the core refused pending confirmation. The dialog shows the change
 * list the core produced and waits: the interface never confirms on the user's
 * behalf and never invents the diff itself.
 *
 * Contract 0.3 routes proposals — converting a source, reducing detail, cutting
 * history — through the same door: the retry is a `proposal.accept` carrying an
 * id the core bound to the exact inputs it measured. Nothing has run yet when
 * this dialog is on screen, and a proposal whose inputs moved on is refused by
 * the core rather than replayed here.
 *
 * Three rules this dialog owes the user:
 *
 * - It shows what changes, the proposal id and the core's own diagnostic. The
 *   raw command object is a diagnostic artefact and lives in the diagnostics
 *   view, which opens over this dialog without closing it.
 * - It does not promise the change is undoable. Only some retries are project
 *   edits; others write a file, call the network or prune history.
 * - It closes when the retry comes back `ok`, and only then. A refusal stays on
 *   screen with its code and a way to try again; a *new* confirmation replaces
 *   this one in the dialog state, so nothing is lost either way.
 *
 * Dismissal is the fourth rule, and contract 0.3 gave it a command. Closing this
 * dialog is not a private interface event: the core is still holding the
 * proposal, its lease and possibly a job it owns. So closing *sends*
 * `proposal.discard` with the exact id the confirmation carried and waits for
 * the answer before reporting the dialog dismissed. Three answers, three
 * different meanings, and the interface never invents a fourth:
 *
 * - `ok` — the proposal is consumed. Nothing was committed, no history step, no
 *   revision change. Only now is the dialog gone.
 * - `APPROVAL_IN_PROGRESS` — acceptance has already started. Discard cannot
 *   undo a commit that is being made, so the dialog *stays*, says so, and waits
 *   for the acceptance to answer. It does not pretend the change was withdrawn.
 * - `STALE_CONFIRMATION` / unknown id — this proposal is already gone at the
 *   core. This dialog closes because it is about that dead id; a newer proposal
 *   has its own id and its own dialog and is not touched by any of this.
 *
 * Any other refusal keeps the dialog open with the core's code. A dismissal the
 * core did not confirm is never reported as a dismissal.
 */
export function ConfirmDialog({
  title,
  changes,
  retry,
  diagnostic,
  context,
  onClose,
}: {
  title: string
  changes: string[]
  retry: AppCommand
  diagnostic: Diagnostic
  context: ContextStamp
  onClose: () => void
}) {
  const run = useRunCommand()
  const bridge = useBridge()
  const snapshot = useSnapshot()
  const actions = useUiActions()
  const [failure, setFailure] = useState<Diagnostic | null>(null)
  const [dismissFailure, setDismissFailure] = useState<Diagnostic | null>(null)
  const [approving, setApproving] = useState(false)
  const effect = confirmEffect(retry)
  const requests = useRequestContext()

  /**
   * The one field a discard can address.
   *
   * Contract 0.3 says the command targets "the exact ID from
   * confirmation.retry.id", and in the `AppCommand` union only
   * `proposal.accept` carries an id that means *a proposal*. Other retries also
   * have an `id` — `project.delete`, `preset.apply`, `preset.delete` — but those
   * are a project id and a preset id. Sending one of them as a proposal id
   * would be the interface guessing at an identifier space it was not given, so
   * a retry that is not a `proposal.accept` gets no discard at all: nothing was
   * proposed under an id, and closing is then the whole of the dismissal.
   */
  const proposalId = retry.type === 'proposal.accept' ? retry.id : null

  const confirm = useAsyncAction(async () => {
    if (!requests.isCurrent(context)) { onClose(); return }
    setFailure(null)
    setDismissFailure(null)
    // The shared handler already logs it and, for a new confirmation, replaces
    // this dialog. Keeping the toast off avoids reporting the same refusal in
    // two places when the reason is about to be shown right here.
    const result = await run(retry, { success: CONFIRM_ACCEPTED, toastOnError: false })
    if (result.ok) {
      onClose()
      return
    }
    // A fresh confirmation has already taken this dialog's place in the stack.
    if (result.confirmation) return
    setFailure(result.diagnostic)
  })

  /**
   * What the snapshot says *after* the core consumed the proposal. The
   * interface reports the core's state rather than describing the effect it
   * assumes a discard had: the contract releases leases and may abort a job the
   * proposal owned, and those are visible here.
   */
  const reconcile = () => {
    const live = bridge.getSnapshot()
    // A two-step "press again to confirm" armed against the proposal is UI-only
    // state; it must not outlive the proposal it was armed for.
    actions.armDelete(null)
    const editable = live.project.sourceCanvas?.editable
    return [
      'Nhân đã bỏ đề xuất. Không có gì được thực thi và bản sửa của dự án không đổi.',
      live.job === null ? 'Nhân không còn lượt xử lý nào đang chạy.' : `Nhân vẫn đang chạy: ${live.job.stage}.`,
      editable === undefined
        ? ''
        : editable
          ? 'Ảnh nguồn hiện vẫn sửa được.'
          : 'Ảnh nguồn hiện vẫn ở chế độ chỉ xem.',
    ]
      .filter(Boolean)
      .join(' ')
  }

  const dismiss = useAsyncAction(async () => {
    if (!requests.isCurrent(context)) { onClose(); return }
    setDismissFailure(null)
    if (proposalId === null) {
      // No id was ever proposed, so there is nothing at the core to withdraw
      // and nothing has run. Closing is the whole of it.
      onClose()
      return
    }
    // Dispatched straight at the bridge rather than through the shared runner:
    // the answer belongs in this dialog, and routing it through a toast would
    // report the same refusal twice. The log still gets it, below.
    const result = await bridge.dispatch({ type: 'proposal.discard', id: proposalId })
    if (!requests.isCurrent(context)) { onClose(); return }
    if (result.ok) {
      const stated = reconcile()
      actions.logEvent('info', `Đã bỏ đề xuất ${proposalId}.`, { code: 'PROPOSAL_DISCARDED' })
      actions.announce(stated)
      onClose()
      return
    }
    const code = result.diagnostic.code.toUpperCase()
    actions.logEvent(result.diagnostic.severity, result.diagnostic.message, {
      code: result.diagnostic.code,
      ...(result.diagnostic.detail ? { detail: result.diagnostic.detail } : {}),
    })
    if (code.includes(APPROVAL_IN_PROGRESS)) {
      // The acceptance already owns this id. Closing now would leave the user
      // believing they withdrew something that is being committed.
      setApproving(true)
      setDismissFailure(result.diagnostic)
      actions.announce(
        'Nhân đã bắt đầu áp dụng đề xuất này nên không bỏ được nữa. Hộp thoại giữ nguyên để bạn ' +
          'thấy nhân trả lời lượt áp dụng.',
      )
      return
    }
    if (code.includes(STALE_CONFIRMATION) || code.includes(UNKNOWN_PROPOSAL)) {
      // This id is already gone at the core. Only this dialog is about that id;
      // a newer proposal keeps its own dialog and its own id.
      actions.announce(
        'Đề xuất này đã không còn ở nhân, nên hộp thoại của nó đóng lại. Đề xuất mới hơn (nếu có) ' +
          'không bị ảnh hưởng.',
      )
      onClose()
      return
    }
    // Anything else: the core did not confirm the dismissal, so the interface
    // does not report one.
    setDismissFailure(result.diagnostic)
  })

  const busy = confirm.pending || dismiss.pending
  const job = snapshot.job
  const closeReason = confirm.pending
    ? BUSY_REASON
    : dismiss.pending
      ? DISMISS_BUSY_REASON
      : null

  return (
    <Dialog
      title={title}
      // While either command is in the air, Escape and the backdrop must not
      // tear the dialog down: the command was already sent and its answer
      // belongs here. Escape and the backdrop otherwise go through the same
      // discard as the button — dismissing is one act, not three.
      onClose={busy ? () => undefined : () => void dismiss.run()}
      description="Nhân liệt kê đúng các thay đổi dưới đây và chưa thực thi gì cả."
      footer={
        <>
          {/* Soft-disabled, not `disabled`: a disabled button loses focus, and
              focus falling out of the dialog takes Escape with it. */}
          <Button
            disabledReason={closeReason}
            reasonHidden
            onClick={() => void dismiss.run()}
          >
            {dismiss.pending ? 'Đang báo nhân bỏ đề xuất…' : 'Đóng, chưa xác nhận'}
          </Button>
          <Button
            variant="primary"
            icon="check"
            disabledReason={
              approving
                ? 'Nhân đang áp dụng đề xuất này; không gửi lại lượt xác nhận nữa.'
                : busy
                  ? BUSY_REASON
                  : null
            }
            reasonHidden
            onClick={() => void confirm.run()}
          >
            {/* Named after what is actually in flight: while a *dismissal* is
                out this button is shut, but it is not the thing being waited
                for, and saying so would misreport which command was sent. */}
            {confirm.pending ? 'Đang chờ nhân trả lời…' : 'Áp dụng thay đổi'}
          </Button>
        </>
      }
    >
      {changes.length === 0 ? (
        <p className="muted">Nhân không liệt kê thay đổi nào cho thao tác này.</p>
      ) : (
        <ul className="stack" style={{ margin: 0, paddingInlineStart: 18 }}>
          {changes.map((change, index) => (
            <li key={`${change}-${index}`}>{change}</li>
          ))}
        </ul>
      )}

      {retry.type === 'proposal.accept' ? (
        <div className="field">
          <span className="field__label">Mã đề xuất</span>
          <code className="diag__code" data-proposal-id={retry.id}>
            {retry.id}
          </code>
          <span className="muted-3">
            Mã này gắn với đúng nguồn, lựa chọn và bản dự án nhân vừa đo; nếu một trong số đó đã đổi
            thì nhân từ chối và bạn lấy đề xuất mới.
          </span>
        </div>
      ) : null}

      {/* The reason the command stopped, exactly as the core stated it. */}
      <DiagnosticItem diagnostic={diagnostic} />

      <p className="muted-3" style={{ margin: 0 }} data-confirm-effect={effect.scope}>
        {effect.text}
      </p>

      {failure ? (
        <div className="stack" role="alert" data-confirm-failure={failure.code}>
          <strong style={{ color: 'var(--err)' }}>Nhân từ chối lượt xác nhận này.</strong>
          <DiagnosticItem diagnostic={failure} />
          <p className="muted-3" style={{ margin: 0 }}>
            Hộp thoại vẫn mở để bạn đọc lại phần thay đổi. Bấm “Áp dụng thay đổi” để thử lại, hoặc
            đóng và thao tác lại từ đầu nếu nhân báo đề xuất đã cũ.
          </p>
        </div>
      ) : null}

      {dismissFailure ? (
        <div className="stack" role="alert" data-dismiss-failure={dismissFailure.code}>
          <strong style={{ color: approving ? 'var(--warn)' : 'var(--err)' }}>
            {approving
              ? 'Không bỏ được nữa: nhân đang áp dụng đề xuất này.'
              : 'Nhân chưa xác nhận là đã bỏ đề xuất này.'}
          </strong>
          <DiagnosticItem diagnostic={dismissFailure} />
          <p className="muted-3" style={{ margin: 0 }}>
            {approving
              ? 'Lượt áp dụng đã bắt đầu, nên việc đóng hộp thoại không rút lại được nó và giao ' +
                'diện không nói là đã rút. Hộp thoại giữ nguyên cho tới khi nhân trả lời lượt áp dụng.'
              : 'Đề xuất vẫn nằm ở nhân, nên hộp thoại chưa đóng: giao diện không báo đã bỏ khi ' +
                'nhân chưa xác nhận. Thử đóng lại, hoặc mở nhật ký để xem mã nhân trả về.'}
          </p>
        </div>
      ) : null}

      <div className="row">
        <Button
          size="small"
          icon="dots"
          onClick={() => actions.openDialog({ kind: 'diagnostics' })}
        >
          Mở nhật ký và chẩn đoán
        </Button>
        {job?.cancellable ? (
          <Button
            size="small"
            variant="danger"
            icon="cancel"
            disabledReason={busy ? BUSY_REASON : null}
            reasonHidden
            onClick={() => {
              // Cancelling the running job is a different act from dismissing
              // the proposal, so it does not close the dialog on its own: the
              // dismissal still goes through `proposal.discard` and still waits
              // for the core to confirm it.
              void run({ type: 'job.cancel', id: job.id }, { announce: 'Đã gửi yêu cầu hủy.' })
            }}
          >
            Hủy lượt đang chạy
          </Button>
        ) : null}
      </div>
      <p className="muted-3" style={{ margin: 0 }} data-dismiss-mode={proposalId ? 'discard' : 'close-only'}>
        {proposalId
          ? 'Đóng hộp thoại sẽ gửi lệnh bỏ đề xuất (proposal.discard) đúng mã ở trên và chờ nhân ' +
            'trả lời; hộp thoại chỉ đóng khi nhân xác nhận đã bỏ. Việc bỏ không thực thi gì, không ' +
            'thêm bước lịch sử và không đổi bản sửa của dự án.'
          : 'Lượt này chưa có mã đề xuất nào ở nhân, nên đóng hộp thoại chỉ là không xác nhận: ' +
            'không có gì được thực thi và không có gì phải rút lại.'}
        {job?.cancellable
          ? ' Lượt đang chạy là việc riêng: nút “Hủy lượt đang chạy” gửi job.cancel, không thay cho bước bỏ đề xuất.'
          : ''}{' '}
        Lệnh dạng JSON nằm trong “Nhật ký và chẩn đoán”.
      </p>
    </Dialog>
  )
}

/** The long-lived review area: nothing important lives only in a toast. */
export function DiagnosticsDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const { state } = useUi()
  const actions = useUiActions()
  // The raw command of an open confirmation belongs here and nowhere else: it
  // is a diagnostic artefact, not something a user has to read to give consent.
  const pendingConfirmations = state.dialogs.flatMap((entry) =>
    entry.spec.kind === 'confirm' ? [entry.spec] : [],
  )

  return (
    <Dialog
      title="Nhật ký và chẩn đoán"
      wide
      onClose={onClose}
      description="Chẩn đoán hiện hành do nhân công bố, cùng nhật ký thao tác của phiên này."
      footer={
        <>
          <Button onClick={() => actions.clearLog()}>Xóa nhật ký phiên</Button>
          <Button variant="primary" onClick={onClose}>
            Đóng
          </Button>
        </>
      }
    >
      <section className="stack">
        <h3 style={{ margin: 0 }}>Chẩn đoán từ nhân</h3>
        <DiagnosticList diagnostics={snapshot.diagnostics} />
      </section>
      <div className="divider" />
      <section className="stack" data-pending-confirmations={pendingConfirmations.length}>
        <h3 style={{ margin: 0 }}>Lệnh đang chờ xác nhận ({pendingConfirmations.length})</h3>
        {pendingConfirmations.length === 0 ? (
          <p className="muted">Không có yêu cầu xác nhận nào đang mở.</p>
        ) : (
          pendingConfirmations.map((spec, index) => (
            <div key={`${spec.title}-${index}`} className="stack">
              <strong>{spec.title}</strong>
              <p className="muted-3" style={{ margin: 0 }}>
                Nguyên văn lệnh sẽ được gửi lại nếu bạn bấm “Áp dụng thay đổi”. Phần này để chẩn
                đoán, không phải để đọc trước khi đồng ý.
              </p>
              <pre className="code-block">{JSON.stringify(spec.retry, null, 2)}</pre>
            </div>
          ))
        )}
      </section>
      <div className="divider" />
      {/* UI-C14: history is what the core publishes about itself, including
          whether it had to shorten the trail. */}
      <section className="stack">
        <h3 style={{ margin: 0 }}>Lịch sử dự án theo nhân</h3>
        <div className="row">
          <span className="chip chip--muted fc-border">
            {snapshot.project.history.undoCount} bước hoàn tác
          </span>
          <span className="chip chip--muted fc-border">
            {snapshot.project.history.redoCount} bước làm lại
          </span>
          <span className="chip chip--muted fc-border">
            {formatBytes(snapshot.project.history.payloadBytes)} dữ liệu lịch sử
          </span>
          <span
            className={`chip ${snapshot.project.history.truncated ? 'chip--warn' : 'chip--muted'} fc-border`}
          >
            {snapshot.project.history.truncated ? 'đã rút ngắn' : 'chưa rút ngắn'}
          </span>
        </div>
        {snapshot.project.history.truncated ? (
          <p className="muted" style={{ margin: 0 }}>
            Nhân đã bỏ bớt phần đầu của lịch sử để giữ trong hạn mức. Các bước cũ hơn không hoàn tác
            lại được, kể cả khi dự án vẫn mở.
          </p>
        ) : null}
      </section>
      <div className="divider" />
      <section className="stack">
        <h3 style={{ margin: 0 }}>Nhật ký phiên ({state.log.length})</h3>
        {state.log.length === 0 ? (
          <p className="muted">Chưa có sự kiện nào.</p>
        ) : (
          <ul className="list-reset stack">
            {state.log.map((item) => (
              <li key={item.id} className={`diag diag--${item.tone === 'success' ? 'info' : item.tone} fc-border`}>
                <div className="diag__head">
                  <span className="diag__sev">{item.tone}</span>
                  {item.code ? <code className="diag__code">{item.code}</code> : null}
                  <span className="muted-3">{formatDateTime(item.at)}</span>
                </div>
                <div className="diag__msg">{item.text}</div>
                {item.detail ? <div className="diag__detail">{item.detail}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Dialog>
  )
}

/** Generated from the command registry — never a hand-written second table. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const groups = new Map<string, CommandDef[]>()
  for (const command of COMMANDS) {
    if (command.bindings.length === 0) continue
    const list = groups.get(command.group) ?? []
    list.push(command)
    groups.set(command.group, list)
  }

  return (
    <Dialog
      title="Bảng phím tắt"
      wide
      onClose={onClose}
      description="Bảng này và bảng lệnh trong Tìm nhanh sinh từ cùng một registry."
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {[...groups.entries()].map(([group, commands]) => (
        <section key={group} className="stack">
          <h3 style={{ margin: 0 }}>{group}</h3>
          <ul className="list-reset stack">
            {commands.map((command) => (
              <li key={command.id} className="row">
                <span className="grow">
                  {command.label}
                  {command.scope !== 'both' ? (
                    <span className="muted-3"> · chỉ bước {command.scope}</span>
                  ) : null}
                  {command.hint ? <span className="reason">{command.hint}</span> : null}
                </span>
                {command.bindings.map((binding) => (
                  <span key={binding.display} className="kbd">
                    {binding.display}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="stack">
        <h3 style={{ margin: 0 }}>Cử chỉ và lớp</h3>
        <ul className="list-reset stack">
          {GESTURE_ROWS.map((row) => (
            <li key={row.keys} className="row">
              <span className="kbd">{row.keys}</span>
              <span className="muted grow">{row.scope}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="muted-3" style={{ margin: 0 }}>
        Phím một chữ không kích hoạt khi con trỏ nằm trong ô nhập, khi IME đang ghép chữ, hoặc khi
        bạn đang giữ một tổ hợp trợ năng. {TOOLS_2D.length} công cụ 2D thuộc bước 1;{' '}
        {VIEW_ACTIONS.filter((action) => action.scope === 'step2').length} lệnh khung xem thuộc
        bước 2.
      </p>
    </Dialog>
  )
}

export function ExportChoiceDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const runExport = useAsyncAction(async (id: string) => bridge.exportFile(id), {
    announce: 'Đã gửi yêu cầu xuất tệp.',
  })
  const enabled = snapshot.exports.filter((option) => option.enabled)
  const blocked = snapshot.exports.filter((option) => !option.enabled)

  return (
    <Dialog
      title="Chọn đường xuất"
      wide
      onClose={onClose}
      description="Chỉ các đường xuất đang hợp lệ mới bấm được. Không có lựa chọn mặc định ngầm theo tên máy."
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <section className="stack">
        <h3 style={{ margin: 0 }}>Đang hợp lệ ({enabled.length})</h3>
        {enabled.length === 0 ? <p className="muted">Không có đường xuất nào hợp lệ.</p> : null}
        {enabled.map((option) => (
          <div
            key={option.id}
            className="row"
            data-export-option={option.id}
            data-export-prerequisite={exportPrerequisite(option)}
          >
            <span className="grow">
              {option.label} <span className="muted-3">{option.extension}</span>
            </span>
            <span className="chip chip--muted fc-border">
              {PREREQUISITE_LABEL[exportPrerequisite(option)]}
            </span>
            <span className="chip chip--muted fc-border">{VERDICT_LABEL[option.verdict]}</span>
            <Button
              icon="download"
              disabled={runExport.pending}
              onClick={() => void runExport.run(option.id)}
            >
              {option.verdict === 'pass' ? 'Xuất' : 'Xuất để kiểm tra'}
            </Button>
          </div>
        ))}
      </section>

      {blocked.length > 0 ? (
        <section className="stack">
          <h3 style={{ margin: 0 }}>Đang bị chặn ({blocked.length})</h3>
          {blocked.map((option) => (
            <div
              key={option.id}
              className="diag diag--warning fc-border"
              data-export-option={option.id}
              data-export-prerequisite={exportPrerequisite(option)}
            >
              <div className="diag__head">
                <span className="diag__sev">{option.label}</span>
                <code className="diag__code">{option.id}</code>
                {option.reasonCode ? <code className="diag__code">{option.reasonCode}</code> : null}
              </div>
              <div className="diag__msg">
                {exportReasonText(option, 'Nhân không nêu lý do cụ thể.')}
              </div>
              <div className="diag__detail">{PREREQUISITE_NOTE[exportPrerequisite(option)]}</div>
            </div>
          ))}
        </section>
      ) : null}
    </Dialog>
  )
}
