/** Defensive JSON boundary shared by Node and the browser. No getters/coercion. */
export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'DomainError'; this.code = code; this.details = details;
  }
}
export function fail(code, message, details) { throw new DomainError(code, message, details); }
export function check(condition, code, message, details) { if (!condition) fail(code, message, details); }
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function assertKey(key) {
  check(typeof key === 'string' && !forbidden.has(key), 'unsafe-key', 'Prototype keys are forbidden.', { key });
}
export function assertRecord(value) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'record-required', 'Expected a plain JSON record.');
}
export function cloneData(value, path = '$', ancestors = new Set(), depth = 0, budget = { nodes: 0 }) {
  check(depth <= 64 && ++budget.nodes <= 200000, 'data-limit', 'JSON exceeds depth/node budget.', { path });
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { check(Number.isFinite(value), 'nonfinite', 'Finite numbers required.', { path }); return value === 0 ? 0 : value; }
  check(typeof value === 'object', 'json-required', 'Only JSON data may cross the domain boundary.', { path });
  check(!ancestors.has(value), 'cyclic-data', 'Cyclic data is not supported.', { path });
  if (!Array.isArray(value)) assertRecord(value);
  ancestors.add(value);
  const result = Array.isArray(value) ? [] : {};
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    assertKey(key);
    const d = Object.getOwnPropertyDescriptor(value, key);
    check(d && 'value' in d && d.enumerable, 'unsafe-property', 'Accessors/non-enumerable data are forbidden.', { path, key });
    if (Array.isArray(value)) check(/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length, 'array-property', 'Array contains a named property.');
    result[key] = cloneData(d.value, path + '/' + key, ancestors, depth + 1, budget);
  }
  if (Array.isArray(value)) check(result.length === value.length && keys.length === value.length + 1, 'sparse-array', 'Sparse arrays are forbidden.');
  ancestors.delete(value);
  return result;
}
export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}
export function onlyKeys(value, allowed, required = allowed) {
  assertRecord(value);
  for (const key of Object.keys(value)) check(allowed.includes(key), 'unknown-property', 'Unknown property; retain the document without modifying it.', { key });
  for (const key of required) check(Object.hasOwn(value, key), 'missing-property', 'Required property is missing.', { key });
}
export function stableStringify(value) {
  const data = cloneData(value);
  const encode = v => v === null || typeof v !== 'object' ? JSON.stringify(v)
    : Array.isArray(v) ? '[' + v.map(encode).join(',') + ']'
    : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + encode(v[k])).join(',') + '}';
  return encode(data);
}
export const equalData = (a, b) => stableStringify(a) === stableStringify(b);
export function errorRecord(error) {
  if (!(error instanceof DomainError)) throw error;
  return { code: error.code, message: error.message, details: error.details };
}
/** Parse without invoking getters; detect duplicate keys and preserve number tokens for a caller's policy. */
export function parseJsonStrict(raw, numberPolicy = token => Number(token)) {
  check(typeof raw === 'string' && raw.length <= 32 * 1024 * 1024, 'json-size', 'Expected JSON text within 32 MiB characters.');
  check(new TextEncoder().encode(raw).byteLength <= 32 * 1024 * 1024, 'json-size', 'JSON exceeds the 32 MiB UTF-8 budget.');
  let i = 0, nodes = 0;
  const ws = () => { while (i < raw.length && /[ \t\r\n]/.test(raw[i])) i++; };
  const str = () => {
    const start = i++;
    while (i < raw.length) {
      if (raw[i] === '\\') { i += 2; continue; }
      if (raw[i++] === '"') { try { return JSON.parse(raw.slice(start, i)); } catch { fail('invalid-json', 'Invalid JSON string.', { offset: start }); } }
    }
    fail('invalid-json', 'Unterminated JSON string.', { offset: start });
  };
  const read = depth => {
    check(depth <= 64 && ++nodes <= 200000, 'data-limit', 'JSON exceeds depth/node budget.');
    ws(); const c = raw[i];
    if (c === '"') return str();
    if (c === '{' || c === '[') {
      const array = c === '[', end = array ? ']' : '}', out = array ? [] : {};
      const seen = new Set(); i++; ws(); if (raw[i] === end) { i++; return out; }
      for (;;) {
        ws(); let key;
        if (!array) {
          check(raw[i] === '"', 'invalid-json', 'Expected object key.', { offset: i });
          key = str(); assertKey(key);
          check(!seen.has(key), 'duplicate-key', 'Duplicate JSON object key.', { key }); seen.add(key);
          ws(); check(raw[i++] === ':', 'invalid-json', 'Expected colon.', { offset: i });
        }
        const value = read(depth + 1);
        if (array) out.push(value); else out[key] = value;
        ws(); const delimiter = raw[i++];
        if (delimiter === end) return out;
        check(delimiter === ',', 'invalid-json', 'Expected comma or closing delimiter.', { offset: i });
      }
    }
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]]) {
      if (raw.startsWith(literal, i)) { i += literal.length; return value; }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(i));
    check(match, 'invalid-json', 'Invalid JSON token.', { offset: i });
    i += match[0].length; return numberPolicy(match[0]);
  };
  const value = read(0); ws(); check(i === raw.length, 'invalid-json', 'Unexpected trailing JSON.', { offset: i });
  return value;
}
