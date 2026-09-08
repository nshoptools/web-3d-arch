# Source SVG implementation tests

All tests are implementation evidence, not a configured independent review.
There are no child agents, provider accounts, paid requests or deployed services.

## Portable execution

After integrating the two production files and tests, run from the repository:

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId <fresh-run>
./tests/source-svg-export/run.ps1 -RunId <fresh-run> -Label acceptance `
  -ModulePath <explicit-arch-kernel.mjs> -WasmPath <matching-arch-kernel.wasm> `
  -ModuleSHA256 <exact-64-hex> -WasmSHA256 <exact-64-hex>
```

The builder requires explicit production pair hashes; it never guesses the latest
pair or uses fixture-only native exports. prepare.mjs copies the checked source
closure, test fixtures and original fonts/artwork into that RunId, captures exact
input hashes, and copies pinned test dependencies into its own work/node_modules.
All tests execute the isolated snapshot. -Prepared reruns an existing prepared
snapshot with a fresh label. -NoBrowser is a focused Node/types/readback run and
does not claim browser coverage. No dependency is installed by this runner.

Read-only requirements: repo Node24.19, Python3.13 stdlib, installed Playwright1.63,
Rolldown1.2.7, TypeScript7.0.2 at .toolchain/app-runtime; fflate0.8.3 and
@xmldom/xmldom0.9.12 (MIT) at .toolchain/printing-js. Exact copied dependency,
original asset and license hashes are captured in inputs/test-dependencies.json.
The two XML/ZIP packages are existing project dependencies, not new product deps.

Playwright pins Chromium153.0.8010.12 revision1243, Firefox155.0 revision1543,
WebKit26.6 revision2359. Browsers run sequentially. Every profile/download/cache
belongs to the RunId; Firefox disables proxies only in its private test profile.
The browser harness serves an exact GET-only loopback whitelist with COI/CSP.
The Node fixture asset server restricts responses to its checked original SHA list. No external
route is allowed. Windows WebKit uses the real private renderer fallback supplied
by createEngineTextRenderer; there is no fake OffscreenCanvas bitmap.

## Evidence scope

Node exercises actual source adoption, actual unified native/HarfBuzz/raster
services, the new provider and Ohm export. Node's transport is explicitly a test
bridge, while browser tests use actual parent EngineClient/engine-worker RPC.
All scenarios have model=null and reject product recipes. Browser scenarios cover
SVG, NFD text, mono emoji, raster and selected Noto COLRv1 converted with explicit
fixture consent; each reopens/revalidates and checks identical output bytes.
The source conversion approvals are synthetic user decisions inside tests.

Focused negatives cover forged rehashed numeric outlines/source provenance,
geometry/identity hash labels and collisions, missing/duplicate materials,
dependency mutations and same-key replacements, logout/A-B-A, cancelled/reset/
superseded refresh, exact ticket/descriptor/lease ownership and concurrent limits.
A real whole-gesture erase is committed; the default conversion attempts the actual
adoption path and retains its explicit upstream blocker without a material fallback.

Python readback uses stdlib XML and independently written affine/winding arithmetic,
not production geometry functions. It checks retained raw curves/rules, the analytic
rectangle hole and area after recolor/exclusion, asymmetric raster-hole orientation,
edited-source preservation/no-stale-output, finite paths and browser output hashes. It is not a
general SVG renderer, tessellator, topology certificate or independent review.

Node/browser byte outputs and result metadata are retained under evidence. before/
after snapshots pin source/test hashes and the Module pair around an acceptance
run. Label-specific output folders prevent replacing earlier evidence. Final
handoff records actual counts, failures and constraints; this document does not
turn a failed or skipped stage into a pass.

## Known native boundary reproduction

The retained boundary fixture is Inter original font, text E + U+0302 + U+0301,
newline, ĐO; 12mm, wght620, letter spacing0.35mm, line spacing1.4, bend12 degrees.
The existing source-adoption path can return REGION_BELOW_BOOLEAN_RESOLUTION before
the export provider runs. No conditioned/rounded path, font fallback, reduced
accent or fake adoption is substituted. Real variable/bent multiline OO and
separate NFD multiline cases distinguish working layouts from this combined
native limitation. A separately pinned boundary diagnostic records the exact pair
and whether the current native path accepts or rejects that case.

## Upstream adoption blockers retained in this handoff

On the captured source adoption baseline, the default re-conversion of an edited
raster hits PRODUCT_MATERIAL_ID_CONFLICT before the provider: parser palette IDs
conflict with entries already carried by the material table. Anonymous geometry
replacement also requires the host's real source-identity-rebind decision.
Parent/Halley own these atomic source-adoption semantics. The production provider
and delivered tests contain no replacement material policy or automatic acceptance.

The delivered erase test runs the real pixel gesture, proves the original stays
unchanged, attempts the default source conversion, records the precise blocker
and verifies no SVG is published. It does not claim the default edited-raster E2E
works. If an integrated parent baseline resolves the blocker, the same test takes
that default successful result and verifies the edited export. The evidence file
edited-raster-result.json distinguishes these outcomes. Earlier exploratory
test-host adoption evidence is retained, but its alternative branch was removed
from delivery at the parent's instruction.

A nonzero self-crossing pentagram plus a disconnected 0.2mm accent imports and
exports unchanged. An evenodd bow-tie with point-only contact is rejected upstream
as PLANAR_POINT_CONTACT; the original failed acceptance evidence is retained.
The provider neither conditions those edges nor relaxes the native guard.

Parent reported a subsequent private native region-reuse fix for the combined
Vietnamese/bend case, with 904 points including a 1nm edge. This candidate does not
claim to have run that pending pair. Its explicit tested production pair is
950225... / 211b392..., and the earlier f13 boundary evidence remains intact.

## Acceptance mapping

| Requirement/boundary | Executed check |
| --- | --- |
| EXP-01/02 source export before first model | All five source families via actual Worker RPC, model=null |
| Current source/material semantics | Real original SVG, current recolor/exclusion candidate, all-excluded output |
| Curves, holes, accents, text provenance | Native SVG parser, real HarfBuzz NFD/variation/spacing/bend, independent XML/winding |
| Restore/reopen | Fresh shape/native replay; stable bytes in each browser; forged rehashed outlines rejected |
| Hash/identity/privacy | Exact dependencies, full identity ledgers, collision labels, account A-B-A, reset/cancel/ticket/lease races |
| Accepted color/raster graph | Actual 31-buffer replay; asymmetric-hole position; Noto COLRv1 conversion with explicit fixture consent |
| Raster display-metadata forgery | Dimensions and stable summary matched against the fresh native packet on Node and all browsers |
| Edited raster default import boundary | Actual erase preserves original; default adoption conflict remains explicit, without fallback |
| Geometry/fit separation | No product recipe/model/printer gate; sourceBound=null and fit/slicer unverified |
