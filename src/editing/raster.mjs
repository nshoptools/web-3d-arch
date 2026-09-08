import {LIMITS, fail, roundRatio, pressureScale, snap45} from './contract.mjs';

const rgba = (data, i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
const pack = c => (((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) >>> 0);
const unpack = p => [p >>> 24, (p >>> 16) & 255, (p >>> 8) & 255, p & 255];
const inside = (x, y, w, h) => x >= 0 && y >= 0 && x < w && y < h;
function neighbors(i, w, h, diagonal = false) {
  const x = i % w, y = Math.floor(i / w), out = [];
  if (x > 0) out.push(i - 1); if (x + 1 < w) out.push(i + 1);
  if (y > 0) out.push(i - w); if (y + 1 < h) out.push(i + w);
  if (diagonal) {
    if (x > 0 && y > 0) out.push(i - w - 1);
    if (x + 1 < w && y > 0) out.push(i - w + 1);
    if (x > 0 && y + 1 < h) out.push(i + w - 1);
    if (x + 1 < w && y + 1 < h) out.push(i + w + 1);
  }
  return out;
}
function matches(data, i, target, tolerance, transparentOnly) {
  if (transparentOnly) return data[i * 4 + 3] === 0;
  if (data[i * 4 + 3] === 0 && target[3] === 0) return true;
  for (let k = 0; k < 4; k++) if (Math.abs(data[i * 4 + k] - target[k]) > tolerance) return false;
  return true;
}
async function flood(image, command, work, healing = false) {
  const {width: w, height: h, data} = image, mask = new Uint8Array(w * h), queue = new Uint32Array(w * h);
  let visited = 0, units = 0;
  for (const seed of command.seeds) {
    const x = Math.floor(seed.x), y = Math.floor(seed.y);
    if (!inside(x, y, w, h)) continue;
    const first = y * w + x;
    if (mask[first] || (healing && data[first * 4 + 3] !== 0)) continue;
    const target = rgba(data, first); let head = 0, tail = 1, exterior = false;
    queue[0] = first; mask[first] = 1;
    while (head < tail) {
      const i = queue[head++], ix = i % w, iy = Math.floor(i / w);
      if (!ix || !iy || ix === w - 1 || iy === h - 1) exterior = true;
      for (const j of neighbors(i, w, h, command.connectivity === 8)) {
        if (!mask[j] && matches(data, j, target, command.tolerance ?? 0, healing)) {
          mask[j] = 1; queue[tail++] = j;
        }
      }
      visited++; units += command.connectivity === 8 ? 9 : 5;
      if (units >= 1024) { await work.step(units, 'select-region', visited, w * h); units = 0; }
    }
    if (healing && exterior && !command.allowExterior)
      fail('EXTERIOR_REGION', 'Selected transparent region touches the image edge; explicitly allowExterior or use a brush');
  }
  await work.step(units, 'select-region', visited, w * h);
  return mask;
}
function distanceSq(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
const mid = (a, b) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
async function curveSegments(points, work) {
  const result = [], toleranceSq = 0.125 ** 2;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const b1 = {x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6};
    const b2 = {x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6};
    const r0 = p1.scale, r1 = p2.scale;
    const stack = [{a: p1, b: b1, c: b2, d: p2, t0: 0, t1: 1, depth: 0}];
    while (stack.length) {
      const s = stack.pop();
      if (Math.max(distanceSq(s.b, s.a, s.d), distanceSq(s.c, s.a, s.d)) <= toleranceSq) {
        result.push([{...s.a, scale: r0 + (r1 - r0) * s.t0}, {...s.d, scale: r0 + (r1 - r0) * s.t1}]);
        if (result.length > LIMITS.maxSegments) fail('RESOURCE_LIMIT', 'Curve segment limit exceeded');
      } else {
        if (s.depth >= 16) fail('RESOURCE_LIMIT', 'Curve subdivision depth exceeded');
        const ab = mid(s.a, s.b), bc = mid(s.b, s.c), cd = mid(s.c, s.d), abc = mid(ab, bc), bcd = mid(bc, cd), m = mid(abc, bcd);
        const t = (s.t0 + s.t1) / 2, depth = s.depth + 1;
        stack.push({a: m, b: bcd, c: cd, d: s.d, t0: t, t1: s.t1, depth});
        stack.push({a: s.a, b: ab, c: abc, d: m, t0: s.t0, t1: t, depth});
      }
      await work.step(1, 'flatten-curve', i, points.length - 1);
    }
  }
  return result;
}
// Exact test for the union of linearly varying discs/squares along one segment.
function sweptHit(x, y, a, b, r0, r1, brush) {
  const dx = b.x - a.x, dy = b.y - a.y, ex = x - a.x, ey = y - a.y, dr = r1 - r0;
  if (brush === 'round') {
    const A = dx * dx + dy * dy - dr * dr, B = -2 * (ex * dx + ey * dy + r0 * dr), C = ex * ex + ey * ey - r0 * r0;
    if (C <= 0 || A + B + C <= 0) return true;
    const t = A > 0 ? -B / (2 * A) : -1;
    return t > 0 && t < 1 && (A * t + B) * t + C <= 0;
  }
  let lo = 0, hi = 1;
  for (const [constant, slope] of [[ex - r0, -dx - dr], [-ex - r0, dx - dr], [ey - r0, -dy - dr], [-ey - r0, dy - dr]]) {
    if (slope === 0) { if (constant > 0) return false; }
    else if (slope > 0) hi = Math.min(hi, -constant / slope);
    else lo = Math.max(lo, -constant / slope);
  }
  return lo <= hi;
}
async function stroke(image, c, work) {
  const w = image.width, h = image.height, mask = new Uint8Array(w * h);
  const points = c.points.map(p => ({...p, scale: pressureScale(p.pressure)}));
  if (c.snap === '45') for (let i = 1; i < points.length; i++) points[i] = snap45(points[i - 1], points[i]);
  const segments = c.tool === 'curve' && points.length > 2 ? await curveSegments(points, work) :
    points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((p, i) => [points[i], p]);
  let tested = 0;
  for (const [a, b] of segments) {
    const r0 = c.width * a.scale / 2, r1 = c.width * b.scale / 2;
    const x0 = Math.max(0, Math.ceil(Math.min(a.x - r0, b.x - r1) - 0.5));
    const x1 = Math.min(w - 1, Math.floor(Math.max(a.x + r0, b.x + r1) - 0.5));
    const y0 = Math.max(0, Math.ceil(Math.min(a.y - r0, b.y - r1) - 0.5));
    const y1 = Math.min(h - 1, Math.floor(Math.max(a.y + r0, b.y + r1) - 0.5));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (!mask[i] && sweptHit(x + 0.5, y + 0.5, a, b, r0, r1, c.brush)) mask[i] = 1;
      }
      const count = Math.max(0, x1 - x0 + 1); tested += count;
      await work.step(count, 'rasterize-stroke', tested);
    }
    await work.step(1, 'rasterize-stroke', tested);
  }
  return mask;
}
async function crop(image, c, work) {
  const w = image.width, h = image.height, mask = new Uint8Array(w * h), end = {...c.to};
  if (c.square) {
    const size = Math.max(Math.abs(end.x - c.from.x), Math.abs(end.y - c.from.y));
    end.x = c.from.x + (end.x < c.from.x ? -size : size);
    end.y = c.from.y + (end.y < c.from.y ? -size : size);
  }
  const x0 = Math.min(c.from.x, end.x), x1 = Math.max(c.from.x, end.x);
  const y0 = Math.min(c.from.y, end.y), y1 = Math.max(c.from.y, end.y);
  if (x0 === x1 || y0 === y1) return mask; // Clicking an empty crop never deletes the image.
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const within = c.shape === 'rectangle' ? x + 0.5 >= x0 && x + 0.5 < x1 && y + 0.5 >= y0 && y + 0.5 < y1 :
        ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
      mask[y * w + x] = (c.keep === 'inside' ? !within : within) ? 1 : 0;
    }
    await work.step(w, 'crop-mask', y + 1, h);
  }
  return mask;
}
async function boundaryColors(image, mask, work) {
  const {width: w, height: h, data} = image, n = w * h;
  const output = new Uint32Array(n), seen = new Uint8Array(n), queue = new Uint32Array(n);
  let units = 0;
  for (let start = 0; start < n; start++) {
    units++;
    if (!mask[start] || seen[start]) {
      if (units >= 1024) { await work.step(units, 'boundary-colors', start, n); units = 0; }
      continue;
    }
    const votes = new Map(); let head = 0, tail = 1;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      for (const j of neighbors(i, w, h)) {
        if (mask[j]) {
          if (!seen[j]) { seen[j] = 1; queue[tail++] = j; }
        } else if (data[j * 4 + 3] > 0) {
          const key = pack(rgba(data, j));
          votes.set(key, (votes.get(key) ?? 0) + 1);
          if (votes.size > LIMITS.maxBoundaryColors) fail('RESOURCE_LIMIT', 'Too many boundary colors; select an explicit color');
        }
      }
      units += 5;
      if (units >= 1024) { await work.step(units, 'boundary-colors', start, n); units = 0; }
    }
    if (!votes.size) fail('NO_BOUNDARY_COLOR', 'No occupied boundary neighbor; select an explicit color');
    let best = null, count = -1;
    for (const [key, value] of votes) {
      if (value > count || (value === count && key < best)) { best = key; count = value; }
      if (++units >= 1024) { await work.step(units, 'boundary-colors', start, n); units = 0; }
    }
    for (let q = 0; q < tail; q++) {
      output[queue[q]] = best;
      if (++units >= 1024) { await work.step(units, 'boundary-colors', start, n); units = 0; }
    }
  }
  await work.step(units, 'boundary-colors', n, n);
  return output;
}
async function allGaps(image, c, work) {
  const {width: w, height: h, data} = image, mask = new Uint8Array(w * h), colors = new Uint32Array(w * h), distances = new Uint8Array(w * h);
  const consider = (i, distance, key) => {
    if (!mask[i] || distance < distances[i] || (distance === distances[i] && key < colors[i])) {
      mask[i] = 1; distances[i] = distance; colors[i] = key;
    }
  };
  for (const horizontal of [true, false]) {
    const lines = horizontal ? h : w, length = horizontal ? w : h, stride = horizontal ? 1 : w;
    for (let line = 0; line < lines; line++) {
      const start = horizontal ? line * w : line; let left = -1;
      for (let p = 0; p < length; p++) {
        if (!data[(start + p * stride) * 4 + 3]) continue;
        const gap = p - left - 1;
        if (left >= 0 && gap > 0 && gap <= c.maxGapPx) {
          const a = pack(rgba(data, start + left * stride)), b = pack(rgba(data, start + p * stride));
          for (let t = 1; t <= gap; t++) {
            const rightDistance = gap + 1 - t;
            const key = t < rightDistance ? a : rightDistance < t ? b : Math.min(a, b);
            consider(start + (left + t) * stride, Math.min(t, rightDistance), key);
          }
        }
        left = p;
      }
      await work.step(length * 2, 'heal-gaps', line + 1 + (horizontal ? 0 : h), h + w);
    }
  }
  return {mask, colors};
}
function writePixel(data, offset, source, opacity, blend) {
  const sa = roundRatio(source[3] * opacity, 255), da = data[offset + 3];
  if (blend === 'replace') {
    data[offset] = sa ? source[0] : 0; data[offset + 1] = sa ? source[1] : 0; data[offset + 2] = sa ? source[2] : 0;
    data[offset + 3] = sa; return;
  }
  if (!sa) return;
  const denominator = sa * 255 + da * (255 - sa);
  for (let k = 0; k < 3; k++) data[offset + k] = roundRatio(source[k] * sa * 255 + data[offset + k] * da * (255 - sa), denominator);
  data[offset + 3] = roundRatio(denominator, 255);
}
export async function editPixels(image, command, work) {
  const c = command, n = image.width * image.height;
  // Opacity zero is explicitly a no-op for every tool, including replace/cut.
  if (!c.opacity) return new Uint8Array(image.data);
  let mask, colors;
  if (c.tool === 'paint') mask = await flood(image, c, work);
  else if (c.tool === 'crop') mask = await crop(image, c, work);
  else if (c.tool === 'heal' && c.method === 'region') mask = await flood(image, c, work, true);
  else if (c.tool === 'heal' && c.method === 'all-gaps') ({mask, colors} = await allGaps(image, c, work));
  else mask = await stroke(image, c, work);
  if (c.mode === 'merge' || c.tool === 'heal') {
    for (let start = 0; start < n; start += 1024) {
      for (let i = start; i < Math.min(n, start + 1024); i++) {
        const occupied = image.data[i * 4 + 3] > 0;
        if ((c.mode === 'merge' && !occupied) || (c.tool === 'heal' && occupied)) mask[i] = 0;
      }
      await work.step(Math.min(1024, n - start), 'filter-mask', start, n);
    }
    if (c.color === 'auto' && !colors) colors = await boundaryColors(image, mask, work);
  }
  const data = new Uint8Array(image.data);
  for (let start = 0; start < n; start += 1024) {
    for (let i = start; i < Math.min(n, start + 1024); i++) {
      if (!mask[i]) continue;
      const o = i * 4;
      if (c.mode === 'hole') {
        const alpha = roundRatio(data[o + 3] * (255 - c.opacity), 255);
        data[o + 3] = alpha;
        if (!alpha) data[o] = data[o + 1] = data[o + 2] = 0;
      } else if (c.mode === 'merge') {
        const chosen = c.color === 'auto' ? unpack(colors[i]) : c.color;
        for (let k = 0; k < 3; k++) data[o + k] = roundRatio(chosen[k] * c.opacity + data[o + k] * (255 - c.opacity), 255);
      } else {
        const chosen = c.color === 'auto' ? unpack(colors[i]) : c.color;
        writePixel(data, o, chosen, c.opacity, c.blend ?? 'source-over');
      }
    }
    await work.step(Math.min(1024, n - start), 'apply-color', start, n);
  }
  return data;
}
