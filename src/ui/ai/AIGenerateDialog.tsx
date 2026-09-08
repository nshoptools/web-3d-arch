import { useEffect, useMemo, useRef, useState } from 'react'
import type { AIJobView, AIProviderView, AIQuoteView } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useRunCommand, useSetting, useSnapshot } from '../core/bridge.tsx'
import { accountIdentity, fileKey, requestKey } from '../core/identity.ts'
import { useDroppedAnswerLog, useRequestOwner } from '../core/request-owner.ts'
import { SETTING } from '../core/registry.ts'
import { useProjectGate } from '../core/project-gate.ts'
import { Button } from '../components/Button.tsx'
import { Dialog } from '../components/Dialog.tsx'
import { CheckField, SelectField, TextField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { chooseFile } from '../core/file-dialog.ts'
import { formatDateTime } from '../core/text.ts'

const PROMPT_LIMIT = 4000
const ACCEPT_REFERENCE = 'image/png,image/jpeg,image/webp'

function newOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `op-${String(performance.now()).replace('.', '')}`
}

function savedPrompts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * AI image generation (SRC-03, AI-01 to AI-04, UI-C08).
 *
 * Two deliberate steps. `prepareImage` is not billable: it validates, reserves
 * nothing and returns a quote. Only after that quote has been shown in full —
 * recipient, credential, the data that leaves the machine, the ceiling and what
 * is still unknown — and the user has ticked consent does `submitImage` run.
 * The jobId and quoteHash of that quote are what get submitted, so a double
 * click, a retry or a lost response never becomes a second charged turn.
 */
