# Frozen source SVG provider handoff

Implementation run 20260908-source-svg-export-wave1. Promote only the new files
listed in reports/frozen-manifest.json under this run. The copied baseline,
inputs, Module and test dependencies are evidence, not a parent delta.
All delivery paths have an absent main preimage, checked again at sealing.

Production entry: createSourceSVGExport({context,kernel,sources}) in
src/integration/source-svg-export.mjs + .d.mts. Parent factory/application owns
composition and lifecycle. This provider implements the exact Ohm
SourceSnapshotProvider and works before the first app model. See README.md for
the hooks and TESTING.md for acceptance mapping and resource/error boundaries.

## Final executed evidence

- evidence/node-acceptance3.txt: 26/26 Node tests.
- evidence/types-acceptance3.txt: TypeScript noEmit succeeded; empty diagnostic log.
- evidence/browser-acceptance3.txt and per-engine result.json: 3/3 actual parent
  Worker RPC runs, sequential Chromium/Firefox/WebKit. Five source families in
  each; all model=null; reopen bytes stable; current recolor creates a real
  proposal; self-rehashed raster dimensions rejected by all three.
- evidence/readback-acceptance3.json: 163 independent Python XML/affine/winding/
  hash checks passed. No renderer, mesh/slicer/physical qualification is claimed.
- evidence/before-acceptance3.json + after-acceptance3.json: all 114 source/test
  files and the Module pair unchanged across that complete run.
- evidence/portable-final-preparation.txt + portable-final-node.txt: fresh
  isolated source/asset/dependency copy from the final candidate, followed by
  real SVG/text/mono/raster Node checks. The temporary copy stays inside this run.

Exact tested production pair, copied to this run's work/module:

- arch-kernel.mjs: 138932 bytes,
  950225880c23476f9a6523111ac5a33aebb24f1d89bfa1d8f60bff1b1cc1c375.
- arch-kernel.wasm: 5752782 bytes,
  211b392f097eb55c8b52898e7b6123cb4b4b4539bfc68a5223d2f9e4c4d0e4cd.

The current core matching that pair was captured in
inputs/runtime-api-production.json. Initial baseline and prior f13 pair remain
separate. Parent's newer signed-frame/translation/region-reuse or sealed-dimension
build is not silently substituted and has no execution claim in this handoff.
Parent will supply the intended pair explicitly when running integrated regression.

Reproduce this candidate's full run using a NEW label:

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260908-source-svg-export-wave1
& ./tmp/reviews/codex/runs/20260908-source-svg-export-wave1/work/source-svg-export/tests/source-svg-export/run.ps1 -RunId 20260908-source-svg-export-wave1 -Label parent-check -Prepared
```

For a fresh main/RunId snapshot, use the explicit pair form in TESTING.md.
The frozen delivery itself must not be edited to rerun tests.

## Dependency blocker, not a successful edited-source E2E claim

Actual erase changed 16 pixels and retained the exact original hash.
Default re-conversion then returned PRODUCT_MATERIAL_ID_CONFLICT in upstream
source adoption, before this provider could receive a new committed REGION.
evidence/source-cases-acceptance3/edited-raster-result.json records the blocker,
different working hash, no SVG publication and no material fallback.
Parent/Halley owns the palette and explicit identity-rebind remediation.
The delivered production code and tests contain no alternative material policy.
Earlier exploratory test-host adoption evidence is retained only as history;
its alternative branch was removed from delivery.

Other explicit upstream boundaries: point-only evenodd bow-tie admission returns
PLANAR_POINT_CONTACT on this baseline. The original f13 combined Vietnamese/
variation/bend failure remains recorded; parent reported a subsequent native fix,
but that pending pair has no claim here. Normal NFD, variable/bent Latin multiline,
separate Vietnamese multiline, mm/pt and selected real emoji paths were executed.

## Retained failures and corrected causes

Earlier logs are retained rather than relabeled: initial-attempt1 (native shared
heap copying and reserved metadata field), cases/node attempts (fixture command/
asset-record errors, reset ordering, upstream admission), readback-production1
(raster Y inversion), browser-production1/2/3 (Firefox startup/deadline limits),
dimension-before.tap (self-rehashed display size accepted before fresh-packet
comparison). The final run includes the relevant corrected behavior and explicit
upstream negatives. Firefox uses a private profile with proxy disabled and a
bounded harness deadline; observed run time is not a product latency guarantee.

No main, earlier worker room or .toolchain edits; no new Module in the provider,
no children, paid services, deployment or independent review. Inherited requested
Astra/max is recorded; this interface does not attest model/effort/fast settings.
This is implementation evidence, not configured review compliance or full v1/
printer/fit qualification.
