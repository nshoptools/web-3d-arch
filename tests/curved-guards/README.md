# Curved final-guard regressions

These are implementation regressions against the actual public prepared-source
child ABI. Read root AGENTS and tests/AGENTS; output only to a fresh own run.
No additional product WASM Module or production source I/O is introduced.

Configure the existing `tests/curved-products` CMake entry with
`-DCMAKE_PROJECT_arch_curved_products_replay_INCLUDE=<absolute tests/curved-guards/inject.cmake>`.
This adds `prepared_guard_probe.exe` (native) or `.js/.wasm` (Node-WASM) linked
to the same mechanics/source child targets and pinned dependencies. The probe
is synthetic test I/O only. `ARCH_MANIFOLD_SOURCE` and `ARCH_CLIPPER2_SOURCE`
must select checked dependencies; build, cache and outputs belong to the run.

After dot-sourcing `tools/development/env.ps1 -Seat codex -RunId <fresh-run>`
and overriding package/tool caches into the run:

```powershell
python tests/curved-guards/regression.py native --tag fixed --binary <own-native-probe>
python tests/curved-guards/controls.py native --tag fixed --binary <own-native-probe>
python tests/curved-guards/regression.py wasm --tag fixed --binary <own-wasm-probe.js>
python tests/curved-guards/controls.py wasm --tag fixed --binary <own-wasm-probe.js>
node tests/curved-products/stage-fixtures.mjs
node tests/curved-products/derive.mjs
$env:CURVED_CORPUS='corpus-production'
node tests/curved-guards/run-corpus.mjs native core-native
node tests/curved-products/oracle.mjs core-native
node tests/curved-guards/run-corpus.mjs wasm core-wasm
node tests/curved-products/oracle.mjs core-wasm
```

Select the unchanged corpus executable with `ARCH_CURVED_BINARY` when it is not
under `work/build-native/Release` or `work/build-wasm`. For a staged candidate set
`CURVED_BORROW_ROOT` to the matching source tree. `run-corpus.mjs` only schedules
the unchanged corpus runner, two cases at a time; it changes no expectation,
timeout, parameter or oracle. Optional final argument `corpus-variants` selects
all 12 existing derivatives. Never stage or derive over an existing corpus.
For their oracle also set `CURVED_CORPUS=corpus-variants` explicitly; the child
scheduler's environment does not update its parent shell.

`regression.py` pins seven original request files. It requires correct typed
refusal, unchanged request/parameter data, blocked export and zero published
geometry. Explicit `--expect baseline` instead checks the historical negative
witness over every serialized IEEE triangle using exact rational arithmetic;
this is not a manufacturing pass. Both adjacent intact rays are also checked.

`controls.py` writes ten explicit synthetic derivatives in its output folder:
positive roof below the same slit, intact split slabs, concave side-wall controls,
zero chamfer, near-parallel and exact 90-degree rotation. Positive controls use
actual mesh topology and analytic ray intersections. Its 1e-12 mm comparison is
only for decimal/rotated ray arithmetic; it never affects manufacturing data or
the strict rational negative witnesses. The existing near-parallel negative was
already refused by the baseline exterior-domain guard and remains a refusal.

The synthetic probe and rational mesh reader originate in the project's sealed
curved-products review reproduction and are retained as first-party test code.
The source request bytes and their SHA-256 pins are preserved. No external asset,
new codec, numerical library or license dependency is introduced.

The API scope and conditional resolution limits are described in
`docs/curved-products/GUARD-RESOLUTION.md`. These tests are not an independent
review, whole-application qualification, slicer test or proof for all inputs.
