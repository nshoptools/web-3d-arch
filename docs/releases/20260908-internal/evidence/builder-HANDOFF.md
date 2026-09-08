# Final internal website artifact — handoff

Use the parent-issued `product-acceptance-input/2` at `report/preview/20260908-internal/input.json`.
The artifact is packaged and hash checked. Three actual compiled Worker checks and one portable HTTPS shell check passed. Whole-product acceptance and release clearance remain with parent/Huygens.

| Binding | SHA-256 |
| --- | --- |
| report/release/20260908-internal/release-manifest.json | 720e815fbb0b5817b3a3a66918114393b0b60542ff73cd3e8b825d22d279a898 |
| report/build/20260908-internal/prepared.json | 029689a4e449e5f2137094090050ed3f50f6a9ea34423456df8fc5eeb41494f6 |
| report/preview/20260908-internal/input.json | 3ee43aa58efddfb937886696ec1b965cb44196988bf0a239dff02584aa65677b |

All paths above are relative to `D:\VoSon\Code\web-3d-arch`. `prepared.releasePlanSHA256` now equals the actual immutable release-manifest SHA.

**Historical input warning:** `report/build/20260908-internal-input2.json` and both own `HUYGENS-INPUT2*.json` reports are superseded. They are preserved, not edited to impersonate the parent contract. The earlier prepared seal3b527 was a plan-binding mismatch and must not be used for current acceptance.

Parent binding evidence: `tmp/reviews/codex/runs/20260908-implementation-wave1/evidence/handover-plan-binding-correction.json`; parent retained old preimages under its `inputs/handover-old-*.json`.

The original prepare was relocated without payload recopy. The initial relocation retained a historical plan whose input digest referred to the old absolute private paths. The sole plan difference was inputSha256; the corrected private plan uses exact release-manifest bytes. Only release-plan.json and prepared.json changed in that correction. All21,647 manifest entries/public/runtime bytes stayed identical.

The own background correction completed before the final stop inspection could catch it, producing the identical029689 seal. An earlier stop filter missed mixed slash path text. All logs/backups are retained; no own metadata writer remains. Parent receipt/input are authoritative. No further prepared/public/input writes or tests were performed after takeover.

## Exact engine and content

- Canonical MJS:139,735B; cd92ea536fcdff3f53bed29fc42022229f8e2cd24a942fa87237fa89fed58828.
- Derived MJS:139,865B; 0fd2608e295add773c399bf5624104392ae27996604dc6b89d28acccfbcae589.
- WASM:5,813,742B; 064f52946188df285fc1328e7e2607a7cbdb174a82f85eded2e949a71f4c1b3c.
- Canonical production build receipt:2f3b120da8282f537ad511af042bebf3536984bf14cd5d09a41d38e98793ea17; Printing=true, TestFixtures=false, ABI2/semantics3/source2.
- Exactly two quoted arch-kernel.wasm literals were replaced by the full SHA-addressed filename; original pair retained under prepared inputs/engine. WASM bytes unchanged by packaging.
- 17 frontend files from actual main index/src/main/product-entry,219 compiled modules,4 explicit ES Worker entries. One Vite warning for chunks above500kB.
- 21,414 public assets /360,491,890B; library21,391 original resources /306,260,612B and7,751 actual PNG previews;172 legal notices. Server schema5/Node24.19.0.
- No main or previous frozen-room changes. Source snapshot290 files plus2 separately pinned native guards and5 integration receipts remained unchanged through compile/package.

## Executed focused checks

- Chromium153.0.8010.12/r1243, Firefox155.0/r1543, WebKit26.6/r2359; Playwright1.63.0, sequential:3/3 passed.
- Each actual compiled Worker instantiated the verified owned WASM once, used one WASM fetch and no streaming path, matched the descriptor, rejected duplicate init without a second Module, and rejected same-length tampered bytes before ready.
- These Worker records retain historical prepared seal3b527. Parent proves unchanged compiled file pins across the two-file correction; the records apply to the same compiled bytes, not a new execution after metadata correction.
- Portable artifact HTTPS Chromium shell:1/1 passed in105.19s. Actual app rendered70 buttons in a secure isolated page; synthetic owner login/private no-store API, PNG Worker round-trip, CSP/COI/MIME/cache/ETag, private path404s and persisted-pageshow reload passed.
- Browser cache contained only public paths. TLS/IdP/session/profile/SQLite were synthetic and confined to the run. No paid provider or deployed service was used.

Exact command logs: evidence/pin-input.log, prepare.log, prepared-relocation.log, package.log, compiled-workers.log, portable-shell.log and final-plan-binding.log. JSON Worker/shell records and all handoff pins are in HANDOFF.json. The existing integrated pin-input/prepare/package CLI was used; no broad33+6 suite or fresh product regression was run.

## Remaining acceptance boundary

This delivery proves package bytes, actual compiled Worker initialization/refusals, and shell behavior. It does not certify the whole application, every geometry input, slicer compatibility, physical fit or printing. Huygens owns actual selected product flows; parent owns final clearance, operator TLS/IdP/credentials/configuration and preview/deployment. Unsupported qualification labels must remain gated.

Public byte totals are admission totals, not process RSS or physical RPO/RTO bounds. Prepared provenance retains original source/toolchain paths; the portable host/runtime/catalog package and required compiled prepared files are in report/, independent of those paths for preview serving.

Implementation/build evidence only. No independent review, no new agents or Opus calls, and no retry of the blocked backend review route.
