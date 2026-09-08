# Frozen product application builder handoff

Implementation only, run20260908-product-release-builder. Parent promotes the
explicit delta; nothing in main, prior rooms or .toolchain was written by this
work. No package.json patch is needed.

## Ready baseline

Repository-relative paths under tmp/reviews/codex/runs/20260908-product-release-builder:

| Item | Path | SHA256 |
|---|---|---|
| Actual portable artifact | work/release-owned-r2/release-manifest.json | 1147ad94ad005ffdb5f2524e4d9e6ada71778f3cc84c1b3cf590b2165c3b621f |
| Prepared seal | work/production-owned-r2-1/prepared.json | 136b8b90a35e4007a6e110db7a2737d73eb25f12c8b33fc9b44b595fb333d2e9 |
| Input | inputs/pinned-application4/application-input.json | d06649e4e6bb9ea9235ad60f759049bec089a7c9f67c05aef54c90ed0f091072 |
| Exact285-file main capture | work/production-owned-r2-1/inputs/snapshot.json | 01a6382612c5ca4ff4c230555691c484aeade3e75201cb8372104b980227bf3c |
| Canonical parent native build receipt | inputs/engine-owned-r2/build-receipt.json | 171daf4a7bcb16836970ace1634217ed8aeb6d986da4ad2ef0963abb1a991f42 |

Artifact:21,647 manifest-listed files,21,414 public assets,360,390,873 public bytes,
schema5,172 original notice records. Actual index.html/main/product-entry compiled
to17 frontend assets with four explicit ES Worker entries; no source maps/inlining.
The private source snapshot includes the profile-hardening baseline, current
runtime helper and canonical incoming API/build sources. Capture was checked
after compile/plan and again before atomic package publication.

The source wrapper139,291 bytes is
64c5f89e2ee8fecda371436f907faf83e9120c41e11089979bd011bc8a197ed2.
WASM5,788,253 bytes is
b67d421769ba188e5dc6328bf520ab683213239459da3c308d92411df458e949.
Exactly two double-quoted literals at byte offsets6275/6310 were replaced.
Derived wrapper139,421 bytes is
11870a06cd38aa2d86c5faf3e4a6fd158e4d52062ff3ed9a2bd8eb67e1f81877.
Original pair/receipt remain untouched in both inputs and prepared capture.
No other wrapper or compiled output rewrite, second product Module or fallback
recipe was introduced.

## Integration API

