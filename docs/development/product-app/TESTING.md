# Reproduce this implementation

Node24.19.0, TypeScript7.0.2 (repository-private, read-only); no dependency installation.

From repo root, choose a NEW output run after handoff, never the frozen run:

    . ./tools/project-env.ps1 -Seat codex -RunId 20260908-product-app-recheck-01
    $env:PRODUCT_APP_MODULE = '<absolute checked root arch-kernel.mjs path>'
    node --test --test-concurrency=1 '<candidate>/tests/product-app/adapters.test.mjs' '<candidate>/tests/product-app/adoption.test.mjs'

Tests write only PROJECT_REVIEW_RUN/evidence. The paired .wasm must be next to the supplied module. The original module pin is in inputs/dependencies.json of the frozen run (authority product-runtime-6fa96754c1bf3baf). The test harness creates exactly one supplied root Module per Node test process. Production code creates none. Tests serialize files to bound simultaneous memory.

For declarations:

    node .toolchain/app-runtime/node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --module nodenext --target es2022 --lib es2022,dom '<candidate>/tests/product-app/types.mts'

14 runtime test groups currently cover:
- initial source adoption with pure initializer and one simulated parent domain commit:5×4 SVG and5×4 PNG raster products, default domain/source-processing records except explicit art-style selection; no hand-defined region/role/material bindings in this matrix;
- real SVG contours and native raster decoder/31-buffer indexed graph, real existing raster source receipt/replay/consumer lifetime, opaque token borrow resolved by actual dispatcher in the test harness;
- independent mesh incidence/orientation/vertex-link/positive-volume and measured holes/common-material seams;
- ID hashing/collision injection, color/order changes, same-color distinct role materials, explicit slot/default handling, unmatched edit/rebind proposals and retained material history;
- rejected raw/hash/identity/context/region coverage/routing/owner mismatches; native registration catches a dishonest selector permutation;
- expired token, async cancel/private reset/auth/head/ticket changes, retired prepared recipe and retained root head;
- native no-mesh proposal, head-mismatch refusal, one-shot acknowledgment without domain changes;
- synthetic prepared text contours with declared133/134 references and rejection of unsupported text features;
- explicit mechanics-semantics3 rejection on the version2 reader.

Fixtures are synthetic:40×30 SVG, two authored regions and a hole;64×48 RGBA PNG, two colored regions and transparent interior hole. The raster path uses actual default processing (k4,res520,smooth3,minA5,denoise1,eps35,tension65) and each product's effective size. Source changes must be accepted by the existing source adapter. The physical source-coordinate oracle scales expected raster locations from the checked processing size; it does not treat pixels as printer accuracy.

The matrix contains40 models/220 parts,40 artwork-hole probes and148 measured coincident shared-seam samples in the current freeze. The seam oracle excludes intentional mechanical holes by sampling declared slabs at four Z fractions and requiring at least one true shared seam per model. It uses the captured canonical seam coordinate (grid rounding) and checks equality between independent ray/triangle intersections to1e-12mm; it does not enlarge kernel tolerances. Topological tests do not read reported volume as truth.

The fake part of the harness is ONLY the parent transport object around the real frozen root Module. Product adapter, domain encoder, SVG parser, raster operations/dispatcher/transport, receipt adapter, source assembly, mechanics and mesh oracle are real code. The test-only client resolves opaque raster tokens through dispatcher.withSourceReference synchronously before native request registration; it does not advertise a production fake adapter. No second raster preparation occurs for a product build. Source adoption describes the already captured proposal buffers, before the simulated single source+binding commit.

Scope limits: this run has no new native binary build or real browser/UI/SourceOperations history qualification. Parent's separate native/WASM/three-browser results are not counted as this helper's evidence. Synthetic text exercises contour/datum plumbing, not HarfBuzz/shaping correctness. No physical fit, printer capacity, R2 datum/roof remediation or semantics3 is qualified.

Final accepted logs:all-tests.log, types.log; machine summary VERIFICATION.json. Earlier failed logs/debug files are retained as investigation evidence and are not acceptance evidence. The raster callback TDZ was reported during development; final raster-adapters dependency is the unchanged corrected main copy.
