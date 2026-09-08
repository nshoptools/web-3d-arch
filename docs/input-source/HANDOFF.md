# Text/emoji source candidate handoff

Implementation candidate only, in tmp/reviews/codex/runs/20260908-text-source-wave1/work/text-source. Parent promotes/integrates the listed files. Main, assets, .toolchain, editor wave1 and other rooms were read-only. No child or independent reviewer was run. Assignment inherited Astra/max; fast setting is not exposed, so no configured independent-review claim is made.

The adapter implements actual text outline/layout preparation and selected monochrome/SVG/COLRv1/CBDT sources through the parent's shared HarfBuzz ABI2 factory. It creates no second production WASM instance. Text output preserves original Unicode, normalized cluster mappings, variations, glyph offsets exactly once, multiline/tracking/bend/placement in mm, closed curves, holes and disconnected accents. Color output retains exact original sources and full paint graphs alongside actual RGBA and host-confirmed conversion proposals.

Chromium/Firefox have real native color rendering in their Workers. WebKit's Worker canvas gap remains explicit. The new, explicitly installed bounded main-thread bridge renders original Noto COLRv1/CBDT in all three qualified engines, including WebKit's detached HTML canvas. It uses a private MessagePort, source allowlist and actual byte hashes, source/revision checks on both sides, bounded inputs, cancellation, deadlines and native timing telemetry. No source switch, fake bitmap, raw SVG DOM or object URL is used.

Verified scope:

| Execution | Result |
| --- | --- |
| Node 24.19.0 source/layout | 85/85 checks |
| Node bridge protocol/lifecycle | 10/10 checks |
| Chromium 153.0.8010.12 | 144/144: 85 shared + 25 Worker renderer/proposal + 3 real Worker message + 31 main bridge checks |
| Firefox 155.0 | 144/144, same scope |
| WebKit 26.6 | 137 passes / 144; 7 direct Worker-canvas checks unsupported; all 31 main bridge checks pass |
| TypeScript 7.0.2 | Strict standalone consumer, no emit |
| Playwright | 1.63.0; one engine at a time, own loopback whitelist/profile/output directories |

The browser aggregate intentionally exits 2 for the seven unsupported WebKit direct Worker-canvas qualifications, in accordance with QA-01. It exits 1 for actual failed assertions. The final checked run has no failed assertions. WebKit source preparation/layout/paint/PNG extraction and message-boundary tests execute normally, and its separately qualified bridge returns actual color RGBA.

Main bridge limits: 512 pixels per edge, 4,096 paint operations, 8 MB original COLRv1 font, 1 MiB embedded PNG, two cached native faces/8 MB, one active request/no queue, 16 ms client cancellation checks and a 10 second cooperative deadline. Instrumented render calls have a 100 ms observed budget; synchronous font setup has a separate aggregate 500 ms budget per request. These are rejection-after-return limits, not native preemption or frame-latency guarantees. Prefer the Worker path on Chromium/Firefox.

In the final run, maximum observed bridge render calls were 2.70 ms (Chromium), 33.18 ms (Firefox), and 49.62 ms (WebKit). Maximum aggregate synchronous font setup per request was 11.33, 91.98 and 3.00 ms respectively. Earlier Firefox cold font setup exceeded the original combined 100 ms policy; evidence/bridge-font-budget-100ms-failure.json preserves that failure. A data-font loading probe also retained synchronous cost and was not adopted. MAIN-CANVAS-BRIDGE.md documents the resulting split policy and native limitations. Timings are evidence for this run, not a future performance guarantee.

The tested parent module is:
tmp/reviews/codex/runs/20260908-implementation-wave1/work/module/arch-kernel.{mjs,wasm}.
WASM SHA-256: b95d684eb02db05d7d5ed25687f9281ea28d1532f2bd1e49fc2294b53aca6483.
HarfBuzz 14.4.0 source revision: 36cb489cb02ce4b92099669ba9f9bea348eff93f; wrapper source harfbuzzjs 1.6.1. Exact parent reader/module and original asset hashes are recorded in the checked manifest. Rerun applicable integration checks if parent promotion changes those files.

