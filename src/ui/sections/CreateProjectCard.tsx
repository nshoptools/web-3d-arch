import { useRef, useState, type KeyboardEvent } from 'react'
import type { Diagnostic, ProductId } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useCapability, useRunCommand } from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { CAP, PRODUCTS } from '../core/registry.ts'
import { MQ_COMPACT, useMediaQuery } from '../core/useMediaQuery.ts'
import { Button } from '../components/Button.tsx'
import { SelectField } from '../components/Fields.tsx'
import { diagnosticText } from '../core/text.ts'

/**
 * Creating a project is the first door of the flow: with no document open the
 * core answers PROJECT_REQUIRED to every source, parameter and save command.
 *
 * The card owns nothing but the choice of product type. Whether the project
 * exists is the core's answer, never an assumption made here, and a refusal
 * stays on screen with its code until the user acts on it.
 *
 * Two shapes: `start` is the hero of the start screen (product types as a
 * radio list), `compact` is the small card inside the library panel that
 * creates another project while one is open.
 */

const PENDING_REASON = 'Đang tạo dự án, chờ nhân trả lời.'

/** Where the keyboard lands once the workspace opens: the first way to add a source. */
const FIRST_TASK_ANCHOR = 'w3a-source-import'

export function CreateProjectCard({
  idPrefix = 'w3a-create',
  variant = 'compact',
}: {
  idPrefix?: string
  variant?: 'start' | 'compact'
}) {
  const run = useRunCommand()
  const actions = useUiActions()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason
  const groupRef = useRef<HTMLDivElement>(null)
  const compact = useMediaQuery(MQ_COMPACT)

  const [product, setProduct] = useState<ProductId>(PRODUCTS[0]?.id ?? 'keychain')
  const [failure, setFailure] = useState<Diagnostic | null>(null)

  const createProject = useAsyncAction(async () => {
    const result = await run({ type: 'project.create', product }, { toastOnError: false })
    if (result.ok) {
      setFailure(null)
      actions.announce('Đã tạo dự án mới. Thêm ảnh, chữ hoặc emoji để bắt đầu.')
      // The workspace opens on the source section; the file chooser is not
      // opened from here because the click already spent its user activation.
      // On a compact layout the panel is a drawer that would cover the stage,
      // and the stage's own empty card offers the same first actions — so the
      // drawer stays closed there and the stage is what the person sees.
      actions.setSection('source', !compact)
      if (!compact) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => document.getElementById(FIRST_TASK_ANCHOR)?.focus()),
        )
      }
      return
    }
    // A confirmation is already a dialog; only a plain refusal belongs inline.
    if (!result.confirmation) setFailure(result.diagnostic)
  })

  const onRadioKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0
    const target =
      event.key === 'Home' ? 0 : event.key === 'End' ? PRODUCTS.length - 1 : delta === 0 ? -1 : (index + delta + PRODUCTS.length) % PRODUCTS.length
    if (target < 0) return
    event.preventDefault()
    const next = PRODUCTS[target]
    if (!next) return
    setProduct(next.id)
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[target]?.focus()
  }

  return (
    <div className="stack" data-create-project="true" id={idPrefix}>
      {variant === 'start' ? (
        <div ref={groupRef} className="pick" role="radiogroup" aria-label="Loại sản phẩm">
          {PRODUCTS.map((item, index) => {
            const selected = product === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-product={item.id}
                className="pick__item fc-border"
                tabIndex={selected ? 0 : -1}
                onKeyDown={(event) => onRadioKeyDown(event, index)}
                onClick={() => setProduct(item.id)}
              >
                <span className="pick__mark" aria-hidden="true" />
                <span className="pick__text">
                  <span className="pick__label">{item.label}</span>
                  <span className="pick__sub">{item.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <SelectField
          inputId={`${idPrefix}-product`}
          label="Loại sản phẩm"
          value={product}
          options={PRODUCTS.map((item) => ({ value: item.id, label: `${item.label} — ${item.sub}` }))}
          disabledReason={writeBlocked}
          onChange={(value) => setProduct(value as ProductId)}
        />
      )}

      <div className="row">
        {/* Soft-disabled while pending: a `disabled` button drops focus, which
            matters most on the control someone just pressed. */}
        <Button
          icon="plus"
          variant="primary"
          disabledReason={writeBlocked ?? (createProject.pending ? PENDING_REASON : null)}
          reasonHidden={writeBlocked === null}
          onClick={() => void createProject.run()}
        >
          {createProject.pending ? 'Đang tạo…' : variant === 'start' ? 'Tạo dự án' : 'Tạo dự án mới'}
        </Button>
        {variant === 'start' ? (
          <span className="muted-3">Loại sản phẩm đổi lại được sau; ứng dụng sẽ hỏi trước khi đổi.</span>
        ) : (
          <span className="muted-3">Dự án đang mở được giữ nguyên.</span>
        )}
      </div>

      {failure ? (
        <div className="diag diag--error fc-border" role="alert" data-create-failure="create">
          <div className="diag__head">
            <span className="diag__sev">Không tạo được dự án</span>
            <code className="diag__code">{failure.code}</code>
          </div>
          <div className="diag__msg">{diagnosticText(failure.code, failure.message)}</div>
          {failure.detail ? <div className="diag__detail">{failure.detail}</div> : null}
          <div className="row">
            <Button
              size="small"
              icon="redo"
              disabledReason={createProject.pending ? PENDING_REASON : null}
              reasonHidden
              onClick={() => void createProject.run()}
            >
              Thử lại
            </Button>
            <Button size="small" onClick={() => setFailure(null)}>
              Bỏ qua thông báo
            </Button>
            <Button size="small" icon="dots" onClick={() => actions.openDialog({ kind: 'diagnostics' })}>
              Mở nhật ký
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
