/**
 * The one text-block editor. SRC-04 requires the source panel and the 3D block
 * popup to use the same component so a change in one place shows in the other;
 * this file is that component, and neither caller may fork it.
 *
 * Eight numeric controls, two independent switches, the text itself, the font
 * and the three block-level commands. Every value comes from
 * AppSnapshot.project.text and every edit leaves through text.update.
 */
import { useEffect, useMemo, useState } from 'react'
import type { FontEntry, TextView } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { useProjectGate } from '../core/project-gate.ts'
import { Button } from '../components/Button.tsx'
import { CheckField, NumberField, SelectField, TextField, type CommitResult } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'

type NumericTextKey =
  | 'sizeMm'
  | 'heightLayers'
  | 'baseWidthMm'
  | 'baseThicknessLayers'
  | 'baseRadiusMm'
  | 'bend'
  | 'letterSpacing'
  | 'lineSpacing'
  | 'xMm'
  | 'yMm'

interface NumericDef {
  key: NumericTextKey
  label: string
  unit: string
  min: string
  max: string
  step: string
  hint?: string
}

/** SRC-04: cỡ chữ, cao chữ, rộng đế, dày đế, bo viền đế, uốn cong, giãn chữ, giãn dòng. */
const NUMERIC: readonly NumericDef[] = [
  {
    key: 'sizeMm',
    label: 'Cỡ chữ',
    unit: 'mm',
    min: '2',
    max: '120',
    step: '0,1',
    hint: 'Cỡ chữ là em-size, không phải chiều cao nét nhìn thấy. 1 pt = 25,4/72 mm.',
  },
  { key: 'heightLayers', label: 'Cao chữ', unit: 'lớp', min: '1', max: '80', step: '1' },
  { key: 'baseWidthMm', label: 'Rộng đế chữ', unit: 'mm', min: '0', max: '40', step: '0,1' },
  { key: 'baseThicknessLayers', label: 'Dày đế chữ', unit: 'lớp', min: '1', max: '60', step: '1' },
  { key: 'baseRadiusMm', label: 'Bo viền đế', unit: 'mm', min: '0', max: '20', step: '0,1' },
  { key: 'bend', label: 'Uốn cong', unit: '°', min: '-180', max: '180', step: '1' },
  { key: 'letterSpacing', label: 'Giãn chữ', unit: 'mm', min: '-5', max: '20', step: '0,05' },
  { key: 'lineSpacing', label: 'Giãn dòng', unit: '×', min: '0,5', max: '4', step: '0,05' },
]

export interface TextControlsProps {
  /** 'panel' is the source section, 'popup' is the 3D block popup. */
  place: 'panel' | 'popup'
}

