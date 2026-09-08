# Bounded derived-support chord refinement

Decision/version: **arch-source-support-regularization/1**, 2026-09-08. Bug fix within source ABI1 / semantics2; mechanics ABI2 / semantics3 unchanged. Implementation verification, not configured independent review.

The ordinary committed text source `Vie\u0323\u0302t Nam`, Be Vietnam Pro, default keychain/noi, size45mm, offset1.5mm and weld0.8mm refused `SUPPORT_REGULARIZATION_BOUND`. The controller/shaping/root capture retains raw NFD SHA `e2701b2b68fee0751cac951cc965c9c36a8bdf26139e49640e5e8697e78fb813` and canonical numeric-source SHA `261321939c58ba7df3ebf30d8f7481360cb31787b1740128e113f596b92485d3`. No input normalization or font substitution is part of this fix.

Clipper2 `SimplifyPath(path,2,true)` removes vertices using local distance to a line through current neighbours. It does not certify each final chord against the entire chain of removed original vertices or against the finite segment. The captured derived support has4934 grid vertices. Its3085-vertex proposal has an exact independently measured deviation of2.106921483203274nm. The violating chord is `(8455911,-3779952)` → `(8511216,-3815747)`; original vertex `(8457755,-3781148)` lies beyond its2nm bound. All integers here are on the existing1nm grid (1e6 units/mm).

`support_regularization.h` retains pinned Clipper2 as proposal generator. It verifies the complete original chain for every finite chord. A failing chord is split at its worst original vertex; an explicit stack verifies both children. Acceptance stays at2nm. The finite-segment calculation uses outward-rounded binary64 intervals for each operation and an outward square root under the target's strict IEEE flags. There is no epsilon added to acceptance. Original coordinates, cyclic order and winding remain; the production topology and short-edge guards still run.

For this captured support, one original vertex is reinstated (3086 output vertices). The exact BigInt oracle measures final maximum deviation1.9956086663219577nm. The library proposal and refinement are never applied to original artwork or shared material source edges. The original12 shaped contours, including2 holes and10 disconnected solid components, are retained exactly after the declared source scale/grid transform. The source's intentional body-hole-fill setting is unchanged.

For each accepted chord, distance to its closed segment is convex along each original edge, so the maximum over original vertices bounds the entire chain. Conversely, the chain's continuous projection covers the segment between its endpoints; each chord point has a chain point within the same bound. Thus the audited bound is bidirectional, not merely a local vertex-to-line test. Source stage7 also keeps the existing grid-rounding term sqrt(2)/2nm. Stage100 keeps the existing generated-source error budget. This local proof is not a certified global parser/shaper/CSG error bound.

The caller's `max_points` also caps the captured derived-support vertex count before simplification. Refinement storage is O(N); worst-case work is bounded separately at64 vertex tests per `max_operations` unit, shared across support rings, with cancellation observation every512 visits and during point validation. Exhaustion returns typed `AS_RESOURCE`; cancellation clears publishable source/mesh. Library calls are observed before/after; this does not claim that every Clipper/Manifold query is interruptible. A collapsed proposal uses the original chain, subject to the same later topology/edge guards; it is never silently discarded.

## Focused evidence and scope

- Native and WASM exact captured AP RQ + ARCH/1 replay through an unchanged root C++ product bridge and unchanged private mechanics dependency.
- Default45mm/noi; explicit36mm/.0005mm and60mm/.002mm cases; four art modes at45mm; weld0 control. These are seven positive models, not a font corpus.
- Independent indexed-mesh incidence, orientation, vertex-link and signed-volume checks; all12 original contour boundaries compared exactly; hole/disconnected-component probes; nominal bbox and height checks; original parameter modes, datum, reference, provenance and raw NFD SHA preserved.
- Explicit invalid size, point budget and one-grid-unit raw edge remain refused with no published geometry. Cancellation during support work preserves inputs and permits a subsequent valid build.
- One finite-segment/backtracking regression plus64 seeded ellipse predicates (`0x53092026`), with exact BigInt whole-chain distance checks. These are numeric predicate tests, not65 product-feature passes.
- The uninstrumented production `arch_source_assembly` CMake target is separately linked and replayed. Instrumented targets add only a test observer of the support input.

The original capture uses the read-only parent `module-handover-r4` pair: MJS `cd92ea536fcdff3f53bed29fc42022229f8e2cd24a942fa87237fa89fed58828`; WASM `064f52946188df285fc1328e7e2607a7cbdb174a82f85eded2e949a71f4c1b3c`. Candidate proof is child CABI native/WASM replay, not a rebuilt Rust root Worker/browser or whole-application acceptance. Parent owns the combined root build and latest CSG/mechanical-guard integration. Fit remains unqualified.

## Reproduction after promotion or in the candidate

Dot the project environment with a fresh own run. Set `$child` to this source-assembly directory (candidate or main). All generated files stay in that run; root/toolchain are read-only inputs.

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId <fresh-run>
$child = Join-Path $env:PROJECT_ROOT 'src/kernel/source-assembly'
& "$child/tools/source-domain-check.ps1" -Target native -RunId <fresh-run>
& "$child/tools/source-domain-check.ps1" -Target wasm -RunId <fresh-run>
node "$child/tests/source-domain/run.mjs" native r1
node "$child/tests/source-domain/run.mjs" wasm r1
node "$child/tests/source-domain/preservation.mjs" native r1
node "$child/tests/source-domain/preservation.mjs" wasm r1
node "$child/tests/source-domain/guards.mjs" native r1
node "$child/tests/source-domain/guards.mjs" wasm r1
node "$child/tests/source-domain/production-proof.mjs" native r1
node "$child/tests/source-domain/production-proof.mjs" wasm r1
```

The build helper reconstructs a private223-file canonical Clipper tree from the pinned archive + carry patch and verifies SHA `6316DC4C346683B329F362B78D9D2C324AD628175716F1CCD280C12D305A62CB`, rather than using unrelated extra googletest files in the shared tree. Manifold commit `0edd9d54876f3135e431575214dd6d8a72866fee`, downloads OFF; existing CMake4.4.3/EMS6.0.9/Ninja1.13.2. The private baseline source preimage is only a regression fixture. Original font assets/licenses stay in the repository's existing asset catalog; fixtures contain the short test's generated numeric contours, not a replacement font.
