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
import { Button } from '../components/Button.tsx'
import { CheckField, NumberField, SelectField } from '../components/Fields.tsx'
import { Icon } from '../components/Icon.tsx'
import { Tooltip } from '../components/Tooltip.tsx'
import { formatNumber } from '../core/text.ts'
import { zoomLabel } from './canvas-math.ts'
import { useSourceCanvas } from './source-canvas-state.tsx'

/** Tools whose gesture is a dragged chain, so the published width applies. */
const TOOLS_WITH_WIDTH = ['line', 'curve', 'erase', 'cut'] as const

/**
 * The seven step-1 tools (EDT-01) and the controls of the 2D source canvas.
 *
 * Every editor value shown here comes back from `AppSnapshot.editor` (UI-C05).
 * The crop shape, the kept side and the square lock are *not* editor settings:
 * contract 0.3 carries them on the gesture itself, so they are interface state
 * that travels with the next `editSource` and nothing is invented in
 * `editor.settings` to hold them.
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
  /**
   * The option cards float over the drawing surface. On a 320 px viewport they
   * would cover most of it, so below 720 px they start folded and the canvas
   * stays usable; the choice is remembered once the user makes it.
   */
  const detailOpen = isGroupOpen(state, 'stage-tools-detail', !mobile)
  /**
   * The two bands the stage bar owns. The canvas controls — zoom, pan, compare
   * and the pointer-free coordinate entry — are a *sibling* of the tool options,
   * not a child of them: they are the only keyboard route to a gesture, and
   * burying them under the tool card removed that route entirely at 320 px.
   */
  const toolsOpen = isGroupOpen(state, 'stage-tools', true)
  const canvasControlsOpen = isGroupOpen(state, 'stage-canvas-controls', !mobile)

  const selectTool = (id: (typeof TOOLS_2D)[number]['id']) => {
    void run({ type: 'editor.tool', tool: id }, { announce: `Đã chọn công cụ ${id}.` })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    // Selection follows focus, as the radiogroup pattern requires.
    const move = (delta: number) => {
      event.preventDefault()
      const next = (index + delta + TOOLS_2D.length) % TOOLS_2D.length
      buttons?.[next]?.focus()
      const tool = TOOLS_2D[next]
      if (tool && !writeBlocked && tool.id !== selected) selectTool(tool.id)
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(-1)
    else if (event.key === 'Home') moveTo(0)
    else if (event.key === 'End') moveTo(TOOLS_2D.length - 1)

    function moveTo(target: number) {
      event.preventDefault()
      buttons?.[target]?.focus()
      const tool = TOOLS_2D[target]
      if (tool && !writeBlocked && tool.id !== selected) selectTool(tool.id)
    }
  }

  const activeTool = TOOLS_2D.find((tool) => tool.id === selected)
  const showColour = TOOLS_WITH_COLOUR.includes(selected)
  const showCutMode = TOOLS_WITH_CUT_MODE.includes(selected)
  const showWidth = (TOOLS_WITH_WIDTH as readonly string[]).includes(selected)

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
    <div className="stack" style={{ maxInlineSize: 'min(340px, calc(100vw - 40px))' }}>
      <div id="w3a-stage-tools" className="stack" hidden={!toolsOpen}>
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
      </div>

      <button
        type="button"
        className="btn btn--small btn--ghost fc-border"
        aria-expanded={detailOpen}
        aria-controls="w3a-tools-detail"
        onClick={() => actions.setGroupOpen('stage-tools-detail', !detailOpen)}
      >
        {detailOpen ? '▾' : '▸'} Tùy chọn công cụ và khung ảnh
      </button>

      <div id="w3a-tools-detail" hidden={!detailOpen} className="stack">
      {activeTool ? (
        <div className="card card--glass fc-border" style={{ padding: 8, gap: 6 }}>
          <strong style={{ fontSize: 'var(--fs-label)' }}>{activeTool.label}</strong>
          <p className="muted-3" style={{ margin: 0 }}>
            {activeTool.behaviour}
          </p>
          {activeTool.localKeys ? (
            <p className="muted-3" style={{ margin: 0 }}>
              Phím cục bộ: {activeTool.localKeys}
            </p>
          ) : null}

          {showColour ? (
            <div className="row" role="group" aria-label="Dãy màu dùng cho công cụ">
              {snapshot.project.materials.slice(0, 8).map((material) => {
                const active = editor.colorMaterialId === material.id
                return (
                  <button
                    key={material.id}
                    type="button"
                    className="swatch fc-border"
                    aria-pressed={active}
                    aria-disabled={writeBlocked ? true : undefined}
                    aria-label={`Dùng màu ${material.label} ${material.color}`}
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
              {snapshot.project.materials.length === 0 ? (
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
              hint="Bề rộng tính bằng pixel của ảnh nguồn, không đổi theo mức phóng khung xem."
              onCommit={(raw) => commitSetting(EDITOR_SETTING.strokeWidthPx, raw)}
            />
          ) : null}

          {selected === 'crop' ? <CropOptions disabledReason={writeBlocked} /> : null}

          {showColour && editor.colorMaterialId === null ? (
            <span className="reason">
              {snapshot.project.materials.length === 0
                ? 'Nhân chưa công bố vùng màu nào cho nguồn này, nên công cụ này chưa gửi được.'
                : 'Chọn một ô màu ở trên trước: nhân từ chối nét của công cụ này khi chưa có màu vật liệu.'}
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
                hint="Chế độ này quét toàn ảnh, nên nó có thể nối cả khoảng cách cố ý giữa hai vật thể tách rời."
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

      <div id="w3a-canvas-controls" hidden={!canvasControlsOpen}>
        <CanvasControls disabledReason={writeBlocked} />
      </div>
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
  const base = 'Ngưỡng theo đơn vị thiết kế, không theo mức phóng khung xem.'
  if (pixelSizeMm === undefined || !Number.isFinite(pixelSizeMm) || pixelSizeMm <= 0) {
    return `${base} Nhân chưa công bố bước pixel của ảnh nguồn, nên chưa quy ra được số pixel.`
  }
  const parsed = Number(value.replace(',', '.'))
  const resolved =
    Number.isFinite(parsed) && parsed > 0
      ? ` Với bước ${formatNumber(pixelSizeMm, 4)} mm/px, nhân sẽ quy ngưỡng này về số pixel nguyên và công bố lại giá trị đã dùng.`
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
        hint="Tương đương giữ Shift khi kéo. Có công tắc riêng để không bắt buộc phải giữ phím."
        onChange={api.setSquareLock}
      />
      <p className="muted-3" style={{ margin: 0 }}>
        Ba lựa chọn này đi kèm từng cử chỉ trong <code>editSource</code>; hợp đồng 0.3 không công bố
        chúng trong <code>EditorView</code> nên giao diện không gửi chúng qua <code>editor.settings</code>.
      </p>
    </>
  )
}

/** Zoom, pan, comparison and the pointer-free way to build the same gesture. */
function CanvasControls({ disabledReason }: { disabledReason: string | null }) {
  const api = useSourceCanvas()
  const snapshot = useSnapshot()
  const snapshotRevision = snapshot.project.revision
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
    <div className="card card--glass fc-border" style={{ padding: 8, gap: 6 }}>
      <strong style={{ fontSize: 'var(--fs-label)' }}>Khung ảnh nguồn</strong>

      <div className="row" role="group" aria-label="Mức phóng khung ảnh nguồn">
        <Button size="small" icon="minus" aria-label="Thu nhỏ" onClick={() => api.zoomBy(1 / 1.25)}>
          −
        </Button>
        <span className="chip chip--muted fc-border">{zoomLabel(api.view.scale)}</span>
        <Button size="small" icon="plus" aria-label="Phóng to" onClick={() => api.zoomBy(1.25)}>
          +
        </Button>
        <Button size="small" icon="fit" onClick={() => api.fit()}>
          Vừa khung
        </Button>
        <Button size="small" onClick={() => api.zoomTo(1)}>
          100%
        </Button>
      </div>
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

      <SelectField
        inputId="w3a-canvas-compare"
        label="Ảnh đang xem"
        value={api.compare}
        options={[
          { value: 'current', label: 'Bản hiện tại' },
          { value: 'original', label: 'Bản trước khi sửa' },
        ]}
        hint="“Bản trước khi sửa” là ảnh raster của bản chuyển đổi trước lần sửa đầu tiên. Đó không phải byte gốc của tệp vector hay font: bản gốc đó do nhân giữ riêng."
        onChange={(value) => api.setCompare(value === 'original' ? 'original' : 'current')}
      />

      {draft ? (
        <div className="stack" role="status" data-draft-stale={api.stale ? 'true' : 'false'}>
          <span className="chip chip--warn fc-border">
            {draft.rejected ? 'Nét bị từ chối, vẫn giữ' : 'Đang vẽ'} {draft.tool}:{' '}
            {draft.points.length} điểm
            {draft.snap === '45' ? ' · bám 45°' : ''}
            {draft.square ? ' · vuông' : ''}
          </span>
          {draft.rejected ? (
            <span className="reason">
              Nhân đã từ chối lần gửi trước. Các điểm được giữ nguyên và bản đã chụp lại; gửi lần
              nữa là bạn đồng ý áp chúng theo màu và chế độ đang chọn hiện tại.
            </span>
          ) : null}
          {api.stale ? (
            <span className="reason">
              Dự án đã sang bản {snapshotRevision} (nét này chụp bản {draft.projectRevision}) hoặc
              ảnh nguồn đã đổi. Hợp đồng 0.3 cho nhân từ chối nét cũ thay vì áp nó lên ảnh mới, nên
              hãy hủy và vẽ lại trên ảnh hiện tại.
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
                (api.stale
                  ? 'Nét này chụp một bản cũ của dự án hoặc ảnh nguồn; nhân sẽ từ chối. Hủy và vẽ lại.'
                  : null)
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
          <span className="muted-3">
            Hủy một cử chỉ chưa gửi không tạo bước hoàn tác nào: chưa có gì đi tới nhân.
          </span>
        </div>
      ) : null}

      {/* Not nested behind a second disclosure: this is the only pointer-free
          route to a gesture, and one fold (the stage bar) is already one too
          many for someone who cannot use a pointer. */}
      <div className="stack">
        <strong style={{ fontSize: 'var(--fs-label)' }}>Nhập tọa độ bằng bàn phím</strong>
        <p className="muted-3" style={{ margin: 0 }}>
          Tọa độ theo pixel của ảnh nguồn, gốc ở góc trên bên trái. Đây là đường tương đương cho
          người không dùng được con trỏ.
        </p>
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
        <div className="row">
          <Button
            size="small"
            icon="plus"
            disabledReason={blocked ?? (coordinateReady ? null : 'Nhập cả X và Y trước.')}
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
            onClick={() => void api.submitDraft()}
          >
            Áp dụng thao tác
          </Button>
        </div>
      </div>

      {api.lastSent ? (
        <span className="muted-3" data-last-gesture={api.lastSent.id}>
          Đã gửi cử chỉ {api.lastSent.tool} ({api.lastSent.points} điểm), mã {api.lastSent.id}.
        </span>
      ) : null}
      {blocked ? <span className="reason">{blocked}</span> : null}
    </div>
  )
}
