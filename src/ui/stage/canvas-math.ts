/**
 * View mathematics for the 2D source canvas.
 *
 * Everything here is presentation: mapping between the CSS pixels of a viewport
 * and the pixel grid of the source image the core published, plus the Shift
 * snapping rule the renderer has to preview. No pixel is written here — the
 * seven editing tools live in the core (docs/editing/API.md, ADR-001) and this
 * file never reimplements one of them.
 */

export interface Point {
  x: number
  y: number
  pressure?: number
}

/** Scale bounds of the viewer. They bound the view, never the stroke width. */
export const MIN_SCALE = 0.05
export const MAX_SCALE = 64

export interface View {
  /** CSS pixels per image pixel. Uniform: the aspect ratio is never distorted. */
  scale: number
  /** CSS pixel offset of image pixel (0,0) inside the viewport. */
  offsetX: number
  offsetY: number
}

export interface Size {
  width: number
  height: number
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * Rounds to 1/256 px with ties to even, the same normalisation ADR-001 applies
 * once inside the core. Doing it here as well means the number the interface
 * shows, the number it sends and the number the core uses are the same number.
 */
export function quantize(value: number): number {
  if (!Number.isFinite(value)) return 0
  const scaled = value * 256
  const floor = Math.floor(scaled)
  const diff = scaled - floor
  let rounded: number
  if (diff > 0.5) rounded = floor + 1
  else if (diff < 0.5) rounded = floor
  else rounded = floor % 2 === 0 ? floor : floor + 1
  // -0 would print as "-0"; normalise it away.
  return rounded === 0 ? 0 : rounded / 256
}

export function imageToDevice(view: View, point: { x: number; y: number }): { x: number; y: number } {
  return { x: point.x * view.scale + view.offsetX, y: point.y * view.scale + view.offsetY }
}

export function deviceToImage(view: View, point: { x: number; y: number }): { x: number; y: number } {
  return { x: (point.x - view.offsetX) / view.scale, y: (point.y - view.offsetY) / view.scale }
}

/** Scale that shows the whole image inside the viewport, with a small margin. */
export function fitView(viewport: Size, image: Size, margin = 24): View {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 }
  }
  const usableW = Math.max(16, viewport.width - margin * 2)
  const usableH = Math.max(16, viewport.height - margin * 2)
  const scale = clampScale(Math.min(usableW / image.width, usableH / image.height))
  return centreView(viewport, image, scale)
}

/** Keeps the same zoom and puts the middle of the image in the middle of the box. */
export function centreView(viewport: Size, image: Size, scale: number): View {
  const safe = clampScale(scale)
  return {
    scale: safe,
    offsetX: (viewport.width - image.width * safe) / 2,
    offsetY: (viewport.height - image.height * safe) / 2,
  }
}

/** Zooms around one anchor in viewport CSS pixels, so that point stays put. */
export function zoomAround(view: View, anchor: { x: number; y: number }, nextScale: number): View {
  const scale = clampScale(nextScale)
  const image = deviceToImage(view, anchor)
  return {
    scale,
    offsetX: anchor.x - image.x * scale,
    offsetY: anchor.y - image.y * scale,
  }
}

/**
 * Shift snapping exactly as ADR-001 specifies it: project the segment onto the
 * closest of horizontal, positive diagonal, vertical and negative diagonal — in
 * that tie order — anchored to the previous already-snapped point.
 *
 * The core applies the authoritative snap when the gesture carries `snap: '45'`;
 * this copy exists so the preview shows what will actually be committed.
 */
const SNAP_AXES: readonly { x: number; y: number }[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
]

export function snap45(previous: { x: number; y: number }, next: { x: number; y: number }): { x: number; y: number } {
  const dx = next.x - previous.x
  const dy = next.y - previous.y
  let best = SNAP_AXES[0]!
  let bestLength = -1
  for (const axis of SNAP_AXES) {
    const length = Math.abs(dx * axis.x + dy * axis.y)
    // Strictly greater keeps the declared tie order.
    if (length > bestLength + 1e-9) {
      bestLength = length
      best = axis
    }
  }
  const projected = dx * best.x + dy * best.y
  return { x: previous.x + projected * best.x, y: previous.y + projected * best.y }
}

/** Square/circle lock for the crop box: the larger drag extent wins (ADR-001). */
export function squareCorner(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: from.x + (dx < 0 ? -size : size),
    y: from.y + (dy < 0 ? -size : size),
  }
}

/** Formats a zoom factor for a readout: 1 -> "100%", 0.5 -> "50%". */
export function zoomLabel(scale: number): string {
  const percent = scale * 100
  const digits = percent < 10 ? 1 : 0
  return `${percent.toFixed(digits)}%`
}