export function AIGenerateDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const gate = useProjectGate()
  const bridge = useBridge()
  const run = useRunCommand()
  const providers = snapshot.aiProviders
  const promptsSetting = useSetting(SETTING.savedPrompts)

  const [providerId, setProviderId] = useState(
    providers.find((item) => item.connected)?.id ?? providers[0]?.id ?? '',
  )
  const provider = providers.find((item) => item.id === providerId)
  const [modelId, setModelId] = useState(provider?.models[0]?.id ?? '')
  const [prompt, setPrompt] = useState('')
  // No hidden default: an empty string means "chưa chọn", and prepare stays
  // blocked until the user picks one of the values the model published.
  const [quality, setQuality] = useState('')
  const [size, setSize] = useState('')
  const [reference, setReference] = useState<File | null>(null)
  /**
   * The quote *and the request it was prepared for*.
   *
   * Storing them apart was the whole defect: a quote is an offer for one exact
   * payload, and once it is separated from that payload nothing on screen can
   * tell whether the money ceiling being consented to belongs to the prompt in
   * the box. They are one value here, and consent is gated on the pair.
   */
  const [quote, setQuote] = useState<{ view: AIQuoteView; request: string } | null>(null)
  const [consent, setConsent] = useState(false)
  /**
   * Every job this dialog has actually submitted. A set, not one slot: the slot
   * could be cleared by a later prepare (the operationId is stable, so a repeat
   * prepare returns the *same* jobId) and the guard against paying twice for one
   * job would go with it. Nothing removes an id from here.
   */
  const [submittedJobIds, setSubmittedJobIds] = useState<readonly string[]>([])
  /** A prepare whose answer arrived about a request that is no longer on screen. */
  const [droppedQuote, setDroppedQuote] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [openTray, setOpenTray] = useState(true)
  const [armedArtifact, setArmedArtifact] = useState<string | null>(null)
  // One operationId per intent. A double click, a reload or a retry of the same
  // intent reuses it, so the backend can return the same job (AI-03).
  const operationId = useRef(newOperationId())

  const model = provider?.models.find((item) => item.id === modelId) ?? provider?.models[0]
  const overLimit = prompt.length > PROMPT_LIMIT
  /** The reference is only part of the request when the model would receive it. */
  const referenceSent = reference && model?.supportsReference ? reference : null

  /**
   * What would be sent, in one string. Everything the request carries is in it,
   * including the intent id, so "Tạo lượt mới" is as much a different request as
   * a different prompt.
   */
  const currentRequest = requestKey([
    provider?.id,
    model?.id,
    prompt,
    model && model.qualities.length > 0 ? quality : '',
    model && model.sizes.length > 0 ? size : '',
    fileKey(referenceSent),
    operationId.current,
  ])
  const requestRef = useRef(currentRequest)
  requestRef.current = currentRequest

  // The account is the identity that decides whether an answer may be shown at
  // all; the request key decides whether it is about what is on screen.
  const owner = useRequestOwner(currentRequest, accountIdentity)
  const logDropped = useDroppedAnswerLog()

  /** Any edit to what would be sent invalidates the quote (UI-C08). */
  const invalidateQuote = () => {
    owner.release()
    setQuote(null)
    setConsent(false)
    setDroppedQuote(null)
  }

  // Keeps the countdown honest without polling: one timer, armed at expiry.
  useEffect(() => {
    if (!quote) return
    const delay = quote.view.expiresAt - Date.now()
    if (delay <= 0) {
      setNow(Date.now())
      return
    }
    const timer = setTimeout(() => setNow(Date.now()), delay + 250)
    return () => clearTimeout(timer)
  }, [quote])

  const quoteExpired = quote !== null && quote.view.expiresAt <= now
  /**
   * The quote on screen was prepared for a different payload. Belt and braces
   * next to `invalidateQuote`: that clears the quote on every edit path known
   * today, and this refuses to spend one whatever path was missed.
   */
  const quoteMismatch = quote !== null && quote.request !== currentRequest

  const pickReference = useAsyncAction(async () => {
    const file = await chooseFile(ACCEPT_REFERENCE)
    if (file) {
      setReference(file)
      invalidateQuote()
    }
  })

  const prepare = useAsyncAction(async () => {
    if (!provider || !model) return
    setDroppedQuote(null)
    const ticket = owner.begin()
    let result: Awaited<ReturnType<typeof bridge.prepareImage>>
    try { result = await bridge.prepareImage({
      providerId: provider.id,
      modelId: model.id,
      prompt,
      ...(referenceSent ? { reference: referenceSent } : {}),
      // Only sent when the model actually published the choice.
      ...(model.qualities.length > 0 && quality !== '' ? { quality } : {}),
      ...(model.sizes.length > 0 && size !== '' ? { size } : {}),
      operationId: operationId.current,
    }) } catch (cause) {
      const claim = owner.claim(ticket, requestRef.current)
      if (claim !== 'owner') { logDropped(claim, 'báo giá AI'); return }
      throw cause
    }
    const claim = owner.claim(ticket, requestRef.current)
    if (claim !== 'owner') {
      // The offer is for a payload that is no longer on screen, so it is not
      // shown and cannot be consented to. What is *not* said: that anything was
      // cancelled. Prepare is non-billable by contract — it reserves nothing and
      // sends nothing to the provider — so the honest statement is that a quote
      // exists for the earlier request and was not used.
      logDropped(claim, 'báo giá AI')
      if (claim === 'superseded') {
        setDroppedQuote(
          'Báo giá cho yêu cầu trước đó đã về sau khi yêu cầu trên màn hình đã đổi, nên nó không ' +
            'được áp cho yêu cầu đang hiển thị. Bước lấy báo giá không tính phí và không gửi nội ' +
            'dung tới nhà cung cấp; lượt cũ vẫn nằm ở nhân đúng như nhân ghi nhận. Bấm “Lấy báo ' +
            'giá” lại cho yêu cầu hiện tại.',
        )
      }
      return
    }
    if (result.ok && result.quote) {
      setQuote({ view: result.quote, request: ticket.key })
      setConsent(false)
      setNow(Date.now())
    } else if (result.ok) {
      // A prepare that succeeds without a quote cannot be consented to; say so
      // instead of letting an empty panel imply a free turn.
      setQuote(null)
    }
    return result
  }, { success: 'Đã lấy báo giá. Bước này không tính phí và chưa gửi nội dung đi.' })

  const submit = useAsyncAction(async (target: { view: AIQuoteView; request: string }) => {
    // Last gate before money: the offer must still be an offer for the request
    // the person is looking at. Checked here as well as in `submitBlocked`,
    // because a click reads the values of the render it was drawn in.
    if (target.request !== requestRef.current) return
    const result = await bridge.submitImage({
      jobId: target.view.jobId,
      quoteHash: target.view.quoteHash,
      consent: true,
    })
    // On success the turn is spent; on failure the same jobId stays on screen
    // so a retry re-sends that job rather than opening a new one.
    if (result.ok) {
      setSubmittedJobIds((current) =>
        current.includes(target.view.jobId) ? current : [...current, target.view.jobId],
      )
    }
    return result
  }, { success: 'Đã gửi lượt tạo ảnh. Kết quả về khay khi nhà cung cấp trả lời.' })

  const cancelJob = useAsyncAction(async (id: string) => {
    await run({ type: 'ai.cancel', jobId: id }, { announce: 'Đã gửi yêu cầu hủy lượt AI.' })
  })

  const applyArtifact = useAsyncAction(async (artifactId: string) => {
    await run(
      { type: 'ai.apply-result', artifactId, confirmed: true },
      { success: 'Đã gửi lệnh áp ảnh vào dự án.' },
    )
    setArmedArtifact(null)
  })

  const savePrompt = useAsyncAction(async () => {
    const existing = savedPrompts(promptsSetting?.value)
    if (existing.includes(prompt)) return
    await run(
      { type: 'settings.update', values: { [SETTING.savedPrompts]: [...existing, prompt] } },
      { success: 'Đã gửi yêu cầu lưu prompt.' },
    )
  })

  const prepareBlocked = useMemo(() => {
    // The quote is prepared against a project. Finding that out after writing a
    // prompt and picking a reference image is the most expensive way to learn it.
    if (gate.reason) return gate.reason
    if (!provider) return 'Chưa có nhà cung cấp nào được phép trong chính sách hệ thống.'
    if (!provider.connected) return 'Kết nối AI của bạn: chưa có khóa hợp lệ cho nhà cung cấp này.'
    if (!provider.available) return provider.reason ?? 'Nhà cung cấp này đang không dùng được.'
    if (!snapshot.online) return 'Đang ngoại tuyến. Tạo ảnh cần mạng.'
    if (prompt.trim() === '') return 'Nhập mô tả trước khi lấy báo giá.'
    if (overLimit) {
      return `Prompt dài ${prompt.length} ký tự, vượt trần ${PROMPT_LIMIT}. Sửa lại, nội dung không bị cắt ngầm.`
    }
    if (provider.budget === null) return 'Chưa đặt ngân sách hợp lệ nên AI đang tắt.'
    if (model && model.qualities.length > 0 && quality === '') {
      return 'Chọn mức chất lượng model công bố trước khi lấy báo giá; giao diện không chọn thay bạn.'
    }
    if (model && model.sizes.length > 0 && size === '') {
      return 'Chọn kích thước model công bố trước khi lấy báo giá; giao diện không chọn thay bạn.'
    }
    return null
  }, [gate.reason, model, overLimit, prompt, provider, quality, size, snapshot.online])

  const submitBlocked = useMemo(() => {
    if (!quote) return 'Lấy báo giá trước; bước lấy báo giá không tính phí.'
    if (quoteMismatch) {
      return (
        'Báo giá đang hiển thị được lập cho một yêu cầu khác với yêu cầu hiện tại. Lấy báo giá mới ' +
        'cho đúng nội dung, model, chất lượng, kích thước và ảnh tham chiếu đang chọn.'
      )
    }
    if (quoteExpired) return 'Báo giá đã hết hạn. Lấy báo giá mới trước khi gửi.'
    if (submittedJobIds.includes(quote.view.jobId)) {
      return 'Lượt này đã được gửi. Dùng “Tạo lượt mới” nếu bạn thực sự muốn một lượt khác.'
    }
    if (!consent) return 'Đánh dấu đồng ý với báo giá ở trên trước khi gửi.'
    return null
  }, [consent, quote, quoteExpired, quoteMismatch, submittedJobIds])

  const tray = snapshot.aiJobs.filter((job) => job.artifacts.length > 0)
  const activeJobs = snapshot.aiJobs.filter(
    (job) => job.state === 'submitted' || job.state === 'running' || job.state === 'reserved',
  )
  const prompts = savedPrompts(promptsSetting?.value)

  return (
    <Dialog
      title="Tạo ảnh bằng AI"
      wide
      onClose={onClose}
      description="Mở trang này không gửi gì. Lấy báo giá cũng không tính phí và không gửi nội dung đi; chỉ nút Gửi mới thực hiện lượt tính phí."
      footer={
        <>
          <Button onClick={onClose}>Đóng</Button>
          <Button
            icon="coin"
            disabled={prepare.pending}
            disabledReason={prepareBlocked}
            onClick={() => void prepare.run()}
          >
            {prepare.pending ? 'Đang lấy báo giá…' : 'Lấy báo giá'}
          </Button>
          <Button
            variant="primary"
            icon="sparkle"
            disabled={submit.pending}
            disabledReason={submitBlocked}
            onClick={() => {
              if (quote) void submit.run(quote)
            }}
          >
            {submit.pending ? 'Đang gửi…' : 'Gửi lượt đã đồng ý'}
          </Button>
        </>
      }
    >
      <SelectField
        label="Nhà cung cấp"
        value={providerId}
        options={providers.map((item) => ({
          value: item.id,
          label: `${item.label}${item.connected ? '' : ' — chưa kết nối'}`,
        }))}
        onChange={(value) => {
          setProviderId(value)
          const next = providers.find((item) => item.id === value)
          setModelId(next?.models[0]?.id ?? '')
          setQuality('')
          setSize('')
          invalidateQuote()
        }}
      />

      <SelectField
        label="Model"
        value={model?.id ?? ''}
        options={(provider?.models ?? []).map((item) => ({
          value: item.id,
          label: `${item.label}${item.supportsReference ? ' · nhận ảnh tham chiếu' : ''}`,
        }))}
        disabledReason={provider ? null : 'Chọn nhà cung cấp trước.'}
        onChange={(value) => {
          setModelId(value)
          // The published lists differ per model, so an old pick is dropped
          // instead of being carried over as a hidden default.
          setQuality('')
          setSize('')
          invalidateQuote()
        }}
      />

      {/* AI-01: quality and size come from the model registry. They are shown
          before prepare, travel inside the request, and changing one drops the
          quote and the consent with it. */}
      {model && model.qualities.length > 0 ? (
        <SelectField
          label="Mức chất lượng"
          value={quality}
          options={[
            { value: '', label: '— chưa chọn', disabled: true },
            ...model.qualities.map((item) => ({ value: item.id, label: item.label })),
          ]}
          hint="Danh sách do model công bố. Mức chất lượng ảnh hưởng chi phí, nên đổi nó làm báo giá mất hiệu lực."
          onChange={(value) => {
            setQuality(value)
            invalidateQuote()
          }}
        />
      ) : model ? (
        <span className="reason">
          Model này không công bố mức chất lượng nào, nên giao diện không gửi trường chất lượng.
        </span>
      ) : null}

      {model && model.sizes.length > 0 ? (
        <SelectField
          label="Kích thước ảnh"
          value={size}
          options={[
            { value: '', label: '— chưa chọn', disabled: true },
            ...model.sizes.map((item) => ({ value: item.id, label: item.label })),
          ]}
          hint="Danh sách do model công bố. Kích thước ảnh hưởng chi phí, nên đổi nó làm báo giá mất hiệu lực."
          onChange={(value) => {
            setSize(value)
            invalidateQuote()
          }}
        />
      ) : model ? (
        <span className="reason">
          Model này không công bố kích thước nào, nên giao diện không gửi trường kích thước.
        </span>
      ) : null}

      <TextField
        label="Mô tả (prompt)"
        multiline
        rows={4}
        value={prompt}
        onChange={(value) => {
          setPrompt(value)
          invalidateQuote()
        }}
        hint={`${prompt.length}/${PROMPT_LIMIT} ký tự`}
        error={overLimit ? `Vượt trần ${PROMPT_LIMIT} ký tự. Nội dung của bạn được giữ nguyên để sửa.` : null}
      />

      {prompts.length > 0 ? (
        <SelectField
          label="Prompt đã lưu"
          value=""
          options={[
            { value: '', label: `${prompts.length} prompt đã lưu — chọn để dùng lại` },
            ...prompts.map((entry, index) => ({
              value: String(index),
              label: entry.length > 70 ? `${entry.slice(0, 70)}…` : entry,
            })),
          ]}
          hint="Danh sách này đến từ cài đặt cá nhân trong snapshot, không phải bộ nhớ của biểu mẫu."
          onChange={(value) => {
            const entry = prompts[Number(value)]
            if (entry !== undefined) {
              setPrompt(entry)
              invalidateQuote()
            }
          }}
        />
      ) : null}

      <div className="row">
        <Button
          icon="image"
          disabled={pickReference.pending}
          disabledReason={
            model?.supportsReference
              ? null
              : 'Model đang chọn chưa công bố khả năng nhận ảnh tham chiếu.'
          }
          onClick={() => void pickReference.run()}
        >
          Chọn ảnh tham chiếu
        </Button>
        {reference ? (
          <span className="chip chip--muted fc-border">
            {reference.name}
            <button
              type="button"
              className="chip__x"
              aria-label="Bỏ ảnh tham chiếu"
              onClick={() => {
                setReference(null)
                invalidateQuote()
              }}
            >
              ×
            </button>
          </span>
        ) : (
          <span className="muted-3">Chưa chọn ảnh tham chiếu.</span>
        )}
      </div>

      {/* A prepare that answered about a request the screen has left. It is
          reported as what it is — a quote that was not used — and never as a
          cancellation: nothing was charged and nothing was sent to the
          provider, but the interface does not claim the core has no record. */}
      {droppedQuote ? (
        <div className="diag diag--warning fc-border" role="status" data-ai-quote-dropped>
          <div className="diag__head">
            <span className="diag__sev">Báo giá cũ đã bị bỏ qua</span>
            <code className="diag__code">ANSWER_SUPERSEDED</code>
          </div>
          <div className="diag__msg">{droppedQuote}</div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ quote */}
      {quote ? (
        <div
          className="card fc-border"
          data-ai-quote={quoteMismatch ? 'mismatch' : quoteExpired ? 'expired' : 'live'}
          style={{ borderColor: quoteExpired || quoteMismatch ? 'var(--warn)' : undefined }}
        >
          <div className="row">
            <strong className="grow">Báo giá cho lượt này</strong>
            <span
              className={`chip ${quoteExpired || quoteMismatch ? 'chip--warn' : 'chip--ok'} fc-border`}
            >
              {quoteMismatch ? 'không khớp yêu cầu' : quoteExpired ? 'đã hết hạn' : 'còn hiệu lực'}
            </span>
          </div>

          {quoteMismatch ? (
            <p className="muted" style={{ margin: 0, color: 'var(--warn)' }}>
              Báo giá này được lập cho một yêu cầu khác với yêu cầu đang hiển thị bên trên. Nó không
              gửi được, và trần chi phí của nó không nói gì về nội dung hiện tại.
            </p>
          ) : null}

          {/* What is being consented to, not only how much it costs. Without
              this the money ceiling is the only thing on screen and there is no
              way to see that the offer belongs to the prompt in the box. */}
          <AIRequestSummary
            model={model ?? null}
            quality={quality}
            size={size}
            prompt={prompt}
            reference={referenceSent}
          />

          <ul className="list-reset stack">
            <li className="row">
              <span className="grow muted">Nơi nhận</span>
              <span style={{ overflowWrap: 'anywhere' }}>{quote.view.recipient}</span>
            </li>
            <li className="row">
              <span className="grow muted">Nhà cung cấp</span>
              <span>{quote.view.providerLabel}</span>
            </li>
            <li className="row">
              <span className="grow muted">Tài khoản tính phí</span>
              <span style={{ overflowWrap: 'anywhere' }}>{quote.view.credentialLabel}</span>
            </li>
            <li className="row">
              <span className="grow muted">Trần chi phí của lượt</span>
              <strong>
                {quote.view.maximumCost} {quote.view.currency}
              </strong>
            </li>
            <li className="row">
              <span className="grow muted">Hiệu lực đến</span>
              <span>{formatDateTime(new Date(quote.view.expiresAt).toISOString())}</span>
            </li>
            <li className="row">
              <span className="grow muted">Mã việc</span>
              <code className="diag__code">{quote.view.jobId}</code>
            </li>
          </ul>

          <div className="stack">
            <strong style={{ fontSize: 'var(--fs-label)' }}>Dữ liệu sẽ rời máy</strong>
            {quote.view.dataToSend.length === 0 ? (
              <span className="muted">Nhân không liệt kê dữ liệu nào cho lượt này.</span>
            ) : (
              <ul style={{ margin: 0, paddingInlineStart: 18 }} className="muted">
                {quote.view.dataToSend.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          {quote.view.unknowns.length > 0 ? (
            <div className="stack">
              <strong style={{ fontSize: 'var(--fs-label)', color: 'var(--warn)' }}>
                Phần chưa biết ({quote.view.unknowns.length})
              </strong>
              <ul style={{ margin: 0, paddingInlineStart: 18 }} className="muted">
                {quote.view.unknowns.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <span className="muted-3">
                Những mục này chưa xác định được, và không được hiểu là bằng 0.
              </span>
            </div>
          ) : null}

          <CheckField
            label={`Tôi đồng ý gửi lượt này với trần ${quote.view.maximumCost} ${quote.view.currency}`}
            checked={consent}
            disabledReason={
              quoteMismatch
                ? 'Báo giá không thuộc yêu cầu đang hiển thị; lấy báo giá mới trước khi đồng ý.'
                : quoteExpired
                  ? 'Báo giá đã hết hạn; lấy báo giá mới.'
                  : null
            }
            hint="Chi phí thật do nhà cung cấp đối soát và có thể khác ước tính; trần ở trên là giới hạn đã giữ chỗ."
            onChange={setConsent}
          />
        </div>
      ) : (
        <div className="card fc-border" data-ai-quote="none">
          <strong>Chưa có báo giá</strong>
          <p className="muted" style={{ margin: 0 }}>
            Bấm “Lấy báo giá” để xem nơi nhận, tài khoản tính phí, dữ liệu sẽ gửi và trần chi phí.
            Bước đó không tính phí và không gửi nội dung tới nhà cung cấp. Đổi mô tả, nhà cung cấp,
            model, chất lượng, kích thước hoặc ảnh tham chiếu sẽ làm báo giá hiện có mất hiệu lực.
          </p>
          <AIRequestSummary
            model={model ?? null}
            quality={quality}
            size={size}
            prompt={prompt}
            reference={referenceSent}
          />
        </div>
      )}

      <div className="row">
        <Button
          icon="save"
          disabled={savePrompt.pending}
          disabledReason={prompt.trim() === '' ? 'Chưa có nội dung để lưu.' : null}
          onClick={() => void savePrompt.run()}
        >
          Lưu prompt
        </Button>
        <Button
          icon="refresh"
          onClick={() => {
            // A new intent: a new operation id, no quote and no consent. The
            // record of what has already been submitted is *not* cleared —
            // forgetting it is how a job gets paid for twice.
            operationId.current = newOperationId()
            owner.release()
            invalidateQuote()
          }}
        >
          Tạo lượt mới
        </Button>
        <span className="muted-3">
          “Tạo lượt mới” là một ý định mới và có thể phát sinh phí thêm một lần nữa. Mã lượt hiện
          tại: <code>{operationId.current}</code>.
        </span>
      </div>

      {/* --------------------------------------------------------- in flight */}
      {activeJobs.length > 0 ? (
        <section className="stack">
          <h3 style={{ margin: 0 }}>Đang chạy ({activeJobs.length})</h3>
          <ul className="list-reset stack">
            {activeJobs.map((job) => (
              <li key={job.id} className="row">
                <span className="grow" style={{ overflowWrap: 'anywhere' }}>
                  {job.modelId} · <code className="diag__code">{job.id}</code>
                </span>
                <span className="chip chip--muted fc-border">{job.state}</span>
                <Button
                  size="small"
                  variant="danger"
                  icon="cancel"
                  disabled={cancelJob.pending}
                  onClick={() => void cancelJob.run(job.id)}
                >
                  Hủy
                </Button>
              </li>
            ))}
          </ul>
          <p className="muted-3" style={{ margin: 0 }}>
            Hủy là cố gắng tốt nhất và không hứa hoàn tiền. Lượt đã gửi có thể vẫn được tính phí.
          </p>
        </section>
      ) : null}

      {/* -------------------------------------------------------- result tray */}
      <CollapsibleGroup
        title="Khay kết quả"
        open={openTray}
        onToggle={() => setOpenTray((value) => !value)}
        count={`${tray.reduce((sum, job) => sum + job.artifacts.length, 0)} ảnh`}
      >
        <p className="muted" style={{ margin: 0 }}>
          Kết quả về khay chứ không tự thay nguồn thiết kế. Nếu dự án đã đổi từ lúc gửi, ảnh vẫn
          nằm ở đây cho tới khi bạn chọn áp.
        </p>
        {tray.length === 0 ? <p className="muted">Chưa có kết quả nào trong khay.</p> : null}
        {tray.map((job) => (
          <TrayJob
            key={job.id}
            job={job}
            armed={armedArtifact}
            pending={applyArtifact.pending}
            onArm={setArmedArtifact}
            onApply={(artifactId) => void applyArtifact.run(artifactId)}
          />
        ))}
      </CollapsibleGroup>
    </Dialog>
  )
}

/**
 * What the request currently is, in the user's own terms.
 *
 * Shown next to a quote as well as before one, so "what am I paying for" and
 * "how much" are never separated. The prompt is trimmed for length only; it is
 * the person's own text and is not paraphrased.
 */
function AIRequestSummary({
  model,
  quality,
  size,
  prompt,
  reference,
}: {
  model: AIProviderView['models'][number] | null
  quality: string
  size: string
  prompt: string
  reference: File | null
}) {
  const trimmed = prompt.trim()
  return (
    <ul className="list-reset stack" data-ai-selection>
      <li className="row">
        <span className="grow muted">Model</span>
        <span>{model ? model.label : 'chưa chọn'}</span>
      </li>
      <li className="row">
        <span className="grow muted">Chất lượng</span>
        <span>
          {model && model.qualities.length === 0
            ? 'model không công bố'
            : (model?.qualities.find((item) => item.id === quality)?.label ?? 'chưa chọn')}
        </span>
      </li>
      <li className="row">
        <span className="grow muted">Kích thước</span>
        <span>
          {model && model.sizes.length === 0
            ? 'model không công bố'
            : (model?.sizes.find((item) => item.id === size)?.label ?? 'chưa chọn')}
        </span>
      </li>
      <li className="row">
        <span className="grow muted">Ảnh tham chiếu</span>
        <span style={{ overflowWrap: 'anywhere' }}>{reference ? reference.name : 'không gửi'}</span>
      </li>
      <li className="stack">
        <span className="muted">Mô tả sẽ gửi</span>
        <span style={{ overflowWrap: 'anywhere' }} data-ai-prompt-echo>
          {trimmed === ''
            ? 'chưa nhập'
            : trimmed.length > 240
              ? `${trimmed.slice(0, 240)}…`
              : trimmed}
        </span>
      </li>
    </ul>
  )
}

function TrayJob({
  job,
  armed,
  pending,
  onArm,
  onApply,
}: {
  job: AIJobView
  armed: string | null
  pending: boolean
  onArm: (id: string | null) => void
  onApply: (id: string) => void
}) {
  return (
    <div className="card fc-border" style={{ padding: 10 }}>
      <div className="row">
        <strong className="grow" style={{ overflowWrap: 'anywhere' }}>
          {job.modelId}
        </strong>
        <span className="chip chip--muted fc-border">{job.state}</span>
        <span className="chip chip--muted fc-border">kỳ UTC {job.periodUtc}</span>
      </div>
      <ul className="list-reset stack">
        {job.artifacts.map((artifact) => {
          const isArmed = armed === artifact.id
          return (
            <li key={artifact.id} className="stack">
              <div className="row">
                {artifact.previewUrl ? (
                  <img
                    src={artifact.previewUrl}
                    alt=""
                    width={44}
                    height={44}
                    style={{ borderRadius: 'var(--r1)', background: '#fff', objectFit: 'contain' }}
                  />
                ) : (
                  <span className="chip chip--muted fc-border">chưa có ảnh xem trước</span>
                )}
                <span className="grow" style={{ overflowWrap: 'anywhere' }}>
                  {artifact.label}
                </span>
                <Button
                  size="small"
                  icon="check"
                  variant={isArmed ? 'danger' : 'default'}
                  disabled={pending}
                  disabledReason={
                    artifact.canApply ? null : (artifact.reason ?? 'Ảnh này chưa áp được vào dự án.')
                  }
                  onClick={() => {
                    if (isArmed) onApply(artifact.id)
                    else onArm(artifact.id)
                  }}
                >
                  {isArmed ? 'Xác nhận áp ảnh?' : 'Áp làm nguồn'}
                </Button>
              </div>
              {isArmed ? (
                <span className="muted-3" role="status">
                  Áp ảnh này thay nguồn thiết kế hiện tại của dự án. Lệnh hoàn tác được; bấm ra chỗ
                  khác để bỏ.
                </span>
              ) : null}
              {!artifact.canApply && artifact.reason ? (
                <span className="reason">{artifact.reason}</span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
