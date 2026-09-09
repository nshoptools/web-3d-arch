/**
 * The real 2D source canvas of step 1.
 *
 * It paints the image the core published in `project.sourceCanvas` — never a
 * glyph, an icon or a placeholder standing in for the user's input — and turns
 * pointer and keyboard input into exactly one `editSource` gesture, expressed in
 * source-image pixels.
 *
 * The pixel work stays in the core: this file draws the published bitmap, draws
 * a preview of the gesture being composed, and sends the finished gesture. It
 * never floods, strokes, heals or crops a pixel itself.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useUiActions } from '../core/ui-state.tsx'
import { useAsyncAction, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { CAP } from '../core/registry.ts'
import { Button } from '../components/Button.tsx'
import { TOOLS_2D } from '../core/registry.ts'
import { formatNumber } from '../core/text.ts'
import { deviceToImage, imageToDevice, zoomLabel, type Point } from './canvas-math.ts'
import { cropCorners, snappedChain, useSourceCanvas } from './source-canvas-state.tsx'

/**
 * Loads one bitmap and reports when it is ready or refused.
 *
 * `attempt` is bumped by the retry control. The address itself is never
 * rewritten — no cache-busting query is appended — because the interface must
 * ask for exactly what the core published; the demo server answers `no-store`,
 * so a retry really is a fresh request rather than a repeat of a cached answer.
 */
function useBitmap(
  url: string | undefined,
  attempt: number,
): { image: HTMLImageElement | null; failed: boolean; loading: boolean } {
  const [state, setState] = useState<{
    image: HTMLImageElement | null
    failed: boolean
    loading: boolean
  }>({ image: null, failed: false, loading: false })
  useEffect(() => {
    if (!url) {
      setState({ image: null, failed: false, loading: false })
      return
    }
    let cancelled = false
    setState((previous) => ({ ...previous, loading: true }))
    const element = new Image()
    element.decoding = 'async'
    element.addEventListener('load', () => {
      if (!cancelled) setState({ image: element, failed: false, loading: false })
    })
    element.addEventListener('error', () => {
      if (!cancelled) setState({ image: null, failed: true, loading: false })
    })
    element.src = url
    return () => {
      cancelled = true
    }
  }, [attempt, url])
  return state
}

const KNOT_RADIUS = 4
const SEED_RADIUS = 7

