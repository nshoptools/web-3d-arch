/**
 * Shared state of the 2D source canvas.
 *
 * It holds view state (zoom, pan, which image is shown) and the *draft* of the
 * gesture the user is drawing. A draft is presentation only: nothing is written
 * to the project until one complete gesture is handed to `editSource`, and a
 * cancelled draft therefore never becomes a history entry.
 *
 * The seven tools themselves are core work (docs/editing/API.md, ADR-001). This
 * module decides which points a gesture carries, in source-image pixels, and
 * which project/source revision it was started against.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppSnapshot,
  EditorGesture,
  SourceCanvasView,
  ToolId,
} from '../../contracts/app-bridge.ts'
import { useBridge, useCapability, useResultHandler, useSnapshot } from '../core/bridge.tsx'
import { accountIdentity } from '../core/identity.ts'
import { uid, useUiActions } from '../core/ui-state.tsx'
import { CAP, TOOLS_2D, type ToolCapture } from '../core/registry.ts'
import {
  centreView,
  clampScale,
  deviceToImage,
  fitView,
  quantize,
  snap45,
  squareCorner,
  type Point,
  type Size,
  type View,
} from './canvas-math.ts'

export type CropShape = 'rectangle' | 'ellipse'
export type CropKeep = 'inside' | 'outside'

/**
 * *Which* thing the points belong to, as opposed to *which version* of it.
 *
 * A revision says the same source moved on, and the interface answers that with
 * `stale`: the points are still the user's work on the same picture. This says
 * the picture underneath is not the same picture any more — another project was
 * opened, the source was swapped or removed, or a different person is signed
 * in. Coordinates never travel across that line, and neither does an answer
 * that was already in flight when it was crossed.
 *
 * Deliberately built from identifiers only. `currentUrl`/`originalUrl` are left
 * out because a controller is free to republish the same picture under a fresh
 * blob address, and a draft must not be thrown away for that.
 */
function sourceIdentity(snapshot: AppSnapshot): string {
  const { project, session } = snapshot
  return [
    session.status,
    session.user?.id ?? '',
    project.id,
    project.source?.id ?? '',
    project.sourceCanvas === null ? 'no-canvas' : 'canvas',
    // A separator no identifier can carry, so two different tuples can never
    // collapse into one string.
  ].join('\u001f')
}

/** What became of the two addresses `SourceCanvasView` publishes. */
export interface SourceImageState {
  /** The picture being shown did not load. */
  failed: boolean
  /**
   * The picture an edit would change — `currentUrl` — did not load.
   *
   * Kept apart from `failed` because comparing against the pre-edit raster is a
   * normal thing to do: looking at "bản trước khi sửa" fills the frame again,
   * but it does not make the picture the gesture lands on visible. A stroke
   * placed while that one is unreadable is a stroke placed blind.
   */
  targetFailed: boolean
  /** A request for the picture being shown is in flight. */
  loading: boolean
  /**
   * The *other* published address is a genuinely different one and it did load,
   * so offering to look at it is a real way out rather than a second dead end.
   */
  otherUsable: boolean
}

const IMAGE_OK: SourceImageState = {
  failed: false,
  targetFailed: false,
  loading: false,
  otherUsable: false,
}

export interface Draft {
  id: string
  tool: ToolId
  capture: ToolCapture
  /** Raw image-pixel points. Snapping is previewed, never baked in here. */
  points: Point[]
  projectRevision: number
  sourceRevision: number
  /** The project/source/account these points were drawn on. */
  identity: string
  snap: 'none' | '45'
  square: boolean
  /** The pointer that owns this draft, or null when it was built by keyboard. */
  pointerId: number | null
  /**
   * The core refused this gesture and the points were kept instead of thrown
   * away. Its revisions have been re-captured, so sending it again means
   * applying these points under the colour and mode in force *now* — which is
   * why it takes a second, explicit send.
   */
  rejected?: boolean
}

