import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { PresetEntry, ProductId } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP, PRODUCTS } from '../core/registry.ts'
import { useProjectGate } from '../core/project-gate.ts'
import { Button } from '../components/Button.tsx'
import { TextField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'

const DELETE_WINDOW_MS = 4000

export function ProductSection() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const gate = useProjectGate()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = gate.reason ?? (write.available ? null : write.reason)
  const product = snapshot.project.product

  const groupRef = useRef<HTMLDivElement>(null)
  const [presets, setPresets] = useState<PresetEntry[]>([])
  const [presetError, setPresetError] = useState<string | null>(null)
  const [allCount, setAllCount] = useState<number | null>(null)
  const [presetName, setPresetName] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    void bridge
      .queryPresets(product)
      .then((entries) => {
        if (cancelled) return
        setPresets(entries)
        setPresetError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // An empty list and a failed query are different things, and the user
        // must be able to tell them apart.
        setPresets([])
        setPresetError(cause instanceof Error ? cause.message : 'Không đọc được danh mục mẫu.')
      })
    void Promise.all(PRODUCTS.map((item) => bridge.queryPresets(item.id)))
      .then((lists) => {
        if (!cancelled) setAllCount(lists.reduce((sum, list) => sum + list.length, 0))
      })
      .catch(() => {
        if (!cancelled) setAllCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [bridge, product, reload])

  // Two-step delete (DAT-03): the first press arms for four seconds.
  useEffect(() => {
    if (!state.armedDelete) return
    const timer = setTimeout(() => actions.armDelete(null), DELETE_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [actions, state.armedDelete])

  const changeProduct = useAsyncAction(async (next: ProductId) => {
    await run(
      { type: 'project.product', product: next },
      { announce: 'Đã gửi yêu cầu đổi loại sản phẩm.' },
    )
  })

  /**
   * `preset.apply` is confirmation-gated in the core (`CONFIRMATION_REQUIRED`),
   * and that refusal carries no confirmation payload, so there is no dialog to
   * fall back on. The consent is given here, with the same two-step arm the two
   * neighbouring destructive commands already use.
   */
  const applyPreset = useAsyncAction(async (id: string) => {
    await run({ type: 'preset.apply', id, confirmed: true })
    actions.armDelete(null)
  })

  const savePreset = useAsyncAction(async (name: string) => {
    const result = await run({ type: 'preset.save', name }, { success: `Đã lưu mẫu "${name}".` })
    if (result.ok) {
      setPresetName('')
      setReload((value) => value + 1)
    }
    return undefined
  })

  const deletePreset = useAsyncAction(async (id: string) => {
    const result = await run({ type: 'preset.delete', id, confirmed: true }, { success: 'Đã xóa mẫu.' })
    if (result.ok) setReload((value) => value + 1)
    actions.armDelete(null)
    return undefined
  })

  return (
    <div className="stack">
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="field__label" style={{ paddingBlockEnd: 6 }}>
          Loại sản phẩm
        </legend>
        {/* Arrow keys move between the radios and select as they go, which is
            what the radiogroup pattern requires. */}
        <div className="stack" ref={groupRef} role="radiogroup" aria-label="Loại sản phẩm">
          {PRODUCTS.map((item, index) => {
            const selected = product === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={writeBlocked ? true : undefined}
                tabIndex={selected ? 0 : -1}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  const delta =
                    event.key === 'ArrowDown' || event.key === 'ArrowRight'
                      ? 1
                      : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
                        ? -1
                        : 0
                  if (delta === 0) return
                  event.preventDefault()
                  const next = (index + delta + PRODUCTS.length) % PRODUCTS.length
                  const target = PRODUCTS[next]
                  const buttons =
                    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                  buttons?.[next]?.focus()
                  if (target && !writeBlocked && target.id !== product) {
                    void changeProduct.run(target.id)
                  }
                }}
                className="btn fc-border"
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'start',
                  paddingBlock: 8,
                  borderColor: selected ? 'var(--sec-product)' : undefined,
                }}
                onClick={() => {
                  if (writeBlocked || selected) return
                  void changeProduct.run(item.id)
                }}
              >
                <span style={{ display: 'grid', gap: 2 }}>
                  <span>
                    {selected ? '● ' : '○ '}
                    {item.label}
                  </span>
                  <span className="muted-3">{item.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <p className="muted-3" style={{ margin: 0 }}>
        Đổi loại sản phẩm sẽ hỏi trước khi áp dụng và hoàn tác được. Giá trị bạn đã chọn tay được giữ
        nếu còn hợp lệ.
      </p>
      {writeBlocked ? <span className="reason">{writeBlocked}</span> : null}

      <CollapsibleGroup
        title="Mẫu dựng sẵn"
        color="var(--sec-product)"
        open={isGroupOpen(state, 'product-presets')}
        onToggle={() => actions.setGroupOpen('product-presets', !isGroupOpen(state, 'product-presets'))}
        count={
          allCount === null
            ? 'đang đếm…'
            : `${presets.length} cho loại này / ${allCount} tổng`
        }
      >
        {presetError ? (
          <div className="diag diag--error fc-border">
            <div className="diag__msg">{presetError}</div>
            <div className="diag__detail">
              Đây là lỗi đọc danh mục, không phải "loại này không có mẫu".
            </div>
          </div>
        ) : null}

        {presets.length === 0 && !presetError ? (
          <div className="empty">
            <strong className="empty__title">Loại này chưa có mẫu dựng sẵn</strong>
            <p className="muted" style={{ margin: 0 }}>
              Đặt thông số ở khu Thông số rồi lưu lại thành mẫu của riêng bạn bằng ô bên dưới.
            </p>
            <Button icon="sliders" onClick={() => actions.setSection('parameters', true)}>
              Mở khu Thông số
            </Button>
          </div>
        ) : (
          <ul className="list-reset stack">
            {presets.map((preset) => {
              const armed = state.armedDelete === `preset:${preset.id}`
              const armedApply = state.armedDelete === `preset-apply:${preset.id}`
              return (
                <li key={preset.id} className="card fc-border" style={{ padding: 10 }}>
                  <div className="row">
                    <strong className="grow" style={{ overflowWrap: 'anywhere' }}>
                      {preset.name}
                    </strong>
                    <span className="chip chip--muted fc-border">
                      {preset.custom ? 'mẫu của tôi' : 'dựng sẵn'}
                    </span>
                  </div>
                  <div className="row">
                    <Button
                      size="small"
                      icon="check"
                      variant={armedApply ? 'primary' : 'default'}
                      disabled={applyPreset.pending}
                      disabledReason={writeBlocked}
                      onClick={() => {
                        if (armedApply) void applyPreset.run(preset.id)
                        else actions.armDelete(`preset-apply:${preset.id}`)
                      }}
                    >
                      {armedApply ? 'Áp dụng, ghi đè thông số?' : 'Áp dụng'}
                    </Button>
                    {preset.custom ? (
                      <Button
                        size="small"
                        variant={armed ? 'danger' : 'default'}
                        icon="trash"
                        disabled={deletePreset.pending}
                        disabledReason={writeBlocked}
                        onClick={() => {
                          if (armed) void deletePreset.run(preset.id)
                          else actions.armDelete(`preset:${preset.id}`)
                        }}
                      >
                        {armed ? 'Xóa?' : 'Xóa'}
                      </Button>
                    ) : null}
                    {armed ? (
                      <span className="muted-3" role="status">
                        Bấm lại trong 4 giây để xóa. Esc hoặc đổi mục sẽ hủy.
                      </span>
                    ) : null}
                    {armedApply ? (
                      <span className="muted-3" role="status">
                        Áp mẫu thay bộ thông số hiện tại và hoàn tác được. Bấm lại trong 4 giây để
                        xác nhận.
                      </span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="divider" />

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow">
            <TextField
              label="Lưu thông số hiện tại thành mẫu"
              value={presetName}
              placeholder="Tên mẫu"
              maxLength={80}
              onChange={setPresetName}
              hint="Mẫu lưu thông số, không chụp lại nguồn đang sửa."
            />
          </div>
          <Button
            icon="save"
            disabled={savePreset.pending}
            disabledReason={
              writeBlocked ?? (presetName.trim() === '' ? 'Nhập tên mẫu trước khi lưu.' : null)
            }
            onClick={() => void savePreset.run(presetName.trim())}
          >
            Lưu mẫu
          </Button>
        </div>
        <p className="muted-3" style={{ margin: 0 }}>
          Tối đa 20 mẫu cho mọi loại. Áp dụng mẫu không đặt lại màu hay khe bạn đã chọn tay.
        </p>
      </CollapsibleGroup>
    </div>
  )
}