Candidate entry points and contracts:

- src/input/index.mjs and index.d.mts: standalone API/types.
- src/input/text-source.mjs: atomic preparation, byte/hash verification, source cache, cancellation and one-use conversion confirmation.
- src/input/text-layout.mjs: Unicode/cluster/line/variation layout, mm/pt, circular cluster bend, placement, shared curves and numeric SVG bridge.
- src/input/emoji-source.mjs and paint-contract.mjs: exact collection source, complete bounded paint stream, original SVG/PNG provenance.
- src/input/native-color-renderer.mjs: real Worker FontFace/OffscreenCanvas and PNG decoder; shared internal canvas hook.
- src/input/color-render-bridge.mjs: explicit Worker client and bounded main-thread endpoint.
- docs/INTEGRATION.md: parent wiring, serializable commands, transforms, errors and source budgets.
- docs/MAIN-CANVAS-BRIDGE.md: private port wiring, allowed sources, native backend qualification, lifecycle and timing policy.
- docs/ADR-001-source-semantics.md and ACCEPTANCE.md: semantics and requirements/test mapping.
- tests/text-source: real/analytic/reference tests, protocol tests, sequential browser harness, types and checked manifest builder.

Reproduction from repository root (dot-source before each separate writing process):

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260908-text-source-wave1
$TextCandidate = Join-Path $env:PROJECT_REVIEW_RUN 'work/text-source'
node (Join-Path $TextCandidate 'tests/text-source/node.test.mjs')
node (Join-Path $TextCandidate 'tests/text-source/bridge-client.test.mjs')
~~~

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260908-text-source-wave1
$TextCandidate = Join-Path $env:PROJECT_REVIEW_RUN 'work/text-source'
node '.toolchain/app-runtime/node_modules/typescript/bin/tsc' --ignoreConfig --noEmit --strict --module NodeNext --moduleResolution NodeNext --target ES2024 --lib ES2024,WebWorker (Join-Path $TextCandidate 'tests/text-source/types.test.mts')
~~~

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260908-text-source-wave1
$TextCandidate = Join-Path $env:PROJECT_REVIEW_RUN 'work/text-source'
node (Join-Path $TextCandidate 'tests/text-source/browser.test.mjs')
# Expected exit 2: seven WebKit direct Worker-canvas qualifications unsupported.
# All 31 real bridge checks must pass in each engine.
# Optional final argument: chromium, firefox or webkit; never run concurrently.
~~~

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260908-text-source-wave1
$TextCandidate = Join-Path $env:PROJECT_REVIEW_RUN 'work/text-source'
node (Join-Path $TextCandidate 'tests/text-source/manifest.mjs')
~~~

Node writes exact reference records to evidence/reference-cases.json for browser tests. The original authored analytic font is included; make-paint-fixture.py regenerates it with read-only repository FontTools 4.64.0 if needed. No install/download/.toolchain mutation is required.

Evidence is under this run's evidence/: node-results.json, bridge-client-results.json, browser/{engine}/results.json, ordinary and bridge sample PNGs, browser/run-chromium-firefox-webkit.json, type-check.json, checked-manifest.json and manifest-check.json. The checked manifest covers every candidate file, exact dependency/source hashes and final test evidence, including real bridge PNG hashes and native timing records. It rehashes its inventory before publishing; it remains outside the candidate to avoid a recursive self-hash.

The controller owns domain/history/storage and final color-reduction confirmation; the kernel owns geometry. Integration constraints include a per-Worker native memory/time watchdog, four cached source font readers, explicit itemization for mixed scripts/bidi, original SVG through the existing validated parser and host confirmation of each derivative. The parent portable contour preview/PNG encoder remains separate. Total source error bound, manufacturing geometry for every source, mesh correctness, slicer and physical fit are not qualified. This source-level handoff is not a v1-wide release approval.
