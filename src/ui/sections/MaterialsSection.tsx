import { useId, useMemo } from 'react'
import type { MaterialView } from '../../contracts/app-bridge.ts'
import { useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { materialBelongsTo, materialName } from '../core/names.ts'
import { Button } from '../components/Button.tsx'
import { DraftTextField, NumberField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { formatNumber } from '../core/text.ts'

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
  const name = materialName(material)

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
  // NỀN only exists for source regions and only in step 2, because it changes
  // how the body is built (MOD-02). A row that can never take it shows no
  // dead button; the reason is stated once, on the rows that could.
  const backgroundReason =
    writeBlocked ?? (step === 1 ? 'NỀN tác động dựng thân nên chỉ bật ở bước 2.' : null)

  return (
    <li
      className="mrow fc-border"
      data-selected={selected ? 'true' : 'false'}
      data-material-id={material.id}
      onFocusCapture={() => actions.selectMaterial(material.id)}
    >
      <div className="mrow__top">
        <span className="swatch focus-safe fc-border">
          <input
            type="color"
            value={material.color}
            aria-label={`Màu của ${name}`}
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
          label={`Mã màu hex của ${name}`}
          labelHidden
          className="input--hex"
          value={material.color}
          disabledReason={writeBlocked}
          onCommit={(raw) => commit({ type: 'material.update', id: material.id, color: raw })}
        />

        <span className="mrow__name">
          <strong>{name}</strong>
          {name !== material.label ? <span className="u-visually-hidden"> ({material.label})</span> : null}
        </span>

        {material.areaPercent !== undefined ? (
          <span className="mrow__pct" title="Phần diện tích của nguồn">
            {formatNumber(material.areaPercent, 1)}%
          </span>
        ) : null}
      </div>

      {noVolume ? (
        <div className="mrow__bottom">
          <span className="chip chip--warn fc-border">
            Không sinh khối trong bản dựng
            {material.excludedCause ? `: ${CAUSE_LABEL[material.excludedCause]}` : ''}
          </span>
          <Button
            size="small"
            icon="refresh"
            disabledReason={writeBlocked}
            reasonHidden
            onClick={() => update({ type: 'material.update', id: material.id, excluded: false })}
          >
            Đưa lại vào bản dựng
          </Button>
        </div>
      ) : material.backgroundEligible || slots > 0 || material.overridden ? (
        <div className="mrow__bottom">
          {material.backgroundEligible ? (
            <Button
              size="small"
              disabledReason={backgroundReason}
              reasonHidden
              title="Cắt phần nền chạm biên của vùng này khỏi thân"
              onClick={() => update({ type: 'material.update', id: material.id, excluded: true })}
            >
              NỀN
            </Button>
          ) : null}

          {slots > 0 ? (
            <>
              <label className="u-visually-hidden" htmlFor={slotId}>
                Khe filament của {name}
              </label>
              <select
                id={slotId}
                className="select slot-select"
                value={material.slot === null ? '' : String(material.slot)}
                disabled={Boolean(writeBlocked) || step === 1}
                title={step === 1 ? 'Khe filament đặt ở bước 2.' : 'Khe filament'}
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
            </>
          ) : null}

          {material.overridden ? (
            <Button
              size="small"
              icon="refresh"
              disabledReason={writeBlocked}
              reasonHidden
              onClick={() => update({ type: 'material.reset', id: material.id })}
            >
              Về mặc định
            </Button>
          ) : null}
        </div>
      ) : null}

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
  const { state } = useUi()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason
  const { project, printer } = snapshot
  const materials = project.materials
  const step = project.step
  const slots = printer.filamentSlots

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

  // The product publishes three kinds of rows: the materials this product
  // type prints (`product.active` and a role of this type), the roles the
  // kernel initialises for the other product types (kept so a switch keeps
  // the person's choices), and the source reader's own palette kept for
  // identity (`product.active === false`). Only the first list is the one a
  // person edits day to day; the other two stay reachable, folded.
  const active = materials.filter((material) => material.product?.active !== false)
  const shown = active.filter((material) => materialBelongsTo(material, project.product))
  const otherTypes = active.filter((material) => !materialBelongsTo(material, project.product))
  const reference = materials.filter((material) => material.product?.active === false)
  const otherOpen = isGroupOpen(state, 'materials-other-types', false)

  return (
    <div className="stack">
      {slots === 0 ? (
        <div className="card fc-border" data-materials-no-printer="true">
          <strong>Chưa chọn máy in</strong>
          <p className="muted" style={{ margin: 0 }}>
            Khe filament chỉ gán được khi đã chọn máy in có hồ sơ. Màu và NỀN vẫn đặt được ngay.
          </p>
          <Button size="small" icon="gear" onClick={() => actions.openDialog({ kind: 'settings' })}>
            Mở cài đặt máy in
          </Button>
        </div>
      ) : step === 1 ? (
        <p className="muted" style={{ margin: 0 }}>
          Khe filament được gán ở bước 2, sau khi dựng.
        </p>
      ) : null}

      <ul className="list-reset stack" data-material-rows="active">
        {shown.map((material) => (
          <MaterialRow
            key={material.id}
            material={material}
            slots={slots}
            step={step}
            writeBlocked={writeBlocked}
          />
        ))}
      </ul>

      {otherTypes.length > 0 ? (
        <CollapsibleGroup
          title="Giữ cho loại sản phẩm khác"
          color="var(--sec-materials)"
          open={otherOpen}
          onToggle={() => actions.setGroupOpen('materials-other-types', !otherOpen)}
          count={`${otherTypes.length} phần`}
        >
          <p className="muted-3" style={{ margin: 0 }}>
            Những phần này không xuất hiện trên mô hình của loại đang chọn; màu bạn đặt được giữ nếu
            đổi loại sản phẩm.
          </p>
          <ul className="list-reset stack" data-material-rows="other-types">
            {otherTypes.map((material) => (
              <MaterialRow
                key={material.id}
                material={material}
                slots={slots}
                step={step}
                writeBlocked={writeBlocked}
              />
            ))}
          </ul>
        </CollapsibleGroup>
      ) : null}

      {reference.length > 0 ? (
        <details className="details" data-material-rows="reference">
          <summary>Bảng màu gốc của nguồn ({reference.length})</summary>
          <p className="muted-3" style={{ margin: '4px 0 8px' }}>
            Màu do bộ đọc nguồn công bố, giữ để đối chiếu; bản dựng dùng các hàng ở trên.
          </p>
          <ul className="list-reset stack">
            {reference.map((material) => (
              <MaterialRow
                key={material.id}
                material={material}
                slots={slots}
                step={step}
                writeBlocked={writeBlocked}
              />
            ))}
          </ul>
        </details>
      ) : null}

      {clashes.length > 0 ? (
        <div className="slot-clash fc-border" role="status">
          <div className="slot-clash__title">⚠ Trùng khe filament</div>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
            {clashes.map((clash) => (
              <li key={clash.slot}>
                Khe {clash.slot}: {clash.list.map((item) => `${materialName(item)} (${item.color})`).join(', ')}
              </li>
            ))}
          </ul>
          <p style={{ margin: '6px 0 0' }}>
            Chọn lại khe cho một trong các hàng trên. Giao diện không tự đổi giúp bạn.
          </p>
        </div>
      ) : null}

      <p className="muted-3" style={{ margin: 0 }}>
        Hàng xếp theo thứ tự vùng nguồn rồi tới các vai. Một màu không đương nhiên là một lớp in.
      </p>
      <p className="muted-3" style={{ margin: '4px 0 0' }}>
        Số khe lúc nhận nguồn được đặt tạm theo màu, để lần nhập lại cùng một tệp cho cùng kết
        quả. Đó là quy ước nạp khay, <strong>không phải thứ tự máy in ra</strong>: máy cắt lớp tự
        chọn thứ tự đùn của lớp đầu, và gói xuất của ứng dụng không ghi thứ tự đó. Bạn đổi khe thì
        lựa chọn của bạn được giữ.
      </p>
      {writeBlocked ? <span className="reason">{writeBlocked}</span> : null}
    </div>
  )
}
