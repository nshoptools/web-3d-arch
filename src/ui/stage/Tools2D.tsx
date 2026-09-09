import { useRef, useState, type KeyboardEvent } from 'react'
import type { Json } from '../../contracts/app-bridge.ts'
import { useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { MQ_MOBILE, useMediaQuery } from '../core/useMediaQuery.ts'
import {
  CAP,
  EDITOR_SETTING,
  TOOLS_2D,
  TOOLS_WITH_COLOUR,
  TOOLS_WITH_CUT_MODE,
} from '../core/registry.ts'
import { materialName } from '../core/names.ts'
import { sourceNextStep } from '../core/project-state.ts'
import { Button } from '../components/Button.tsx'
import { CheckField, NumberField, SelectField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { Icon } from '../components/Icon.tsx'
import { Tooltip } from '../components/Tooltip.tsx'
import { formatNumber } from '../core/text.ts'
import { zoomLabel } from './canvas-math.ts'
import { ConvertSource } from './SourceCanvas.tsx'
import { useSourceCanvas } from './source-canvas-state.tsx'

/** Tools whose gesture is a dragged chain, so the published width applies. */
const TOOLS_WITH_WIDTH = ['line', 'curve', 'erase', 'cut'] as const

/**
 * The seven step-1 tools (EDT-01) and the options of the tool in hand.
 *
 * Every editor value shown here comes back from `AppSnapshot.editor` (UI-C05).
 * The crop shape, the kept side and the square lock are *not* editor settings:
 * contract 0.3 carries them on the gesture itself, so they are interface state
 * that travels with the next `editSource` and nothing is invented in
 * `editor.settings` to hold them.
 *
 * The band is one column at the top-right of the frame: the tool bar, then the
 * options card of the active tool, then undo/redo. The zoom and comparison
 * controls of the frame live in the corner (see CanvasControls); the
 * pointer-free route — coordinates typed by hand — is a folded group at the
 * end of the options card, so it never costs the drawing surface a row until
 * it is wanted.
 */
export function Tools2D() {
  const snapshot = useSnapshot()
  const run = useRunCommand()
  const actions = useUiActions()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason
  const listRef = useRef<HTMLDivElement>(null)
  const { state } = useUi()
  const mobile = useMediaQuery(MQ_MOBILE)
  const editor = snapshot.editor
  const selected = editor.tool
  const canvas = snapshot.project.sourceCanvas
  const readOnly = canvas !== null && !canvas.editable
  // An editable raster whose colour regions are not separated yet can be
  // painted on but not built; the step that changes that is offered here too.
  const nextStep = sourceNextStep(snapshot.project)
  /**
   * The option card floats over the drawing surface. On a 320 px viewport it
   * would cover most of it, so below 720 px it starts folded and the canvas
   * stays usable; the choice is remembered once the user makes it.
   */
  const detailOpen = isGroupOpen(state, 'stage-tools-detail', !mobile)

  const selectTool = (id: (typeof TOOLS_2D)[number]['id']) => {
    const tool = TOOLS_2D.find((item) => item.id === id)
    void run({ type: 'editor.tool', tool: id }, { announce: `Đã chọn công cụ ${tool?.label ?? id}.` })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    // Selection follows focus, as the radiogroup pattern requires.
    const moveTo = (target: number) => {
      event.preventDefault()
      buttons?.[target]?.focus()
      const tool = TOOLS_2D[target]
      if (tool && !writeBlocked && tool.id !== selected) selectTool(tool.id)
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') moveTo((index + 1) % TOOLS_2D.length)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') moveTo((index - 1 + TOOLS_2D.length) % TOOLS_2D.length)
    else if (event.key === 'Home') moveTo(0)
    else if (event.key === 'End') moveTo(TOOLS_2D.length - 1)
  }

  const activeTool = TOOLS_2D.find((tool) => tool.id === selected)
  const showColour = TOOLS_WITH_COLOUR.includes(selected)
  const showCutMode = TOOLS_WITH_CUT_MODE.includes(selected)
  const showWidth = (TOOLS_WITH_WIDTH as readonly string[]).includes(selected)
  const palette = snapshot.project.materials.filter((material) => material.product?.active !== false).slice(0, 8)

  const setSetting = (values: Record<string, Json>) => {
    void run({ type: 'editor.settings', values })
  }

  const commitSetting = async (key: string, raw: string) => {
    const result = await run(
      { type: 'editor.settings', values: { [key]: raw } },
      { toastOnError: false },
    )
    return result.ok ? { ok: true } : { ok: false, message: result.diagnostic.message }
  }

  return (
    // A percentage max-inline-size resolves against an indefinite containing
    // block here, i.e. it does not constrain at all; the cap has to be an
    // absolute length that still shrinks on a narrow viewport.
    <div className="stack tools2d" style={{ maxInlineSize: 'min(320px, calc(100vw - 40px))' }}>
      <div
        ref={listRef}
        className="toolbar fc-border"
        role="radiogroup"
        aria-label="Bảy công cụ sửa vùng 2D"
      >
        {TOOLS_2D.map((tool, index) => {
          const isSelected = selected === tool.id
          return (
            // UI-05: the bubble has to appear on keyboard focus as well, which a
            // native `title` never does.
            <Tooltip key={tool.id} text={`${tool.label} (${tool.key}) — ${tool.behaviour}`}>
              <button
                type="button"
                role="radio"
                id={`w3a-tool-${tool.id}`}
                className="tool"
                aria-checked={isSelected}
                aria-keyshortcuts={tool.key}
                aria-disabled={writeBlocked ? true : undefined}
                tabIndex={isSelected ? 0 : -1}
                onKeyDown={(event) => onKeyDown(event, index)}
                onClick={() => {
                  if (writeBlocked) {
                    actions.announce(writeBlocked)
                    actions.toast('warning', writeBlocked)
                    return
                  }
                  selectTool(tool.id)
                }}
              >
                <Icon name={tool.icon} size={17} />
                <span className="u-visually-hidden">
                  {tool.label} — phím {tool.key}
                </span>
                <span aria-hidden="true" style={{ fontSize: 10 }}>
                  {tool.key}
                </span>
              </button>
            </Tooltip>
          )
        })}
        <button
          type="button"
          className="btn btn--small btn--ghost fc-border"
          aria-expanded={detailOpen}
          aria-controls="w3a-tools-detail"
          aria-label={detailOpen ? 'Thu gọn tùy chọn công cụ' : 'Mở tùy chọn công cụ'}
          title={detailOpen ? 'Thu gọn tùy chọn công cụ' : 'Mở tùy chọn công cụ'}
          onClick={() => actions.setGroupOpen('stage-tools-detail', !detailOpen)}
        >
          <Icon name={detailOpen ? 'chevronUp' : 'chevronDown'} size={14} />
        </button>
      </div>

      <div id="w3a-tools-detail" hidden={!detailOpen} className="stack">
        {activeTool ? (
          <div className="card card--glass fc-border tools2d__options" style={{ padding: 8, gap: 6 }}>
            <div className="row">
              <strong className="grow" style={{ fontSize: 'var(--fs-label)' }}>
                {activeTool.label}
                <span className="muted-3"> · phím {activeTool.key}</span>
              </strong>
            </div>
            <p className="muted-3" style={{ margin: 0 }}>
              {activeTool.behaviour}
              {activeTool.localKeys ? ` ${activeTool.localKeys}.` : ''}
            </p>

            {readOnly || nextStep !== null ? (
              // The source is a picture that cannot be painted on yet, or one
              // whose regions are not separated yet. The one control that
              // changes that stays here, next to the tools it unlocks; the
              // core's own reason is the button's description.
              <div
                className="stack"
                data-read-only-source={readOnly ? 'true' : 'false'}
                data-source-next-step={nextStep?.kind ?? 'none'}
                style={{ gap: 4 }}
              >
                <span className="chip chip--warn fc-border">
                  {readOnly ? 'Chỉ xem — chưa sửa được nguồn này' : 'Chưa tách vùng màu — chưa dựng được'}
                </span>
                <ConvertSource compact reason={readOnly ? (canvas?.reason ?? null) : null} />
              </div>
            ) : null}

            {showColour ? (
              <div className="row" role="group" aria-label="Dãy màu dùng cho công cụ">
                {palette.map((material) => {
                  const active = editor.colorMaterialId === material.id
                  return (
                    <button
                      key={material.id}
                      type="button"
                      className="swatch fc-border"
                      aria-pressed={active}
                      aria-disabled={writeBlocked ? true : undefined}
                      aria-label={`Dùng màu ${materialName(material)} ${material.color}`}
                      title={`${materialName(material)} · ${material.color}`}
                      style={{
                        background: material.color,
                        outline: active ? '2px solid var(--accent)' : undefined,
                        outlineOffset: '2px',
                      }}
                      onClick={() => {
                        // The colour sequence writes to the project, so it obeys
                        // project.write like every other write control.
                        if (writeBlocked) {
                          actions.announce(writeBlocked)
                          return
                        }
                        setSetting({ [EDITOR_SETTING.colorMaterialId]: material.id })
                      }}
                    />
                  )
                })}
                {palette.length === 0 ? (
                  <span className="muted-3">Chưa có vùng màu để chọn.</span>
                ) : null}
              </div>
            ) : null}

            {showCutMode ? (
              <SelectField
                label="Chế độ chung của Xóa, Đường cắt và Khung cắt"
                value={editor.cutMode}
                options={[
                  { value: 'merge', label: 'Gộp màu' },
                  { value: 'hole', label: 'Cắt thủng' },
                ]}
                disabledReason={writeBlocked}
                onChange={(value) => {
                  setSetting({ [EDITOR_SETTING.cutMode]: value === 'hole' ? 'hole' : 'merge' })
                }}
              />
            ) : null}

            {showWidth ? (
              <NumberField
                inputId="w3a-stroke-width"
                label="Bề rộng nét"
                unit="px"
                min="1"
                max="60"
                step="1"
                value={editor.strokeWidthPx}
                disabledReason={writeBlocked}
                hint="Pixel của ảnh nguồn, không đổi theo mức phóng."
                onCommit={(raw) => commitSetting(EDITOR_SETTING.strokeWidthPx, raw)}
              />
            ) : null}

            {selected === 'crop' ? <CropOptions disabledReason={writeBlocked} /> : null}

            {showColour && editor.colorMaterialId === null && !readOnly ? (
              <span className="reason">
                {palette.length === 0
                  ? 'Nguồn này chưa có vùng màu, nên công cụ chưa gửi được.'
                  : 'Chọn một ô màu ở trên trước khi vẽ.'}
              </span>
            ) : null}

            {selected === 'heal' ? (
              <>
                <CheckField
                  inputId="w3a-heal-auto"
                  label="Lấy màu tự động theo vùng bao"
                  checked={editor.healAuto}
                  disabledReason={writeBlocked}
                  hint="Nhân bỏ phiếu theo màu của các pixel bao quanh lỗ; không có màu bao thì nhân từ chối và giữ nguyên ảnh."
                  onChange={(checked) => {
                    setSetting({ [EDITOR_SETTING.healAuto]: checked })
                  }}
                />
                <CheckField
                  inputId="w3a-heal-allgaps"
                  label="Vá mọi khe hẹp dưới ngưỡng"
                  checked={editor.healAllGaps}
                  disabledReason={writeBlocked}
                  hint="Quét toàn ảnh, nên có thể nối cả khoảng cách cố ý giữa hai vật thể tách rời."
                  onChange={(checked) => {
                    setSetting({ [EDITOR_SETTING.healAllGaps]: checked })
                  }}
                />
                <NumberField
                  inputId="w3a-heal-threshold"
                  label="Ngưỡng khe hẹp"
                  unit="mm"
                  min="0"
                  step="0,01"
                  slider={false}
                  value={editor.healThresholdMm}
                  disabledReason={
                    writeBlocked ??
                    (editor.healAllGaps ? null : 'Bật “Vá mọi khe hẹp” trước khi đặt ngưỡng.')
                  }
                  hint={healThresholdHint(snapshot.project.sourceCanvas?.pixelSizeMm, editor.healThresholdMm)}
                  onCommit={(raw) => commitSetting(EDITOR_SETTING.healThresholdMm, raw)}
                />
              </>
            ) : null}

            <PointerFreeControls disabledReason={writeBlocked} />
          </div>
        ) : null}
      </div>

      <div className="row">
        <Button
          size="small"
          icon="undo"
          keyHint="Z"
          disabledReason={snapshot.project.canUndo ? null : 'Không còn bước nào để hoàn tác.'}
          reasonHidden
          onClick={() => void run({ type: 'history.undo' })}
        >
          Hoàn tác ({snapshot.project.history.undoCount})
        </Button>
        <Button
          size="small"
          icon="redo"
          disabledReason={snapshot.project.canRedo ? null : 'Không còn bước nào để làm lại.'}
          reasonHidden
          onClick={() => void run({ type: 'history.redo' })}
        >
          Làm lại ({snapshot.project.history.redoCount})
        </Button>
      </div>
      {snapshot.project.history.truncated ? (
        <span className="reason">
          Nhân đã rút ngắn lịch sử của dự án này, nên số bước hoàn tác ở trên không phải toàn bộ
          lịch sử từ đầu.
        </span>
      ) : null}
    </div>
  )
}

/**
 * The design threshold of "vá mọi khe hẹp" is a length in millimetres. Only the
 * core turns it into whole pixels (ADR-001 `gapFromDesign`); this hint states
 * the pixel pitch it will be resolved against instead of doing the arithmetic
 * and presenting it as a decided value.
 */
function healThresholdHint(pixelSizeMm: number | undefined, value: string): string {
  const base = 'Theo đơn vị thiết kế, không theo mức phóng.'
  if (pixelSizeMm === undefined || !Number.isFinite(pixelSizeMm) || pixelSizeMm <= 0) {
    return `${base} Nhân chưa công bố bước pixel của ảnh nguồn.`
  }
  const parsed = Number(value.replace(',', '.'))
  const resolved =
    Number.isFinite(parsed) && parsed > 0
      ? ` Bước ảnh ${formatNumber(pixelSizeMm, 4)} mm/px; nhân quy về số pixel nguyên và công bố lại.`
      : ''
  return `${base}${resolved}`
}

/**
 * Crop options travel on the gesture (`cropShape`, `cropKeep`, `square`), so
 * they live here as interface state and are labelled as such.
 */
function CropOptions({ disabledReason }: { disabledReason: string | null }) {
  const api = useSourceCanvas()
  return (
    <>
      <SelectField
        inputId="w3a-crop-shape"
        label="Hình khung cắt"
        value={api.cropShape}
        options={[
          { value: 'rectangle', label: 'Chữ nhật' },
          { value: 'ellipse', label: 'Elip' },
        ]}
        disabledReason={disabledReason}
        onChange={(value) => api.setCropShape(value === 'ellipse' ? 'ellipse' : 'rectangle')}
      />
      <SelectField
        inputId="w3a-crop-keep"
        label="Giữ phần nào"
        value={api.cropKeep}
        options={[
          { value: 'inside', label: 'Giữ phần trong khung' },
          { value: 'outside', label: 'Giữ phần ngoài khung' },
        ]}
        disabledReason={disabledReason}
        onChange={(value) => api.setCropKeep(value === 'outside' ? 'outside' : 'inside')}
      />
      <CheckField
        inputId="w3a-crop-square"
        label="Khóa vuông / tròn"
        checked={api.squareLock}
        disabledReason={disabledReason}
        hint="Tương đương giữ Shift khi kéo."
        onChange={api.setSquareLock}
      />
    </>
  )
}

/**
 * Zoom, fit and the comparison switch of the source frame. Drawn in the corner
 * of the frame at step 1, the way a map keeps its zoom control: small, always
 * in the same place, never in the way of the picture.
 */
export function CanvasControls() {
  const api = useSourceCanvas()
  return (
    <div className="toolbar fc-border canvas-controls" role="group" aria-label="Khung ảnh nguồn">
      <Button size="small" icon="minus" iconOnly aria-label="Thu nhỏ" title="Thu nhỏ (−)" onClick={() => api.zoomBy(1 / 1.25)} />
      <span className="chip chip--muted fc-border" aria-live="off" title="Mức phóng">
        {zoomLabel(api.view.scale)}
      </span>
      <Button size="small" icon="plus" iconOnly aria-label="Phóng to" title="Phóng to (+)" onClick={() => api.zoomBy(1.25)} />
      <Button size="small" icon="fit" title="Vừa khung (0)" onClick={() => api.fit()}>
        Vừa khung
      </Button>
      <Button size="small" title="Xem ở đúng kích thước pixel" onClick={() => api.zoomTo(1)}>
        100%
      </Button>
      <SelectField
        inputId="w3a-canvas-compare"
        label="Ảnh đang xem"
        labelHidden
        value={api.compare}
        options={[
          { value: 'current', label: 'Bản hiện tại' },
          { value: 'original', label: 'Bản trước khi sửa' },
        ]}
        hint={undefined}
        onChange={(value) => api.setCompare(value === 'original' ? 'original' : 'current')}
      />
    </div>
  )
}

/**
 * The pointer-free route to a gesture: coordinates typed by hand and the
 * frame moved by buttons. Folded by default and reachable by keyboard from the
 * tool options, because one fold is the price of keeping the picture visible
 * and a person who cannot use a pointer still gets the whole route.
 */
function PointerFreeControls({ disabledReason }: { disabledReason: string | null }) {
  const api = useSourceCanvas()
  const { state } = useUi()
  const actions = useUiActions()
  const snapshot = useSnapshot()
  const snapshotRevision = snapshot.project.revision
  const open = isGroupOpen(state, 'stage-pointer-free', false)
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const draft = api.draft
  const blocked = api.blockedReason ?? disabledReason

  const parse = (raw: string): number | null => {
    const value = Number(raw.replace(',', '.').trim())
    return Number.isFinite(value) ? value : null
  }
  const parsedX = parse(x)
  const parsedY = parse(y)
  const coordinateReady = parsedX !== null && parsedY !== null

  const addPoint = () => {
    if (parsedX === null || parsedY === null) return
    const point = { x: parsedX, y: parsedY }
    if (!draft) api.startDraft({ point, pointerId: null, snap: false, square: api.squareLock })
    else if (draft.capture === 'knots') api.addKnot(point)
    else api.appendPoint(point)
  }

  return (
    <CollapsibleGroup
      title="Không dùng con trỏ"
      open={open}
      onToggle={() => actions.setGroupOpen('stage-pointer-free', !open)}
      count={draft ? `${draft.points.length} điểm` : undefined}
    >
      <p className="muted-3" style={{ margin: 0 }}>
        Tọa độ theo pixel của ảnh nguồn, gốc ở góc trên bên trái. Mũi tên trên khung ảnh cũng dời
        khung khi khung có focus.
      </p>
      <div className="row" role="group" aria-label="Dời khung ảnh nguồn">
        <Button size="small" aria-label="Dời sang trái" onClick={() => api.panBy(64, 0)}>
          ←
        </Button>
        <Button size="small" aria-label="Dời sang phải" onClick={() => api.panBy(-64, 0)}>
          →
        </Button>
        <Button size="small" aria-label="Dời lên" onClick={() => api.panBy(0, 64)}>
          ↑
        </Button>
        <Button size="small" aria-label="Dời xuống" onClick={() => api.panBy(0, -64)}>
          ↓
        </Button>
      </div>

      {draft ? (
        <div className="stack" role="status" data-draft-stale={api.stale ? 'true' : 'false'}>
          <span className="chip chip--warn fc-border">
            {draft.rejected ? 'Nét bị từ chối, vẫn giữ' : 'Đang vẽ'}: {draft.points.length} điểm
            {draft.snap === '45' ? ' · bám 45°' : ''}
            {draft.square ? ' · vuông' : ''}
          </span>
          {draft.rejected ? (
            <span className="reason">
              Nhân đã từ chối lần gửi trước; các điểm được giữ nguyên. Gửi lần nữa là bạn đồng ý áp
              chúng theo màu và chế độ đang chọn.
            </span>
          ) : null}
          {api.stale ? (
            <span className="reason">
              Dự án đã sang bản {snapshotRevision} (nét này chụp bản {draft.projectRevision}) hoặc
              ảnh nguồn đã đổi; nhân sẽ từ chối nét cũ. Hủy và vẽ lại trên ảnh hiện tại.
            </span>
          ) : null}
          <div className="row">
            <Button
              size="small"
              variant="primary"
              icon="check"
              disabled={api.sending}
              disabledReason={
                api.submitBlockedReason ??
                (api.stale ? 'Nét này chụp một bản cũ của dự án hoặc ảnh nguồn. Hủy và vẽ lại.' : null)
              }
              onClick={() => void api.submitDraft()}
            >
              Kết thúc và gửi
            </Button>
            <Button
              size="small"
              icon="undo"
              disabledReason={draft.capture === 'knots' ? null : 'Chỉ đường cong bỏ được nút cuối.'}
              reasonHidden
              onClick={() => api.removeLastKnot()}
            >
              Bỏ điểm cuối
            </Button>
            <Button size="small" variant="danger" icon="cancel" onClick={() => api.cancelDraft()}>
              Hủy
            </Button>
          </div>
        </div>
      ) : null}

      <div className="row">
        <NumberField
          inputId="w3a-canvas-x"
          label="X (px ảnh)"
          value={x}
          slider={false}
          disabledReason={blocked}
          onCommit={(raw) => {
            setX(raw)
            return { ok: true }
          }}
        />
        <NumberField
          inputId="w3a-canvas-y"
          label="Y (px ảnh)"
          value={y}
          slider={false}
          disabledReason={blocked}
          onCommit={(raw) => {
            setY(raw)
            return { ok: true }
          }}
        />
      </div>
      <div className="row">
        <Button
          size="small"
          icon="plus"
          disabledReason={blocked ?? (coordinateReady ? null : 'Nhập cả X và Y trước.')}
          reasonHidden
          onClick={addPoint}
        >
          Thêm điểm
        </Button>
        <Button
          size="small"
          variant="primary"
          icon="check"
          disabled={api.sending}
          disabledReason={
            draft
              ? (api.submitBlockedReason ??
                (api.stale ? 'Nét này chụp một bản cũ; hủy và vẽ lại.' : null))
              : 'Thêm ít nhất một điểm trước khi áp dụng.'
          }
          reasonHidden
          onClick={() => void api.submitDraft()}
        >
          Áp dụng thao tác
        </Button>
      </div>
      {api.lastSent ? (
        <span className="muted-3" data-last-gesture={api.lastSent.id}>
          Đã gửi cử chỉ {api.lastSent.tool} ({api.lastSent.points} điểm).
        </span>
      ) : null}
      {blocked ? <span className="reason">{blocked}</span> : null}
    </CollapsibleGroup>
  )
}