export interface SourceCanvasApi {
  canvas: SourceCanvasView | null
  image: Size
  viewport: Size
  view: View
  fitMode: boolean
  compare: 'current' | 'original'
  cropShape: CropShape
  cropKeep: CropKeep
  squareLock: boolean
  draft: Draft | null
  /**
   * The draft as it is *right now*, not as the last render saw it. Pointer
   * handlers must use this: a pointerup can arrive in the same batch as the
   * pointermove before it, and reading a rendered copy would silently drop the
   * last point of the gesture.
   */
  getDraft: () => Draft | null
  sending: boolean
  /** Non-null when no gesture may be started, with the reason to show. */
  blockedReason: string | null
  /**
   * Non-null when the *draft in hand* may not be sent. Deliberately different
   * from `blockedReason`: a send in flight blocks a new stroke but is not a
   * reason to refuse the one being finished.
   */
  submitBlockedReason: string | null
  /**
   * The project or the source moved on after this draft started. Contract 0.3
   * says the core refuses such a gesture rather than applying it to different
   * pixels, so the interface says so before the user presses send.
   */
  stale: boolean
  lastSent: { id: string; tool: ToolId; points: number } | null
  /**
   * How the published picture is doing. Reported by the view that actually
   * loads the bitmap, because only that view knows whether the address the core
   * published turned out to be readable; held here because the decision it
   * drives — refusing a gesture aimed at a picture nobody can see — belongs to
   * the shared state, and because the recovery controls are laid out beside the
   * canvas rather than on top of it.
   */
  image2d: SourceImageState
  reportImageState: (state: SourceImageState) => void
  /** Bumped by the retry control; the loader re-requests the same address. */
  imageAttempt: number
  reloadImage: () => void

  setViewport: (size: Size) => void
  setCompare: (value: 'current' | 'original') => void
  setCropShape: (value: CropShape) => void
  setCropKeep: (value: CropKeep) => void
  setSquareLock: (value: boolean) => void

  fit: () => void
  zoomTo: (scale: number, anchor?: { x: number; y: number }) => void
  zoomBy: (factor: number, anchor?: { x: number; y: number }) => void
  panBy: (dx: number, dy: number) => void

  startDraft: (options: { point: Point; pointerId: number | null; snap: boolean; square: boolean }) => void
  appendPoint: (point: Point, options?: { snap?: boolean; square?: boolean }) => void
  addKnot: (point: Point, options?: { snap?: boolean }) => void
  removeLastKnot: () => void
  cancelDraft: () => void
  submitDraft: () => Promise<void>
}

const SourceCanvasContext = createContext<SourceCanvasApi | null>(null)

export function useSourceCanvas(): SourceCanvasApi {
  const value = useContext(SourceCanvasContext)
  if (!value) throw new Error('useSourceCanvas must be used inside <SourceCanvasProvider>')
  return value
}

/** Present but optional: step 2 has no source canvas mounted. */
export function useSourceCanvasOptional(): SourceCanvasApi | null {
  return useContext(SourceCanvasContext)
}

/** Applies the previewed Shift snapping along a point chain. */
export function snappedChain(points: readonly Point[], snap: 'none' | '45'): Point[] {
  if (snap === 'none' || points.length === 0) return [...points]
  const result: Point[] = [{ ...points[0]! }]
  for (let index = 1; index < points.length; index += 1) {
    const previous = result[index - 1]!
    const raw = points[index]!
    const moved = snap45(previous, raw)
    result.push({ ...raw, x: moved.x, y: moved.y })
  }
  return result
}

/** The two corners a crop box previews, with the square lock applied. */
export function cropCorners(points: readonly Point[], square: boolean): [Point, Point] | null {
  const from = points[0]
  const to = points[1]
  if (!from || !to) return null
  if (!square) return [from, to]
  const locked = squareCorner(from, to)
  return [from, { ...to, x: locked.x, y: locked.y }]
}

/**
 * Tools the core refuses without a selected colour material. `heal` is on the
 * core's allow-list even though the interface offers it a colour row, so it is
 * deliberately absent here.
 */
const COLOUR_REQUIRED_TOOLS: readonly ToolId[] = ['paint', 'line', 'curve']

