import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const id = () => randomUUID();
export const token = () => randomBytes(32).toString('base64url');
export const sha = value => createHash('sha256').update(value).digest('hex');
export class Fault extends Error {
  constructor(status, code, details = {}) { super(code); this.status = status; this.code = code; this.details = details; }
}
export function fail(condition, status, code, details) { if (!condition) throw new Fault(status, code, details); }
export function exact(value, allowed, required = allowed) {
  fail(value && typeof value === 'object' && !Array.isArray(value), 400, 'INVALID_JSON_OBJECT');
  fail(Object.keys(value).every(k => allowed.includes(k)) && required.every(k => Object.hasOwn(value, k)), 400, 'INVALID_FIELDS');
  return value;
}
export function str(v, max = 200, min = 1) {
  fail(typeof v === 'string' && v.length >= min && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v), 400, 'INVALID_STRING');
  return v;
}
export function integer(v, max = 1_000_000_000_000, min = 0) { fail(Number.isSafeInteger(v) && v >= min && v <= max, 400, 'INVALID_INTEGER'); return v; }
export function uuid(v) { fail(typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v), 400, 'INVALID_ID'); return v; }
export const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function canonical(value, depth = 0) {
  fail(depth <= 32, 400, 'JSON_DEPTH');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { fail(Number.isFinite(value), 400, 'INVALID_NUMBER'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(x => canonical(x, depth + 1)).join(',') + ']';
  fail(value && typeof value === 'object', 400, 'INVALID_JSON');
  const keys = Object.keys(value).sort();
  fail(keys.every(k => !['__proto__', 'prototype', 'constructor'].includes(k)), 400, 'UNSAFE_JSON_KEY');
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(value[k], depth + 1)).join(',') + '}';
}
export function parse(text) { try { const v = JSON.parse(text); canonical(v); return v; } catch (e) { if (e instanceof Fault) throw e; throw new Fault(400, 'INVALID_JSON'); } }
export const period = time => ({ day: new Date(time).toISOString().slice(0,10), month: new Date(time).toISOString().slice(0,7) });
export function publicUser(u) { return { id:u.id, role:u.role, status:u.status, authVersion:u.auth_version }; }
export function cookieValue(req, name) {
  const hits = (req.headers.cookie ?? '').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  return hits.length === 1 ? hits[0].slice(name.length+1) : null;
}

