export const APP_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; worker-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'";
export const PRIVATE_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; sandbox";
export function secureHeaders(res, { publicAsset=false, hstsSeconds=31536000 } = {}) {
  for (const [k,v] of Object.entries({
    'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
    'Cross-Origin-Opener-Policy':'same-origin', 'Cross-Origin-Embedder-Policy':'require-corp',
    'Cross-Origin-Resource-Policy':'same-origin', 'Content-Security-Policy':publicAsset ? APP_CSP : PRIVATE_CSP,
    'Permissions-Policy':'cross-origin-isolated=(self), camera=(), microphone=(), geolocation=(), payment=()',
    'Strict-Transport-Security':'max-age='+hstsSeconds
  })) res.setHeader(k,v);
}
export function privateHeaders(res) {
  res.setHeader('Cache-Control','no-store, private, max-age=0');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.setHeader('Vary','Cookie, Origin');
  res.removeHeader('X-Arch-Build');
  res.removeHeader('X-Arch-Public');
}
export function safeError(res, status, code) {
  if (res.headersSent || res.destroyed) { res.destroy(); return; }
  privateHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({error:{code}}));
}