/** Stroke sampling floor, in image pixels: keeps the point list honest and bounded. */
const MIN_SAMPLE_DISTANCE = 0.75
/** Well under the 4096-point ceiling of ADR-001, with room for the send. */
const MAX_STROKE_POINTS = 2000

export function SourceCanvasProvider({ children }: { children: ReactNode }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const actions = useUiActions()
  const handleResult = useResultHandler()
  const write = useCapability(CAP.projectWrite)

  const canvas = snapshot.project.sourceCanvas
  const tool = snapshot.editor.tool
  const capture = TOOLS_2D.find((item) => item.id === tool)?.capture ?? 'stroke'

  const [viewport, setViewportState] = useState<Size>({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ scale: 1, offsetX: 0, offsetY: 0 })
  const [fitMode, setFitMode] = useState(true)
  const [compare, setCompare] = useState<'current' | 'original'>('current')
  const [cropShape, setCropShape] = useState<CropShape>('rectangle')
  const [cropKeep, setCropKeep] = useState<CropKeep>('inside')
  const [squareLock, setSquareLock] = useState(false)
  const [draft, setDraftState] = useState<Draft | null>(null)
  const [sending, setSending] = useState(false)
  const [lastSent, setLastSent] = useState<{ id: string; tool: ToolId; points: number } | null>(null)
  const [image2d, setImage2d] = useState<SourceImageState>(IMAGE_OK)
  const [imageAttempt, setImageAttempt] = useState(0)

  const reportImageState = useCallback((next: SourceImageState) => {
    setImage2d((previous) =>
      previous.failed === next.failed &&
      previous.targetFailed === next.targetFailed &&
      previous.loading === next.loading &&
      previous.otherUsable === next.otherUsable
        ? previous
        : next,
    )
  }, [])

  const reloadImage = useCallback(() => {
    setImageAttempt((value) => value + 1)
  }, [])

  const image = useMemo<Size>(
    () => ({ width: canvas?.widthPx ?? 0, height: canvas?.heightPx ?? 0 }),
    [canvas?.heightPx, canvas?.widthPx],
  )

  // Guards the async send against a second concurrent submit without waiting
  // for a state update to land.
  const sendingRef = useRef(false)
  /**
   * The draft lives in a ref and is mirrored into state for rendering. Input
   * events arrive faster than React renders, so every mutation reads and writes
   * the ref; otherwise a pointerup batched with the preceding pointermove would
   * send a gesture that is missing its last point.
   */
  const draftRef = useRef<Draft | null>(null)
  const setDraft = useCallback((next: Draft | null) => {
    draftRef.current = next
    setDraftState(next)
  }, [])
  const getDraft = useCallback(() => draftRef.current, [])
  /** The snapshot as it is when an async answer lands, not when the send began. */
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  /**
   * Which project/source/account the interface is on *now*, and the ticket of
   * the send that is allowed to write draft state.
   *
   * Every `editSource` takes the next ticket. An answer may only touch the
   * draft, `lastSent` or the sending flag while it still holds the current
   * ticket **and** the identity it was sent under is still the one on screen.
   * The two together are what stops an answer from a project the user has left
   * from resurrecting points, deleting a newer draft, or reporting a send that
   * has nothing to do with what is on screen.
   */
  const identity = sourceIdentity(snapshot)
  const identityRef = useRef(identity)
  identityRef.current = identity
  const sendTokenRef = useRef(0)

  const setViewport = useCallback((size: Size) => {
    setViewportState((previous) =>
      previous.width === size.width && previous.height === size.height ? previous : size,
    )
  }, [])

  /**
   * Re-laying out the box must not distort the image and must not throw away an
   * unfinished gesture: one scale drives both axes, and only the view is
   * recomputed. In fit mode the image is re-fitted; otherwise the point that was
   * in the middle of the box stays in the middle of the box.
   */
  const previousViewport = useRef<Size>({ width: 0, height: 0 })
  useEffect(() => {
    const previous = previousViewport.current
    if (previous.width === viewport.width && previous.height === viewport.height) return
    previousViewport.current = viewport
    if (viewport.width <= 0 || viewport.height <= 0 || image.width <= 0 || image.height <= 0) return
    setView((current) => {
      if (fitMode || previous.width === 0 || previous.height === 0) return fitView(viewport, image)
      const centre = deviceToImage(current, { x: previous.width / 2, y: previous.height / 2 })
      return {
        scale: current.scale,
        offsetX: viewport.width / 2 - centre.x * current.scale,
        offsetY: viewport.height / 2 - centre.y * current.scale,
      }
    })
  }, [fitMode, image, viewport])

  // A *different source* re-fits once, so the user never lands on an empty
  // viewport after the core published a new canvas. The identity is the
  // pre-edit raster and the pixel size: an edit republishes `currentUrl` and
  // must not throw away the zoom and pan the user set.
  const imageKey = `${image.width}x${image.height}|${canvas?.originalUrl ?? ''}`
  const lastImageKey = useRef('')
  useEffect(() => {
    if (lastImageKey.current === imageKey) return
    if (viewport.width <= 0 || viewport.height <= 0 || image.width <= 0 || image.height <= 0) return
    lastImageKey.current = imageKey
    setView(fitView(viewport, image))
    setFitMode(true)
  }, [image, imageKey, viewport])

  const fit = useCallback(() => {
    if (viewport.width <= 0 || image.width <= 0) return
    setView(fitView(viewport, image))
    setFitMode(true)
  }, [image, viewport])

  const zoomTo = useCallback(
    (scale: number, anchor?: { x: number; y: number }) => {
      setFitMode(false)
      setView((current) => {
        if (image.width <= 0) return current
        const next = clampScale(scale)
        if (!anchor) return centreView(viewport, image, next)
        const point = deviceToImage(current, anchor)
        return { scale: next, offsetX: anchor.x - point.x * next, offsetY: anchor.y - point.y * next }
      })
    },
    [image, viewport],
  )

  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setFitMode(false)
      setView((current) => {
        if (image.width <= 0) return current
        const next = clampScale(current.scale * factor)
        const point = anchor ?? { x: viewport.width / 2, y: viewport.height / 2 }
        const imagePoint = deviceToImage(current, point)
        return { scale: next, offsetX: point.x - imagePoint.x * next, offsetY: point.y - imagePoint.y * next }
      })
    },
    [image.width, viewport.height, viewport.width],
  )

  const panBy = useCallback((dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return
    setFitMode(false)
    setView((current) => ({ ...current, offsetX: current.offsetX + dx, offsetY: current.offsetY + dy }))
  }, [])

  /**
   * Why no gesture of the current tool may be *sent*.
   *
   * The colour clause mirrors the core exactly: paint, line and curve are
   * refused with MATERIAL_SELECTION_REQUIRED unless a colour material resolves,
   * while erase, cut, crop and heal are on the core's allow-list and must not be
   * blocked here even though heal offers a colour.
   */
  const submitBlockedReason = useMemo(() => {
    if (!canvas) {
      return 'Nhân chưa công bố ảnh nguồn có thể sửa cho dự án này (project.sourceCanvas đang trống).'
    }
    if (!canvas.editable) {
      return canvas.reason ?? 'Nhân báo nguồn này chưa sửa được nhưng không nêu lý do cụ thể.'
    }
    if (!write.available) return write.reason
    if (snapshot.job) {
      return `Nhân đang chạy “${snapshot.job.stage}”. Chờ xong hoặc bấm Hủy trước khi sửa tiếp.`
    }
    if (COLOUR_REQUIRED_TOOLS.includes(tool) && snapshot.editor.colorMaterialId === null) {
      return snapshot.project.materials.length === 0
        ? 'Nhân chưa công bố vùng màu nào cho nguồn này, nên công cụ này chưa gửi được nét.'
        : 'Chưa chọn màu vật liệu. Chọn một ô màu trong bảng công cụ trước khi vẽ.'
    }
    // Last, because these are about the picture rather than about permission.
    // A gesture is a set of coordinates on an image; if that image is not on
    // screen the points land somewhere the user cannot see.
    if (image2d.targetFailed) {
      return (
        'Ảnh nguồn hiện tại — ảnh mà thao tác này sẽ sửa — không tải được, nên chưa vẽ lên nó ' +
        'được. Thử tải lại ảnh hoặc chọn nguồn khác; xem bản trước khi sửa chỉ để đối chiếu, ' +
        'không thay được ảnh đang sửa.'
      )
    }
    if (image2d.failed) {
      return (
        'Ảnh đang xem không tải được, nên chưa vẽ lên nó được. Thử tải lại ảnh hoặc chuyển về ' +
        'bản hiện tại.'
      )
    }
    return null
  }, [
    canvas,
    image2d.failed,
    image2d.targetFailed,
    snapshot.editor.colorMaterialId,
    snapshot.job,
    snapshot.project.materials.length,
    tool,
    write.available,
    write.reason,
  ])

  const blockedReason = useMemo(() => {
    if (submitBlockedReason) return submitBlockedReason
    if (sending) return 'Đang gửi một thao tác; chờ nhân trả lời rồi hãy vẽ tiếp.'
    return null
  }, [sending, submitBlockedReason])

  const stale =
    draft !== null &&
    canvas !== null &&
    (draft.projectRevision !== snapshot.project.revision ||
      draft.sourceRevision !== canvas.revision)

  const startDraft = useCallback<SourceCanvasApi['startDraft']>(
    ({ point, pointerId, snap, square }) => {
      if (!canvas) return
      setDraft({
        id: uid('gesture'),
        tool,
        capture,
        points: [point],
        // Captured once, at the moment the gesture starts: the core rejects the
        // gesture if the project moved on, instead of applying it to new pixels.
        projectRevision: snapshot.project.revision,
        sourceRevision: canvas.revision,
        identity,
        snap: snap ? '45' : 'none',
        square,
        pointerId,
      })
    },
    [canvas, capture, identity, setDraft, snapshot.project.revision, tool],
  )

  const appendPoint = useCallback<SourceCanvasApi['appendPoint']>(
    (point, options) => {
      const current = draftRef.current
      if (!current) return
      const snap = options?.snap === undefined ? current.snap : options.snap ? '45' : 'none'
      const square = options?.square === undefined ? current.square : options.square
      if (current.capture === 'box') {
        // A box is always exactly two points: from and to.
        setDraft({ ...current, snap, square, points: [current.points[0]!, point] })
        return
      }
      const last = current.points[current.points.length - 1]
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_SAMPLE_DISTANCE) {
        setDraft({ ...current, snap, square })
        return
      }
      if (current.points.length >= MAX_STROKE_POINTS) {
        setDraft({ ...current, snap, square })
        return
      }
      setDraft({ ...current, snap, square, points: [...current.points, point] })
    },
    [setDraft],
  )

  const addKnot = useCallback<SourceCanvasApi['addKnot']>(
    (point, options) => {
      const current = draftRef.current
      if (!current) return
      const snap = options?.snap === undefined ? current.snap : options.snap ? '45' : 'none'
      if (current.points.length >= MAX_STROKE_POINTS) {
        setDraft({ ...current, snap })
        return
      }
      setDraft({ ...current, snap, points: [...current.points, point] })
    },
    [setDraft],
  )

  const removeLastKnot = useCallback(() => {
    const current = draftRef.current
    if (!current) return
    setDraft(current.points.length <= 1 ? null : { ...current, points: current.points.slice(0, -1) })
  }, [setDraft])

  /**
   * The square lock behaves like the other two crop options: it applies to the
   * gesture being drawn, not only to the next one. `cropShape` and `cropKeep`
   * are read live when the gesture is sent, so a lock frozen at draft start
   * would make three sibling controls in one card behave two different ways.
   */
  const setSquareLockLive = useCallback(
    (value: boolean) => {
      setSquareLock(value)
      const current = draftRef.current
      if (current && current.capture === 'box') setDraft({ ...current, square: value })
    },
    [setDraft],
  )

  const cancelDraft = useCallback(() => {
    if (!draftRef.current) return
    setDraft(null)
    if (sendingRef.current) {
      // The points already left for the core, so dropping them from the canvas
      // is not an undo. Saying "nothing was written" here would be a lie.
      actions.announce(
        'Đã bỏ nét khỏi khung ảnh, nhưng lần gửi trước đó đã tới nhân và vẫn đang chờ kết quả. ' +
          'Nếu nhân nhận, thao tác đó vẫn nằm trong lịch sử dự án.',
      )
      return
    }
    // Nothing was sent, so nothing entered the project history.
    actions.announce('Đã hủy thao tác đang vẽ. Không có gì được ghi vào lịch sử.')
  }, [actions, setDraft])

  /**
   * Leaving a project, a source or an account ends everything the previous one
   * was holding: the points on screen, the note about the last send, and the
   * right of any answer still in flight to write here. The ticket moves, so the
   * outstanding answer can no longer claim the draft slot, and `sending` is
   * released immediately — the person now looking at a different picture must
   * not be locked out of drawing on it because a call from before is still open.
   */
  const lastIdentity = useRef(identity)
  useEffect(() => {
    if (lastIdentity.current === identity) return
    lastIdentity.current = identity
    sendTokenRef.current += 1
    const hadDraft = draftRef.current !== null
    const wasSending = sendingRef.current
    sendingRef.current = false
    setSending(false)
    setDraft(null)
    setLastSent(null)
    if (hadDraft || wasSending) {
      actions.announce(
        'Đã chuyển sang dự án, nguồn hoặc tài khoản khác, nên thao tác đang vẽ không còn hiệu lực ' +
          'và bị bỏ. Giao diện không chuyển các điểm đó sang ảnh mới.',
      )
    }
  }, [actions, identity, setDraft])

  /**
   * Put a refused gesture back in the user's hands with its revisions taken
   * again from the snapshot as it is now. Sending it a second time is therefore
   * a fresh decision to apply these points under the colour and mode in force
   * now — the interface never re-bases and re-sends on its own.
   *
   * Only the *project* revision is taken again, and that is the whole of what a
   * second send may agree to: the colour, the mode and the other editor and
   * material settings that revision covers, all of which the user can see.
   *
   * The *source* revision is left exactly as it was captured. It is the one
   * that says which pixels these coordinates were measured on, and re-stamping
   * it would silently move the points onto a raster the user never saw — an
   * undo, a background job or another tab's edit republishing the canvas
   * underneath them. Keeping it means `stale` stays true in that case, the
   * warning stays on screen and the send button stays shut until the user
   * cancels and draws again on the picture actually in front of them.
   *
   * Identity is never re-captured either: this only runs for an answer that is
   * still on the same project, source and account.
   */
  const keepRejected = useCallback(
    (rejectedDraft: Draft) => {
      const latest = snapshotRef.current
      setDraft({
        ...rejectedDraft,
        rejected: true,
        projectRevision: latest.project.revision,
      })
      const canvasMoved =
        (latest.project.sourceCanvas?.revision ?? rejectedDraft.sourceRevision) !==
        rejectedDraft.sourceRevision
      actions.announce(
        canvasMoved
          ? 'Nhân từ chối thao tác này, và ảnh nguồn cũng đã đổi sang bản khác. Các điểm vẫn còn ' +
              'trên khung ảnh nhưng chúng đo trên ảnh cũ, nên chưa gửi lại được: hãy hủy và vẽ lại ' +
              'trên ảnh hiện tại.'
          : 'Nhân từ chối thao tác này. Các điểm vẫn còn trên khung ảnh; bấm gửi lần nữa để áp ' +
              'chúng theo màu và chế độ hiện tại, hoặc Hủy để bỏ.',
      )
    },
    [actions, setDraft],
  )

  /**
   * May an answer that has just come back still write here?
   *
   * It may not if another send has been started since (a newer ticket), and it
   * may not if the project, source or account has changed under it. The
   * identity is re-read from the live snapshot rather than from the effect
   * above, because a promise can settle in the same batch as the snapshot that
   * invalidates it, before React has run any effect at all.
   */
  const answerStillOwns = useCallback(
    (token: number, sentIdentity: string) =>
      sendTokenRef.current === token &&
      identityRef.current === sentIdentity &&
      // Read from the bridge, not from the rendered snapshot. Both refs above
      // are assigned in the same render body from the same value, so comparing
      // the second against the first proved nothing; `getSnapshot()` is the
      // live answer even when React has not re-rendered yet.
      sourceIdentity(bridge.getSnapshot()) === sentIdentity,
    [bridge],
  )

  const submitDraft = useCallback(async () => {
    const current = draftRef.current
    if (!current || !canvas) return
    if (sendingRef.current) return
    if (current.points.length === 0) {
      setDraft(null)
      return
    }
    // A draft started while everything was free can become unsendable — a job
    // starts, the tab loses the write lock, the colour is cleared. Hold the
    // points instead of spending them on a refusal.
    if (submitBlockedReason) {
      actions.announce(submitBlockedReason)
      actions.toast('warning', submitBlockedReason)
      return
    }

    // The core is the authority on snapping and on the square lock, so the raw
    // points travel with their flags; what the canvas previewed used the same
    // rules from canvas-math.ts.
    const points = current.points.map((point) => ({
      x: quantize(point.x),
      y: quantize(point.y),
      ...(point.pressure === undefined ? {} : { pressure: point.pressure }),
    }))

    // Finishing a curve with a double click lands the second click on the same
    // knot. A duplicated knot changes the interpolation (ADR-001), so the
    // repeat is dropped instead of being sent as a deliberate knot.
    if (current.capture === 'knots' && points.length >= 2) {
      const last = points[points.length - 1]!
      const previous = points[points.length - 2]!
      if (last.x === previous.x && last.y === previous.y) points.pop()
    }

    const gesture: EditorGesture = {
      id: current.id,
      projectRevision: current.projectRevision,
      sourceRevision: current.sourceRevision,
      tool: current.tool,
      points,
      snap: current.snap,
      ...(current.tool === 'crop'
        ? { cropShape, cropKeep, square: current.square }
        : {}),
    }

    // The ticket and the identity this one send is answerable for. Both are
    // read again when the answer lands; neither is re-derived from whatever is
    // on screen by then.
    const token = sendTokenRef.current + 1
    sendTokenRef.current = token
    const sentIdentity = current.identity
    /** The account this send was made under, for the log's own decision below. */
    const snapshotAtSend = bridge.getSnapshot()
    sendingRef.current = true
    setSending(true)

    /**
     * An answer that arrived for a project, source or account the user has
     * already left. It is kept in the reviewable log — the core really did
     * answer, and on a success it really did change the project that was open
     * then — but it touches nothing on screen: no draft, no `lastSent`, no
     * toast and no alert aimed at work that is not this work.
     */
    const logSuperseded = (outcome: string, detail: string) => {
      // The log is a session-wide surface and survives a sign-out, so what goes
      // in it depends on *which* identity moved. A different project is still
      // this person's own work and is recorded in full. A different account is
      // somebody else's: the fact that an answer was dropped is kept, its
      // outcome and detail are not.
      const sameAccount =
        accountIdentity(bridge.getSnapshot()) === accountIdentity(snapshotAtSend)
      if (!sameAccount) {
        actions.logEvent(
          'info',
          'Một câu trả lời cho thao tác sửa nguồn của phiên trước đã về sau khi tài khoản đã đổi. ' +
            'Giao diện không áp nó và không ghi lại nội dung của nó. Thao tác đã gửi vẫn nằm ở nhân ' +
            'đúng như nhân ghi nhận.',
          { code: 'EDIT_SOURCE_ANSWER_SUPERSEDED' },
        )
        return
      }
      actions.logEvent(
        'info',
        `Nhân trả lời thao tác ${current.tool} (mã ${current.id}) sau khi màn hình đã chuyển sang ` +
          `dự án, nguồn hoặc tài khoản khác: ${outcome}. Câu trả lời này không được áp vào những gì ` +
          'đang hiển thị.',
        { code: 'EDIT_SOURCE_ANSWER_SUPERSEDED', detail },
      )
    }

    // The draft stays in hand until the core has answered. A refusal must not
    // cost the user their points: the contract makes the core *reject* a stale
    // gesture rather than rebase it, so the points are still the user's work.
    try {
      const result = await bridge.editSource(gesture)
      if (!answerStillOwns(token, sentIdentity)) {
        logSuperseded(
          result.ok ? 'nhân đã nhận' : `nhân từ chối (${result.diagnostic.code})`,
          result.ok ? 'ok' : (result.diagnostic.detail ?? result.diagnostic.message),
        )
        return
      }
      handleResult(result, {
        announce: result.ok
          ? `Đã gửi thao tác ${current.tool} với ${points.length} điểm.`
          : undefined,
      })
      if (result.ok) {
        // Only the draft this send was made from may be cleared. A newer one —
        // the user drew again while the answer was on its way — is theirs.
        if (draftRef.current?.id === current.id) setDraft(null)
        setLastSent({ id: current.id, tool: current.tool, points: points.length })
      } else if (draftRef.current?.id === current.id) {
        keepRejected(current)
      } else {
        // The points are gone from the canvas — cancelled, or replaced by a
        // newer gesture. A refusal does not put them back over the top of that.
        actions.announce(
          'Nhân từ chối thao tác đã gửi trước đó. Các điểm của thao tác đó không còn trên khung ' +
            'ảnh nên không được dựng lại; nét đang vẽ hiện tại giữ nguyên.',
        )
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      if (!answerStillOwns(token, sentIdentity)) {
        logSuperseded('lệnh không hoàn tất được', detail)
        return
      }
      handleResult({
        ok: false,
        diagnostic: {
          code: 'EDIT_SOURCE_REJECTED',
          severity: 'error',
          message: 'Không gửi được thao tác sửa nguồn.',
          detail,
        },
      })
      if (draftRef.current?.id === current.id) keepRejected(current)
    } finally {
      // A ticket that has moved on belongs to a newer send, or to the switch
      // that released the flag already; this answer must not clear it.
      if (sendTokenRef.current === token) {
        sendingRef.current = false
        setSending(false)
      }
    }
  }, [
    actions,
    answerStillOwns,
    bridge,
    canvas,
    cropKeep,
    cropShape,
    handleResult,
    keepRejected,
    setDraft,
    submitBlockedReason,
  ])

  // Switching tool abandons a half-drawn gesture of the previous tool rather
  // than sending points the new tool never meant to collect. Because the tool
  // letters are single-key shortcuts that fire while the canvas has focus, the
  // discard is announced instead of happening in silence.
  const lastTool = useRef(tool)
  useEffect(() => {
    if (lastTool.current === tool) return
    lastTool.current = tool
    if (draftRef.current) {
      actions.announce(
        `Đã đổi sang công cụ ${tool}, nên thao tác đang vẽ bị bỏ. Không có gì được ghi vào lịch sử.`,
      )
    }
    setDraft(null)
  }, [actions, setDraft, tool])

  const value = useMemo<SourceCanvasApi>(
    () => ({
      canvas,
      image,
      viewport,
      view,
      fitMode,
      compare,
      cropShape,
      cropKeep,
      squareLock,
      draft,
      getDraft,
      sending,
      blockedReason,
      submitBlockedReason,
      stale,
      lastSent,
      image2d,
      reportImageState,
      imageAttempt,
      reloadImage,
      setViewport,
      setCompare,
      setCropShape,
      setCropKeep,
      setSquareLock: setSquareLockLive,
      fit,
      zoomTo,
      zoomBy,
      panBy,
      startDraft,
      appendPoint,
      addKnot,
      removeLastKnot,
      cancelDraft,
      submitDraft,
    }),
    [
      addKnot,
      appendPoint,
      blockedReason,
      canvas,
      cancelDraft,
      compare,
      cropKeep,
      cropShape,
      draft,
      fit,
      fitMode,
      getDraft,
      image,
      image2d,
      imageAttempt,
      lastSent,
      panBy,
      reloadImage,
      removeLastKnot,
      reportImageState,
      sending,
      setSquareLockLive,
      setViewport,
      squareLock,
      stale,
      startDraft,
      submitBlockedReason,
      submitDraft,
      view,
      viewport,
      zoomBy,
      zoomTo,
    ],
  )

  return <SourceCanvasContext.Provider value={value}>{children}</SourceCanvasContext.Provider>
}
