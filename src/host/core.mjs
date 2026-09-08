import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';

export class HostFault extends Error {
  constructor(code, status = 500) { super(code); this.code = code; this.status = status; }
}
export function need(ok, code, status) { if (!ok) throw new HostFault(code, status); }
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function exact(value, keys, required = keys) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'CONFIG_INVALID');
  need(Object.keys(value).every(k => keys.includes(k)) && required.every(k => Object.hasOwn(value, k)), 'CONFIG_FIELDS_INVALID');
}
export function integer(n, min, max) { need(Number.isSafeInteger(n) && n >= min && n <= max, 'LIMIT_INVALID'); return n; }
export function inside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel));
}
export function plainPath(path) {
  need(typeof path === 'string' && isAbsolute(path), 'ABSOLUTE_PATH_REQUIRED');
  const abs = resolve(path);
  for (let p = abs;; p = dirname(p)) {
    const s = lstatSync(p);
    need(!s.isSymbolicLink(), 'SYMLINK_REJECTED');
    if (dirname(p) === p) break;
  }
  need(realpathSync.native(abs).toLowerCase() === abs.toLowerCase(), 'PATH_ALIAS_REJECTED');
  return abs;
}
export function readPlain(path, limit) {
  const abs = plainPath(path), before = lstatSync(abs);
  need(before.isFile() && before.nlink === 1 && before.size <= limit, 'FILE_REJECTED');
  const fd = openSync(abs, 'r');
  try {
    const stat = fstatSync(fd);
    need(stat.isFile() && stat.nlink === 1 && stat.ino === before.ino && stat.dev === before.dev && stat.size <= limit, 'FILE_CHANGED');
    const bounded = Buffer.alloc(stat.size + 1);
    let count = 0, n;
    do { n = readSync(fd, bounded, count, bounded.length-count, null); count += n; } while(n > 0 && count < bounded.length);
    const bytes = bounded.subarray(0, count);
    need(bytes.length === stat.size && bytes.length <= limit, 'FILE_CHANGED');
    plainPath(abs);
    need(lstatSync(abs).ino === stat.ino, 'FILE_CHANGED');
    return bytes;
  } finally { closeSync(fd); }
}
export function publicPath(path) {
  // Deliberately canonical ASCII URLs. Decode/normalize is never used to select a file.
  need(typeof path === 'string' && path.length <= 2048 && path.startsWith('/') && !path.startsWith('//'), 'PATH_REJECTED', 400);
  if (path === '/') return path;
  need(/^\/[A-Za-z0-9_/-]+(?:[.][A-Za-z0-9_/-]+)*$/.test(path), 'PATH_REJECTED', 400);
  const parts = path.slice(1).split('/');
  need(parts.every(p => p && !p.startsWith('.') && !p.endsWith('.') && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)), 'PATH_REJECTED', 400);
  return path;
}
export const isApi = path => path === '/api' || path.startsWith('/api/');
export function target(raw) {
  need(typeof raw === 'string' && raw.length <= 8192 && !/[\x00-\x20\x7f\\#]/.test(raw), 'PATH_REJECTED', 400);
  const i = raw.indexOf('?'), path = i === -1 ? raw : raw.slice(0, i);
  publicPath(path);
  return { path, query: i !== -1 };
}
