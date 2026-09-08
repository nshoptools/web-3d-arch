# Acceptance and commands

Run the integrated code or the isolated candidate with the same portable command:

~~~powershell
./tests/release/run.ps1 -RunId <fresh-run> -Label <new-evidence-label>
~~~

The script resolves the repo from tools/project-env.ps1, takes a required RunId,
confines TLS/profiles/databases/packages/logs to that caller's run, stages the main
integrated full library into its own inputs and runs serial Node tests. An explicit
-LibraryRoot <checked-deployment-directory> can reuse a readonly checked deployment;
no prior RunId/path is hardcoded into test imports. The four config documents and
every source are rehashed. Sources are never fetched from a network.

Node24.19.0 and readonly Playwright1.63.0 are required. Browser pins: Chromium
153.0.8010.12/revision1243; Firefox155.0/revision1543; WebKit26.6/revision2359.
One browser at a time, own profile/downloads/artifacts and APPDATA/LOCALAPPDATA;
explicit synthetic loopback origin whitelist. Synthetic TLS errors are ignored
only in these browser tests, no trust-store install. Real HTTPS Node clients trust
only the generated synthetic certificate. No paid provider requests or actual
operator identities/keys are used.

Acceptance mapping:
- build.test: two fresh deterministic builds/all file hashes, relocation/portable
  checker, malformed/missing/changed compiled input/WASM/catalog/runtime pins,
  explicit references/licenses, casefold collisions, private customer key exclusion,
  no overwrite/outside-room output, unlisted/changed artifact rejection, safe errors.
- transport.test: unchanged frozen documents, semantic media/hash/byte preservation,
  inert original URLs, actual PNG preview mapping, exact map/hash conflicts, unsafe
  URLs/origins, source16MB versus config64MiB budgets, owned snapshots and SharedArrayBuffer
  rejection during asynchronous digest work.
- host-limits.test:65536/65537 record and32MiB/+1 byte boundaries using small/synthetic
  manifests, existing exact schema/MIME/casefold/hash/private path/sum/hardlink checks.
- https.test: actual portable host+backend, owner and two members, private settings,
  authentication/logout, CSRF/proxy identity rejection, COI/CSP/MIME/ETag/no-store,
  inert bytes/PNG, unlisted private paths and static memory snapshot.
- browser.test: all three pinned engines, genuine DedicatedWorker+WASM fixture,
  release transport, PNG decoding, synthetic OIDC PKCE/signature auth through HTTPS,
  logout/private cache exclusion, actual host stopped with public-only SW cache.
- operator.test: exact private config, explicit owner/bootstrap, original-key dependencies,
  schema5/default5min/no DB mutation on validate, actual foreground CLI start/stop,
  legitimate writer lock, artifact/catalog rollback, exact backup/source/key hashes,
  restored auth revocation/accounting hold and held maintenance.
- full-library.test: one full approved library artifact, all21391 source hashes unchanged,
  all7751 PNG preview bindings, each media-class original delivered through real HTTPS,
  original config bytes preserved, browser Worker all-map validation, real color+mono
  PNG decode and original font loading. Module/entry are explicitly synthetic plumbing
  fixtures; parent final compiled app/WASM qualification remains separate.

The runner records syntax, TAP counts, code/config/TLS input hashes before/after
and codeStableDuringRun. Original failing attempts are retained in the implementation
run alongside corrected evidence; those failures do not become passing evidence.
No independent review/configured-review conclusion or production app/deployment claim.
