import {VERSION, LIMITS, keys, number, dimensions, byteArray, token, sha, identifier, normalizeCommand, fail} from './contract.mjs';

export function validateUndo(v, copy = true) {
  keys(v, ['version', 'id', 'width', 'height', 'base', 'afterHash', 'changedBounds', 'changedPixels', 'command', 'before', 'after'], 'undo payload');
  if (v.version !== VERSION) fail('VERSION_MISMATCH', 'Unsupported undo version');
  const n = dimensions(v.width, v.height), b = v.changedBounds;
  keys(b, ['x', 'y', 'width', 'height'], 'changedBounds');
  const bounds = {x: number(b.x, 0, v.width - 1, 'bounds.x', true), y: number(b.y, 0, v.height - 1, 'bounds.y', true),
    width: number(b.width, 1, v.width, 'bounds.width', true), height: number(b.height, 1, v.height, 'bounds.height', true)};
  if (bounds.x + bounds.width > v.width || bounds.y + bounds.height > v.height)
    fail('INVALID_INPUT', 'Undo bounds exceed image');
  const length = bounds.width * bounds.height * 4;
  const before = byteArray(v.before, length, 'before patch'), after = byteArray(v.after, length, 'after patch');
  const command = normalizeCommand(v.command), base = token(v.base), id = identifier(v.id, 'undo id');
  if (command.id !== id || JSON.stringify(command.expected) !== JSON.stringify(base))
    fail('INVALID_INPUT', 'Undo provenance disagrees with command');
  return {version: VERSION, id, width: v.width, height: v.height, base, afterHash: sha(v.afterHash),
    changedBounds: bounds, changedPixels: number(v.changedPixels, 1, Math.min(n, length / 4), 'changedPixels', true),
    command, before: copy ? new Uint8Array(before) : before, after: copy ? new Uint8Array(after) : after};
}
const MAGIC = [65, 82, 67, 72, 69, 68, 49, 0]; // ARCHED1\0
export function undoByteLength(payload) {
  const {before, after, ...metadata} = validateUndo(payload, false);
  const length = new TextEncoder().encode(JSON.stringify(metadata)).length;
  if (length > LIMITS.maxMetadataBytes) fail('RESOURCE_LIMIT', 'Undo metadata too large');
  return 20 + length + before.length + after.length;
}
export function encodeUndo(payload) {
  const p = validateUndo(payload, false);
  const {before, after, ...metadata} = p, bytes = new TextEncoder().encode(JSON.stringify(metadata));
  if (bytes.length > LIMITS.maxMetadataBytes) fail('RESOURCE_LIMIT', 'Undo metadata too large');
  const out = new Uint8Array(20 + bytes.length + before.length + after.length), view = new DataView(out.buffer);
  out.set(MAGIC); view.setUint32(8, bytes.length, true); view.setUint32(12, before.length, true); view.setUint32(16, 0, true);
  out.set(bytes, 20); out.set(before, 20 + bytes.length); out.set(after, 20 + bytes.length + before.length);
  return out;
}
export function decodeUndo(bytes) {
  byteArray(bytes, bytes?.byteLength, 'encoded undo');
  if (bytes.length < 20 || bytes.length > 20 + LIMITS.maxMetadataBytes + LIMITS.maxPixels * 8)
    fail('INVALID_INPUT', 'Encoded undo length outside limits');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (MAGIC.some((v, i) => bytes[i] !== v) || view.getUint32(16, true) !== 0)
    fail('VERSION_MISMATCH', 'Invalid undo header');
  const metaLength = view.getUint32(8, true), patchLength = view.getUint32(12, true);
  if (metaLength > LIMITS.maxMetadataBytes || patchLength > LIMITS.maxPixels * 4 ||
      20 + metaLength + 2 * patchLength !== bytes.length)
    fail('INVALID_INPUT', 'Invalid undo lengths');
  let metadata;
  try { metadata = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(20, 20 + metaLength))); }
  catch { fail('INVALID_INPUT', 'Invalid undo metadata encoding'); }
  keys(metadata, ['version', 'id', 'width', 'height', 'base', 'afterHash', 'changedBounds', 'changedPixels', 'command'], 'undo metadata');
  return validateUndo({...metadata, before: bytes.subarray(20 + metaLength, 20 + metaLength + patchLength),
    after: bytes.subarray(20 + metaLength + patchLength)});
}
export async function makeUndo(image, next, command, hash, work) {
  const w = image.width, h = image.height, a = image.data, b = next.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2] || a[o + 3] !== b[o + 3]) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); count++;
      }
    }
    await work.step(w, 'changed-bounds', y + 1, h);
  }
  if (!count) return null;
  const bounds = {x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1};
  const before = new Uint8Array(bounds.width * bounds.height * 4), after = new Uint8Array(before.length);
  for (let y = 0; y < bounds.height; y++) {
    const start = ((y0 + y) * w + x0) * 4, offset = y * bounds.width * 4, end = start + bounds.width * 4;
    before.set(a.subarray(start, end), offset); after.set(b.subarray(start, end), offset);
    await work.step(bounds.width * 2, 'undo-patch', y + 1, bounds.height);
  }
  return {version: VERSION, id: command.id, width: w, height: h, base: command.expected, afterHash: hash,
    changedBounds: bounds, changedPixels: count, command, before, after};
}
export async function replayPixels(image, payload, direction, work) {
  const next = {...image, data: new Uint8Array(image.data)}, b = payload.changedBounds;
  const from = direction === 'undo' ? payload.after : payload.before, to = direction === 'undo' ? payload.before : payload.after;
  let changes = 0, minX = b.width, minY = b.height, maxX = -1, maxY = -1;
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const j = (y * b.width + x) * 4, o = ((b.y + y) * image.width + b.x + x) * 4;
      let changed = false;
      for (let k = 0; k < 4; k++) {
        if (image.data[o + k] !== from[j + k]) fail('PAYLOAD_MISMATCH', 'Undo patch does not match current pixels');
        if (from[j + k] !== to[j + k]) changed = true;
        next.data[o + k] = to[j + k];
      }
      if (changed) {
        changes++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    await work.step(b.width, 'replay-patch', y + 1, b.height);
  }
  if (changes !== payload.changedPixels || minX !== 0 || minY !== 0 || maxX !== b.width - 1 || maxY !== b.height - 1)
    fail('PAYLOAD_MISMATCH', 'Undo changed bounds/count are not exact');
  return next;
}
