# Reproduce the bounded implementation proof

Use a fresh own run and dot-source tools/project-env.ps1 before every writing
process. Inputs/tools may be read from main/.toolchain; outputs, cargo/emscripten
caches and Playwright profiles must remain in that run. Do not rerun commands
into this frozen delivery room. The checked manifests describe actual tested
dependency/source preimages; hashes are not independent review.

1. Apply new runtime files and minimal delta in an owned checked copy, or let
   the parent integrate main. Root native CMake needs product-bridge.cpp and
   source/mechanics includes; build.rs already links arch_source_assembly and
   arch_mechanics. Keep all existing printing/raster/HB links and exports.
   Append the list native/product-exports.json in tools/kernel/build.ps1.
   No root CMake/build.rs/tool replacement is proposed.
2. Build native and WASM using the repo's pinned unified printing build pipeline.
   Preserve Node24.19, Rust1.98.1/native, nightly2026-09-07/WASM, Emsdk6.0.9,
   Manifold3.5.3, checked Clipper2, HarfBuzz14.4.0 and lib3MF2.5.0 sources.
   Use the exact native/source/mechanics dependency copies in the manifests.
   Cargo example product-runtime-probe is the real root library test runner.
   The own build-product.ps1 is a frozen reproduction record with this run's
   explicit paths, not a reusable main build replacement. Copy/adapt its
   run/output guards in a NEW room if using it to reproduce.
3. Set PROJECT_ROOT and PROJECT_REVIEW_RUN through project-env, then set
   PRODUCT_NATIVE_EXE and PRODUCT_RUNTIME_MODULE to the newly built probe/module.
   Defaults select work/rust-target/release/examples/product-runtime-probe[.exe]
   and work/module/arch-kernel.mjs in the current run. Tests locate source via
   their own import.meta.url, not a hardcoded old run.
4. Run, from the candidate/root checkout:
~~~powershell
node tests/product-runtime/run-native.mjs defaults
node tests/product-runtime/run-native.mjs all
node tests/product-runtime/run-native-raster.mjs
node tests/product-runtime/run-native-special.mjs
node --test tests/product-runtime/runtime.test.mjs
$env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $env:PROJECT_ROOT '.toolchain/playwright'
node --test tests/product-runtime/browser.test.mjs
node tests/product-runtime/oracles.mjs native-product
node tests/product-runtime/oracles.mjs native-raster-product
node tests/product-runtime/oracles.mjs node-wasm-product
node tests/product-runtime/oracles.mjs browser-product/chromium
node tests/product-runtime/oracles.mjs browser-product/firefox
node tests/product-runtime/oracles.mjs browser-product/webkit
~~~
   These commands inherit the dot-sourced own-run environment. Browser test
   imports pinned .toolchain/app-runtime Playwright read-only and makes its own
   per-engine persistent profile. The HTTP fixture server binds an OS-assigned
   loopback port with COOP/COEP/CORP and an exact generated route map. It is a
   controlled test server, not a deployment/host qualification.
5. Run root native Rust --lib tests and raster-runtime-probe with
   raster-runtime-tests enabled. Existing root build env ARCH_NATIVE_BUILD,
   ARCH_PRINTING_ENABLED=1 and own cargo/cache paths are required.

Frozen synthetic fixtures: 40x30mm SVG with two explicitly named adjacent paths
and a4x4mm hole;64x48 RGBA with two materials and a6x7pixel transparent hole;
a separate explicit text-outline SVG with a hole. Default five-product records
are unchanged. Art-mode matrix changes only artMode; raster matrix explicitly
sets its k/res/smooth/minA/denoise/eps/tension to the actual prepared settings.
Semantics2 regressions set explicit housing/skirt/layer/nominal-MM values.
They are model construction tests, not physical parameter recommendations.

Assertions read every model part with the existing independent mesh reader/
topology routine: incidence, winding, vertex links, positive volume. Source
spatial queries verify the original artwork hole and the shared canonical
partition seam, using provenance/lineage rather than palette identity. Exact
shared-face comparisons use1e-12mm between the two meshed faces, plus2e-8mm
local query allowance against the captured canonical grid. The original
unquantized SVG coordinate is not substituted for the captured source seam.
Source offset certificates are checked against their declared tolerance.
The tests do not claim a certified cumulative arbitrary-CSG error bound.

Native first-part STL readback is checked separately; that is not final-scene
STL union or grouping coverage. Other exporters/mesh import and the two reported
R2 defects remain separate blockers. The R1 mechanical geometry and nominal
intervals are recorded exactly; the bridge does not alter a reference to pass
source acceptance. Propagating a later source/mechanics rejection is required.

Browser matrices test 5 defaults +20 SVG +20 accepted-raster models and a
separate prepared-text context, real Worker messages, shared root heap, extra
lease ownership/epoch checks, retained bytes, cancellation, no-mesh native
proposals and explicit exact-head acknowledgements. The bounded typed context
and register/cancel/resource tests are additional assertions, not new product
qualification counts. Node/native parity tolerances and actual artifact hashes
are in evidence; superseded failure/debug logs are retained as historical data.

The proposed src/integration/kernel-adapters.mjs delta exposes semantic blocks/
export mapping and preserves the non-product path. It is not app/controller
acceptance: parent must wire selectRecipe persistent IDs/material bindings and
the native no-mesh proposal lifecycle. Parent's current textOperation/source
service/request-capture changes were merged into the candidate Worker/client;
their independent text feature suite remains parent's evidence.