export function TextControls({ place }: TextControlsProps) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const gate = useProjectGate()
  const text = snapshot.project.text
  const readOnly = snapshot.capabilities.find((cap) => cap.id === 'project.write')
  /**
   * With no document open, `project.text` is the core's own default — not this
   * user's typing — and every commit would come back PROJECT_REQUIRED. The gate
   * is stated before the field is touched, not after a round trip.
   */
  const writeBlocked =
    gate.reason ??
    (readOnly && !readOnly.available ? (readOnly.reason ?? 'Dự án đang ở chế độ chỉ đọc.') : null)

  const [draftText, setDraftText] = useState(text.text)
  const [fontQuery, setFontQuery] = useState('')
  const [fonts, setFonts] = useState<FontEntry[]>([])
  const [fontError, setFontError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState({ shape: true, base: true })

  useEffect(() => {
    setDraftText(text.text)
  }, [text.text])

  useEffect(() => {
    let cancelled = false
    void bridge
      .queryFonts(fontQuery)
      .then((entries) => {
        if (!cancelled) {
          setFonts(entries)
          setFontError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setFontError(error instanceof Error ? error.message : 'Không đọc được danh mục font.')
      })
    return () => {
      cancelled = true
    }
  }, [bridge, fontQuery])

  const update = async (values: Partial<TextView>): Promise<CommitResult> => {
    const result = await run({ type: 'text.update', values }, { toastOnError: false })
    return result.ok ? { ok: true } : { ok: false, message: result.diagnostic.message }
  }

  const commitNumeric = (key: NumericTextKey) => async (raw: string) =>
    update({ [key]: raw } as Partial<TextView>)

  const remove = useAsyncAction(async () => {
    await run(
      { type: 'text.remove' },
      { success: 'Đã bỏ khối chữ. Dùng Hoàn tác nếu cần lấy lại.' },
    )
  })

  const fontOptions = useMemo(
    () =>
      fonts.map((font) => ({
        value: font.id,
        label: `${font.family} · ${font.style}`,
      })),
    [fonts],
  )

  const selectedKnown = fonts.some((font) => font.id === text.fontId)
  const idPrefix = `text-${place}`

  return (
    <div className="stack">
      {/* Pinned preview (SRC-04). It is the only sticky element in the body. */}
      <div className="panel__sticky" data-role="text-preview">
        <div className="row">
          <strong className="grow" style={{ minInlineSize: 0, overflowWrap: 'anywhere' }}>
            {text.text.trim() === '' ? (
              <span className="muted">Chưa có chữ</span>
            ) : (
              text.text
            )}
          </strong>
          <span className="chip chip--muted fc-border">{text.fontId || 'chưa chọn font'}</span>
        </div>
        <p className="muted-3" style={{ margin: '4px 0 0' }}>
          Xem trước là bản dựng chữ do nhân trả về; đây không phải kết quả kiểm mesh.
        </p>
      </div>

      <TextField
        inputId={`${idPrefix}-value`}
        label="Nội dung chữ"
        value={draftText}
        multiline
        rows={2}
        maxLength={500}
        hint="Tối đa 500 cụm ký tự Unicode. Chuỗi được giữ nguyên, không cắt đuôi ngầm."
        disabledReason={writeBlocked}
        onChange={setDraftText}
        onCommit={async (raw) => update({ text: raw })}
      />

      <div className="stack">
        <TextField
          inputId={`${idPrefix}-font-q`}
          label="Tìm font"
          type="search"
          value={fontQuery}
          placeholder="Tên họ hoặc kiểu chữ"
          onChange={setFontQuery}
          hint="Chỉ font đang chọn được nạp. Danh mục lấy từ nhân."
          {...(fontError ? { error: fontError } : {})}
        />
        <SelectField
          inputId={`${idPrefix}-font`}
          label="Font"
          value={selectedKnown ? text.fontId : ''}
          options={[
            ...(selectedKnown
              ? []
              : [{ value: '', label: `${text.fontId || 'chưa chọn'} — ngoài kết quả tìm` }]),
            ...fontOptions,
          ]}
          disabledReason={writeBlocked}
          onChange={(value) => {
            if (value) void update({ fontId: value })
          }}
        />
      </div>

      <CollapsibleGroup
        title="Khối chữ"
        color="var(--sec-source)"
        open={openGroups.shape}
        onToggle={() => setOpenGroups((value) => ({ ...value, shape: !value.shape }))}
        count={`${NUMERIC.length} thông số`}
      >
        {/* SRC-04 / UI-C13: the size carries a unit, and the value shown next to
            it is the one the core computed — the interface converts nothing. */}
        <SelectField
          inputId={`${idPrefix}-sizeunit`}
          label="Đơn vị cỡ chữ"
          value={text.sizeUnit}
          options={[
            { value: 'mm', label: 'Milimet (mm)' },
            { value: 'pt', label: 'Point (pt)' },
          ]}
          disabledReason={writeBlocked}
          hint={`Nhân đang hiển thị cỡ chữ là ${text.sizeDisplay || '—'} ${text.sizeUnit}. 1 pt = 25,4/72 mm; giao diện không tự quy đổi.`}
          onChange={(value) => {
            if (value === 'mm' || value === 'pt') void update({ sizeUnit: value })
          }}
        />
        {NUMERIC.map((def) => (
          <NumberField
            key={def.key}
            inputId={`${idPrefix}-${def.key}`}
            label={def.label}
            unit={def.unit}
            min={def.min}
            max={def.max}
            step={def.step}
            {...(def.hint ? { hint: def.hint } : {})}
            value={text[def.key]}
            disabledReason={writeBlocked}
            onCommit={commitNumeric(def.key)}
          />
        ))}
        <p className="muted-3" style={{ margin: 0 }}>
          Các chiều cao tính theo lớp. Số mm tương ứng do nhân suy ra từ lịch lớp Z; giao diện
          không tự nhân số lớp với một chiều cao lớp giả định.
        </p>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Đế và mép"
        color="var(--sec-source)"
        open={openGroups.base}
        onToggle={() => setOpenGroups((value) => ({ ...value, base: !value.base }))}
        count="2 công tắc"
      >
        {/* Two switches, independent of each other and of the body top bevel. */}
        <CheckField
          inputId={`${idPrefix}-base`}
          label="Có đế đỡ chữ"
          checked={text.baseEnabled}
          disabledReason={writeBlocked}
          onChange={(checked) => void update({ baseEnabled: checked })}
        />
        <CheckField
          inputId={`${idPrefix}-bevel`}
          label="Bo mép chữ và đế"
          hint="Độc lập với bo mép trên của thân sản phẩm."
          checked={text.bevelEnabled}
          disabledReason={writeBlocked}
          onChange={(checked) => void update({ bevelEnabled: checked })}
        />
      </CollapsibleGroup>

      <div className="stack">
        <strong style={{ fontSize: 'var(--fs-label)' }}>Chỗ đứng của khối chữ</strong>
        {/* UI-C16 / UI-06: every drag gesture has a numeric equivalent, so the
            block can be placed from the keyboard alone. */}
        <div className="row">
          <NumberField
            inputId={`${idPrefix}-x`}
            label="Vị trí X"
            unit="mm"
            slider={false}
            value={text.xMm}
            disabledReason={writeBlocked}
            hint="Ô số thay cho Shift+kéo. Nhân xử lý cả số và cử chỉ."
            onCommit={commitNumeric('xMm')}
          />
          <NumberField
            inputId={`${idPrefix}-y`}
            label="Vị trí Y"
            unit="mm"
            slider={false}
            value={text.yMm}
            disabledReason={writeBlocked}
            onCommit={commitNumeric('yMm')}
          />
        </div>

        <SelectField
          inputId={`${idPrefix}-placement`}
          label="Cách đặt khối chữ"
          value={text.placement}
          options={[
            { value: 'on-model', label: 'Trên mô hình' },
            { value: 'beside', label: 'Bên cạnh mô hình' },
          ]}
          disabledReason={writeBlocked}
          onChange={(value) => {
            if (value === 'on-model' || value === 'beside') void update({ placement: value })
          }}
        />

        <CheckField
          inputId={`${idPrefix}-assource`}
          label="Dùng chữ làm hình"
          hint="Tạo nguồn thiết kế từ khối chữ. Thay bằng ảnh sau này là một lệnh có hoàn tác."
          checked={text.asSource}
          disabledReason={writeBlocked}
          onChange={(checked) => void update({ asSource: checked })}
        />
        <div className="row">
          <Button
            icon="trash"
            variant="danger"
            disabled={remove.pending}
            disabledReason={writeBlocked ?? (text.text.trim() === '' ? 'Chưa có khối chữ để bỏ.' : null)}
            onClick={() => {
              void remove.run()
              actions.announce('Đã gửi lệnh bỏ chữ.')
            }}
          >
            Bỏ chữ
          </Button>
          <span className="muted-3">Gỡ chữ và đế chữ; hoàn tác được.</span>
        </div>
      </div>
    </div>
  )
}
