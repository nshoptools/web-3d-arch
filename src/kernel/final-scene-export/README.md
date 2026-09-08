# Final-scene export child module

Implements the final-mesh subset of EXP-01/02, GEO-01/02/04, OUT-01 and ABI-01:
geometric-union binary STL, ZIP STL grouped by explicit `(slot, RGBA)`, and
SVG sections of the completed post-CSG scene. Native C++ uses the root's pinned
Manifold/Clipper2 targets; a Rust child encodes files and owns immutable output
leases in the same root ABI-2 Module and allocator. ARCH/1 is unchanged.

Read [API](docs/API.md), [decisions and numerical scope](docs/DECISIONS.md),
[acceptance matrix](docs/ACCEPTANCE.md) and [parent hooks](hooks/README.md).
`runtime-helper.mjs` is an optional command/file helper for the parent's Worker;
it does not replace the engine Worker/client or their text/product RPCs.

The parent must bind a committed **final** snapshot, exact generation/revision,
trusted upstream gate flags, independent mesh verdict and material map. An
invalid upstream semantic/wall/roof/datum gate blocks every format, including
inspection. This component does not correct mechanics/source-assembly R2.

## Reproduce from an integrated main tree or candidate

All writes go into the selected fresh run. Run from the repository containing
AGENTS.md; do not execute against a frozen output room. The script copies the
current root kernel to a private overlay, applies only missing focused hooks,
and copies this child there. It refuses unrecognized hook preimages. Existing
dependencies are read only, with downloads disabled and Cargo cache copied into
the fresh run before offline builds. No global install is needed.

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId my-final-export-check
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$component='src/kernel/final-scene-export' # or this candidate's absolute path
& "$component/tools/build.ps1" -RunId my-final-export-check -Target native
& "$component/tools/build.ps1" -RunId my-final-export-check -Target wasm
node "$component/tests/run-native.mjs"
node "$component/tests/native-runtime.mjs"
node "$component/tests/run-wasm.mjs"
node --test "$component/tests/runtime-helper.test.mjs"
node "$component/tests/browser.mjs"
node "$component/tests/parity.mjs"
node "$component/tools/provenance.mjs"
node "$component/tools/check-evidence.mjs"
```

Tests use the current root `tests/oracles/mesh-oracle.mjs` plus independent
analytic expectations, and the printing module's ZIP/XML readers (`fflate`,
`@xmldom/xmldom`). Root Node dependencies and the pinned three Playwright engines
must already be installed. `ARCH_FINAL_NATIVE`/`ARCH_FINAL_WASM` may override the
test artifact paths. `ARCH_MECHANICS_CANDIDATE` optionally selects a verified
frozen mechanics candidate for a **private** overlay; it is never changed.

Native and WASM fixtures construct real final CSG meshes using Manifold. The
browser suite exercises the same Rust/native functions and allocator in one
Dedicated Worker per browser, including old root STL/snapshot functions. It
does not certify the parent's concurrent product/text dispatcher or full UI.

No source SVG exporter, PNG renderer, 3MF implementation, codec, triangulator,
mesh repair, printer service or slicer integration is introduced here.
No physical-fit or configured independent-review qualification is claimed.
