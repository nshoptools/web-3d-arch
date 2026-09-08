# Curved source/mechanics regression replay

These are implementation tests. They do not qualify physical fit, printers,
slicer projects or every arbitrary source. Read root AGENTS and tests/AGENTS.
All output is under `PROJECT_REVIEW_RUN`; use a new, writable own run.

The 80 losslessly compressed fixture buffers preserve the actual production
ARCH1 canonical source and APRQ requests from 40 Inter O / selected Noto Emoji
models (five products × four modes × two sources). The corresponding font
licenses are included. Fixtures are original captured bytes with SHA-256; no
mesh/source is regenerated to match an expectation. The C++ fixture calls the
ordinary root `product-bridge.cpp` and the two child targets in one executable
or WASM Module. It does not exercise Rust snapshot registry or browser RPC.

From repo root, after these files and the child delta are integrated:

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId <fresh-run>
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
node ./tests/curved-products/stage-fixtures.mjs
./tools/curved-products/build.ps1 -Target native -RunId <fresh-run>
./tools/curved-products/build.ps1 -Target wasm -RunId <fresh-run>
$env:CURVED_CORPUS='corpus-production'
node ./tests/curved-products/run.mjs native checked-native
node ./tests/curved-products/run.mjs wasm checked-wasm
node ./tests/curved-products/oracle.mjs checked-native
node ./tests/curved-products/oracle.mjs checked-wasm
node ./tests/curved-products/derive.mjs
$env:CURVED_CORPUS='corpus-variants'
node ./tests/curved-products/run.mjs native variants-native
node ./tests/curved-products/run.mjs wasm variants-wasm
node ./tests/curved-products/oracle.mjs variants-native
node ./tests/curved-products/oracle.mjs variants-wasm
node ./tests/curved-products/r2-guards.mjs native
node ./tests/curved-products/r2-guards.mjs wasm
node ./tests/curved-products/resource.mjs native
node ./tests/curved-products/resource.mjs wasm
```

The same commands work against a candidate tree: prefix the script paths with
that tree. The standalone CMake recipe is under `tests/curved-products`, so this
does not replace or configure the application's root CMake project. Existing
Manifold/Clipper child targets and pinned read-only sources are reused, with
downloads disabled. `-BuildName` selects a fresh cache directory when changing
CMake entry points. Set `ARCH_CURVED_BINARY`, `ARCH_MECHANICS_FIXTURE` and
`ARCH_SOURCE_FIXTURE` to those binaries when using a non-default build name.

`CURVED_BORROW_ROOT` optionally selects an immutable matching copy of the root
JS APMS reader. In this implementation run `work/root-borrow` holds the pinned
production core; in an integrated main/new run the reader defaults to main.
The fixture replay itself needs no production `.mjs/.wasm` pair or font parser.
`capture.mjs` is the optional maintainer recapture path from recorded committed
PSB states; it uses actual production WASM canonicalization through the labelled
test harness and matching core. It is not an EngineClient/RPC qualification.

`derive.mjs` makes **explicit test-only** size 40/50/60 mm, first-layer .27 mm,
regular-layer .16/.20/.25 mm, and mating-tolerance .001/.0005/.00025 mm requests
for the two newly unblocked feature families in Chìm mode. It preserves all
other nominal values and IDs, changes both copies of a preparation binding, and
records every change and parent hash. These are direct ABI derivatives, not
committed application states or verified application heads.

The numeric oracle reads serialized triangles and canonical source contours.
It checks indexed manifold topology, independent volume/bbox, exact integer
boundary cancellation, every source Z interval, source outline preservation,
distributed signed groove radial sections, bore openings, mouth lead geometry,
roof/floor samples against the conservative guard lower bounds, and every input
parameter record. It neither calls Manifold nor trusts Status as its oracle.
The samples are independent regression evidence; production guard acceptance
requires the complete-volume/interval proof. Resource refusals and R2 negatives
are reported separately from normal feature passes. Seed and reproducers are
stored alongside outputs. Existing child suites must also run, with executable
paths supplied as above; the handoff lists their actual checked results.

For a full replay, stage the inputs and derive them once, then run
`tools/curved-products/check.ps1 -Target native|wasm -RunId <fresh-run>`.
The two target checks may run concurrently after staging, as their outputs are
disjoint. This runner includes the 40 captured requests, 12 derivatives, numeric
oracles, 16 resource/corner cases, 22 R2 guard controls and the existing child
suites. Native also checks in-flight cancellation. Run
`node tests/curved-products/parity.mjs release` after both targets succeed.
`-BuildName` and `-SkipBuild` select an already built portable target explicitly.
Native check also runs seven `surface-parity.test.mjs` controls. Parity version 2
checks bijective vertex correspondence and complete directed patch boundaries
with a plane-slab bound for alternate diagonals. It records byte identity
separately, preserves the 1e-8 mm comparison budget and modifies neither mesh.

The nine new shallow-notch controls use exact 1e-6/.001/.2 mm notch depths and
40/50/60 mm source sizes at .001/.0005/.00025 mm mating tolerances. Their oracle
measures the actual output's distance from the reentrant vertex at four groove
Z sections. The source corpus may have no canonical reentrant corners; optional
corpus corner samples are recorded as such and do not replace these controls.
All 14 normal resource/corner cases require actual valid geometry. Only the two
explicit budget violations expect rejection, empty geometry and preserved input.
