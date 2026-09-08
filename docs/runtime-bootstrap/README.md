# Actual runtime integrity Worker tests

These tests exercise the production `EngineClient`, production Worker and an
explicitly pinned, completed unified `arch-kernel.mjs` / `arch-kernel.wasm` pair.
They are implementation tests, not independent review or general geometry
acceptance. They complement the existing
`tests/runtime-bootstrap/bootstrap.node.test.mjs`; that file is not replaced.

## Run from an isolated snapshot

Prerequisites are the repository's existing Node, Vite, Playwright and installed
Chromium / Firefox / WebKit binaries. No package installation or browser download
is performed. The verified run used Node 24.19.0, Vite 8.2.2 and Playwright 1.63.0.
The pair must be complete before capture. Its authorized SHA-256 values are
mandatory; computing new expected hashes from an unapproved replacement is not
an integrity qualification.

Run in PowerShell from the repository root. Select a fresh run and completed
main build directory. Neither command assumes a historical room or drive letter.

```powershell
. tools/development/env.ps1 -Seat codex -RunId runtime-integrity-check-01
$env:CARGO_HOME = Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:PIP_TARGET = Join-Path $env:PROJECT_REVIEW_RUN 'cache/python-deps'
$env:npm_config_prefix = Join-Path $env:PROJECT_REVIEW_RUN 'cache/npm-prefix'
$runtimeNode = Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'

# Supply the completed main build path and approved lowercase SHA-256 values.
$env:ARCH_KERNEL_MODULE = '<in-repo completed build>/arch-kernel.mjs'
$env:ARCH_KERNEL_MODULE_SHA256 = '<approved 64-hex wrapper SHA-256>'
$env:ARCH_KERNEL_WASM_SHA256 = '<approved 64-hex WASM SHA-256>'
$env:ARCH_RUNTIME_TEST_STAGE_NAME = 'runtime-bootstrap-snapshot'
& $runtimeNode tests/runtime-bootstrap/stage.mjs
if ($LASTEXITCODE -ne 0) { throw 'Snapshot capture failed' }

$runtimeSnapshot = Join-Path $env:PROJECT_REVIEW_RUN 'work/runtime-bootstrap-snapshot'
$env:ARCH_KERNEL_MODULE = Join-Path $env:PROJECT_REVIEW_RUN 'inputs/runtime-bootstrap-snapshot/module/arch-kernel.mjs'
$env:ARCH_RUNTIME_TEST_TAG = 'verified-pair'
& $runtimeNode --test (Join-Path $runtimeSnapshot 'tests/runtime-bootstrap/engine-ready.node.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Ready protocol regression' }
& $runtimeNode --test --test-concurrency=1 (Join-Path $runtimeSnapshot 'tests/runtime-bootstrap/integrity.worker.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Actual Worker integrity regression' }
```

Dot-source the environment again in each new shell process, and repeat the own
cache overrides. `stage.mjs` defaults to the current `PROJECT_ROOT` sources.
`ARCH_RUNTIME_TEST_SOURCE` may name a checked in-repo candidate instead; it does
not change dependency ownership. Staging copies production components, these
six tests, and existing dependencies into the own run. It retains a hash manifest
under `inputs/<stage-name>/manifest.json` and refuses to overwrite changed
captures. Different revisions need different stage names. Main sources,
`.toolchain`, and the supplied original module pair remain read-only.

The Worker suite requires `PROJECT_REVIEW_RUN` and both explicit pair hashes.
It writes JSON evidence under `evidence/integrity-workers/<tag>/`, private Worker
bundles under `work/integrity-worker-bundles/<tag>/`, and short browser profiles
under `p/<tag>/{c,f,w}`. Tags contain 1–24 letters, digits, underscores or hyphens.
Use a new tag for each evidence revision to retain failures. A single-engine
diagnostic can use Node's `--test-name-pattern=chromium`; it does not qualify the
other engines. The full command above must run all three without skipped tests.

## Oracles and boundaries

`engine-ready.node.test.mjs` uses a controlled synthetic Worker **only** for
protocol fault injection. No native factory is used or claimed in those tests.
It covers immutable constructor pins, proof schema/binding/loading flags,
duplicate READY, old-epoch messages, disposal, ABI2, SharedArrayBuffer, exact
16-byte control bounds, and valid absence of optional capabilities.

`observed-worker.mjs` imports the unmodified production Worker. It observes real
`WebAssembly.instantiate` calls while forwarding their original arguments to
the browser API. It hashes the bytes that actually reach instantiation, reads
the real instance's ABI getters, and checks identity of its heap/control block
against READY and snapshot publication. It records `instantiateStreaming`
separately and requires zero calls. It never supplies a fake factory, changes
native exports, or instantiates a second Module to establish proof.

The actual Worker scenarios prove:

- The copied caller descriptor survives later mutation. Concurrent `start()`
  calls share one initialization and exactly one native instance per epoch.
- A private same-origin, content-addressed host retains verified buffers. Its
  expendable disk copies are overwritten while a WASM response is held; the
  verified buffers remain unchanged. Host logs include unknown/fallback routes.
- Exactly one WASM HTTP fetch occurs per epoch, with the authorized byte count
  and hash; the bytes passed to the real instantiation match those pins.
  Wrapper verification and native import can require one or two JS requests.
- Actual exported versions are root ABI2, arch3mf ABI1, kernel3mf ABI2 and source
  frame ABI1. The printing tuple carries the current client epoch.
- A synthetic 20×10 mm SVG with a 4×4 mm hole produces real ARCH/1 geometry, then
  a real ASFR/1 planar frame. Both use the same root heap; the old source bytes
  stay unchanged. This is a small operation witness, not a mesh validity suite.
- Altered JS/WASM bodies stop before instantiation. A requested module URL that
  disagrees with the release descriptor stops before Worker creation. Missing,
  forged or mixed READY proof, invalid ABI/heap/control stop before queued
  geometry is dispatched. Faulty READY cases mutate an actual root response.
- A duplicate real READY retires proof, heap and capabilities. Disposing during
  a deliberately held initial fetch publishes nothing and cannot restart.
- A real replacement Worker produces an actual numeric snapshot-ID collision
  in a new epoch. Replaying the genuine old READY through its saved old handler,
  touching the retired heap, and releasing its old lease cannot replace the
  current proof or authorize work against the new root. This controlled late
  delivery is explicit; it is not a claim about random browser timing.

The host is loopback-only with COOP/COEP/CORP, `nosniff`, and a same-origin CSP
that permits native WASM but no blob scripts. Browser requests outside this host
are aborted. Response holds and observer drains drive races; there are no test
sleeps. Navigation retains the default 30-second limit, each engine has a
120-second deadline, and request/drain guards are 10 seconds. Firefox uses its
initial persistent page and `network.proxy.type=0`. These are harness settings,
not production fixes or evidence of the cause of earlier browser startup hangs.

The JS import relies on the release host serving immutable verified bytes at
the same content-addressed URL. This is **not dynamic-import SRI** or protection
against an arbitrary malicious server. A mixed-pair refusal means disagreement
with the approved release binding, not semantic compatibility testing of any
two binaries that somebody independently repins. Getter access to `wasmBinary`
alone does not establish exact instantiation; the three-browser byte and fetch
oracles do. No backend, paid service, product UI or extra product WASM is used.

See [recorded evidence and limitations](EVIDENCE.md) for tested revisions.
