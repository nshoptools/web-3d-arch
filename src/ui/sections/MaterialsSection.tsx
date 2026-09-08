import { useId, useMemo } from 'react'
import type { MaterialView } from '../../contracts/app-bridge.ts'
import { useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { Button } from '../components/Button.tsx'
import { DraftTextField, NumberField } from '../components/Fields.tsx'
import { formatNumber } from '../core/text.ts'

const ROLE_LABEL: Record<MaterialView['role'], string> = {
  region: 'Vùng nguồn',
  body: 'Đế và thân',
  text: 'Chữ',
  textBase: 'Đế chữ',
  stem: 'Trụ và gân',
  tray: 'Khay switch',
  other: 'Khối khác',
}

/** MOD-02 / UI-C15: the cause comes from the core, never from a UI guess. */
const CAUSE_LABEL: Record<NonNullable<MaterialView['excludedCause']>, string> = {
  background: 'được đặt làm NỀN',
  'below-min-detail': 'dưới ngưỡng chi tiết in được',
  merged: 'đã gộp vào vùng khác',
  other: 'nguyên nhân khác do nhân nêu',
}

function MaterialRow({
  material,
  slots,
  step,
  writeBlocked,
}: {
  material: MaterialView
  slots: number
  step: 1 | 2
  writeBlocked: string | null
}) {
  const run = useRunCommand()
  const { state } = useUi()
  const actions = useUiActions()
  const hexId = useId()
  const slotId = useId()
  const selected = state.materialSelected === material.id

  // A refused material change now reaches the user as a toast as well as the
  // log; only the field-backed edits suppress the toast and show the reason
  // inline instead.
  const update = (values: Parameters<typeof run>[0]) => void run(values)

  const commit = async (values: Parameters<typeof run>[0]) => {
    const result = await run(values, { toastOnError: false })
    return result.ok ? { ok: true } : { ok: false, message: result.diagnostic.message }
  }

  // A row that produces no solid keeps its place in the table and says why,
  // instead of losing the slot and NỀN cells silently (MOD-02).
  const noVolume = material.excluded

  return (
    <li
      className="mrow fc-border"
      data-selected={selected ? 'true' : 'false'}
      onFocusCapture={() => actions.selectMaterial(material.id)}
    >
      <div className="mrow__top">
        <span className="swatch focus-safe fc-border">
          <input
            type="color"
            value={material.color}
            aria-label={`Màu của ${material.label}`}
            disabled={Boolean(writeBlocked)}
            onChange={(event) =>
              update({ type: 'material.update', id: material.id, color: event.target.value })
            }
          />
        </span>

        {/* Draft-backed: a half-typed or refused hex stays on screen instead of
            being wiped by the next snapshot. */}
        <DraftTextField
          inputId={hexId}
          label={`Mã màu hex của ${material.label}`}
          labelHidden
          className="input--hex"
          value={material.color}
          disabledReason={writeBlocked}
          onCommit={(raw) => commit({ type: 'material.update', id: material.id, color: raw })}
        />

        <span className="mrow__name">
          {material.label}
          <span className="muted-3"> · {ROLE_LABEL[material.role]}</span>
        </span>

        {material.areaPercent === undefined ? (
          <span className="mrow__pct">{ROLE_LABEL[material.role]}</span>
        ) : (
          <span className="mrow__pct">{formatNumber(material.areaPercent, 1)}%</span>
        )}
      </div>

      <div className="mrow__bottom">
        {noVolume ? (
          <span className="chip chip--warn fc-border">
            Không sinh khối trong bản dựng — không nhận khe filament
            {material.excludedCause ? `: ${CAUSE_LABEL[material.excludedCause]}` : ''}
          </span>
        ) : (
          <>
            {/* NỀN only exists for source regions and only in step 2, because it
                changes how the body is built (MOD-02). */}
            <Button
              size="small"
              disabledReason={
                writeBlocked ??
                (!material.backgroundEligible
                  ? 'Vai này không có NỀN; chỉ vùng nguồn chạm biên mới cắt được nền.'
                  : step === 1
                    ? 'NỀN tác động dựng thân nên chỉ bật ở bước 2.'
                    : null)
              }
              reasonHidden
              onClick={() => update({ type: 'material.update', id: material.id, excluded: true })}
            >
              NỀN
            </Button>

            <label className="u-visually-hidden" htmlFor={slotId}>
              Khe filament của {material.label}
            </label>
            <select
              id={slotId}
              className="select slot-select"
              value={material.slot === null ? '' : String(material.slot)}
              disabled={Boolean(writeBlocked) || step === 1}
              onChange={(event) => {
                // Contract 0.3 accepts `slot: null` to clear an assignment, so
                // the empty option is a real choice and not a dead placeholder.
                update({
                  type: 'material.update',
                  id: material.id,
                  slot: event.target.value === '' ? null : Number(event.target.value),
                })
              }}
            >
              <option value="">— chưa gán khe</option>
              {Array.from({ length: slots }, (_unused, index) => index + 1).map((slot) => (
                <option key={slot} value={String(slot)}>
                  Khe {slot}
                </option>
              ))}
            </select>
            {step === 1 ? (
              <span className="reason">Khe filament đặt ở bước 2 hoặc khi khối đã có màu bộ phận.</span>
            ) : null}
          </>
        )}

        {material.overridden ? (
          <Button
            size="small"
            icon="refresh"
            disabledReason={writeBlocked}
            onClick={() => update({ type: 'material.reset', id: material.id })}
          >
            Về mặc định
          </Button>
        ) : null}

        {noVolume ? (
          <Button
            size="small"
            icon="refresh"
            disabledReason={writeBlocked}
            onClick={() => update({ type: 'material.update', id: material.id, excluded: false })}
          >
            Đưa lại vào bản dựng
          </Button>
        ) : null}
      </div>

      {/* The row keeps its place in the table and states why, instead of losing
          the slot and NỀN cells silently (MOD-02). */}
      {noVolume ? (
        <div className="mrow__bottom">
          <span className="reason">
            {material.excludedReason ?? 'Nhân chưa nêu nguyên nhân cụ thể cho hàng này.'}
          </span>
        </div>
      ) : null}

      {material.heightLayers !== undefined && !noVolume ? (
        <div className="mrow__bottom">
          <NumberField
            label="Chiều cao riêng"
            unit="lớp"
            min="0"
            max="60"
            step="1"
            slider={false}
            value={String(material.heightLayers)}
            disabledReason={
              writeBlocked ?? (step === 1 ? 'Chiều cao riêng đặt ở bước 2.' : null)
            }
            onCommit={async (raw) => {
              const result = await run(
                { type: 'material.update', id: material.id, heightLayers: raw },
                { toastOnError: false },
              )
              return result.ok ? { ok: true } : { ok: false, message: result.diagnostic.message }
            }}
          />
          <span className="chip chip--muted fc-border">
            {material.heightLayers} lớp theo lịch lớp của nhân
          </span>
        </div>
      ) : null}
    </li>
  )
}

export function MaterialsSection() {
  const snapshot = useSnapshot()
  const actions = useUiActions()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason
  const { project, printer } = snapshot
  const materials = project.materials
  const step = project.step

  // Presentation grouping only: the core still owns the authoritative
  // diagnostic. Nothing is remapped automatically (MOD-02).
  const clashes = useMemo(() => {
    const bySlot = new Map<number, MaterialView[]>()
    for (const material of materials) {
      if (material.excluded || material.slot === null) continue
      const list = bySlot.get(material.slot) ?? []
      list.push(material)
      bySlot.set(material.slot, list)
    }
    return [...bySlot.entries()]
      .filter(([, list]) => new Set(list.map((item) => item.color.toLowerCase())).size > 1)
      .map(([slot, list]) => ({ slot, list }))
  }, [materials])

  if (materials.length === 0) {
    return (
      <div className="empty">
        <strong className="empty__title">Chưa có vùng màu</strong>
        <p className="muted" style={{ margin: 0 }}>
          Bảng màu xuất hiện sau khi có nguồn và nhân đã phân vùng. Bắt đầu từ khu Ảnh nguồn.
        </p>
        <Button icon="image" onClick={() => actions.setSection('source', true)}>
          Mở khu Ảnh nguồn
        </Button>
      </div>
    )
  }

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Thứ tự hàng do nhân sắp theo cao độ, diện tích rồi mã màu và ID. Giao diện không sắp lại
        theo khe.
      </p>

      <ul className="list-reset stack">
        {materials.map((material) => (
          <MaterialRow
            key={material.id}
            material={material}
            slots={printer.filamentSlots}
            step={step}
            writeBlocked={writeBlocked}
          />
        ))}
      </ul>

      {clashes.length > 0 ? (
        <div className="slot-clash fc-border" role="status">
          <div className="slot-clash__title">⚠ Trùng khe filament</div>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
            {clashes.map((clash) => (
              <li key={clash.slot}>
                Khe {clash.slot}: {clash.list.map((item) => `${item.label} (${item.color})`).join(', ')}
              </li>
            ))}
          </ul>
          <p style={{ margin: '6px 0 0' }}>
            Chọn lại khe cho một trong các hàng trên. Giao diện không tự đổi giúp bạn.
          </p>
        </div>
      ) : null}

      <p className="muted-3" style={{ margin: 0 }}>
        Phần trăm diện tích và số lớp lấy nguyên từ nhân. Một màu không đương nhiên là một lớp in;
        khe filament chỉ đặt được ở bước 2 hoặc khi khối đã có màu bộ phận.
      </p>
      {writeBlocked ? <span className="reason">{writeBlocked}</span> : null}
    </div>
  )
}
