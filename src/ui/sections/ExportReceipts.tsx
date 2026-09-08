/**
 * The record the core kept for each export it ran (UI-C10, contract 0.3
 * `AppSnapshot.exportReceipts`).
 *
 * Three things this surface refuses to say, because none of them is true:
 *
 * - that a file exists on the machine. The core answering an export says the
 *   core wrote bytes and recorded them; whether the operating system then saved
 *   anything, and where, is not in the snapshot.
 * - that the result is printable. A verdict is a verdict, a warning is a
 *   warning, and neither becomes "ready to print" by being displayed next to a
 *   green chip.
 * - that this list survives. Receipts belong to the access session and the open
 *   document; the sentence saying so is on screen, next to the button that
 *   downloads a record worth keeping beside the file.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExportReceiptView } from '../../contracts/app-bridge.ts'
import { useBridge, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { requestKey } from '../core/identity.ts'
import { useDroppedAnswerLog, useRequestOwner } from '../core/request-owner.ts'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { formatBytes, formatDateTime, formatNumber, VERDICT_LABEL } from '../core/text.ts'
import { receiptIntentLabel, verdictChipClass } from '../core/export-config.ts'
import { Button } from '../components/Button.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'

/** The kind of request, for the session log. Never the record it was about. */
const REQUEST_WHAT = 'hồ sơ kết quả của một lượt xuất'

export function ExportReceipts() {
  const snapshot = useSnapshot()
  const { state } = useUi()
  const actions = useUiActions()
  const receipts = snapshot.exportReceipts
  const open = isGroupOpen(state, 'export-receipts')

  // A build that publishes no receipts key at all keeps the older interface:
  // the member is additive, and its absence is not an empty session.
  if (receipts === undefined) return null

  return (
    <CollapsibleGroup
      title="Hồ sơ kết quả xuất"
      color="var(--sec-export)"
      open={open}
      onToggle={() => actions.setGroupOpen('export-receipts', !open)}
      count={`${receipts.length} hồ sơ`}
    >
      <div className="stack" data-export-receipts={receipts.length}>
        <p className="muted" style={{ margin: 0 }}>
          Đây là những gì nhân ghi lại cho các lượt xuất của phiên truy cập và dự án đang mở. Tải hồ
          sơ về để lưu cùng tệp: danh sách này không tự tồn tại sau khi bạn đóng dự án, đổi dự án
          hoặc đăng xuất.
        </p>
        <p className="muted-3" style={{ margin: 0 }}>
          Có hồ sơ nghĩa là nhân đã ghi bytes và ghi lại kết quả kiểm của lượt đó. Giao diện không
          biết hệ điều hành đã lưu tệp ở đâu hay đã lưu chưa, và không có dòng nào ở đây nói tệp in
          được.
        </p>
        {receipts.length === 0 ? (
          <div className="empty">
            <strong className="empty__title">Phiên này chưa có lượt xuất nào được ghi</strong>
            <p className="muted" style={{ margin: 0 }}>
              Hồ sơ xuất hiện sau khi nhân chạy xong một lượt xuất và trả về hồ sơ cho nó.
            </p>
          </div>
        ) : (
          <ul className="list-reset stack">
            {receipts.map((receipt) => (
              <ReceiptRow key={receipt.id} receipt={receipt} />
            ))}
          </ul>
        )}
      </div>
    </CollapsibleGroup>
  )
}