Promote only tools/application/*, tests/application-build/* and
docs/application-build/* listed in reports/FROZEN-MANIFEST.json:26 new files.
Copied src/host, src/server, tools/release and docs/release are read-only baseline
context, excluded from the delta. All delivery main preimages are absent; the
manifest records exact byte/hash pins and separate captured-main preimages.

API.md is the final contract; it supersedes API-EARLY.md. Engine request/input
requires module/wasm exact Pins, ABI2/semantics3/source2 and buildReceipt:Pin for the
canonical arch-kernel-build-receipt/1. No implicit pair paths or asset URLs.
pin-input preserves legal originals and pins the ready deployment. prepare compiles
the captured main and produces exact package-input for existing release tools.
verify/package REQUIRE the independently retained prepared SHA.

After parent promotion:
~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId <fresh-run>
node tools/application/pin-input.mjs <absolute-request.json> <new-input-directory>
node tools/application/cli.mjs prepare <absolute-input.json> <new-build-directory>
node tools/application/cli.mjs verify <build-directory> <prepared-sha256>
node tools/application/cli.mjs package <build-directory> <prepared-sha256> <new-artifact-directory>
~~~

The PowerShell tools/application/run.ps1 wrapper provides the same actions and
applies project-env. Subsequent source/toolchain/builder changes intentionally
prevent reusing the prepared directory for publication: recapture. An already
published artifact is immutable and can be verified by its own release manifest
without requiring later main to match. Use its docs/release/API.md and RUNBOOK.md
for private config validation, foreground TLS/IdP/backend startup, graceful close
and artifact/catalog rollback. No deployment or real credential is included.

## Acceptance and limits

- 33/33 Node analytic tests: derivation, resource/path boundaries, real byte hashes,
  source changes, source maps/inline/private assets, frontend dependencies and
  canonical incoming API admission.
- 6/6 Node real receipt tests: actual source/log/output pins; incorrect output,
  source hash, missing wasmBinary, failed build and credential path all reject.
- Actual compiled Worker3/3: Chromium153.0.8010.12/1243,
  Firefox155.0/1543, WebKit26.6/2359, Playwright1.63.0, sequential own profiles.
  Exactly one observed byte-array instantiation and one WASM fetch, binary argument
  SHA equals b67d..., no streaming or extra Instance constructor. Ready ABI/SAB and
  control pointer checked; duplicate init refuses without second instantiation.
  Same-length corrupt response refuses RUNTIME_HASH before instance/ready.
  Per-engine evidence also retains the server request list, including one WASM
  request per case. The separate observer is not in the release.
- Current artifact HTTPS shell1/1: actual bootstrap70buttons, synthetic owner\n  login through private API/proxy, exact decoded PNG Worker pixels, private\n  paths404, COI/CSP/MIME/ETag/cache headers and persisted-pageshow reload.\n  SW registration/control and private-cache exclusion were observed; cachePaths\n  was empty, so offline cache population/hit behavior is not qualified here.
- Earlier two fresh actual compiles had identical frontend hashes/public buildId;
  two packages from the same prepared input had identical release manifests.
  That run ended5/7: parent changed runtime-integrity.mjs while its final
  restore/check ran, which correctly returned SOURCE_CHANGED; its summary failed.
  Keep the original failure, not a7/7 claim. The current package passed its
  before/after source checks; full seven-test repeat on a future final combined
  main is still the parent's qualification.

The current prepared/package metadata deliberately leaves applicationQualification
and runtimeProof as parent-required; the separately pinned executed Worker evidence
qualifies only its observed initialization path. Getter-read, static assignment,
build exit0 or prior same-WASM native geometry are not equivalent evidence.
No whole-app five-product UI/HTTP/storage workflow, geometric accuracy, fit,
slicer or physical printing claim. Huygens/parent own those follow-up checks.

Source library is the unchanged ready deployment under the parent's
20260908-product-bootstrap-r1/work/library:21,391 original resources,
306,260,612 bytes,7,751 PNG previews. Original catalog/deployment/artwork/receipt
and separate release-transport/1 remain distinct hashed documents. Semantic
mediaType/original bytes remain unchanged when inert transport uses .bin.

39 focused Node analytic/receipt tests do not replace full-app tests.
Build admission limits are in API.md: source64MiB/1,024 files, frontend64MiB/4,096,
per installed toolchain1GiB/20,000, compiler180s/1536MiB V8 heap, release512MiB
public/768MiB package. Public306MB source payload is not a process RSS cap.
Preload/full-catalog filesystem checks can take minutes.

Legal inventory172 includes required app/npm/native notices, exact pinned66 Cargo
archive/license proofs, Rust distribution notices and original lib3mf dependencies.
The oversized original Rust copyright was retained as exact bounded UTF8 parts,
with original whole-file SHA and offsets. inputs/license-provenance.json and
inputs/approved-notice-origins.json retain origin pins. Project remains private
LicenseRef with no invented public grant; the helper does not determine legal
sufficiency automatically.

## Preserved diagnostic evidence

Evidence directories retain production-attempt1 empty dependency input issue;
production-attempt2 raw default Worker assets rejected (parent source fix);
production-attempt3 old pair diagnostic; application-acceptance1 full5/7 result;
parent-pause-527a-b67d.json and old artifact/shell evidence. Old factory527a...
ignored incoming wasmBinary and is NOT qualified by the successful shell.

Native-receipt prepare initially refused .toolchain via a public portable-path
validator; fixed to allow only the exact two declared read-only toolchain sources.
Owned-Worker attempt1 harness waited for error instead of actual failed RPC and
was stopped after its deadline; attempt2 passed functional assertions but failed
to serialize absent optional fields. Final attempt3 records3/3 passing tests.
These outputs remain unchanged; no previous failure is relabeled.

No machine config, downloads, external network, live IdP/provider account, paid AI,
deployment, SSH, customer/user.keys read or child/review was used. Requested
inherited Astra/max is not an independent-review configuration attestation;
this interface does not verify effort/fast settings. Previously blocked review
was not retried.