export function SourceCanvas() {
  const snapshot = useSnapshot()
  const actions = useUiActions()
  const api = useSourceCanvas()
  const {
    canvas: published,
    compare,
    draft,
    image,
    view,
    viewport,
    blockedReason,
    cropShape,
    cropKeep,
    squareLock,
  } = api

  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const drawPointerRef = useRef<number | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)

  const current = useBitmap(published?.currentUrl, api.imageAttempt)
  const original = useBitmap(published?.originalUrl, api.imageAttempt)
  const shown = compare === 'original' ? original : current
  const other = compare === 'original' ? current : original
  /**
   * A published address that is blank is not "no picture yet", it is a picture
   * that cannot be fetched — an image element given an empty `src` fires no
   * error at all, so it would otherwise pass for a silent success.
   */
  const blank = (url: string | undefined) => url === undefined || url.trim() === ''
  const shownUrl = compare === 'original' ? published?.originalUrl : published?.currentUrl
  const failed = published !== null && (shown.failed || blank(shownUrl))
  const targetFailed = published !== null && (current.failed || blank(published.currentUrl))
  /**
   * The other published address is a real way out only when it is a different
   * address that has actually loaded. Offering "look at the other one" when
   * both are the same byte string, or when it failed too, would send the user
   * to a second dead end.
   */
  const otherUsable =
    published !== null &&
    published.currentUrl !== published.originalUrl &&
    other.image !== null &&
    !other.failed

  /**
   * Only the view that loads the bitmap knows whether the published address was
   * readable. The shared state needs that fact to refuse a gesture aimed at a
   * picture nobody can see, and the recovery card beside the canvas needs it to
   * know which ways out are real.
   */
  const reportImageState = api.reportImageState
  useEffect(() => {
    reportImageState({ failed, targetFailed, loading: shown.loading, otherUsable })
  }, [failed, otherUsable, reportImageState, shown.loading, targetFailed])
  // Step 2 unmounts this view while the provider stays mounted, so the state is
  // handed back rather than left behind.
  useEffect(
    () => () =>
      reportImageState({ failed: false, targetFailed: false, loading: false, otherUsable: false }),
    [reportImageState],
  )

  const tool = snapshot.editor.tool
  const toolDef = TOOLS_2D.find((item) => item.id === tool)
  const strokeWidthPx = Number(String(snapshot.editor.strokeWidthPx).replace(',', '.'))

  // The listeners below outlive individual renders, so they read the current
  // api through a ref instead of re-registering on every state change.
  const apiRef = useRef(api)
  apiRef.current = api

  /* ------------------------------------------------------------- measuring */

  const setViewport = api.setViewport
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = () => {
      const box = host.getBoundingClientRect()
      setViewport({ width: Math.round(box.width), height: Math.round(box.height) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [setViewport])

  /* -------------------------------------------------------------- painting */

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const context = element.getContext('2d')
    if (!context) return
    // Device pixels for sharpness, bounded so the backing store stays inside
    // what every engine will allocate even on a very large or very dense box.
    const MAX_SIDE = 8192
    const density = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
    const ratio = Math.min(
      density,
      MAX_SIDE / Math.max(1, viewport.width),
      MAX_SIDE / Math.max(1, viewport.height),
    )
    const width = Math.max(1, Math.round(viewport.width * ratio))
    const height = Math.max(1, Math.round(viewport.height * ratio))
    if (element.width !== width) element.width = width
    if (element.height !== height) element.height = height
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)
    context.fillStyle = '#141a24'
    context.fillRect(0, 0, viewport.width, viewport.height)

    if (image.width <= 0 || image.height <= 0) return

    const topLeft = imageToDevice(view, { x: 0, y: 0 })
    const boxWidth = image.width * view.scale
    const boxHeight = image.height * view.scale

    // Checkerboard under the image only: holes in the source stay visible as
    // holes instead of blending into one flat background.
    const tile = 10
    context.save()
    context.beginPath()
    context.rect(topLeft.x, topLeft.y, boxWidth, boxHeight)
    context.clip()
    context.fillStyle = '#ffffff'
    context.fillRect(topLeft.x, topLeft.y, boxWidth, boxHeight)
    context.fillStyle = '#d7dde6'
    const startX = Math.floor(topLeft.x / tile) * tile
    const startY = Math.floor(topLeft.y / tile) * tile
    for (let y = startY; y < topLeft.y + boxHeight; y += tile) {
      for (let x = startX; x < topLeft.x + boxWidth; x += tile) {
        if ((Math.round((x - startX) / tile) + Math.round((y - startY) / tile)) % 2 === 0) continue
        context.fillRect(x, y, tile, tile)
      }
    }
    context.restore()

    // A bitmap is only painted at the size the core published for it. While a
    // new address is loading the previous one is still in hand, and after a
    // crop that previous picture has a different pixel grid — drawing it
    // stretched to the new one would show the user a source that does not
    // exist, and would invite a gesture aimed at it.
    const fits =
      shown.image !== null &&
      (shown.image.naturalWidth === 0 ||
        (shown.image.naturalWidth === image.width && shown.image.naturalHeight === image.height))
    if (shown.image && fits) {
      context.save()
      context.translate(view.offsetX, view.offsetY)
      context.scale(view.scale, view.scale)
      // Zoomed in, the honest thing to show is the pixel grid, not a blur.
      context.imageSmoothingEnabled = view.scale < 1
      context.drawImage(shown.image, 0, 0, image.width, image.height)
      context.restore()
    }

    context.strokeStyle = 'rgba(146, 165, 194, 0.9)'
    context.lineWidth = 1
    context.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, boxWidth - 1, boxHeight - 1)

    /* ---------------------------------------------------------- draft ink */

    if (!draft || draft.points.length === 0) return
    const points =
      draft.capture === 'box'
        ? (cropCorners(draft.points, draft.square) ?? draft.points)
        : snappedChain(draft.points, draft.snap)
    const device = points.map((point) => imageToDevice(view, point))

    context.save()
    context.lineJoin = 'round'
    context.lineCap = 'round'

    if (draft.capture === 'seed') {
      for (const point of device) {
        context.beginPath()
        context.arc(point.x, point.y, SEED_RADIUS, 0, Math.PI * 2)
        context.strokeStyle = 'rgba(0,0,0,0.75)'
        context.lineWidth = 4
        context.stroke()
        context.strokeStyle = '#5ee7ff'
        context.lineWidth = 2
        context.stroke()
        context.beginPath()
        context.moveTo(point.x - SEED_RADIUS - 4, point.y)
        context.lineTo(point.x + SEED_RADIUS + 4, point.y)
        context.moveTo(point.x, point.y - SEED_RADIUS - 4)
        context.lineTo(point.x, point.y + SEED_RADIUS + 4)
        context.stroke()
      }
    } else if (draft.capture === 'box') {
      const [from, to] = device.length >= 2 ? [device[0]!, device[1]!] : [device[0]!, device[0]!]
      const x = Math.min(from.x, to.x)
      const y = Math.min(from.y, to.y)
      const w = Math.abs(to.x - from.x)
      const h = Math.abs(to.y - from.y)
      context.beginPath()
      if (cropShape === 'ellipse') {
        context.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.5), Math.max(h / 2, 0.5), 0, 0, Math.PI * 2)
      } else {
        context.rect(x, y, w, h)
      }
      context.fillStyle =
        cropKeep === 'inside' ? 'rgba(94, 231, 255, 0.16)' : 'rgba(255, 138, 128, 0.16)'
      context.fill()
      context.strokeStyle = 'rgba(0,0,0,0.75)'
      context.lineWidth = 4
      context.stroke()
      context.strokeStyle = '#5ee7ff'
      context.lineWidth = 2
      context.setLineDash([6, 4])
      context.stroke()
      context.setLineDash([])
    } else {
      const width = Number.isFinite(strokeWidthPx) ? Math.max(1, strokeWidthPx) : 1
      context.beginPath()
      context.moveTo(device[0]!.x, device[0]!.y)
      for (const point of device.slice(1)) context.lineTo(point.x, point.y)
      context.strokeStyle = 'rgba(94, 231, 255, 0.35)'
      context.lineWidth = Math.max(1, width * view.scale)
      context.stroke()
      context.strokeStyle = 'rgba(0,0,0,0.75)'
      context.lineWidth = 3
      context.stroke()
      context.strokeStyle = '#5ee7ff'
      context.lineWidth = 1.5
      context.stroke()
      if (draft.capture === 'knots') {
        for (const point of device) {
          context.beginPath()
          context.rect(point.x - KNOT_RADIUS, point.y - KNOT_RADIUS, KNOT_RADIUS * 2, KNOT_RADIUS * 2)
          context.fillStyle = '#0b0e14'
          context.fill()
          context.strokeStyle = '#5ee7ff'
          context.lineWidth = 2
          context.stroke()
        }
      }
    }
    context.restore()
  }, [
    compare,
    cropKeep,
    cropShape,
    draft,
    image.height,
    image.width,
    shown.image,
    strokeWidthPx,
    view,
    viewport.height,
    viewport.width,
  ])

  /* ---------------------------------------------------------------- wheel */

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const box = element.getBoundingClientRect()
      const anchor = { x: event.clientX - box.left, y: event.clientY - box.top }
      apiRef.current.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, anchor)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  /* -------------------------------------------------------- space to pan */

  useEffect(() => {
    // Only while the canvas itself has focus: a space typed into a text field
    // must never turn into a viewport gesture.
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && event.target === canvasRef.current) setSpaceHeld(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const blur = () => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /* -------------------------------------------------------------- pointer */

  const toImage = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect()
    const point = deviceToImage(view, { x: event.clientX - box.left, y: event.clientY - box.top })
    // Pen devices report a real pressure; a mouse reports a constant that means
    // nothing, so it is left out and the core uses its "missing pressure" rule.
    const pressure = event.pointerType === 'pen' ? event.pressure : undefined
    return pressure === undefined ? point : { ...point, pressure }
  }

  const refuse = () => {
    if (!blockedReason) return false
    actions.announce(blockedReason)
    actions.toast('warning', blockedReason)
    return true
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.focus({ preventScroll: true })
    const wantsPan = event.button === 1 || spaceHeld || event.altKey
    if (wantsPan) {
      event.preventDefault()
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0) return
    if (drawPointerRef.current !== null) return
    if (refuse()) return

    const point = toImage(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    drawPointerRef.current = event.pointerId

    if (toolDef?.capture === 'knots') {
      // Reads the live draft: two clicks can land inside one render.
      const live = api.getDraft()
      if (live && live.tool === tool) api.addKnot(point, { snap: event.shiftKey })
      else api.startDraft({ point, pointerId: null, snap: event.shiftKey, square: false })
      return
    }
    api.startDraft({
      point,
      pointerId: event.pointerId,
      snap: event.shiftKey,
      square: event.shiftKey || squareLock,
    })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setHover(deviceToImage(view, { x: event.clientX - box.left, y: event.clientY - box.top }))

    const pan = panRef.current
    if (pan && pan.pointerId === event.pointerId) {
      api.panBy(event.clientX - pan.x, event.clientY - pan.y)
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      return
    }
    if (drawPointerRef.current !== event.pointerId) return
    const live = api.getDraft()
    if (!live || live.pointerId !== event.pointerId) return
    // A move only extends the draft; nothing is committed here (EDT-01).
    api.appendPoint(toImage(event), {
      snap: event.shiftKey,
      square: event.shiftKey || squareLock,
    })
  }

  const release = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current
    if (pan && pan.pointerId === event.pointerId) {
      panRef.current = null
      release(event)
      return
    }
    if (drawPointerRef.current !== event.pointerId) return
    drawPointerRef.current = null
    release(event)
    // A draft cancelled mid-drag leaves nothing to send: the pointer-up that
    // follows Escape must not turn into a gesture.
    const live = api.getDraft()
    if (!live || live.pointerId !== event.pointerId) return
    void api.submitDraft()
  }

  const onPointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null
    if (drawPointerRef.current === event.pointerId) {
      drawPointerRef.current = null
      const live = api.getDraft()
      if (live && live.pointerId === event.pointerId) api.cancelDraft()
    }
    release(event)
  }

  /* ------------------------------------------------------------- keyboard */

  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 128 : 32
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        api.panBy(step, 0)
        return
      case 'ArrowRight':
        event.preventDefault()
        api.panBy(-step, 0)
        return
      case 'ArrowUp':
        event.preventDefault()
        api.panBy(0, step)
        return
      case 'ArrowDown':
        event.preventDefault()
        api.panBy(0, -step)
        return
      case '+':
      case '=':
        event.preventDefault()
        api.zoomBy(1.25)
        return
      case '-':
      case '_':
        event.preventDefault()
        api.zoomBy(1 / 1.25)
        return
      case '0':
        event.preventDefault()
        api.fit()
        return
      case 'Escape':
        if (!api.getDraft()) return
        // preventDefault keeps the shell from also peeling one of its layers.
        event.preventDefault()
        event.stopPropagation()
        drawPointerRef.current = null
        api.cancelDraft()
        return
      case 'Enter':
        if (!api.getDraft()) return
        event.preventDefault()
        void api.submitDraft()
        return
      case 'Backspace': {
        // A Backspace aimed at a drawing surface must never walk the browser
        // history back, whether or not there is a draft to shorten.
        event.preventDefault()
        const live = api.getDraft()
        if (!live || live.capture !== 'knots') return
        api.removeLastKnot()
        return
      }
      default:
    }
  }

  /* ---------------------------------------------------------------- render */

  const viewLabel = compare === 'original' ? 'bản trước khi sửa' : 'bản hiện tại'
  const label = published
    ? failed
      ? `Ảnh nguồn ${published.widthPx}×${published.heightPx} px: không tải được ${viewLabel}. ` +
        'Khung ảnh đang trống và chưa vẽ lên được; các cách phục hồi nằm trong thông báo bên cạnh.'
      : targetFailed
        ? `Ảnh nguồn ${published.widthPx}×${published.heightPx} px, đang xem ${viewLabel}. ` +
          'Ảnh hiện tại — ảnh mà thao tác sẽ sửa — vẫn không tải được, nên chưa vẽ được.'
        : `Ảnh nguồn ${published.widthPx}×${published.heightPx} px, đang xem ${viewLabel}, mức phóng ${zoomLabel(view.scale)}`
    : 'Chưa có ảnh nguồn để sửa'

  return (
    <div
      className="stage__viewport srccanvas"
      data-mode="2d"
      data-image-failed={failed ? 'true' : 'false'}
      data-edit-target-failed={targetFailed ? 'true' : 'false'}
      ref={hostRef}
    >
      <canvas
        ref={canvasRef}
        className="srccanvas__surface"
        style={{ cursor: spaceHeld ? 'grab' : 'crosshair' }}
        role="img"
        aria-label={label}
        aria-describedby="w3a-canvas-help"
        tabIndex={0}
        data-canvas-scale={view.scale}
        data-canvas-offset-x={view.offsetX}
        data-canvas-offset-y={view.offsetY}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={(event) => {
          const live = api.getDraft()
          if (!live || live.capture !== 'knots') return
          event.preventDefault()
          drawPointerRef.current = null
          void api.submitDraft()
        }}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      />

      <p id="w3a-canvas-help" className="u-visually-hidden">
        Khung ảnh nguồn. Mũi tên để dời khung nhìn, phím cộng và trừ để phóng, phím 0 để vừa khung.
        {toolDef ? ` Công cụ ${toolDef.label}: ${toolDef.behaviour}` : ''} Enter kết thúc và gửi thao
        tác, Backspace bỏ nút cuối của đường cong, Escape hủy thao tác đang vẽ. Nếu không dùng được
        con trỏ, dùng ô nhập tọa độ trong bảng công cụ.
      </p>

      <div className="srccanvas__readout" aria-hidden="true">
        <span className="chip chip--glass fc-border">{zoomLabel(view.scale)}</span>
        {hover ? (
          <span className="chip chip--glass fc-border">
            x {formatNumber(hover.x, 1)} · y {formatNumber(hover.y, 1)} px
          </span>
        ) : null}
        {published ? (
          <span className="chip chip--glass fc-border">
            {published.widthPx}×{published.heightPx} px · {formatNumber(published.pixelSizeMm, 4)} mm/px
          </span>
        ) : null}
        {compare === 'original' ? (
          <span className="chip chip--warn fc-border">bản trước khi sửa</span>
        ) : null}
      </div>

      {published === null ? (
        <div className="srccanvas__notice" data-notice="no-canvas">
          <div className="card fc-border srccanvas__notice-card">
            <strong className="card__title">Chưa có ảnh nguồn để sửa</strong>
            <p className="muted" style={{ margin: 0 }}>
              Nhân chưa chuẩn bị xong ảnh raster cho nguồn này. Bảy công cụ sửa vùng chỉ chạy trên
              ảnh raster mà nhân đã chuẩn bị; giao diện không tự dựng ảnh thay cho nguồn của bạn.
            </p>
          </div>
        </div>
      ) : null}

      {/* Nothing about the failure is drawn here. The frame stays an honest
          empty frame, and the whole message — with the ways out — is one card
          in the stage's empty-state slot, so there is exactly one thing on
          screen to read and exactly one place the recovery controls live. */}

      {published !== null && !published.editable ? (
        <div className="srccanvas__banner">
          <span className="chip chip--warn fc-border" style={{ whiteSpace: 'normal' }}>
            Chỉ xem: {published.reason ?? 'nhân chưa nêu lý do cụ thể.'}
          </span>
          <ConvertSource />
        </div>
      ) : null}
    </div>
  )
}

