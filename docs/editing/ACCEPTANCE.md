# Acceptance mapping

This candidate has 76 portable Node/Worker checks, including 44 explicit analytic bitmap fixtures. Each changed bitmap fixture also checks exact bounds/count, one payload, binary round-trip, complete undo, redo, increasing revisions, source metadata, and unmodified original raster bytes. Extra checks exercise alpha ties, curve sampling, transforms, ownership, stale/cancel/resource behavior, typed buffer validation, framing corruption and maximum raster size.

These are executed component tests, not a configured independent review. Root acceptance files and parent integration are intentionally not rewritten by the candidate.

| Requirement / check | Candidate implementation and executed evidence | Remaining product acceptance |
| --- | --- | --- |
| EDT-01 / AT-010.1 | All seven raster tools, keep inside/outside, rectangle/ellipse, merge/hole, selected/auto healing, width/pressure/Shift, holes and tiny accents. Analytic expected grids plus distinct dense polynomial curve oracle. | Opus UI commands, vector editing/conversion adapter confirmation, manufacturing topology and provenance integration. |
| EDT-01 / AT-010.2 | Every changed grid fixture is one commit/payload; no-op none. Byte-exact undo/redo round-trip; prepare reports exact payload bytes before commit. Conflicts/cancel keep committed pixels. | Parent history stack, 20 transactions/24 MiB retention and visible warning before trimming; durable history/store acknowledgment. |
| EDT-02 / AT-011.1 | Affine round-trip for pan/zoom/DPR/rotation/reflection. Working/original copies and source hashes remain isolated. | Actual original-file viewer, restoration of prior zoom/pan, touch/pinch and keyboard/pointer presentation. |
| EDT-02 / AT-011.2 | Raster pressure 0.4..1.6, missing=1; image width invariant under device transform. | Vector stroke mm, export outline oracle and device UI behavior. |
| SRC-01 / DAT-01 | Trusted bounded derivative only, immutable pre-edit RGBA plus source-file hash reference; no source IO or replacement. | Parent retains raw original bytes/EXIF/profile, decoder bounds and confirmed conversion; durable projects/recovery. |
| ARC-01 / ABI-01 / WEB-01 | UI-independent module Worker core, declarative commands, private preparation, typed buffers with copy/transfer ownership, cancellation messages, no main-thread wait. Three pinned engines verified under COI. | Parent WASM/SAB geometry gate, deployed/offline/auth headers, watchdog/recovery. This processor is not a geometry ABI replacement. |
| LIM-01 | Edge/pixel/points/segments/metadata/work/boundary-color limits; 1280² success, over-limit/invalid rejection and actual undo-byte accounting. | Original decoder 64-million-pixel/32-MB limit and process-wide/controller/history quotas. |
| STO-01 | Hash-checked replay and serialized undo records usable by storage. | Storage fault injection, atomic durable head/ack, multi-tab/project conflicts and source reconstruction. |
| UI-03 / UI-05 | Versioned progress/cancel/result/error messages; serializable point commands. | React UI, key focus/IME policy, accessibility, previews and pointer capture. |
| QA-01 / QA-02 | Input/output hashes, checked inventory, hand-defined pixel oracles and separately computed Node SHA-256 checked against browser output. | No mesh/slicer/print/fit verdict is assigned by these pixel checks. |

## Executed environments

Node 24.19.0: 76/76 passing, no skipped cases. TypeScript 7.0.2: strict no-emit consumer check passed.

Playwright 1.63.0, repository-installed engines only, sequential persistent contexts with separate room profiles/cache/artifacts/download paths:

| Engine | Browser version | Pinned revision | Portable Worker checks | Additional transport scenario |
| --- | --- | --- | --- | --- |
| Chromium | 153.0.8010.12 | 1243 | 76/76 | 17 RPC requests passed |
| Firefox | 155.0 | 1543 | 76/76 | 17 RPC requests passed |
| WebKit | 26.6 | 2359 | 76/76 | 17 RPC requests passed |

Transport verifies initialization, transferred input ownership, provisional preparation, current-source conflict at commit, changed image/payload, serialized undo/redo, in-progress cancel by message, discarded preparation, resource rollback, and original proof. These are one scenario per browser; 17 requests are not 17 independent product acceptance checks.

Each engine remained responsive on the main thread during the fixture Worker run. The harness listens on an OS-assigned port on 127.0.0.1 only, serves an exact file whitelist, restricts request Host/method, routes browser requests to that whitelist and blocks service workers. It does not serve the repository generally or fetch outside resources.

## Corrections and limits of evidence

The initial Node run passed 68/70. Two all-gaps fixture expectations wrongly treated an internal transparent spacer as protected, even though it was bracketed by occupied endpoints within the threshold. The expected grids were corrected from the documented run rule, with the initial failure log retained. No algorithm or threshold was changed to make those tests pass. Six further checks added maximum-size, clipping, numeric conversion, async copying, automatic boundary-color and curve-segment limit coverage, giving 76 final checks.

Timing records are observations from this machine, not a latency guarantee. Default production scheduling uses Worker tasks; small portable oracle checks use a microtask scheduler for speed, and separate cancellation/transport tests exercise the real task scheduler. Both suites actually compute changed RGBA. There are no mock images, capability-only success paths, external source art, or UI screenshot approvals.

The integrated code and tests are in `src/editing` and `tests/editing`.
Run `tests/editing/run.ps1 -RunId <session-id>` after choosing a project-local
session. Logs, browser records and screenshots are written below that session's
`evidence` directory. `manifest.json` records the durable source/test inventory.
Changing the inventory requires an explicit `node tests/editing/manifest.mjs
--write`; checking it uses `--check`. Integration and full application evidence
are tracked separately in [the development plan](../development/PLAN.md).
