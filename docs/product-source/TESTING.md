# Frozen implementation tests

Date: 2026-09-08. These are implementation/self-tests, not independent review.

## Checked runtime inputs

- Node24.19.0, no npm installation.
- Playwright1.63.0 read from the existing .toolchain/app-runtime/node_modules.
- Chromium153.0.8010.12, Firefox155.0, WebKit26.6, headless local loopback HTTP with COOP/COEP/CORP and external requests blocked.
- TypeScript7.0.2, no emit, strict NodeNext/ES2022.
- R3 parent Module mjs SHA256: 65c5bfc89adcd0a8d34c4d47743c6cc05167688f6ecfe4179772a2d1f4029c62.
- R3 parent WASM SHA256: f13bdd2b5b778ac0f2ec70fb2d43052de68e7d415d03218bea6f0a09718e40a9.
- Actual getters: rootABI2, productABI1, mechanicsABI2/semantics3, sourceABI1/semantics2, datumExtension1, finalExport1.
- The previous WASM 16080c207725662ab85215783b3e012e3195f5e9f835874bc0069d9421c98300 was used only in exploratory/earlier tests. R3 final logs and manifests identify the accepted pair.

inputs/source-fixture.json records the catalog slice and original source hashes. Eight original font/artwork files are checked copies under inputs/library; retained licenses/instructions and copy hashes are under inputs/retained and retained-inputs.json. No font/system fallback or external catalog lookup occurs.

## Results

| Final log | Groups | Result and limit |
| --- | ---: | --- |
| product-app-regression-final.log |19|PASS; five products/four styles, SVG and accepted raster, ownership, proposals, material initialization, R2 actual-face and unavailable conversions |
| source-smoke-final.log |2|PASS; actual SVG/raster canonical adoption and model |
| source-boundaries-final.log |5|PASS; exact material extension, color/order-independent geometry hashes, duplicate source IDs, raw/ticket/head/epoch/semantics rejection, late release |
| raster-rebind-final.log |1|PASS; real edited raster proposes one retained/two allocated/one retired region, preserves user override, makes no consent or domain commit |
| artifact-boundaries-final.log |2|PASS; real HarfBuzz negative placement refusal, captured original-frame replay, rehashed frame forgery and stale text rejection |
| source-node-final.log |1|PASS protocol/oracles;59 actual models,22 exact native model refusals, raster+text root gap and missing on-model datum |
| source-browser-final.log |3|PASS;43 models per engine, real root Worker,2 explicit blocked paths per engine, COI true |
| source-color-final.log |3|PASS;1 real default COLR emoji model per engine after separate render and segmentation consent |
| source-types-final.log |1 compile|PASS; strict no-emit public type usage |

There are 36 passing test groups plus one type check. This count does not turn known native refusals into successful models.

The Node matrix attempts five products by four styles for actual SVG, PNG, shaped Inter O and explicitly selected Noto Emoji monochrome grinning face. SVG20/raster20 all produce models; text9/emoji9 produce models;22 text/emoji cases refuse exactly as pinned in native-refusals.json. An actual beside overlay adds one model, giving59. The full Node test compares every native refusal id/code/diagnostic/field/verdict against that fixture; an unexpected refusal fails.

Each browser runs SVG20/raster20 plus real text1, monochrome emoji1 and SVG+text overlay1. The separate default color emoji test retains original source, verifies pending bindings cannot build, explicitly accepts render, independently accepts segmentation, checks receipt lineage/original assets and builds a real model.

## Mesh/provenance evidence

Every successful captured part is read from the actual ARCH snapshot and checked by the existing mathematical mesh oracle implementation (not an independent reviewer). It checks finite indexed geometry and the oracle's existing topology/volume invariants. These tests do not replace or weaken that oracle.

For the SVG fixture, source lineage selects the western region with its hole. Point-in-mesh samples assert that hole stays empty. Four heights along an actual shared material section compare intersected seam positions within1e-12 mm; the3e-6 mm search window only finds the nominal imported f32 plane. It is not a whole-model error bound or global non-overlap proof.

Actual overlay mesh X and native source intervals prove placement and bed/base/text references: base0..0.4 and text0.4..1 at reference layers0/2 for the explicit test schedule. Successful models remain independently unreviewed, fit-unqualified and retain null whole-pipeline error bounds.

Final captures include ARCH bytes, native semantic metadata, bindings, domain/source state and SHA-addressed asset references. Browser host freezes route bytes/hashes before launch and writes per-model oracle results. Node and browser captures include original/derived assets under assets/. evidence-manifest.json lists final evidence by SHA. Exploratory failures/logs are excluded from that acceptance manifest.

## Reproduction

Use integrated source/tests and a freshly named run. The permanent tests/product-source/prepare.mjs generates its fixture from tests/text-app/fixture-data.mjs and the checked original asset catalogs in this repository, copies the selected original bytes and licenses, and records their hashes. It does not require a prior delivery room or a retained temporary source-fixture.json. Build a current unified Module with tools/kernel/build.ps1 using Printing and TestFixtures, or supply an explicitly checked existing pair inside the repo.

From the repository root, supply the absolute path of that arch-kernel.mjs and a new RunId. The runner prepares the project environment, then executes Node matrix, artifact checks and (when selected) both three-browser groups. Exact native-refusals.json expectations remain explicit and must not be silently changed when code is fixed.

~~~powershell
./tests/product-source/run.ps1 -RunId product-source-check -ModulePath $ProductModulePath -Browsers

# Additional controller/material/native ownership regressions, in the same prepared run:
. ./tools/development/env.ps1 -Seat codex -RunId product-source-check
$env:PRODUCT_APP_MODULE=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
node --test tests/product-app/adapters.test.mjs tests/product-app/adoption.test.mjs tests/product-app/r2.test.mjs tests/product-source/smoke.test.mjs tests/product-source/boundaries.test.mjs tests/product-source/raster-rebind.test.mjs
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --module nodenext --target es2022 tests/product-source/types.mts tests/product-app/types.mts
~~~

Redirect logs/profiles/outputs into the new run. Scripts require Node24.19 and the pinned repository-private Playwright. Browser limits are600 seconds per engine; Node matrix limit240 seconds. This is a resource limit, not a production latency promise. No live AI, deployment, production IdP, printer or billing is contacted.

Controller material adoption and restored-document validation are now integrated. The shared product-material contract lives in src/contracts so the controller and UI types do not import the native integration adapter. Parent42 Node groups and5 focused validator/lifecycle groups pass after integration; full matrix/browser rerun is recorded separately. Source adoption and geometry consent still require full application acceptance.