/**
 * The ways out when the published address turns out to be unreadable.
 *
 * The failure itself is not the interface's to fix: it never substitutes
 * another picture, and it never lets a gesture be aimed at one that is not
 * there. What it owes the user is a way onward — retry the same address, look
 * at the other published image when that one did load, go to the source block
 * to load a different source, or open the log to read what the core said.
 *
 * It takes the stage's empty-state slot rather than inventing a second kind of
 * overlay. That slot is already how this interface says "the frame cannot be
 * used yet, and here is what to do about it" for a missing project and a
 * missing source, it already carries its actions inside itself, and it is
 * already the layer the responsive work sized for 320 px at 200% text. A
 * separate sheet floated over the canvas would land on the tool bar instead —
 * and the one thing a recovery card must never do is bury the controls it
 * exists to replace.
 *
 * Everything the covered banner offered is carried here too, so nothing that
 * was reachable before becomes unreachable while this is up.
 */
export function SourceImageRecovery() {
  const api = useSourceCanvas()
  const actions = useUiActions()
  const snapshot = useSnapshot()
  const run = useRunCommand()
  const { canvas, image2d, compare } = api
  if (canvas === null || !(image2d.failed || image2d.targetFailed)) return null
  const shownLabel = compare === 'original' ? 'bản trước khi sửa' : 'bản hiện tại'
  const otherLabel = compare === 'original' ? 'bản hiện tại' : 'bản trước khi sửa'
  return (
    <div className="stage-empty" data-recovery="image-failed">
      <div
        className="card fc-border"
        style={{ maxInlineSize: 460 }}
        role="group"
        aria-label="Ảnh nguồn không tải được và các cách phục hồi"
      >
        <strong className="card__title">Không tải được ảnh nguồn</strong>
        <p className="muted" style={{ margin: 0 }}>
          {image2d.failed
            ? `Địa chỉ ${shownLabel} do nhân công bố không đọc được. Giao diện không thay bằng hình khác.`
            : `${shownLabel} đang hiển thị bình thường, nhưng ảnh hiện tại — ảnh mà thao tác sẽ sửa — vẫn không đọc được.`}{' '}
          Chưa cho vẽ chừng nào ảnh đang sửa còn chưa hiện lên, vì các điểm sẽ rơi vào chỗ bạn không
          nhìn thấy.
        </p>
        <div className="row">
          <Button
            size="small"
            icon="refresh"
            variant="primary"
            disabled={image2d.loading}
            data-recover="retry"
            onClick={() => {
              api.reloadImage()
              actions.announce('Đang tải lại ảnh nguồn từ đúng địa chỉ nhân đã công bố.')
            }}
          >
            {image2d.loading ? 'Đang tải lại…' : 'Thử tải lại ảnh'}
          </Button>
          <Button
            size="small"
            icon="image"
            data-recover="show-other"
            disabledReason={
              image2d.otherUsable ? null : `Nhân không công bố ${otherLabel} nào khác đang đọc được.`
            }
            onClick={() => api.setCompare(compare === 'original' ? 'current' : 'original')}
          >
            Xem {otherLabel}
          </Button>
        </div>
        <div className="row">
          {/* The frame this card covers held undo, and undo is a real way back
              here: the picture of the previous revision may well be readable.
              A control that was reachable a moment ago does not become
              unreachable because something went wrong. */}
          <Button
            size="small"
            icon="undo"
            data-recover="undo"
            disabledReason={
              snapshot.project.canUndo
                ? null
                : 'Không còn bước nào để hoàn tác, nên không có bản ảnh cũ hơn để quay về.'
            }
            onClick={() => void run({ type: 'history.undo' })}
          >
            Hoàn tác ({snapshot.project.history.undoCount})
          </Button>
          <Button
            size="small"
            icon="upload"
            data-recover="pick-source"
            onClick={() => actions.setSection('source', true)}
          >
            Chọn nguồn khác
          </Button>
          <Button
            size="small"
            icon="warning"
            data-recover="log"
            onClick={() => actions.openDialog({ kind: 'diagnostics' })}
          >
            Mở nhật ký
          </Button>
        </div>
        {/* The read-only banner lives under this card, so its one control comes
            along rather than being sealed off behind the failure. */}
        {canvas.editable ? null : (
          <>
            <span className="reason">
              Chỉ xem: {canvas.reason ?? 'nhân chưa nêu lý do cụ thể.'}
            </span>
            <ConvertSource />
          </>
        )}
        <span className="muted-3">
          Thử lại gửi đúng địa chỉ nhân đã công bố, không thêm tham số nào. Nếu vẫn hỏng thì lỗi
          nằm ở nguồn hoặc ở nhân, không phải ở khung xem.
        </span>
      </div>
    </div>
  )
}

/**
 * Asking the core to prepare an editable raster of a source it has not
 * converted yet (`source.convert`).
 *
 * The command is a *request*: the core answers with the diff of what the
 * conversion would change and a `proposal.accept` to retry with. Nothing is
 * converted until that confirmation comes back through the shared dialog, and a
 * proposal whose inputs have moved on is refused rather than replayed.
 */
function ConvertSource() {
  const run = useRunCommand()
  const write = useCapability(CAP.projectWrite)
  const convert = useAsyncAction(async () => {
    await run({ type: 'source.convert', target: 'raster' })
  })
  return (
    <div className="stack" style={{ marginBlockStart: 6 }}>
      <Button
        size="small"
        icon="refresh"
        disabled={convert.pending}
        disabledReason={write.available ? null : write.reason}
        onClick={() => void convert.run()}
      >
        {convert.pending ? 'Đang hỏi nhân…' : 'Chuyển nguồn sang ảnh raster để sửa'}
      </Button>
      <span className="muted-3" style={{ maxInlineSize: 340 }}>
        Nhân trả về phần thay đổi trước; chưa có gì được chuyển cho tới khi bạn xác nhận. Byte gốc
        của nguồn vector hoặc font vẫn được giữ riêng.
      </span>
    </div>
  )
}
