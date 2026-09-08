# Candidate checks and evidence

All writing processes dot-source tools/development/env.ps1 with Seat codex and RunId
20260908-source-adoption-wave1. Main, toolchain and all previous rooms are read-only.
The candidate stages its immutable 141-file baseline plus bounded proposed overlays into
a unique own-run runtime. Stage manifests hash every served module and dependency.

Run from the repository root:

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId 20260908-source-adoption-wave1
& "$env:PROJECT_REVIEW_RUN/work/source-adoption/tools/run-node-types.ps1"
```

That command creates a new immutable stage, runs all seven Node test files (45 tests),
and checks contracts.typecheck.ts, ui-contract.examples.ts and source-adoption.examples.ts.
The exact results and commands are saved to node-types-exits.json alongside logs.

The browser runner consumes a staged runtime with an in-memory generated self-signed
test certificate saved only to that stage's temporaryDirectory/test-tls.pfx. It uses the
existing real same-origin backend session fixture, actual IndexedDB and selected OPFS or
explicit IDB fallback, and installed Chromium/Firefox/WebKit. It serves only whitelisted
test/app modules, editing worker, PNG encoder, viewport and Three vendor files.
Server source, repository paths and credential directories are never served.

The shared eight new cases cover:
1. Cold SVG adoption, immutable input, isolated byte copies, no-hook compatibility, undo/redo.
2. Raster adoption, one explicit approval/receipt/commit, conversion preserving source ID and incrementing source revision; an actual edit preserves sourceConversion assets when the latest flat receipt is raster.
3. Malformed result/list/defaults/IDs/version/ticket/metadata budgets fail atomically.
4. Exact 64 KiB UTF-8 metadata boundary, including non-ASCII bytes.
5. Cancel, changed parameter, same-state save/head change, project switch, newer source job.
6. Candidate hash immutability, worker rejection and stale approval.
7. Font and mesh skip.
8. Six real pixel edits across both provenance shapes; history pruning, save/open, initial RGBA/PNG/raw/font verified, unreferenced first edit frame removed.

An additional browser case aborts the actual authenticated fetch from inside the awaited
adoption hook. It checks failed publication, unchanged IDB head, no pending job/proposal,
and authorized read-only rescue using rescueInventory.

Node uses an explicitly named in-memory commit recorder and synthetic source/session
fixtures, with actual controller/domain/history/hash validation and real editing core.
Browser source preparations/receipts are explicitly named fixtures, not native kernel
or font validation. Browser editing uses the actual Dedicated Worker. Portable PNG bytes
are produced by the existing encoder. Parent remains responsible for real product helper
and SVG/raster/text/kernel E2E; no geometry or physical crash proof is claimed here.

Earlier evidence is retained, including test development failures:
- First stage: 37 existing Node tests passed; new test had a missing fixture brace.
  Typecheck also caught excessive recursive instantiation in initial DeepReadonly.
- Second stage: 7 new Node tests passed; PNG fixture passed Uint8Array to the lower-level
  encoder requiring Uint8ClampedArray. Fixed only the named test encoder wrapper.
- Third stage: 8 new Node tests and typecheck passed. Browser online-loss assertion
  incorrectly called normal store.load after rescue-only lock. Replaced with direct
  head observation plus rescueInventory; no product policy or storage change.

Final evidence paths and exact counts/exits are recorded in reports/handoff.md.
After integration, tests/app/run.ps1 includes the new Node/type cases; browser-cases.mjs
registers ten new browser cases (the two provenance metadata shapes are separate cases). Candidate-local staging is provided in tools/stage.mjs.

For the focused browser follow-up, run tools/run-browser-check.ps1 from the candidate after run-node-types.ps1, with -Cases adoptionRasterApprovalAndConversion,adoptionOnlineLossBeforePublication. It creates the test certificate in the fresh own stage and records browser-exit.json. The isolated WebKit diagnostic uses tools/trace-stage.mjs plus tools/run-webkit-trace.ps1; its test-only tracing is not a proposed main delta.

WebKit diagnostic: the original combined two-shape case timed out at 360 seconds. A trace showed continuing real commits through revision 26 and history-pruning approvals, rather than a stopped editing Worker. Browser provenance shapes are now independent scenarios. Each retains the full 20-transaction budget and 22 subsequent actual parameter commits, with a bounded 480-second case timeout and recorded duration. This is test scheduling; there is no product storage, crypto, lease, or pixel change and no WebKit performance-fix claim.

Final bounded result: the independent WebKit sourceConversion scenario passed in 396236 ms; the independent rasterPreparation scenario timed out at its 480000 ms limit. That WebKit GC/save-reopen scenario is a remaining verification issue, not a pass/unavailable capability. The same two-shape assertions passed in Node/Chromium/Firefox, and current receipt/online-loss checks passed on all three browsers. No further broad reruns or product storage changes were made.
