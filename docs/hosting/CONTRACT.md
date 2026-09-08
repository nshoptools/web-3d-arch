# HTTPS host contract v1

Implementation for WEB-01, SEC-01, ACC-01 and EXT-05. Node **24.19.0**, ESM, stdlib only. Production copy: src/host/* and tools/hosting/*. No change to src/server is required. Frontend, authentication and domain algorithms remain separate modules.

**Trust boundary.** Operator-approved static builds are public code/data, including before login. The build root, allowlist and manifest must never contain a key, session, private project, prompt or user export. There is no safe content detector for secrets hidden in an intentionally published JavaScript/JSON file. Host rejects common credential/config names, dotfiles, unknown MIME, repo roots, symlink/junction/hardlink aliases and undeclared paths. It does not discover or recursively expose files.

Use host-config.example.json; replace every path/origin. Configuration JSON has exact keys. Paths are absolute and cannot have symlink ancestors. TLS key/certificate and manifest must be outside webroot. CLI additionally confines config/TLS/runtime to PROJECT_REVIEW_RUN. Webroot and manifest may be an approved read-only release elsewhere in this repository. HTTPS bind is a literal IP; upstream is always HTTP to literal **127.0.0.1**, configured port, no DNS or forwarded routing. Set BACKEND_ORIGIN to exactly the same HTTPS origin including nondefault port. Library port 0 supports OS-assigned tests and exposes the resulting origin; production CLI requires an explicit nonzero port.

**Manifest bounds (release packaging extension, 2026-09-08).** MAX_MANIFEST_ASSETS is 65,536 and MAX_MANIFEST_BYTES is 32 MiB, exported by manifest.mjs. Default public-byte sum stays 512 MiB; configurable maximum stays 1 GiB. Verified public bytes are eagerly retained. The full library has 306,260,612 asset bytes plus config/transport data; that asset sum is not an RSS cap. SVG/text originals may travel unchanged as explicitly bound .bin worker data with semantic source metadata retained by the separate release transport; actual PNG previews remain PNG. No active SVG MIME is added.

**Manifest.** Version 1 has exactly schemaVersion, buildId, assets, navigations. Each asset has exactly url, file, sha256, bytes, mime, cache. File is relative to webroot; URL is an absolute path on this origin. SHA-256 is lowercase 64 hex. Every file must be regular, have one link, and match size/hash at startup; verified bytes stay in memory. No file reads occur on static requests. Disk replacements do not change a running release.

URLs/files use canonical ASCII segments; no percent encoding in path, dot segments, empty segments, backslash, colon, NTFS ADS/device names, or directory listings. Validation precedes URL normalization. API query strings (OIDC state/code) are preserved and never logged. Static queries are allowed only on HTML and force private/no-store without a public marker. Navigation is an exact map from URL to HTML asset, including /. No catch-all SPA fallback. Missing asset/navigation is 404 without a build marker.

Accepted extensions/MIME are exported by manifest.mjs: HTML; JS/MJS; CSS; WASM; WOFF/WOFF2/TTF/OTF; PNG/JPEG/WebP/AVIF/ICO; JSON/webmanifest; explicitly listed binary worker data (.bin). MIME must exactly match the table and URL/file extension. SVG, XML, source maps, archives, database/key file types and all unknown MIME are rejected. JS/CSS/HTML containing sourceMappingURL/sourceURL references is rejected. The separate build pipeline must remove those references. No on-demand SVG sanitizer is claimed.

Build an explicit allowlist first (allowlist.example.json). The generator has **no glob or automatic discovery**:

~~~text
node tools/hosting/manifest.mjs <absolute-webroot> <absolute-allowlist.json> <absolute-new-manifest.json>
~~~

Run after project-env. Output must be inside that run, outside webroot. Existing output is never overwritten. Invalid generation exits 1; an output created before final validation failure is not a verified release. Host independently validates at startup.

**HTTPS routes.**

| Method/path | Behavior |
| --- | --- |
| GET/HEAD exact manifest asset/navigation | Frozen public bytes, MIME, SHA ETag, isolation headers |
| GET/HEAD /host-sw.js, serviceWorker=true | Generated worker, private/no-store, scope /; otherwise 404 |
| Allowed methods /api/v1 or /api/v1/* | Single loopback backend |
| Other /api/*, unknown navigation/file | 404, no-store |
| Static POST/PUT/etc | 405 |
| Range on static asset | 416; no partial/compressed representation |
| Bad Host/Origin/fetch metadata/SW registration | 403 |
| Bad/raw/encoded path, duplicate sensitive headers, GET body, protocol mismatch | 400 |
| Oversize body / unsupported encoding / Expect | 413 / 415 / 417 |
| Capacity / stopping | 503 |
| Upstream unavailable/invalid response; read deadline | 502; 504 |
| Write delivery lost after send | 502/504 API_DELIVERY_UNKNOWN; zero retries |

Errors are JSON {"error":{"code":"..."}} without path, stack, cookie, query or credential. TLS/parser/protocol failures may close the connection or return empty 400. Unknown startup failures produce only HOST_STARTUP_FAILED and exit 1. No HTTP redirect listener, CONNECT, WebSocket, HTTP/2, HTTP/3, compression or arbitrary proxy URL.

**Proxy semantics.** Method, raw canonical path/query, body, public Host, Cookie, Origin, CSRF, If-Match and Idempotency-Key are retained. Only an explicit request header allowlist is sent; Forwarded, X-Forwarded routing/identity, X-User/X-Auth identity and hop headers are not trusted. No CORS is added. Backend owns real auth, membership/authVersion, CSRF and origin checks. Host has no identity bypass, demo switch, cookie minting, OIDC substitution or provider keys.

Requests are buffered within the limit before any upstream write. Responses are buffered within a limit before forwarding. No replay after timeout, 5xx, disconnect or malformed response. Client must reconcile an uncertain write using its backend operation/job identifier. A host error does not prove cancellation or no charge; work already accepted by backend may finish.

Response Set-Cookie arrays remain separate, including __Host- Path=/ Secure HttpOnly SameSite=Lax and deletion cookies. API Content-Type/Disposition/ETag, request/user/session IDs and Retry-After are preserved. API redirects require relative same-origin Location, are never followed, and remain private/no-store. Backend OIDC currently returns its external authorization URL as JSON; browser uses a top-level redirect then GET callback. No popup/opener dependency. Response identity headers are metadata, not credentials.

**Headers/cache.** Normal responses have COOP same-origin, COEP require-corp, CORP same-origin, nosniff, no-referrer, HSTS (no includeSubDomains/preload), restrictive Permissions-Policy. App CSP is exported by headers.mjs: self modules/styles/fonts/workers/WASM/connect, wasm-unsafe-eval; no JS eval, inline script/handler/style permission, object, frame or foreign origin; images self/blob only. UI must safely parse/render dynamic SVG and other untrusted input. CSP is not a sanitizer; raw user SVG is never served here.

API/errors/auth/SW/query HTML: no-store, private, max-age=0; Pragma no-cache; Expires 0; Vary Cookie/Origin; no public marker. API CSP adds sandbox/default-src none. Public HTML and revalidate assets: public, max-age=0, must-revalidate. Cookies never change public bytes. Immutable assets require the first 16 SHA hex characters in their filename, with configurable max-age up to one year. A Vite short/base64 content label is not assumed to equal SHA: use revalidate unless the build supplies a matching SHA URL. Reusing immutable URLs for changed content or reusing a buildId is prohibited deployment behavior.

Public 200/304 responses carry X-Arch-Build and X-Arch-Public: 1. ETag is "sha256-<hex>". HEAD/304 preserve isolation/cache semantics. Authorization or query HTML removes public cache markers. No stale-while-revalidate/private caching.

**Service worker (opt-in, false by default).** Frontend may register /host-sw.js with scope "/" and updateViaCache "none". Only this script accepts Service-Worker: script; other manifest JS requested for SW registration is rejected. Dedicated Worker modules remain available. Do not combine a second frontend SW.

The generated SW has exact manifest URLs and a build-specific cache. API/auth, non-GET, query, Range, Authorization and cross-origin requests bypass it completely. Public requests omit credentials, reject redirects and use network no-store. Before caching 200, it verifies final URL, public marker, build, MIME, COI/CSP, bounded length and SHA. It rechecks cached bytes on network failure; online errors/login/mixed build never turn into cached success. This provides a public shell, not an offline login/lease.

No skipWaiting: old clients retain their worker generation. Changed releases require a new buildId. Close all app tabs to activate a waiting release; stale-build checks fail closed. Old caches are retained rather than purged across active clients. Storage eviction, UI/engine/schema migration, offline lease, private IndexedDB and revocation UX belong to frontend integration and remain unqualified here.
