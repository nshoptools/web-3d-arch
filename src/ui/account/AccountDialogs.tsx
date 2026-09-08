import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AIJobView, Json, UserView } from '../../contracts/app-bridge.ts'
import {
  isReauthRequired,
  useAsyncAction,
  useBridge,
  useCapability,
  useRunCommand,
  useSnapshot,
} from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { accountIdentity } from '../core/identity.ts'
import { useDroppedAnswerLog, useRequestOwner } from '../core/request-owner.ts'
import { CAP } from '../core/registry.ts'
import { Button } from '../components/Button.tsx'
import { Dialog } from '../components/Dialog.tsx'
import { CheckField, NumberField, SelectField, TextField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { formatDateTime } from '../core/text.ts'

/* ------------------------------------------------------------------ AI keys */

/**
 * BYOK connection management (AI-01, AI-02).
 *
 * The secret exists only inside this form's state and is cleared as soon as the
 * call settles, in success or in failure. It is never logged, never put in a
 * toast, never stored and never sent anywhere except AppBridge.connectAI.
 */
export function AIConnectionsDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const actions = useUiActions()
  const [providerId, setProviderId] = useState(snapshot.aiProviders[0]?.id ?? '')
  const [secret, setSecret] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const connect = useAsyncAction(async (id: string, value: string) => {
    try {
      return await bridge.connectAI(id, value)
    } finally {
      // Cleared on every path, including a thrown error.
      setSecret('')
      setAcknowledged(false)
    }
  }, { success: 'Đã lưu và kiểm tra thông tin kết nối.' })

  const disconnect = useAsyncAction(async (id: string) => bridge.disconnectAI(id), {
    success: 'Đã gỡ thông tin kết nối khỏi kho hoạt động.',
  })

  const provider = snapshot.aiProviders.find((item) => item.id === providerId)

  return (
    <Dialog
      title="Kết nối AI của bạn"
      wide
      onClose={() => {
        setSecret('')
        onClose()
      }}
      description="Mỗi người tự tạo và tự trả tài khoản nhà cung cấp. Không có ví chung và không dùng khóa của người khác."
      footer={
        <Button
          variant="primary"
          onClick={() => {
            setSecret('')
            onClose()
          }}
        >
          Đóng
        </Button>
      }
    >
      {snapshot.aiProviders.length === 0 ? (
        <p className="muted">Chủ nhóm chưa cho phép nhà cung cấp nào trong chính sách hệ thống.</p>
      ) : null}

      <ul className="list-reset stack">
        {snapshot.aiProviders.map((item) => (
          <li key={item.id} className="card fc-border" style={{ padding: 10 }}>
            <div className="row">
              <strong className="grow">{item.label}</strong>
              <span className={`chip ${item.connected ? 'chip--ok' : 'chip--muted'} fc-border`}>
                {item.connected ? 'đã kết nối' : 'chưa kết nối'}
              </span>
            </div>
            <div className="muted-3">
              {item.models.length} model · tiền tệ {item.currency}
            </div>
            {/* AI-02: label, mask and last check come from the snapshot. The
                interface prints exactly what the core published and never
                composes a mask of its own. */}
            {item.credential ? (
              <ul className="list-reset stack">
                <li className="row">
                  <span className="grow muted">Nhãn thông tin kết nối</span>
                  <span style={{ overflowWrap: 'anywhere' }}>{item.credential.label}</span>
                </li>
                <li className="row">
                  <span className="grow muted">Phần che</span>
                  <code className="diag__code">{item.credential.masked}</code>
                </li>
                <li className="row">
                  <span className="grow muted">Trạng thái kiểm</span>
                  <span className="chip chip--muted fc-border">{item.credential.status}</span>
                </li>
                <li className="row">
                  <span className="grow muted">Kiểm gần nhất</span>
                  <span>
                    {item.credential.lastChecked === null ? (
                      <em>chưa kiểm lần nào</em>
                    ) : (
                      formatDateTime(new Date(item.credential.lastChecked).toISOString())
                    )}
                  </span>
                </li>
              </ul>
            ) : (
              <div className="muted-3">
                {item.connected
                  ? 'Nhân chưa công bố nhãn hay phần che cho thông tin kết nối này; giao diện không bịa ra phần che.'
                  : 'Chưa có thông tin kết nối nào cho nhà cung cấp này.'}
              </div>
            )}
            {item.connected ? (
              <div className="muted-3">
                Khóa được giữ mã hóa ở backend. Giao diện không nhận lại khóa sau khi lưu.
              </div>
            ) : null}
            {!item.available && item.reason ? <span className="reason">{item.reason}</span> : null}
            <div className="row">
              <Button
                size="small"
                icon="key"
                onClick={() => {
                  setProviderId(item.id)
                  setSecret('')
                  actions.announce(`Đang nhập khóa cho ${item.label}.`)
                }}
              >
                {item.connected ? 'Thay khóa' : 'Thêm khóa'}
              </Button>
              <Button
                size="small"
                variant="danger"
                icon="trash"
                disabled={disconnect.pending}
                disabledReason={item.connected ? null : 'Chưa có khóa nào để gỡ.'}
                onClick={() => void disconnect.run(item.id)}
              >
                Gỡ khóa
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {provider ? (
        <form
          className="card fc-border"
          onSubmit={(event) => {
            event.preventDefault()
            if (!acknowledged || secret.trim() === '') return
            void connect.run(provider.id, secret)
          }}
        >
          <strong>Nhập khóa cho {provider.label}</strong>
          <TextField
            label="API key"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={setSecret}
            hint="Khóa đi thẳng tới backend cùng origin qua HTTPS và được lưu mã hóa. Ô này bị xóa ngay khi lượt gửi kết thúc và không được lưu ở đâu trong trình duyệt."
          />
          <label className="check">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              Tôi hiểu bước kiểm tra khóa gọi tới nhà cung cấp và một số nhà cung cấp có thể tính
              phí cho lượt kiểm tra này. Bước kiểm tra không sinh ảnh.
            </span>
          </label>
          <Button
            type="submit"
            variant="primary"
            icon="check"
            disabled={connect.pending}
            disabledReason={
              secret.trim() === ''
                ? 'Nhập khóa trước khi lưu.'
                : acknowledged
                  ? null
                  : 'Xác nhận bạn hiểu bước kiểm tra trước khi gửi.'
            }
          >
            {connect.pending ? 'Đang kiểm tra…' : 'Lưu và kiểm tra khóa'}
          </Button>
        </form>
      ) : null}
    </Dialog>
  )
}

/* -------------------------------------------------------------------- costs */

const BASIS_LABEL: Record<AIJobView['accountingBasis'], string> = {
  none: 'chưa ghi nhận',
  pending: 'đang chờ đối soát',
  estimated: 'ước tính',
  actual: 'thực tế',
}

const STATE_LABEL: Record<AIJobView['state'], string> = {
  prepared: 'đã chuẩn bị',
  reserved: 'đã giữ chỗ',
  submitted: 'đã gửi',
  running: 'đang chạy',
  succeeded: 'thành công',
  failed: 'thất bại',
  cancelled: 'đã hủy',
  unknown: 'chưa rõ',
}

/** Money that the core has not resolved is printed as unknown, never as 0. */
function Money({ value, currency }: { value: string | null; currency: string }) {
  if (value === null) return <em>chưa xác định</em>
  return (
    <>
      {value} {currency}
    </>
  )
}

export function JobRow({ job }: { job: AIJobView }) {
  return (
    <li className="card fc-border" style={{ padding: 10 }}>
      <div className="row">
        <strong className="grow" style={{ overflowWrap: 'anywhere' }}>
          {job.modelId}
        </strong>
        <span className="chip chip--muted fc-border">{STATE_LABEL[job.state]}</span>
        {job.unresolved ? (
          <span className="chip chip--warn fc-border">chưa đối soát</span>
        ) : null}
      </div>
      <div className="muted-3" style={{ overflowWrap: 'anywhere' }}>
        {job.providerId} · kỳ UTC {job.periodUtc} · tạo {formatDateTime(job.createdAt)}
      </div>
      <div className="muted-3" style={{ overflowWrap: 'anywhere' }}>
        Mã lượt <code className="diag__code">{job.operationId}</code> · mã việc{' '}
        <code className="diag__code">{job.id}</code>
      </div>
      <div className="row">
        <span className="chip chip--muted fc-border">
          Ước tính: <Money value={job.estimated} currency={job.currency} />
        </span>
        <span className="chip chip--muted fc-border">
          Thực tế: <Money value={job.actual} currency={job.currency} />
        </span>
        <span className="chip chip--warn fc-border">
          Giữ chỗ: {job.reserved} {job.currency}
        </span>
        <span className="chip chip--muted fc-border">
          Cơ sở kế toán: {BASIS_LABEL[job.accountingBasis]}
        </span>
      </div>
    </li>
  )
}

/**
 * AI-03/AI-04: estimated, actual and unknown are three different things, the
 * period is UTC, and the personal budget is three separate limits written as
 * decimal strings the core converts — the interface never does money in float.
 */
export function CostsDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const providers = snapshot.aiProviders

  const [providerFilter, setProviderFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [jobId, setJobId] = useState('')
  const [jobs, setJobs] = useState<AIJobView[]>([])
  const [unresolved, setUnresolved] = useState<AIJobView[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [openGroups, setOpenGroups] = useState({ budget: true, ledger: true })
  /**
   * The ledger is one person's money. It is component state, and nothing in the
   * shell unmounts a dialog when a session ends, so the identity of the account
   * the rows belong to has to be held here and checked — both when a reply
   * lands and when the session underneath changes.
   */
  const account = accountIdentity(snapshot)
  const signedIn = snapshot.session.user !== null
  const [accountEnded, setAccountEnded] = useState(false)
  const owner = useRequestOwner('', accountIdentity)
  const logDropped = useDroppedAnswerLog()

  const budgetProvider = providers.find((item) => item.id === providerFilter) ?? providers[0]
  const [currency, setCurrency] = useState(budgetProvider?.currency ?? 'USD')
  const [perOperation, setPerOperation] = useState('')
  const [perDay, setPerDay] = useState('')
  const [perMonth, setPerMonth] = useState('')
  const [closing, setClosing] = useState<{ jobId: string; reason: string } | null>(null)

  // AI-03: the three limits are read back from the snapshot, so the form shows
  // what is stored rather than what it last sent. A new published revision (or
  // a different currency) reloads the fields.
  const aiBudget = snapshot.aiBudget
  const storedLimit = aiBudget.limits.find((limit) => limit.currency === currency) ?? null
  const budgetKey = `${aiBudget.revision}|${currency}`
  const loadedBudgetKey = useRef('')
  useEffect(() => {
    if (loadedBudgetKey.current === budgetKey) return
    loadedBudgetKey.current = budgetKey
    setPerOperation(storedLimit?.perOperation ?? '')
    setPerDay(storedLimit?.perDay ?? '')
    setPerMonth(storedLimit?.perMonth ?? '')
  }, [budgetKey, storedLimit])

  // Read from a ref so typing a date does not fire a query per keystroke; the
  // text filters are applied when the user asks for them.
  const filters = useRef({ from, to, jobId })
  filters.current = { from, to, jobId }

  /**
   * One page of the ledger, owned by the request that asked for it.
   *
   * Four callers can have a query in flight at once — the effect below, the
   * explicit "Đọc sổ chi phí" button, "Tải thêm", and the reload after closing
   * an unknown charge — and `useAsyncAction`'s guard is per action, so they do
   * not serialise against each other. Only the newest request may write, and
   * that single rule fixes all three races at once: an older page can no longer
   * replace a newer one, an older `nextCursor` can no longer be installed under
   * a filter it does not belong to, and an older page can no longer be appended
   * to a list fetched under a different filter.
   *
   * The error and the "đang đọc…" flag are part of the same answer and take the
   * same rule: a late success may not clear the banner of a newer failure, and a
   * late failure may not put a banner over a newer, valid page.
   */
  const load = useCallback(
    async (after?: string) => {
      const current = filters.current
      const filter: Parameters<typeof bridge.queryAIJobs>[0] = {}
      if (current.from.trim() !== '') filter.from = current.from.trim()
      if (current.to.trim() !== '') filter.to = current.to.trim()
      if (providerFilter !== '') filter.providerId = providerFilter
      if (current.jobId.trim() !== '') filter.jobId = current.jobId.trim()
      if (after) filter.after = after
      const ticket = owner.begin()
      try {
        const page = await bridge.queryAIJobs(filter)
        const claim = owner.claim(ticket)
        if (claim !== 'owner') {
          // Never rendered, and for a different account never described either:
          // job ids, operation ids and spend are that person's own reconciliation
          // data. Only the fact that an answer was dropped is recorded.
          logDropped(claim, 'trang sổ chi phí')
          return
        }
        setJobs((previous) => (after ? [...previous, ...page.jobs] : page.jobs))
        setUnresolved(page.unresolved)
        setCursor(page.nextCursor)
        setQueryError(null)
        setLoaded(true)
      } catch (cause) {
        if (owner.claim(ticket) !== 'owner') return
        // An empty ledger and a failed query are different things.
        setQueryError(cause instanceof Error ? cause.message : 'Không đọc được sổ chi phí.')
        setLoaded(true)
      }
    },
    [bridge, logDropped, owner, providerFilter],
  )

  /**
   * The session ended under an open ledger. The rows on screen are the previous
   * account's, so they go — this is the promise the sign-out dialog makes in
   * words, kept here in code. Any query still in flight loses its ticket with
   * the same call, so it cannot repopulate the list afterwards.
   */
  const lastAccount = useRef(account)
  // Whether anything of the previous account was actually on screen, so the
  // notice is only shown when there was something to take away.
  const hadRows = useRef(false)
  hadRows.current = jobs.length > 0 || unresolved.length > 0 || queryError !== null
  useEffect(() => {
    if (lastAccount.current === account) return
    lastAccount.current = account
    owner.release()
    setAccountEnded(hadRows.current)
    setJobs([])
    setUnresolved([])
    setCursor(null)
    setQueryError(null)
    setClosing(null)
    setLoaded(false)
  }, [account, owner])

  // Opening the dialog and changing the provider read the ledger; the date and
  // job-id fields wait for the explicit button. With no signed-in user there is
  // no ledger to read, and asking for one would be asking on nobody's behalf.
  useEffect(() => {
    if (!signedIn) return
    void load()
  }, [load, signedIn])

  const query = useAsyncAction(async () => {
    await load()
  })

  const more = useAsyncAction(async (after: string) => {
    await load(after)
  })

  const saveBudget = useAsyncAction(async () => {
    await run(
      {
        type: 'ai.budget',
        currency: currency.trim(),
        perOperation: perOperation.trim(),
        perDay: perDay.trim(),
        perMonth: perMonth.trim(),
      },
      { success: 'Đã gửi hạn mức cá nhân cho nhân xử lý.' },
    )
  })

  const budgetBlocked = useMemo(() => {
    if (currency.trim() === '') return 'Chọn đơn vị tiền tệ của nhà cung cấp.'
    const missing = [perOperation, perDay, perMonth].some((value) => value.trim() === '')
    if (missing) return 'AI-03 yêu cầu đủ ba trần: mỗi lượt, mỗi ngày và mỗi tháng.'
    return null
  }, [currency, perDay, perMonth, perOperation])

  const budgetDirty =
    (storedLimit?.perOperation ?? '') !== perOperation ||
    (storedLimit?.perDay ?? '') !== perDay ||
    (storedLimit?.perMonth ?? '') !== perMonth

  /**
   * AI-03: closing an unknown charge is a bookkeeping decision, so it needs a
   * written reason and an explicit confirmation. It never turns a real cost
   * into zero — the obligation stays in the period it arose in.
   */
  const closeUnknown = useAsyncAction(async (jobId: string, reason: string) => {
    await run(
      { type: 'ai.close-unknown', jobId, reason, confirmed: true },
      { success: 'Đã gửi yêu cầu đóng khoản chưa rõ kèm lý do.' },
    )
    setClosing(null)
    await load()
  })

  return (
    <Dialog
      title="Chi phí của tôi"
      wide
      onClose={onClose}
      description="Số liệu của riêng bạn. Chủ nhóm không thấy prompt, ảnh hay chi tiêu cá nhân của bạn."
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <section className="stack">
        <h3 style={{ margin: 0 }}>Tổng hợp theo nhà cung cấp</h3>
        <ul className="list-reset stack">
          {providers.map((item) => (
            <li key={item.id} className="card fc-border" style={{ padding: 10 }}>
              <div className="row">
                <strong className="grow">{item.label}</strong>
                <span className="chip chip--muted fc-border">{item.currency}</span>
              </div>
              <div className="row">
                <span className="chip chip--muted fc-border">
                  Đã tiêu: <Money value={item.spent} currency={item.currency} />
                </span>
                <span className="chip chip--warn fc-border">
                  Đang giữ chỗ: {item.reserved} {item.currency}
                </span>
                <span className="chip chip--muted fc-border">
                  Trần cá nhân:{' '}
                  {item.budget === null ? <em>chưa đặt</em> : `${item.budget} ${item.currency}`}
                </span>
              </div>
              {item.spent === null ? (
                <p className="muted" style={{ margin: 0, color: 'var(--warn)' }}>
                  Chưa lấy được chi phí thật từ nhà cung cấp. Mục này ghi là chưa xác định, không
                  ghi số 0 là thực tế.
                </p>
              ) : null}
            </li>
          ))}
          {providers.length === 0 ? (
            <li className="muted">Chưa có nhà cung cấp nào được phép trong chính sách hệ thống.</li>
          ) : null}
        </ul>
      </section>

      <CollapsibleGroup
        title="Hạn mức cá nhân"
        open={openGroups.budget}
        onToggle={() => setOpenGroups((value) => ({ ...value, budget: !value.budget }))}
        count="3 kỳ"
      >
        <p className="muted" style={{ margin: 0 }}>
          Nhập số theo chuỗi thập phân của đúng đơn vị tiền tệ, ví dụ <code>1,50</code>. Nhân quy
          đổi sang micro-currency; giao diện không tính tiền bằng số thực. Trần hiệu lực là mức thấp
          hơn giữa cá nhân và hệ thống, trong cùng đơn vị và cùng kỳ.
        </p>
        <SelectField
          label="Đơn vị tiền tệ"
          value={currency}
          options={[
            ...new Set([currency, ...providers.map((item) => item.currency)].filter(Boolean)),
          ].map((code) => ({ value: code, label: code }))}
          onChange={setCurrency}
          hint="Không cộng tiền khác đơn vị; mỗi đơn vị có hạn mức riêng."
        />
        <div className="row">
          <span className="chip chip--muted fc-border">
            Bản hạn mức {aiBudget.revision}
          </span>
          {storedLimit ? (
            <span className="chip chip--muted fc-border">
              Đã lưu: {storedLimit.perOperation} / {storedLimit.perDay} / {storedLimit.perMonth}{' '}
              {storedLimit.currency}
            </span>
          ) : (
            <span className="chip chip--warn fc-border">
              Chưa có hạn mức đã lưu cho đơn vị {currency}
            </span>
          )}
          {budgetDirty ? (
            <span className="chip chip--warn fc-border">ô đang khác giá trị đã lưu</span>
          ) : null}
        </div>
        <TextField
          label="Trần mỗi lượt"
          value={perOperation}
          onChange={setPerOperation}
          hint="Chuỗi thập phân, gửi nguyên văn cho nhân."
        />
        <TextField label="Trần mỗi ngày (kỳ UTC)" value={perDay} onChange={setPerDay} />
        <TextField label="Trần mỗi tháng (kỳ UTC)" value={perMonth} onChange={setPerMonth} />
        <div className="row">
          <Button
            icon="save"
            variant="primary"
            disabled={saveBudget.pending}
            disabledReason={budgetBlocked}
            onClick={() => void saveBudget.run()}
          >
            Lưu hạn mức
          </Button>
          <Button
            icon="refresh"
            disabledReason={budgetDirty ? null : 'Ba ô đang khớp giá trị nhân đã công bố.'}
            reasonHidden
            onClick={() => {
              setPerOperation(storedLimit?.perOperation ?? '')
              setPerDay(storedLimit?.perDay ?? '')
              setPerMonth(storedLimit?.perMonth ?? '')
            }}
          >
            Về giá trị đã lưu
          </Button>
        </div>
        <p className="muted-3" style={{ margin: 0 }}>
          Không có ngân sách hợp lệ thì AI tắt. Lưu hạn mức không xóa sổ chi phí hay khoản đang giữ
          chỗ. Giá trị hiển thị ở trên đọc từ <code>aiBudget</code> của nhân, không phải từ ô nhập.
        </p>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Sổ chi phí"
        open={openGroups.ledger}
        onToggle={() => setOpenGroups((value) => ({ ...value, ledger: !value.ledger }))}
        count={loaded ? `${jobs.length} lượt` : 'đang đọc…'}
      >
        <SelectField
          inputId="w3a-costs-provider"
          label="Lọc theo nhà cung cấp"
          value={providerFilter}
          options={[
            { value: '', label: 'Tất cả nhà cung cấp' },
            ...providers.map((item) => ({ value: item.id, label: item.label })),
          ]}
          onChange={setProviderFilter}
        />
        <div className="row">
          <div className="grow">
            <TextField
              label="Từ (UTC)"
              value={from}
              onChange={setFrom}
              placeholder="2026-09-01"
              hint="Mốc đầu tính vào khoảng lọc."
            />
          </div>
          <div className="grow">
            <TextField
              label="Đến (UTC)"
              value={to}
              onChange={setTo}
              placeholder="2026-09-30"
              hint="Mốc cuối không tính vào khoảng lọc."
            />
          </div>
        </div>
        <TextField
          label="Mã việc cụ thể"
          value={jobId}
          onChange={setJobId}
          hint="Dùng để tự đối soát với hóa đơn của nhà cung cấp."
        />
        <Button
          icon="search"
          disabled={query.pending}
          disabledReason={
            signedIn ? null : 'Không còn phiên đăng nhập nào để đọc sổ chi phí của bạn.'
          }
          onClick={() => void query.run()}
        >
          {query.pending ? 'Đang đọc…' : 'Đọc sổ chi phí'}
        </Button>

        {/* The rows belonged to a session that has ended. They are gone rather
            than left on screen, and what is said about them is only that they
            were removed — not that anything was cancelled or refunded. */}
        {accountEnded ? (
          <div className="diag diag--warning fc-border" role="status" data-ledger-cleared>
            <div className="diag__msg">
              Phiên đăng nhập của sổ này đã đổi, nên các dòng đang hiển thị đã được gỡ khỏi màn hình.
            </div>
            <div className="diag__detail">
              Đây chỉ là việc của giao diện: các lượt đã gửi vẫn nằm ở nhân và ở nhà cung cấp đúng
              như đã ghi nhận, không có lượt nào bị hủy vì việc này. Đăng nhập lại rồi mở lại trang
              này để xem sổ của tài khoản đang dùng.
            </div>
          </div>
        ) : null}

        {!signedIn ? (
          <p className="muted" data-ledger-signed-out>
            Sổ chi phí là dữ liệu riêng của một tài khoản. Chưa có phiên đăng nhập nào nên giao diện
            không đọc và không hiển thị sổ của ai cả.
          </p>
        ) : null}

        {queryError ? (
          <div className="diag diag--error fc-border">
            <div className="diag__msg">{queryError}</div>
            <div className="diag__detail">
              Đây là lỗi đọc sổ, không phải “bạn chưa có lượt nào”.
            </div>
          </div>
        ) : null}

        {loaded && !queryError && jobs.length === 0 ? (
          <p className="muted">Không có lượt nào khớp bộ lọc này.</p>
        ) : null}

        <ul className="list-reset stack">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ul>

        {cursor ? (
          <Button
            block
            icon="plus"
            disabled={more.pending}
            onClick={() => void more.run(cursor)}
          >
            Tải thêm
          </Button>
        ) : null}
      </CollapsibleGroup>

      {unresolved.length > 0 ? (
        <section className="stack">
          <h3 style={{ margin: 0, color: 'var(--warn)' }}>
            Khoản chưa đối soát ({unresolved.length})
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            Các lượt này giữ nghĩa vụ ở kỳ phát sinh của chúng, kể cả khi đã sang kỳ mới. Đóng một
            khoản chưa rõ không biến chi phí thật thành 0.
          </p>
          <ul className="list-reset stack">
            {unresolved.map((job) => (
              <li key={`unresolved-${job.id}`} className="stack">
                <ul className="list-reset">
                  <JobRow job={job} />
                </ul>
                {closing?.jobId === job.id ? (
                  <div className="card fc-border" role="group" aria-label={`Đóng khoản ${job.id}`}>
                    <strong>Đóng khoản chưa rõ này?</strong>
                    <ul style={{ margin: 0, paddingInlineStart: 18 }} className="muted">
                      <li>Lượt vẫn nằm ở kỳ UTC {job.periodUtc} và vẫn được tính vào kỳ đó.</li>
                      <li>Chi phí thật vẫn là chưa xác định; đóng theo dõi không đặt nó về 0.</li>
                      <li>Lý do bạn ghi được lưu cùng bản ghi để đối soát sau này.</li>
                    </ul>
                    <TextField
                      label="Lý do đóng"
                      multiline
                      rows={2}
                      value={closing.reason}
                      onChange={(value) => setClosing({ jobId: job.id, reason: value })}
                      hint="Bắt buộc. Ví dụ: đã đối chiếu hóa đơn tháng của nhà cung cấp."
                    />
                    <div className="row row--end">
                      <Button onClick={() => setClosing(null)}>Để nguyên</Button>
                      <Button
                        variant="danger"
                        icon="check"
                        disabled={closeUnknown.pending}
                        disabledReason={
                          closing.reason.trim() === '' ? 'Ghi lý do trước khi đóng.' : null
                        }
                        onClick={() => void closeUnknown.run(job.id, closing.reason.trim())}
                      >
                        Xác nhận đóng
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="row">
                    <Button
                      size="small"
                      icon="check"
                      onClick={() => setClosing({ jobId: job.id, reason: '' })}
                    >
                      Đóng khoản chưa rõ
                    </Button>
                    <span className="muted-3">Cần lý do và một bước xác nhận.</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="muted-3" style={{ margin: 0 }}>
        Ledger của ứng dụng chỉ đo các lượt đi qua ứng dụng này; hóa đơn của nhà cung cấp là số đối
        soát cuối. Kỳ tính theo UTC.
      </p>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ members */

type MemberAction = 'suspend' | 'restore' | 'role' | 'revoke' | 'delete'

interface PendingAction {
  user: UserView & { active: boolean }
  action: MemberAction
}

const ACTION_TITLE: Record<MemberAction, string> = {
  suspend: 'Đình chỉ thành viên?',
  restore: 'Khôi phục thành viên?',
  role: 'Đổi vai trò?',
  revoke: 'Thu hồi mọi phiên đăng nhập?',
  delete: 'Xóa thành viên?',
}

const ACTION_DETAIL: Record<MemberAction, string[]> = {
  suspend: [
    'Người này không tạo được phiên mới và không gửi được request dịch vụ.',
    'Dữ liệu của họ được giữ nguyên; đình chỉ không phải là xóa.',
    'Request đã gửi tới nhà cung cấp trước lúc thu hồi vẫn có thể hoàn tất và tính phí.',
  ],
  restore: ['Người này đăng nhập lại được và dùng lại không gian cá nhân của mình.'],
  role: [
    'Đổi vai trò cần một lần xác thực lại; quyền nhạy cảm chỉ mở trong thời gian ngắn.',
    'Không hạ quyền hoặc đình chỉ chủ nhóm đang hoạt động cuối cùng.',
  ],
  revoke: [
    'Mọi phiên đang mở của người này kết thúc; lần dùng sau phải đăng nhập lại.',
    'Dữ liệu và cài đặt không bị thay đổi.',
  ],
  delete: [
    'Ngừng nhận job mới, thu hồi thông tin kết nối và phiên của người này.',
    'Xóa dữ liệu cá nhân khỏi kho hoạt động; job đã chạy chỉ giữ metadata kế toán tối thiểu.',
    'Bản đã tải về máy của họ không thu hồi được từ xa.',
  ],
}

function actionValues(action: MemberAction, user: UserView & { active: boolean }) {
  switch (action) {
    case 'suspend':
      return { active: false, confirmed: true } as const
    case 'restore':
      return { active: true, confirmed: true } as const
    case 'role':
      return { role: user.role === 'owner' ? ('member' as const) : ('owner' as const), confirmed: true }
    case 'revoke':
      return { revokeSessions: true, confirmed: true } as const
    case 'delete':
      return { delete: true, confirmed: true } as const
  }
}

export function MembersDialog({ onClose }: { onClose: () => void }) {
  const bridge = useBridge()
  const actions = useUiActions()
  const memberAdmin = useCapability(CAP.memberAdmin)
  const [users, setUsers] = useState<(UserView & { active: boolean })[]>([])
  const [error, setError] = useState<string | null>(null)
  const [issuer, setIssuer] = useState('')
  const [subject, setSubject] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [reauthNeeded, setReauthNeeded] = useState<string | null>(null)
  /** Why a confirmed action was not sent because its row had moved on. */
  const [rowMoved, setRowMoved] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void bridge
      .listUsers()
      .then((list) => {
        if (!cancelled) {
          setUsers(list)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không đọc được danh sách.')
      })
    return () => {
      cancelled = true
    }
  }, [bridge, reload])

  const invite = useAsyncAction(async () => {
    const sentSubject = subject
    const result = await bridge.inviteUser({ issuer: issuer.trim(), subject: subject.trim() })
    if (result.ok) {
      setInviteUrl(result.inviteUrl ?? null)
      // Clear the field only if it still holds what was invited. The subject box
      // stays editable while the call is out, and wiping the next identity the
      // owner has started typing is a silent loss of their work.
      setSubject((current) => (current === sentSubject ? '' : current))
      setReload((value) => value + 1)
    }
    return result
  }, { success: 'Đã tạo lời mời. Chuyển liên kết cho đúng người.' })

  /**
   * The row the confirmation card was opened against, re-read from the list as
   * it is now. `actionValues` derives the role toggle from the captured copy, so
   * a list that was reloaded under an open card (an invite finishing, for
   * instance) could otherwise send the opposite of what the screen says.
   */
  const currentRowFor = (target: PendingAction) =>
    users.find((item) => item.id === target.user.id) ?? null

  const update = useAsyncAction(
    async (target: PendingAction) => {
      const current = currentRowFor(target)
      if (!current) {
        setPending(null)
        setRowMoved('Người này không còn trong danh sách vừa đọc, nên thao tác không được gửi.')
        return
      }
      if (current.role !== target.user.role || current.active !== target.user.active) {
        // The card describes a state that has moved. Nothing is sent and
        // nothing is guessed: the owner reopens the action on the row as it is.
        setPending(null)
        setRowMoved(
          `Trạng thái của ${current.name} đã đổi từ lúc bạn mở hộp xác nhận, nên thao tác không ` +
            'được gửi. Mở lại thao tác trên dòng hiện tại.',
        )
        return
      }
      setRowMoved(null)
      const result = await bridge.updateUser(current.id, actionValues(target.action, current))
      if (result.ok) {
        setReload((value) => value + 1)
        setReauthNeeded(null)
      } else if (isReauthRequired(result.diagnostic)) {
        // Kept as its own visible state: the refusal is not a generic failure
        // and the operation is never retried on the user's behalf.
        setReauthNeeded(result.diagnostic.message)
      }
      setPending(null)
      return result
    },
    { success: 'Đã cập nhật thành viên.' },
  )

  return (
    <Dialog
      title="Quản lý thành viên"
      wide
      onClose={onClose}
      description="Chủ nhóm quản lý vòng đời thành viên. Đình chỉ là cách thu hồi truy cập, không tự xóa dữ liệu của người đó."
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {memberAdmin.available ? null : <span className="reason">{memberAdmin.reason}</span>}
      {error ? <div className="diag diag--error fc-border"><div className="diag__msg">{error}</div></div> : null}
      {reauthNeeded ? (
        <div className="diag diag--warning fc-border">
          <div className="diag__head">
            <span className="diag__sev">Cần xác thực lại</span>
            <code className="diag__code">REAUTH_REQUIRED</code>
          </div>
          <div className="diag__msg">{reauthNeeded}</div>
          <div className="row">
            {/* Opens the one sign-in surface. The shared refusal handling may
                already have opened it for this same diagnostic; the dialog
                stack keeps a single instance rather than stacking two
                identical ones behind each other. */}
            <Button
              icon="shield"
              onClick={() => actions.openDialog({ kind: 'sign-in', mode: 'reauth' })}
            >
              Xác thực lại
            </Button>
            <span className="muted-3">Thao tác vừa rồi không tự chạy lại sau khi bạn quay về.</span>
          </div>
        </div>
      ) : null}

      {rowMoved ? (
        <div className="diag diag--warning fc-border" role="status" data-member-row-moved>
          <div className="diag__msg">{rowMoved}</div>
          <div className="diag__detail">
            Không có lệnh nào được gửi. Giao diện không đoán thao tác mới từ một dòng đã đổi.
          </div>
        </div>
      ) : null}

      {pending ? (
        <div className="card fc-border" role="alertdialog" aria-label={ACTION_TITLE[pending.action]}>
          <strong>{ACTION_TITLE[pending.action]}</strong>
          <div className="muted-3" style={{ overflowWrap: 'anywhere' }}>
            {pending.user.name} · {pending.user.issuer ?? 'issuer chưa công bố'} /{' '}
            {pending.user.subject ?? 'subject chưa công bố'}
          </div>
          <ul style={{ margin: 0, paddingInlineStart: 18 }} className="muted">
            {ACTION_DETAIL[pending.action].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="row row--end">
            {/* Once the command is out, "leave it alone" cannot take it back —
                there is no cancel for a member update in the contract — so the
                control says why instead of quietly closing a card over an
                action that is still going through. */}
            <Button
              disabledReason={
                update.pending
                  ? 'Lệnh đã gửi tới máy chủ và không rút lại được; chờ máy chủ trả lời.'
                  : null
              }
              onClick={() => setPending(null)}
            >
              Để nguyên
            </Button>
            <Button
              variant="danger"
              icon="check"
              disabled={update.pending}
              onClick={() => void update.run(pending)}
            >
              {update.pending ? 'Đang gửi…' : 'Xác nhận'}
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="list-reset stack">
        {users.map((user) => {
          const buttons: { id: MemberAction; label: string; icon: 'lock' | 'check' | 'shield' | 'trash' }[] = [
            user.active
              ? { id: 'suspend', label: 'Đình chỉ', icon: 'lock' }
              : { id: 'restore', label: 'Khôi phục', icon: 'check' },
            {
              id: 'role',
              label: user.role === 'owner' ? 'Hạ về thành viên' : 'Nâng lên chủ nhóm',
              icon: 'shield',
            },
            { id: 'revoke', label: 'Thu hồi phiên', icon: 'lock' },
            { id: 'delete', label: 'Xóa', icon: 'trash' },
          ]
          return (
            <li key={user.id} className="card fc-border" style={{ padding: 10 }}>
              <div className="row">
                <strong className="grow" style={{ overflowWrap: 'anywhere' }}>
                  {user.name}
                </strong>
                <span className={`chip ${user.active ? 'chip--ok' : 'chip--warn'} fc-border`}>
                  {user.active ? 'đang hoạt động' : 'đã đình chỉ'}
                </span>
                <span className="chip chip--muted fc-border">
                  {user.role === 'owner' ? 'chủ nhóm' : 'thành viên'}
                </span>
              </div>
              {/* Identity is (issuer, subject); the email is display only and is
                  never used as the key (ACC-01). */}
              <div className="muted-3" style={{ overflowWrap: 'anywhere' }}>
                issuer <code className="diag__code">{user.issuer ?? '—'}</code> · subject{' '}
                <code className="diag__code">{user.subject ?? '—'}</code>
              </div>
              <div className="muted-3" style={{ overflowWrap: 'anywhere' }}>
                ID nội bộ {user.id}
                {user.email ? ` · hiển thị: ${user.email}` : ''}
              </div>
              <div className="row">
                {buttons.map((button) => (
                  <Button
                    key={button.id}
                    size="small"
                    icon={button.icon}
                    variant={button.id === 'delete' ? 'danger' : 'default'}
                    disabled={update.pending}
                    disabledReason={memberAdmin.available ? null : memberAdmin.reason}
                    onClick={() => setPending({ user, action: button.id })}
                  >
                    {button.label}
                  </Button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      <form
        className="card fc-border"
        onSubmit={(event) => {
          event.preventDefault()
          void invite.run()
        }}
      >
        <strong>Mời thành viên</strong>
        <p className="muted" style={{ margin: 0 }}>
          Lời mời gắn chính xác <code>issuer</code> và <code>subject</code> của OIDC client. Email
          không phải khóa định danh và không được dùng ở đây.
        </p>
        <TextField
          label="Issuer của nhà cung cấp định danh"
          value={issuer}
          onChange={setIssuer}
          placeholder="https://id.example.invalid"
          hint="Đúng giá trị issuer mà client OIDC của nhóm đang dùng."
        />
        <TextField
          label="Subject của người được mời"
          value={subject}
          onChange={setSubject}
          hint="Định danh bền do nhà cung cấp cấp cho người đó."
        />
        <Button
          type="submit"
          variant="primary"
          icon="plus"
          disabled={invite.pending}
          disabledReason={
            memberAdmin.available
              ? issuer.trim() === '' || subject.trim() === ''
                ? 'Nhập cả issuer và subject trước khi mời.'
                : null
              : memberAdmin.reason
          }
        >
          Tạo lời mời
        </Button>
        <p className="muted-3" style={{ margin: 0 }}>
          Lời mời tạo một thành viên; đổi vai trò là thao tác riêng có xác nhận và xác thực lại.
          Liên kết hết hạn sau 7 ngày, dùng một lần và không tự tạo phiên đăng nhập.
        </p>
        {inviteUrl ? (
          <div className="stack">
            <span className="muted">Liên kết mời (chuyển tay cho đúng người, dùng một lần):</span>
            <pre className="code-block">{inviteUrl}</pre>
            <span className="muted-3">
              Liên kết chỉ hiện một lần ở đây. Ứng dụng không tự gửi email và không ghi liên kết vào
              nhật ký.
            </span>
          </div>
        ) : null}
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------- policy */

type PolicyDocument = { [key: string]: Json }

function isStringArray(value: Json): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

/** One line of the change list shown before anything is sent. */
function policyDiff(base: PolicyDocument, next: PolicyDocument): string[] {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(next)])].sort()
  const lines: string[] = []
  for (const key of keys) {
    const before = JSON.stringify(base[key] ?? null)
    const after = JSON.stringify(next[key] ?? null)
    if (before === after) continue
    if (!(key in base)) lines.push(`${key}: thêm mới → ${after}`)
    else if (!(key in next)) lines.push(`${key}: ${before} → bị bỏ khỏi tài liệu`)
    else lines.push(`${key}: ${before} → ${after}`)
  }
  return lines
}

/**
 * System policy (ACC-02, UI-C10).
 *
 * Contract 0.3 publishes the whole policy document with a version, and takes a
 * dedicated `policy.update`. Three rules drive this screen:
 *
 * 1. The interface does not know the policy schema, so it only offers editors
 *    for the shapes the core actually published. A key it cannot edit is shown
 *    and carried through untouched, never dropped.
 * 2. Nothing is sent without a change list and an explicit confirmation.
 * 3. A version that moved on while the form was open blocks the send. The
 *    newer document is never silently overwritten with a stale one.
 */
export function PolicyDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const run = useRunCommand()
  const systemPolicy = useCapability(CAP.systemPolicy)
  const policy = snapshot.policy

  const [base, setBase] = useState<{ version: number; document: PolicyDocument } | null>(null)
  const [draft, setDraft] = useState<PolicyDocument | null>(null)
  const [confirming, setConfirming] = useState(false)
  /** Set when a successful save left edits behind that it did not include. */
  const [unsentAfterSave, setUnsentAfterSave] = useState(false)

  const stale = policy !== null && base !== null && policy.version !== base.version
  const changes = base && draft ? policyDiff(base.document, draft) : []
  const changeCount = changes.length

  /**
   * When the base may be replaced by what the core published.
   *
   * Never while the owner is holding unsent edits — that is the rule this
   * screen exists for, and it applies to their own successful save exactly as
   * it applies to somebody else's. With nothing unsent there is nothing to
   * protect, so a new published version is simply adopted; the conflict panel
   * is for work that would otherwise be lost, not for every version bump.
   *
   * Written as a condition on the *state*, not as a step in the save. The
   * contract gives no ordering between `dispatch` resolving and the new
   * snapshot being published, so a save that clears a flag and hopes the
   * snapshot has already moved can rebase onto the old version and then accuse
   * the owner of a conflict with themselves.
   */
  useEffect(() => {
    if (!policy) return
    if (base === null) {
      setBase({ version: policy.version, document: { ...policy.document } })
      setDraft({ ...policy.document })
      return
    }
    if (policy.version === base.version) return
    if (changeCount > 0) return
    setBase({ version: policy.version, document: { ...policy.document } })
    setDraft({ ...policy.document })
    setConfirming(false)
    setUnsentAfterSave(false)
  }, [base, changeCount, policy])

  /** The draft as it is *now*, readable from inside an answer that just landed. */
  const draftRef = useRef(draft)
  draftRef.current = draft

  const send = useAsyncAction(async (version: number, document: PolicyDocument) => {
    const sent = JSON.stringify(document)
    const result = await run(
      { type: 'policy.update', version, document, confirmed: true },
      { success: 'Đã gửi bản chính sách mới.' },
    )
    if (!result.ok) return
    setConfirming(false)
    const now = draftRef.current
    // Edits made while the save was in flight were not part of it. They are the
    // owner's work and are kept; the base stays where it was, so the version
    // panel below states the conflict and the owner decides what to do with it.
    setUnsentAfterSave(now !== null && JSON.stringify(now) !== sent)
  })

  const reload = () => {
    if (!policy) return
    setBase({ version: policy.version, document: { ...policy.document } })
    setDraft({ ...policy.document })
    setConfirming(false)
    setUnsentAfterSave(false)
  }

  const patch = (key: string, value: Json) => {
    setDraft((current) => (current === null ? current : { ...current, [key]: value }))
    setConfirming(false)
  }

  const blocked = systemPolicy.available
    ? stale
      ? 'Bản chính sách trên máy chủ đã đổi. Nạp lại bản mới trước khi sửa tiếp.'
      : null
    : systemPolicy.reason

  return (
    <Dialog
      title="Chính sách hệ thống"
      wide
      onClose={onClose}
      description="Chính sách đặt miền cho phép và trần hạ tầng. Nó không ghi đè âm thầm giá trị cá nhân của thành viên."
      footer={
        <>
          <Button onClick={onClose}>Đóng</Button>
          <Button
            icon="refresh"
            disabledReason={policy ? null : 'Chưa có bản chính sách nào để nạp lại.'}
            onClick={reload}
          >
            Nạp lại bản của nhân
          </Button>
          <Button
            variant="primary"
            icon="save"
            disabled={send.pending}
            disabledReason={
              blocked ??
              (changes.length === 0
                ? 'Chưa có thay đổi nào so với bản nhân đang công bố.'
                : confirming
                  ? null
                  : 'Xem danh sách thay đổi rồi bấm “Tôi đã xem thay đổi”.')
            }
            onClick={() => {
              if (!base || !draft) return
              void send.run(base.version, draft)
            }}
          >
            Gửi bản chính sách
          </Button>
        </>
      }
    >
      {systemPolicy.available ? null : <span className="reason">{systemPolicy.reason}</span>}

      {policy === null ? (
        <div className="diag diag--warning fc-border">
          <div className="diag__msg">
            Nhân chưa công bố chính sách hệ thống trong snapshot hiện tại.
          </div>
          <div className="diag__detail">
            Màn này chỉ sửa được tài liệu mà nhân đã công bố; giao diện không tự dựng ra một tài liệu
            chính sách rỗng để gửi đi.
          </div>
        </div>
      ) : null}

      {policy !== null && base !== null ? (
        <div className="row">
          <span className="chip chip--muted fc-border">Bản đang sửa: {base.version}</span>
          <span className={`chip ${stale ? 'chip--warn' : 'chip--muted'} fc-border`}>
            Bản của nhân: {policy.version}
          </span>
          <span className="chip chip--muted fc-border">
            {Object.keys(base.document).length} khóa trong tài liệu
          </span>
        </div>
      ) : null}

      {stale ? (
        <div className="diag diag--warning fc-border" data-policy-stale={unsentAfterSave ? 'own-save' : 'other'}>
          <div className="diag__head">
            <span className="diag__sev">Bản chính sách đã đổi</span>
            <code className="diag__code">POLICY_VERSION_STALE</code>
          </div>
          <div className="diag__msg">
            {unsentAfterSave
              ? `Bản ${base?.version} bạn gửi đã được lưu, và nhân đang công bố bản ${policy?.version}. ` +
                'Những thay đổi bạn sửa thêm trong lúc đang gửi không nằm trong lượt đó.'
              : `Người khác đã lưu bản ${policy?.version} trong lúc bạn đang sửa bản ${base?.version}.`}
          </div>
          <div className="diag__detail">
            {unsentAfterSave
              ? 'Giao diện giữ nguyên các sửa đổi thêm đó ở trên thay vì bỏ đi trong im lặng, và ' +
                'cũng không gửi chúng đè lên bản mới. Nạp lại bản của nhân rồi sửa lại phần còn ' +
                'thiếu trên nền mới.'
              : 'Giao diện không gửi bản cũ đè lên bản mới. Nạp lại bản của nhân; các sửa đổi chưa ' +
                'gửi ở trên sẽ bị bỏ và bạn sửa lại trên nền mới.'}
          </div>
        </div>
      ) : null}

      {draft !== null ? (
        <section className="stack">
          <h3 style={{ margin: 0 }}>Tài liệu chính sách</h3>
          <p className="muted" style={{ margin: 0 }}>
            Giao diện không tự đặt ra khóa nào. Mỗi khóa dưới đây đến từ tài liệu nhân công bố; khóa
            có kiểu mà bản dựng này chưa có ô sửa vẫn được giữ nguyên và gửi lại y hệt.
          </p>
          {Object.keys(draft).length === 0 ? (
            <p className="muted">Tài liệu chính sách hiện đang rỗng.</p>
          ) : null}
          {Object.entries(draft).map(([key, value]) => (
            <PolicyField
              key={key}
              name={key}
              value={value}
              disabledReason={blocked}
              onChange={(next) => patch(key, next)}
            />
          ))}
        </section>
      ) : null}

      <section className="stack">
        <h3 style={{ margin: 0 }}>Thay đổi sẽ gửi ({changes.length})</h3>
        {changes.length === 0 ? (
          <p className="muted">Chưa có thay đổi nào so với bản nhân đang công bố.</p>
        ) : (
          <>
            <ul style={{ margin: 0, paddingInlineStart: 18 }} className="muted">
              {changes.map((line) => (
                <li key={line} style={{ overflowWrap: 'anywhere' }}>
                  {line}
                </li>
              ))}
            </ul>
            <CheckField
              inputId="w3a-policy-confirm"
              label="Tôi đã xem danh sách thay đổi ở trên"
              checked={confirming}
              disabledReason={blocked}
              hint="Lệnh gửi kèm số bản đang sửa; máy chủ từ chối nếu bản đó không còn là bản mới nhất."
              onChange={setConfirming}
            />
          </>
        )}
      </section>

      <p className="muted-3" style={{ margin: 0 }}>
        Khi chính sách mới làm một giá trị cũ nằm ngoài miền, giá trị đó được giữ nguyên và gắn
        nhãn <code>policy-blocked</code>; nhân chặn tính năng phụ thuộc thay vì tự sửa dự án.
      </p>
      <p className="muted-3" style={{ margin: 0 }}>
        Chính sách đi bằng lệnh <code>policy.update</code> riêng, có số bản và xác nhận. Không có
        khóa <code>policy.*</code> nào được luồn qua kênh cài đặt cá nhân.
      </p>
    </Dialog>
  )
}

/**
 * One policy key. The editor is chosen from the *published* value's shape, so
 * the interface never asserts a schema the core did not publish.
 */
function PolicyField({
  name,
  value,
  disabledReason,
  onChange,
}: {
  name: string
  value: Json
  disabledReason: string | null
  onChange: (value: Json) => void
}) {
  if (typeof value === 'boolean') {
    return (
      <CheckField
        label={name}
        checked={value}
        disabledReason={disabledReason}
        hint="Kiểu boolean do nhân công bố."
        onChange={onChange}
      />
    )
  }
  if (typeof value === 'number') {
    return (
      <NumberField
        label={name}
        value={String(value)}
        slider={false}
        disabledReason={disabledReason}
        hint="Kiểu số do nhân công bố. Nhân vẫn là bên kiểm miền giá trị."
        onCommit={(raw) => {
          const parsed = Number(raw.replace(',', '.').trim())
          if (!Number.isFinite(parsed)) {
            return { ok: false, message: `"${raw}" không phải số hợp lệ.` }
          }
          onChange(parsed)
          return { ok: true }
        }}
      />
    )
  }
  if (typeof value === 'string') {
    return (
      <TextField
        label={name}
        value={value}
        disabledReason={disabledReason}
        hint="Kiểu chuỗi do nhân công bố."
        onChange={(next) => onChange(next)}
      />
    )
  }
  if (isStringArray(value)) {
    return (
      <TextField
        label={name}
        multiline
        rows={3}
        value={value.join('\n')}
        disabledReason={disabledReason}
        hint="Danh sách chuỗi do nhân công bố, mỗi dòng một mục. Dòng trống bị bỏ qua."
        onChange={(next) =>
          onChange(
            next
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line !== ''),
          )
        }
      />
    )
  }
  return (
    <div className="field">
      <span className="field__label">{name}</span>
      <pre className="code-block">{JSON.stringify(value, null, 2)}</pre>
      <span className="reason">
        Bản dựng này chưa có ô sửa cho kiểu dữ liệu này. Giá trị được giữ nguyên và gửi lại y hệt khi
        bạn lưu các thay đổi khác.
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------- about */

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const user = snapshot.session.user
  return (
    <Dialog
      title="Giới thiệu và bản dựng"
      wide
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <ul className="list-reset stack">
        <li className="row">
          <span className="grow muted">Phiên bản ứng dụng</span>
          <code className="diag__code">{snapshot.version}</code>
        </li>
        <li className="row">
          <span className="grow muted">Phiên bản hợp đồng</span>
          <code className="diag__code">{snapshot.contractVersion}</code>
        </li>
        <li className="row">
          <span className="grow muted">Môi trường</span>
          <code className="diag__code">{snapshot.environment}</code>
        </li>
      </ul>

      {user ? (
        <section className="stack">
          <h3 style={{ margin: 0 }}>Định danh của phiên này</h3>
          <ul className="list-reset stack">
            <li className="row">
              <span className="grow muted">issuer</span>
              <code className="diag__code" style={{ overflowWrap: 'anywhere' }}>
                {user.issuer ?? 'chưa công bố'}
              </code>
            </li>
            <li className="row">
              <span className="grow muted">subject</span>
              <code className="diag__code" style={{ overflowWrap: 'anywhere' }}>
                {user.subject ?? 'chưa công bố'}
              </code>
            </li>
            <li className="row">
              <span className="grow muted">ID nội bộ</span>
              <code className="diag__code">{user.id}</code>
            </li>
          </ul>
          <p className="muted-3" style={{ margin: 0 }}>
            Khóa dữ liệu là ID nội bộ gắn với cặp issuer/subject. Email và tên hiển thị chỉ để nhận
            ra nhau, không phải định danh.
          </p>
        </section>
      ) : null}

      <section className="stack">
        <h3 style={{ margin: 0 }}>Năng lực nhân công bố</h3>
        {snapshot.capabilities.length === 0 ? (
          <p className="muted">Nhân chưa công bố năng lực nào.</p>
        ) : (
          <ul className="list-reset stack">
            {snapshot.capabilities.map((capability) => (
              <li key={capability.id} className="row">
                <code className="diag__code grow">{capability.id}</code>
                <span className={`chip ${capability.available ? 'chip--ok' : 'chip--muted'} fc-border`}>
                  {capability.available ? 'có' : 'chưa có'}
                </span>
                {capability.reason ? <span className="reason">{capability.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h3 style={{ margin: 0 }}>Ghi công</h3>
        <p className="muted" style={{ margin: 0 }}>
          Biểu tượng giao diện được vẽ trong dự án này. Font và artwork emoji dùng để dựng mô hình
          đến từ danh mục tài nguyên của dự án, có giấy phép và bản ghi riêng; chúng không được
          thay bằng font hệ thống hay hình minh họa của giao diện.
        </p>
      </section>
    </Dialog>
  )
}
