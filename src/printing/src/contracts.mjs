export class PrintingError extends Error {
  constructor(code, detail = '') { super(detail ? code + ': ' + detail : code); this.name='PrintingError'; this.code=code; if(detail) this.detail=String(detail).slice(0,512); }
}
export function check(ok, code, detail) { if (!ok) throw new PrintingError(code, detail); }
export function dataOnly(x, depth=0) {
  check(depth<=32,'JSON_DEPTH');
  if (x===null || typeof x==='boolean' || typeof x==='string') return;
  if (typeof x==='number') { check(Number.isFinite(x),'JSON_NONFINITE'); return; }
  check(typeof x==='object' && (Array.isArray(x) || Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null),'JSON_DATA_ONLY');
  check(Object.keys(x).length<=10000,'JSON_KEY_BOUND');
  for(const k of Object.keys(x)) {
    check(!['__proto__','prototype','constructor'].includes(k),'JSON_UNSAFE_KEY');
    const d=Object.getOwnPropertyDescriptor(x,k);check(d && 'value' in d,'JSON_DATA_ONLY');
    dataOnly(d.value,depth+1);
  }
}
export function canonical(x) {
  dataOnly(x);
  if (x===null || typeof x!=='object') return JSON.stringify(x);
  if (Array.isArray(x)) return '['+x.map(canonical).join(',')+']';
  return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
}
export const utf8 = new TextEncoder();
export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
export const hashData = x=>sha256(utf8.encode(canonical(x)));
export function parseJson(text, maxBytes=2*1024*1024) {
  check(utf8.encode(text).length<=maxBytes,'JSON_BYTE_BOUND');
  let x;try{x=JSON.parse(text);}catch{throw new PrintingError('INVALID_JSON');}
  dataOnly(x);return x;
}
export function xmlText(s) {
  check(typeof s==='string' && s.length<=4096 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/u.test(s),'XML_TEXT');
  // Reject isolated UTF-16 surrogates; TextEncoder must not silently replace names.
  check(s.isWellFormed(),'XML_TEXT');
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;");
}
export async function sealed(payload) { return {payload:structuredClone(payload),sha256:await hashData(payload)}; }
export async function verifySealed(snapshot, code) {
  check(snapshot && /^[a-f0-9]{64}$/.test(snapshot.sha256),'SNAPSHOT_HASH',code);
  check(await hashData(snapshot.payload)===snapshot.sha256,'SNAPSHOT_HASH',code);
  return snapshot.payload;
}