function ReceiptRow({ receipt }: { receipt: ExportReceiptView }) {
  const bridge = useBridge()
  const run = useRunCommand()
  const owner = useRequestOwner(requestKey(['export.receipt', receipt.id]))
  const logDropped = useDroppedAnswerLog()
  const [pending, setPending] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [moved, setMoved] = useState<string | null>(null)

  // A refusal is about the record as it was published. When the core republishes
  // this record differently, the old sentence is no longer about what is shown.
  //
  // `moved` is deliberately not cleared here: it is a statement *about* that
  // republication — the record changed under an open card, so nothing was sent.
  // Wiping it on the very change it reports would leave a click that did
  // nothing and said nothing. It goes when the person tries again.
  const stamp = `${receipt.sha256}|${receipt.projectRevision}|${receipt.metadataAvailable}`
  const seenStamp = useRef(stamp)
  useEffect(() => {
    if (seenStamp.current === stamp) return
    seenStamp.current = stamp
    setRefusal(null)
  }, [stamp])

  const download = useCallback(async () => {
    if (pending) return
    // Read the row back by id from the live snapshot before sending. A list that
    // moved under an open card must not turn this click into a request for a
    // different record, and the interface does not guess a replacement.
    const live = bridge.getSnapshot().exportReceipts?.find((item) => item.id === receipt.id)
    if (!live) {
      setMoved(
        'Hồ sơ này không còn trong danh sách của phiên hiện tại, nên không có lệnh nào được gửi. ' +
          'Giao diện không đoán hồ sơ thay thế từ một dòng đã đổi.',
      )
      return
    }
    if (!live.metadataAvailable) {
      setMoved(
        'Nhân không còn công bố metadata cho hồ sơ này, nên không có lệnh nào được gửi.',
      )
      return
    }
    setMoved(null)
    setRefusal(null)
    setPending(true)
    const ticket = owner.begin()
    try {
      const result = await run(
        { type: 'export.receipt', id: receipt.id },
        {
          toastOnError: false,
          announce: 'Đã gửi yêu cầu tải hồ sơ kết quả cho nhân.',
        },
      )
      const claim = owner.claim(ticket)
      if (claim !== 'owner') {
        logDropped(claim, REQUEST_WHAT)
        return
      }
      if (!result.ok) setRefusal(result.diagnostic.message)
    } finally {
      // A busy flag is a statement about this control, not a claim about the
      // answer, so it is always released.
      setPending(false)
    }
  }, [bridge, logDropped, owner, pending, receipt.id, run])

  return (
    <li
      className="card fc-border"
      style={{ padding: 10 }}
      data-export-receipt={receipt.id}
      data-export-receipt-format={receipt.formatId}
      data-export-receipt-verdict={receipt.verdict}
      data-export-receipt-inspection={receipt.inspection ? 'true' : 'false'}
      data-export-receipt-metadata={receipt.metadataAvailable ? 'true' : 'false'}
      data-export-receipt-warnings={receipt.warnings.length}
    >
      <div className="export-name" data-export-receipt-filename={receipt.filename}>
        {receipt.filename}
      </div>
      <div className="export-chips">
        <code className="diag__code">{receipt.formatId}</code>
        <span className={verdictChipClass(receipt.verdict)}>{VERDICT_LABEL[receipt.verdict]}</span>
        <span className="chip chip--muted fc-border">{receiptIntentLabel(receipt)}</span>
        <span className="chip chip--muted fc-border">{formatBytes(receipt.byteLength)}</span>
        <span className="chip chip--muted fc-border">bản sửa {receipt.projectRevision}</span>
        <span className="chip chip--muted fc-border">{formatDateTime(receipt.createdAt)}</span>
      </div>
      <div className="export-meta" data-export-receipt-bytes={receipt.byteLength}>
        Byte thực: {formatNumber(receipt.byteLength, 0)} · thời điểm nhân ghi: {receipt.createdAt}
      </div>
      <div className="stack" style={{ gap: 2 }}>
        <span className="muted-3">SHA-256 của tệp</span>
        <span className="export-hash" data-export-receipt-sha={receipt.sha256}>
          {receipt.sha256}
        </span>
      </div>
      {receipt.warnings.length > 0 ? (
        <ul className="list-reset stack" aria-label={`Cảnh báo của ${receipt.filename}`}>
          {receipt.warnings.map((warning, index) => (
            <li key={`${index}-${warning}`} className="export-warn" data-export-receipt-warning>
              ⚠ {warning}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row">
        <Button
          icon="download"
          disabledReason={
            receipt.metadataAvailable
              ? null
              : 'Nhân không công bố metadata cho hồ sơ này, nên chưa có gì để tải.'
          }
          aria-label={`Tải hồ sơ kết quả: ${receipt.filename}`}
          onClick={() => void download()}
        >
          {pending ? 'Đang gửi yêu cầu…' : 'Tải hồ sơ (JSON)'}
        </Button>
      </div>
      {moved ? (
        <div className="diag diag--warning fc-border" role="status" data-export-receipt-moved>
          <div className="diag__msg">{moved}</div>
        </div>
      ) : null}
      {refusal ? (
        <div className="diag diag--error fc-border" role="alert" data-export-receipt-error>
          <div className="diag__msg">{refusal}</div>
        </div>
      ) : null}
    </li>
  )
}
