// Raster editing contract v1. Pure ECMAScript, no DOM or I/O.
export const VERSION = 'arch-raster-edit/1';
export const LIMITS = Object.freeze({
  maxEdge: 1280, maxPixels: 1280 * 1280, maxPoints: 4096, maxSeeds: 256,
  maxSegments: 16384, maxCoordinate: 100000, maxWidth: 60,
  maxGap: 60, maxBoundaryColors: 65536, maxWork: 100000000,
  checkpointWork: 8192, maxMemoryBytes: 128 * 1024 * 1024,
  maxMetadataBytes: 1024 * 1024,
});
export class EditError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'EditError'; this.code = code; this.details = details;
  }
}
export function fail(code, message, details) { throw new EditError(code, message, details); }
export function record(v, name = 'record') {
  if (!v || typeof v !== 'object' || (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null))
    fail('INVALID_INPUT', name + ' must be a plain record');
  return v;
}
export function keys(v, allowed, name) {
  record(v, name);
  for (const key of Object.keys(v)) if (!allowed.includes(key))
    fail('INVALID_INPUT', 'Unknown ' + name + ' field: ' + key);
}
export function number(v, min, max, name, integer = false) {
  if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v)))
    fail('INVALID_INPUT', name + ' outside its supported range', {min, max});
  return v;
}
export function choice(v, values, name) {
  if (!values.includes(v)) fail('INVALID_INPUT', 'Invalid ' + name, {values});
  return v;
}
export function identifier(v, name) {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,159}$/.test(v))
    fail('INVALID_INPUT', name + ' must be a bounded identifier');
  return v;
}
export function sha(v, name = 'hash') {
  if (typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v)) fail('INVALID_INPUT', name + ' must be lowercase SHA-256');
  return v;
}
export function dimensions(width, height) {
  number(width, 1, LIMITS.maxEdge, 'width', true); number(height, 1, LIMITS.maxEdge, 'height', true);
  if (width * height > LIMITS.maxPixels) fail('RESOURCE_LIMIT', 'Pixel limit exceeded');
  return width * height;
}
export function byteArray(v, length, name = 'data') {
  if (!(v instanceof Uint8Array || v instanceof Uint8ClampedArray) ||
      !(v.buffer instanceof ArrayBuffer) || v.buffer.resizable || v.byteLength !== length)
    fail('INVALID_INPUT', name + ' must be fixed, non-shared RGBA bytes of the exact length');
  return v;
}
export function copyImage(v) {
  keys(v, ['width', 'height', 'data', 'colorSpace', 'alphaMode'], 'image');
  const pixels = dimensions(v.width, v.height);
  if (v.colorSpace !== 'srgb' || v.alphaMode !== 'straight')
    fail('INVALID_INPUT', 'Adapter must supply straight-alpha sRGB RGBA');
  return {width: v.width, height: v.height, data: new Uint8Array(byteArray(v.data, pixels * 4)),
    colorSpace: 'srgb', alphaMode: 'straight'};
}
export function copySource(v) {
  keys(v, ['id', 'hash', 'adapterId', 'adapterVersion'], 'source');
  return Object.freeze({id: identifier(v.id, 'source.id'), hash: sha(v.hash, 'source.hash'),
    adapterId: identifier(v.adapterId, 'source.adapterId'), adapterVersion: identifier(v.adapterVersion, 'source.adapterVersion')});
}
export function roundEven(value) {
  const floor = Math.floor(value), fraction = value - floor;
  return fraction < 0.5 ? floor : fraction > 0.5 ? floor + 1 : floor + (floor % 2 !== 0 ? 1 : 0);
}
export function roundRatio(n, d) {
  const q = Math.floor(n / d), r = n - q * d;
  return 2 * r < d ? q : 2 * r > d ? q + 1 : q + (q % 2);
}
export function color(v, auto = false) {
  if (auto && v === 'auto') return v;
  if (!Array.isArray(v) || (v.length !== 3 && v.length !== 4)) fail('INVALID_INPUT', 'color must be RGB[A] bytes');
  return [0, 1, 2, 3].map(i => number(i === 3 && v.length === 3 ? 255 : v[i], 0, 255, 'color', true));
}
export function point(v) {
  keys(v, ['x', 'y', 'pressure'], 'point');
  const p = {x: roundEven(number(v.x, -LIMITS.maxCoordinate, LIMITS.maxCoordinate, 'x') * 256) / 256,
    y: roundEven(number(v.y, -LIMITS.maxCoordinate, LIMITS.maxCoordinate, 'y') * 256) / 256};
  if (v.pressure !== undefined) p.pressure = number(v.pressure, 0, 1, 'pressure');
  return p;
}
function points(v, maximum, name) {
  if (!Array.isArray(v) || !v.length || v.length > maximum)
    fail('RESOURCE_LIMIT', name + ' requires 1..' + maximum + ' points');
  return v.map(point);
}
export function token(v) {
  keys(v, ['sourceId', 'sourceHash', 'originalHash', 'revision', 'hash'], 'expected token');
  return Object.freeze({sourceId: identifier(v.sourceId, 'sourceId'), sourceHash: sha(v.sourceHash),
    originalHash: sha(v.originalHash), revision: number(v.revision, 0, Number.MAX_SAFE_INTEGER - 1, 'revision', true),
    hash: sha(v.hash)});
}
export function sameToken(a, b) {
  return ['sourceId', 'sourceHash', 'originalHash', 'revision', 'hash'].every(k => a[k] === b[k]);
}
export function normalizeCommand(v) {
  record(v, 'command');
  const tool = choice(v.tool, ['paint', 'line', 'curve', 'erase', 'cut', 'crop', 'heal'], 'tool');
  const common = ['version', 'id', 'expected', 'tool', 'opacity'];
  const stroke = ['points', 'width', 'brush', 'snap'];
  const mode = ['mode', 'color'];
  const fields = {
    paint: ['seeds', 'color', 'tolerance', 'connectivity', 'blend'],
    line: [...stroke, 'color', 'blend'], curve: [...stroke, 'color', 'blend'],
    erase: [...stroke, ...mode], cut: [...stroke, ...mode],
    crop: ['from', 'to', 'shape', 'keep', 'square', ...mode],
    heal: ['method', 'seeds', 'allowExterior', 'maxGapPx', 'pixelSizeMm', 'color', ...stroke],
  };
  keys(v, [...common, ...fields[tool]], 'command');
  if (v.version !== VERSION) fail('VERSION_MISMATCH', 'Unsupported command version');
  const c = {version: VERSION, id: identifier(v.id, 'gesture id'), expected: token(v.expected), tool,
    opacity: number(v.opacity ?? 255, 0, 255, 'opacity', true)};
  if (['line', 'curve', 'erase', 'cut'].includes(tool) || (tool === 'heal' && v.method === 'brush')) {
    c.points = points(v.points, LIMITS.maxPoints, 'stroke');
    c.width = number(v.width ?? 1, 1, LIMITS.maxWidth, 'width');
    c.brush = choice(v.brush ?? 'round', ['round', 'square'], 'brush');
    c.snap = choice(v.snap ?? 'none', ['none', '45'], 'snap');
  }
  if (['paint', 'line', 'curve'].includes(tool)) {
    c.color = color(v.color);
    c.blend = choice(v.blend ?? (tool === 'paint' ? 'replace' : 'source-over'), ['replace', 'source-over'], 'blend');
  }
  if (tool === 'paint') {
    c.seeds = points(v.seeds, LIMITS.maxSeeds, 'seeds');
    c.tolerance = number(v.tolerance ?? 0, 0, 255, 'tolerance', true);
    c.connectivity = choice(v.connectivity ?? 4, [4, 8], 'connectivity');
  }
  if (['erase', 'cut', 'crop'].includes(tool)) {
    c.mode = choice(v.mode ?? 'hole', ['hole', 'merge'], 'mode');
    c.color = color(v.color ?? (c.mode === 'merge' ? 'auto' : [0, 0, 0, 0]), true);
    if (c.mode === 'merge' && c.color !== 'auto' && c.color[3] !== 255)
      fail('INVALID_INPUT', 'Merge color must be opaque; merge preserves destination alpha');
  }
  if (tool === 'crop') {
    c.from = point(v.from); c.to = point(v.to);
    c.shape = choice(v.shape ?? 'rectangle', ['rectangle', 'ellipse'], 'shape');
    c.keep = choice(v.keep ?? 'inside', ['inside', 'outside'], 'keep');
    c.square = choice(v.square ?? false, [true, false], 'square');
  }
  if (tool === 'heal') {
    c.method = choice(v.method ?? 'region', ['region', 'brush', 'all-gaps'], 'heal method');
    c.color = color(v.color ?? 'auto', true);
    if (c.method === 'region') {
      c.seeds = points(v.seeds, LIMITS.maxSeeds, 'seeds');
      c.allowExterior = choice(v.allowExterior ?? false, [true, false], 'allowExterior');
    }
    if (c.method === 'all-gaps') {
      c.maxGapPx = number(v.maxGapPx, 1, LIMITS.maxGap, 'maxGapPx', true);
      c.pixelSizeMm = number(v.pixelSizeMm, 1e-9, 10000, 'pixelSizeMm');
    }
    const relevant = c.method === 'region' ? ['seeds', 'allowExterior'] :
      c.method === 'brush' ? stroke : ['maxGapPx', 'pixelSizeMm'];
    for (const f of ['seeds', 'allowExterior', 'maxGapPx', 'pixelSizeMm', ...stroke])
      if (v[f] !== undefined && !relevant.includes(f)) fail('INVALID_INPUT', 'Inapplicable heal option: ' + f);
  }
  return c;
}
export function snap45(a, b) {
  // Closest orthogonal projection. Exact ties: horizontal, +diagonal, vertical, -diagonal.
  let best = Infinity, result;
  for (const [x, y] of [[1, 0], [1, 1], [0, 1], [-1, 1]]) {
    const t = ((b.x - a.x) * x + (b.y - a.y) * y) / (x * x + y * y);
    const p = {x: a.x + t * x, y: a.y + t * y};
    const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
    if (d < best) { best = d; result = {...b, ...p}; }
  }
  return result;
}
export function pressureScale(p) { return p === undefined ? 1 : 0.4 + 1.2 * number(p, 0, 1, 'pressure'); }
function affine(m) {
  if (!Array.isArray(m) || m.length !== 6) fail('INVALID_INPUT', 'Expected six affine coefficients');
  m.forEach(x => number(x, -1e9, 1e9, 'affine coefficient'));
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) fail('INVALID_INPUT', 'Singular or ill-conditioned affine transform');
  return det;
}
export function imageToDevice(p, m) {
  affine(m); number(p.x, -1e9, 1e9, 'point.x'); number(p.y, -1e9, 1e9, 'point.y');
  return {x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5]};
}
export function deviceToImage(p, m) {
  const d = affine(m); number(p.x, -1e9, 1e9, 'point.x'); number(p.y, -1e9, 1e9, 'point.y');
  const x = p.x - m[4], y = p.y - m[5];
  return {x: (m[3] * x - m[2] * y) / d, y: (-m[1] * x + m[0] * y) / d};
}
export function gapFromDesign(maxGapMm, pixelSizeMm) {
  number(pixelSizeMm, 1e-9, 10000, 'pixelSizeMm'); number(maxGapMm, 1e-9, 1e9, 'maxGapMm');
  const quotient = maxGapMm / pixelSizeMm, nearest = roundEven(quotient);
  // Treat only a four-ULP neighborhood of an integer as exact equality.
  const maxGapPx = Math.abs(quotient - nearest) <= 4 * Number.EPSILON * Math.max(1, quotient) ? nearest : Math.floor(quotient);
  number(maxGapPx, 1, LIMITS.maxGap, 'resolved maxGapPx', true);
  return {maxGapPx, pixelSizeMm, resolvedGapMm: maxGapPx * pixelSizeMm};
}
export class Work {
  constructor(options = {}, cancelled = () => false) {
    keys(options, ['signal', 'onProgress', 'yieldControl', 'maxWork', 'checkpointWork'], 'control');
    this.signal = options.signal;
    if (this.signal !== undefined && (typeof this.signal.aborted !== 'boolean' || typeof this.signal.addEventListener !== 'function'))
      fail('INVALID_INPUT', 'signal must be an AbortSignal');
    for (const key of ['onProgress', 'yieldControl'])
      if (options[key] !== undefined && typeof options[key] !== 'function') fail('INVALID_INPUT', key + ' must be callable');
    this.onProgress = options.onProgress;
    this.yieldControl = options.yieldControl ?? (() => new Promise(resolve => setTimeout(resolve, 0)));
    this.maxWork = number(options.maxWork ?? LIMITS.maxWork, 1, LIMITS.maxWork, 'maxWork', true);
    this.interval = number(options.checkpointWork ?? LIMITS.checkpointWork, 1, LIMITS.checkpointWork, 'checkpointWork', true);
    this.cancelled = cancelled; this.work = 0; this.sinceYield = 0;
  }
  check() { if (this.signal?.aborted || this.cancelled()) fail('CANCELLED', 'Gesture cancelled; nothing committed'); }
  async step(n, phase, completed = null, total = null, force = false) {
    this.check(); this.work += n; this.sinceYield += n;
    if (this.work > this.maxWork) fail('RESOURCE_LIMIT', 'Gesture work budget exceeded', {work: this.work, maxWork: this.maxWork});
    if (force || this.sinceYield >= this.interval) {
      this.sinceYield = 0;
      this.onProgress?.({phase, work: this.work, maxWork: this.maxWork, completed, total});
      await this.yieldControl(); this.check();
    }
  }
}
export async function hashImage(image) {
  if (!globalThis.crypto?.subtle) fail('CORE_UNAVAILABLE', 'Web Crypto SHA-256 is required');
  // Fixed 24-byte domain header followed by exact RGBA bytes, dimensions little endian.
  const bytes = new Uint8Array(24 + image.data.length);
  bytes.set(new TextEncoder().encode('ARCH-RGBA-v1'), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, image.width, true); view.setUint32(20, image.height, true);
  bytes.set(image.data, 24);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, x => x.toString(16).padStart(2, '0')).join('');
}
