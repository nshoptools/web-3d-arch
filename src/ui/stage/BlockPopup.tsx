import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useFocusOnOpen } from '../core/useFocusTrap.ts'
import { useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { MQ_MOBILE, useMediaQuery } from '../core/useMediaQuery.ts'
import { Button } from '../components/Button.tsx'
import { NumberField, SelectField } from '../components/Fields.tsx'
import { Icon } from '../components/Icon.tsx'
import { TextControls } from '../text/TextControls.tsx'
import { materialName, selectionName } from '../core/names.ts'

const DEFAULT_POSITION = { x: 120, y: 120 }

/**
 * Per-block editor (VIEW-01, UI-05, UI-C04).
 *
 * Which block this edits comes from `project.selection`, the one selection the
 * controller publishes — the same one the keyboard path reads. The interface
 * owns only where the panel sits. Non-modal: no focus trap, Escape closes it,
 * and it stays inside the viewport when dragged.
 */
export function BlockPopup() {
  const snapshot = useSnapshot()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason
  const mobile = useMediaQuery(MQ_MOBILE)
  const selection = snapshot.project.selection
  const placement = state.blockPopup
  const open = placement !== null && selection !== null
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const [position, setPosition] = useState(DEFAULT_POSITION)

  // Non-modal, so no trap; but focus still has to arrive and to come back.
  useFocusOnOpen(ref, open)

  useEffect(() => {
    if (placement) setPosition({ x: placement.x, y: placement.y })
  }, [placement])

  // The core dropping its selection closes the panel: an editor for a block
  // that is no longer selected would be editing nothing.
  useEffect(() => {
    if (placement !== null && selection === null) actions.setBlockPopup(null)
  }, [actions, placement, selection])

  // Escape is deliberately not handled here. A listener on this element runs
  // before React's delegated handlers, which are attached at the root
  // container, so a popup that dismissed itself here would close before a field
  // inside it could say the key was its own — the draft in that field would go
  // with it. AppShell already closes this popup from the one window listener
  // that peels a single layer per Escape (UI-05), and it stands down when a
  // field has consumed the key.

  if (!open || !selection) return null

  const block = snapshot.project.blocks.find((item) => item.id === selection.blockId) ?? null
  const material =
    snapshot.project.materials.find((item) => item.id === (block?.materialId ?? selection.blockId)) ?? null
  const isTextBlock = selection.kind === 'text'
  const title = selectionName(snapshot.project) ?? selection.label

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mobile) return
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    drag.current = { dx: event.clientX - box.left, dy: event.clientY - box.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const offset = drag.current
    if (!offset) return
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    // Clamped to the viewport so the popup can never be dragged out of reach.
    const x = Math.min(Math.max(0, event.clientX - offset.dx), window.innerWidth - box.width)
    const y = Math.min(Math.max(0, event.clientY - offset.dy), window.innerHeight - box.height)
    setPosition({ x, y })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={ref}
      className="popup fc-border"
      role="dialog"
      aria-label={`Khối ${title}`}
      data-shortcut-scope="local"
      style={mobile ? undefined : { insetInlineStart: position.x, insetBlockStart: position.y }}
    >
      <div
        className="popup__head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setPosition(DEFAULT_POSITION)}
      >
        <Icon name="drag" size={15} />
        <span className="popup__title">{title}</span>
        <span className="chip chip--muted fc-border">chỉ khối này</span>
        <Button
          size="small"
          variant="ghost"
          icon="close"
          iconOnly
          aria-label="Đóng popup khối"
          onClick={() => actions.setBlockPopup(null)}
        />
      </div>

      <div className="popup__body">
        <div className="popup__prose">
          <p>
            Giá trị đặt ở đây chỉ áp cho khối này. Thông số chung của cả mô hình vẫn nằm ở khu
            Thông số và được ghi rõ phạm vi tại đó.
          </p>
        </div>

        {material ? (
          <>
            <div className="row">
              <span
                className="swatch fc-border"
                style={{ background: material.color, display: 'inline-block' }}
                aria-hidden="true"
              />
              <span className="grow">{materialName(material)}</span>
              <code className="diag__code">{material.color}</code>
            </div>
            <SelectField
              label="Khe filament của khối"
              value={material.slot === null ? '' : String(material.slot)}
              options={[
                // Contract 0.3 accepts `slot: null`, so "chưa gán" is a choice.
                { value: '', label: '— chưa gán khe' },
                ...Array.from({ length: snapshot.printer.filamentSlots }, (_unused, index) => ({
                  value: String(index + 1),
                  label: `Khe ${index + 1}`,
                })),
              ]}
              disabledReason={writeBlocked}
              onChange={(value) => {
                void run({
                  type: 'material.update',
                  id: material.id,
                  slot: value === '' ? null : Number(value),
                })
              }}
            />
            {material.heightLayers !== undefined ? (
              <NumberField
                label="Chiều cao khối"
                unit="lớp"
                min="0"
                max="60"
                step="1"
                slider={false}
                value={String(material.heightLayers)}
                disabledReason={writeBlocked}
                onCommit={async (raw) => {
                  const result = await run(
                    { type: 'material.update', id: material.id, heightLayers: raw },
                    { toastOnError: false },
                  )
                  return result.ok ? { ok: true } : { ok: false, message: result.diagnostic.message }
                }}
              />
            ) : null}
            {material.excluded ? (
              <span className="reason">
                {material.excludedReason ??
                  'Khối này không sinh khối trong bản dựng hiện tại.'}
              </span>
            ) : null}
            <Button
              icon="refresh"
              disabledReason={writeBlocked ?? (material.overridden ? null : 'Khối này chưa có giá trị bạn đặt riêng.')}
              onClick={() => void run({ type: 'material.reset', id: material.id })}
            >
              Về đúng nguồn
            </Button>
          </>
        ) : (
          <p className="muted">
            Khối này là phần lõi hoặc tầng đã gộp; nhân không tách nó thành đối tượng sửa độc lập
            được, nên chỉ các thông số chung ở khu Thông số tác động tới nó.
          </p>
        )}

        {isTextBlock ? (
          <>
            <div className="divider" />
            {/* Same component as the source panel (SRC-04). */}
            <TextControls place="popup" />
          </>
        ) : null}

        <details className="details">
          <summary>Chi tiết kỹ thuật</summary>
          <div className="muted-3">
            Mã khối <code className="diag__code">{selection.blockId}</code> · loại{' '}
            <code className="diag__code">{selection.kind}</code>
          </div>
        </details>
      </div>
    </div>
  )
}
