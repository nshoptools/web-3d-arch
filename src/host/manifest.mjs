import { resolve, extname, basename, dirname } from 'node:path';
import { lstatSync, existsSync } from 'node:fs';
import { need, exact, integer, inside, plainPath, readPlain, digest, publicPath, isApi } from './core.mjs';
export const MIME = Object.freeze({
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.wasm':'application/wasm', '.woff2':'font/woff2', '.woff':'font/woff',
  '.ttf':'font/ttf', '.otf':'font/otf', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.avif':'image/avif', '.ico':'image/x-icon',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8',
  '.bin':'application/octet-stream'
});
export const MAX_MANIFEST_ASSETS = 65536;
export const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
export const SW_PATH = '/host-sw.js';
const forbidden = p => p.split('/').some(s =>
  /^(tmp|report|reports|cache|node_modules|tools|docs|src|tests|inputs|work|evidence|backups?)$/i.test(s) ||
  /(?:^|[._-])(credentials?|secrets?|private|tokens?|passwords?|sessions?|vault|oidc|env)(?:[._-]|$)/i.test(s) ||
  /^(keys?|host-config|package|package-lock|tsconfig)(?:[.]|$)/i.test(s));
export function assetPath(p) {
  publicPath(p);
  need(p !== '/' && !isApi(p) && p !== SW_PATH && !forbidden(p), 'ASSET_PATH_REJECTED');
  return p;
}
export function loadManifest({ webroot, manifestPath, maxAssetBytes, maxPublicBytes, immutableMaxAge }) {
  const root = plainPath(webroot), manifestFile = plainPath(manifestPath);
  need(lstatSync(root).isDirectory() && !inside(root, manifestFile), 'BUILD_ROOT_INVALID');
  need(dirname(root) !== root && !['.git','.toolchain','tmp','runs','cache'].includes(basename(root).toLowerCase()), 'BUILD_ROOT_INVALID');
  need(!['AGENTS.md','.git','.toolchain','tools/project-env.ps1'].some(p => existsSync(resolve(root,p))), 'REPOSITORY_ROOT_REJECTED');
  const manifestBytes = readPlain(manifestFile, MAX_MANIFEST_BYTES);
  const document = JSON.parse(manifestBytes.toString('utf8'));
  exact(document, ['schemaVersion','buildId','assets','navigations']);
  need(document.schemaVersion === 1 && /^[a-zA-Z0-9_-]{1,80}$/.test(document.buildId), 'MANIFEST_INVALID');
  need(Array.isArray(document.assets) && document.assets.length > 0 && document.assets.length <= MAX_MANIFEST_ASSETS, 'MANIFEST_INVALID');
  exact(document.navigations, Object.keys(document.navigations ?? {}), []);
  const entries = new Map(), seenFiles = new Set(), seenUrls = new Set();
  let total = 0;
  for (const a of document.assets) {
    exact(a, ['url','file','sha256','bytes','mime','cache']);
    assetPath(a.url); assetPath('/' + a.file);
    need(!seenUrls.has(a.url.toLowerCase()) && !seenFiles.has(a.file.toLowerCase()), 'MANIFEST_DUPLICATE');
    seenUrls.add(a.url.toLowerCase()); seenFiles.add(a.file.toLowerCase());
    const extension = extname(a.file), mime = MIME[extension];
    need(mime && a.mime === mime && extname(a.url) === extension, 'MIME_REJECTED');
    need(/^[a-f0-9]{64}$/.test(a.sha256), 'HASH_INVALID');
    integer(a.bytes, 1, maxAssetBytes);
    total += a.bytes; need(total <= maxPublicBytes, 'PUBLIC_BYTES_LIMIT');
    need(['revalidate','immutable'].includes(a.cache), 'CACHE_POLICY_INVALID');
    if (a.cache === 'immutable') {
      need(extension !== '.html' && basename(a.url).includes(a.sha256.slice(0,16)), 'IMMUTABLE_HASH_REQUIRED');
    }
    const file = resolve(root, a.file);
    need(inside(root, file) && file !== root, 'BUILD_ESCAPE');
    const bytes = readPlain(file, maxAssetBytes);
    need(bytes.length === a.bytes && digest(bytes) === a.sha256, 'ASSET_INTEGRITY');
    const text = ['.js','.mjs','.css','.html'].includes(extension) ? bytes.toString('utf8') : '';
    need(!/(?:sourceMappingURL|sourceURL)\s*=/.test(text), 'SOURCEMAP_REFERENCE_REJECTED');
    entries.set(a.url, { bytes, mime, hash:a.sha256, html:extension === '.html',
      cache:a.cache === 'immutable' ? 'public, max-age=' + immutableMaxAge + ', immutable' : 'public, max-age=0, must-revalidate' });
  }
  need(Object.keys(document.navigations).length >= 1 && Object.keys(document.navigations).length <= 1000, 'NAVIGATION_INVALID');
  for (const [url, asset] of Object.entries(document.navigations)) {
    publicPath(url);
    need(!isApi(url) && url !== SW_PATH && !forbidden(url) && !entries.has(url), 'NAVIGATION_INVALID');
    const entry = entries.get(asset);
    need(entry?.html, 'NAVIGATION_INVALID');
    entries.set(url, entry);
  }
  need(entries.get('/')?.html, 'ROOT_NAVIGATION_REQUIRED');
  return { entries, buildId:document.buildId, publicBytes:total, assetCount:document.assets.length, manifestHash:digest(manifestBytes) };
}
