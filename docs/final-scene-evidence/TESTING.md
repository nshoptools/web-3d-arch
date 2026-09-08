# Reproduction and evidence scope

Run from the repository root. Mandatory RunId keeps logs/profiles/temp in the caller's room. The candidate's run.ps1 resolves tools/project-env.ps1 up the ancestor chain, not nested tests/AGENTS.md. No install or global configuration changes.

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId YOUR_NEW_RUN

./PATH_TO_CANDIDATE/tests/final-scene/run.ps1 -RunId YOUR_NEW_RUN -Suite node
./PATH_TO_CANDIDATE/tests/final-scene/run.ps1 -RunId YOUR_NEW_RUN -Suite types
```

Node tests need only local modules. Browser tests additionally require a copied/pinned root pair in the requested run and the five checked synthetic fixtures under tests/final-scene/fixtures. A separately pinned current-core overlay is supported. Example:

```powershell
$env:SCENE_BROWSER_TAG='production-r1'
./PATH_TO_CANDIDATE/tests/final-scene/run.ps1 -RunId YOUR_NEW_RUN -Suite browser `
  -RuntimeDirectory work/production-input/module `
  -InputOverlayDirectory work/production-input -ExpectedQualification complete
```

The overlay contains the current root-compatible src/core/*.mjs and src/kernel/final-scene-export/{float-runtime,runtime-helper}.mjs. It cannot overwrite candidate mesh-qualification* or mesh-predicates.mjs. The in-memory route manifest pins the exact bytes served, including all core modules and the MJS/WASM pair. Source paths must resolve inside the requested run. No old Module is silently combined with a new ready/client. There is no implicit fallback to an old room. The checked fixtures were captured with the real native SVG/prepareBindings path. The auxiliary capture programs and Halley test harness remain pinned research inputs in this run, outside the promotion manifest; ordinary Node/browser regressions do not import them.

The browser runner serves only its in-memory candidate module/fixture allowlist, on an ephemeral IPv4 loopback port. It exposes no repository listing, tmp tree, credential directory or arbitrary filesystem path. Same-origin COOP/COEP/CORP/CSP remain enabled. Tests use the secure-context loopback exception over HTTP, not a claim about deployed HTTPS. Profiles, downloads and logs are private to the RunId. No browser request interception, synthetic certificate bypass or production policy weakening is used. SCENE_BROWSER_ENGINES can select a single engine for a focused diagnosis; its acceptance.json still reports incomplete coverage of the full15-product matrix. SCENE_BROWSER_PAGE=initial selects the existing persistent-context page instead of creating a second blank tab; default is new. SCENE_BROWSER_TAG must be unique per observation; use a fresh private profile. Request/navigation logs include only harness paths/status/timestamps and local resource factors, never auth headers.

Node tests: analytic cube/tetra, open edge, reversed face/shell, exact degeneracy, thin nonzero features, disconnected vertex links, intersecting shells, material intersection/containment, opposite shared faces, edge/point contacts, cavity winding, exact near separation, STL truncation, work/cancel budgets and exact dyadic predicates. Provider unit tests name the synthetic ownership/transport fixture explicitly; they still use the actual mesh checker. Analysis-group tests cover exact source membership, unchanged real material/full-ID table, independent transport generations under one ticket, bad material geometry stopping analysis, bad whole-union geometry refusing pass, stale/cancel/reset barriers and malformed native bindings.

Browser matrix: actual root EngineClient, product adapter/owned inspector, automatic fixture material bindings, real validation Worker, actual-material AFGM plus neutral analysis-group AFGM and independent readback. All five products use the two-color holed SVG in noi mode with domain/product defaults. This is a bounded source/product matrix, not arbitrary UI/renderer/codecs/fit coverage. Three engines also exercise validation-Worker malformed input and cancellation. Provider guard races have meaningful Node tests; parent owns full authenticated application E2E.

The default ExpectedQualification=complete requires all five products per browser to pass snapshot, material readback and whole union; unavailable results fail that assertion. Explicit legacy/material-only observation modes exist to reproduce historic capability limits. The tests' assertion exit code and mesh acceptance count are separate: such a mode may verify that a known unavailable native result is preserved. acceptance.json explicitly counts normal product qualifications and unavailable products; no unavailable product is counted as a mesh pass. The pinned legacy root's clicky STL_FLOAT_COLLISION reproducer remains in older evidence even after the binary64 path succeeds. No result proves that float export of clicky is safe without the separate serializer/conditioning checks and consent.

Production browser-r5 passed Chromium/WebKit5 products each. Firefox timed out navigating the tiny harness document before importing any module. Focused r6 used identical214 served files, fresh profile, navigation logging and the same30-second goto timeout; it reproduced HTTP200 followed by missing document load. A separate navigation-only diagnostic (not qualification) loaded a COI document but failed a plain document, with internal Firefox/Juggler errors. It does not establish COI or product code as a cause. The subsequent r7 initial-page control passed all five Firefox products and Worker valid/invalid/cancel checks with the same214 served file hashes and unchanged30-second navigation/120-second Worker limits. The combined evidence is15/15 across Chromium r5, Firefox r7 and WebKit r5. r5 and r6 suite exits remain1; r7 exits0. A single initial-page pass is not proof of a harness fix. Earlier failures are not removed or relabeled.

Final source checks:43 Node groups,0fail/skip and strict types (including direct Ohm callback assignment), both exit0. Per-product elapsed times for build plus qualification in these observed runs (milliseconds):

| Product | Chromium153 | Firefox155 | WebKit26.6 |
| --- | ---: | ---: | ---: |
| keychain | 2835 | 2039 | 8442 |
| clicky | 26182 | 10293 | 42307 |
| strap | 8472 | 5266 | 26058 |
| lego | 107011 | 54734 | 81398 |
| charm | 12155 | 4121 | 24746 |

These are observed latencies under the current shared-machine load, not a benchmark/SLO. The reports also retain each geometry-check duration, candidate-pair count and source/material/union vertex/triangle/part counts. Cancellation remains available; no watchdog was raised.
