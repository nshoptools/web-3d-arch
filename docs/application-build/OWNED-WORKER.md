# Actual compiled Worker verification

This test accepts an explicit sealed prepared directory and SHA. It serves owned,
hash-checked copies of that build's actual compiled ES Worker chunks and addressed
engine pair on one synthetic HTTPS loopback origin. A separate test-only observer
imports the compiled Worker unchanged. The observer is never in the frontend
inventory or portable release.

It observes the bytes passed to WebAssembly.instantiate, hashes them, counts one
WASM fetch and one byte-array instantiation, rejects streaming/refetch, validates
the real ready descriptor/SAB/control pointer, then sends duplicate init and checks
DUPLICATE_INIT with no second instance. A separate Worker receives a same-length
one-byte-corrupted WASM response and must fail RUNTIME_HASH before instantiation or
ready. These observations qualify this initialization path, not arbitrary later
3D operations or uninstrumented hostile factories.

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId <fresh-run>
$env:APPLICATION_OWNED_PREPARED = '<absolute-build-directory>'
$env:APPLICATION_OWNED_SHA256 = '<exact-prepared-sha>'
$env:APPLICATION_BUILD_LABEL = '<fresh-label>'
$env:APPLICATION_BUILD_TLS = "$env:PROJECT_REVIEW_RUN/temp/owned-test-tls"
& ./tests/application-build/generate-tls.ps1 -RunId <fresh-run> -OutputDirectory $env:APPLICATION_BUILD_TLS
node --test --test-concurrency=1 ./tests/application-build/owned-worker.test.mjs
~~~

All three installed Playwright1.63.0 engines run sequentially:
Chromium153.0.8010.12/revision1243; Firefox155.0/revision1543;
WebKit26.6/revision2359. No trust-store installation, network beyond the exact
loopback origin, external accounts or second product Module. Profiles, downloads,
browser runtime data, TLS and evidence stay in the supplied run. Each test has a
180s deadline; each Worker exchange60s. This test does not require Worker canvas.

The manifest's engine build receipt, getter-read check and the executed observer
are separate evidence. A static assignment or successful native geometry alone
does not prove the bytes used for a browser instance. Product UI, geometry output,
source edits, storage/reopen, printing and whole-app E2E remain separate acceptance.
