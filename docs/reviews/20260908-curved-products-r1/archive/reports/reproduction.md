Reproduction record — 20260908-curved-products-review-r1

Initial findings were sealed at `2026-09-08T11:22:20.578806+00:00` before any other reviewer/author conclusion or handoff. No such conclusions were subsequently read. Initial files remain unchanged; content hashes are in `initial-seal.json`. This document records reproduction and limitations, not release acceptance.

**Fast reproduction of demonstrated defects.**

From repository root, use a fresh tag. Each script resolves the repository from its own location, dot-sources `tools/development/env.ps1 -Seat codex -RunId 20260908-curved-products-review-r1`, validates inputs/binaries against pinned hashes, and refuses to overwrite an existing output directory.

```powershell
pwsh -NoProfile -File ./tmp/reviews/codex/runs/20260908-curved-products-review-r1/work/harness/reproduce-findings.ps1 -Target native -Tag independent-replay-01
pwsh -NoProfile -File ./tmp/reviews/codex/runs/20260908-curved-products-review-r1/work/harness/reproduce-findings.ps1 -Target wasm -Tag independent-replay-01
```

Expected: F1 reproduces for strap shifts 2/4 nm and LEGO shift 2 nm; F2 reproduces for strap-notch-1. Three wider-slit controls refuse with zero mesh. The driver exits 0 only after checking the observed defects and refusal controls, all input parameter records, actual exported mesh topology and exact rational all-triangle witness rays. It does not equate process exit 0 or getter success with correct geometry. Outputs go to `evidence/reproduction-<tag>-<target>`.

Executed final runs: `reviewer-final-check-native` and `reviewer-final-check-wasm`, both exit 0. Exact argv, process exits, input SHA, emitted ARCH SHA, mesh vertices/faces/parts and rational intersections are recorded in each directory's `summary.json`, `.arch`, `.json`, and `.log`. Initial findings pin the requests, helper scripts and important readback reports; the complete manifest pins all selected evidence.

**Build provenance and reproducibility.**

Canonical recipes read: frozen `tests/curved-products/README.md`, its CMakeLists, mechanics/source-assembly README and CMakeLists, and `tools/curved-products/build.ps1`. Built the frozen standalone replay CMake entry point. There was no root application CMake build. `CMAKE_PROJECT_INCLUDE=work/harness/inject.cmake` adds separate reviewer harness targets without changing the snapshot. `independent.cpp` calls the public ABI and serializes all mesh data; `guard-probe.cpp` includes the exact unchanged production TU solely for private diagnosis. Final findings use the public ABI.

Manifold 3.5.3 source revision `0edd9d54876f3135e431575214dd6d8a72866fee` was copied from `.toolchain/manifold` into `work/deps/manifold`, excluding `.git`. Clipper source was copied into `work/deps/clipper2-derived`. Every copied source was hashed against its source before changes. No child or Manifold/Clipper prebuilt library was borrowed. All were compiled locally on both targets.

Clipper upstream archive revision `46f639177fe418f9689e8ddb74f08a870c71f5b4`, SHA-256 `73f5783e0c88299976334f48e3e356c756b96212c652ecc8bceec3bd99455bcb`, is preserved under `inputs/dependency-source`. Actual `.toolchain/clipper2-derived` matched upstream archive file bytes, with tree hash `7b14cc227ae1e0b6a6495226ad60996f456d3079c2239e3c43e88f9f1d287d37`. The exact frozen `clipper2-no-iostream.patch` (SHA `88763e9a0b2ad9ec036baeaf00317090621aa98c9754869e856ba16080ea8039`) was applied to the copied source only. Its three files concern I/O guards and CMake. The resulting tree `fcefb0a6d112a2f44feccc3a2a86411171c0a1666fb3a3fb549d6b432448a8fe` still **does not match** declared `6316dc4c346683b329f362b78d9d2c324ad628175716f1ccd280c12d305a62cb`. The initial pre-patch build was superseded; all qualifying tests used rebuilt upstream+patch copies. These results do not attest the unavailable declared derived tree.

The Emscripten sysroot was borrowed from the existing pinned toolchain, copied into own `cache/emscripten`, and not rebuilt. The 2074 source/copy file hashes are recorded in `emscripten-sysroot-provenance.json`; actual cache/profile files are excluded from the manifest. Installed compiler and runtime executables were used read-only. `.toolchain` was not modified. Native build intermediates, WASM objects, cache, profiles, logs and outputs remained in the own run.

Effective child flags were checked in generated build rules: native `/fp:strict`, WASM `-fno-fast-math -ffp-contract=off`; Manifold internal parallelism and configure downloads disabled. WASM fixtures use exceptions, NODERAWFS, Node environment, growing memory and 4 MiB stack. This is not a pthread/Worker qualification. Whitelisted build settings are in `build-effective-settings.json`; raw CMake caches are excluded.

Exact executed configure/build argv appear in `evidence/commands.jsonl`. To rebuild the same recorded dependency variant in a fresh own directory, after dot-sourcing env:

```powershell
$reviewRun=$env:PROJECT_REVIEW_RUN
$reviewSource=Join-Path $reviewRun 'work/review-source'
$reviewBuild=Join-Path $reviewRun 'work/build-native-replay-01'
$reviewArgs=@('-S',"$reviewSource/tests/curved-products",'-B',$reviewBuild,
  '-G','Visual Studio 18 2026',
  "-DARCH_MANIFOLD_SOURCE=$reviewRun/work/deps/manifold",
  "-DARCH_CLIPPER2_SOURCE=$reviewRun/work/deps/clipper2-derived",
  "-DCMAKE_PROJECT_INCLUDE=$reviewRun/work/harness/inject.cmake",
  '-DCMAKE_BUILD_TYPE=Release')
& $env:CMAKE @reviewArgs
if($LASTEXITCODE){throw 'Configure failed'}
& $env:CMAKE --build $reviewBuild --config Release --parallel 4
if($LASTEXITCODE){throw 'Build failed'}
```

For WASM, select a different own build directory, replace generator with `Ninja`, add `-DCMAKE_MAKE_PROGRAM=<repo>/.toolchain/ninja/bin/ninja.exe` and `-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`, and write `{"type":"commonjs"}` to that build directory's `package.json`. The supplied replay verifier intentionally pins the already reviewed binaries; a newly rebuilt binary requires a separately labelled artifact/hash comparison before reuse. The build recipe is a replay of recorded settings, not a promise of byte-identical native PE timestamps.

| Tool | Observed version | Version-command exit | Executable SHA-256 |
|---|---|---:|---|
| CMake | cmake version 4.4.3 | 0 | `ab8247ca4554871e5d75c0ee118ee8663727bd6fdf37ad76b17e9cc8d5f286a8` |
| Ninja | 1.13.2.git.kitware.jobserver-pipe-1 | 0 | `a7f084e8ee37bff0872aa8bd3d17cc19632d2a37734f6c242dd3dee22d77c0b4` |
| Emscripten | emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.9 (4e4223852a0835923411059a3929907d7df1232e) | 0 | `85b71d8c6ec1905935f74be0c9869aae198d00e98f39df699ec66f9c5a84cecd` |
| Clang | clang version 24.0.0git (https:/github.com/llvm/llvm-project 510126255f89d693717c1ce7105b593f995f07c1) | 0 | `14516a617c3c0770abd0287db0e1a84ba575f2ba6847011118b5f1ed75be08d6` |
| Node | v24.19.0 | 0 | `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` |
| Python | Python 3.13.15 | 0 | `85b71d8c6ec1905935f74be0c9869aae198d00e98f39df699ec66f9c5a84cecd` |
| MSVC | Microsoft (R) C/C++ Optimizing Compiler Version 19.51.36256 for x64 | 0 | `e6d57100c82ae0310c18b16abfe52bc0df8fbb272ca6c5fb287d485807cfce91` |
| Git | git version 2.55.0.windows.3 | 0 | `7b7971dd13f0c3a284e538601f2f9770b3a87dfaccb5fb52d68141c67ed22364` |

The 24 selected executables/WASM/JS/static libraries have path, byte size and SHA-256 in `selected-tool-versions.json`, including the Emscripten driver hash. Actual session model/effort is from a read-only explicit SQLite whitelist before review; CLI executable hash and effective Fast off are independently checked. Server service tier remains **not attested**. Requested `default` alone does not prove backend tier.

**Independent geometry checks and finite limits.**

`mesh-audit.py` reads actual ARCH triangles and part tables without production Boolean libraries: it checks oriented two-face edge incidence, components, Euler, duplicate coordinate vertices, nonzero face areas, signed volume and bbox. Exact ray predicates use Python Fractions of each actual IEEE vertex; a ray is a counterexample witness, never a universal acceptance proof.

`full-surface.py` classifies every source prism triangle against top/bottom and vertical planes. It compares complete directed patch boundaries, splitting all collinear endpoints and canceling opposite edges; consistent normals plus equal projected domain covers triangle interiors. Grid embedding is comparison-only, bounded by 1e-8 mm and never written back to the mesh. `rational-contract.py` separately constructs the expected P/A/P−A shapes, four art modes and every horizontal/vertical material contact. The orthogonal arrangement's open cells exhaust the entire source plane because all boundaries in those eight inputs are axis aligned. Four additional modes use an angled 2 nm strip.

`corpus-audit.py` directly reads ARCH/APMS, compares every original parameter record, independently transforms original canonical artwork, checks exact integer chain conservation on every open source Z interval and analytic mode volumes, then reads all final mesh faces/edges/parts/materials. The 40 captured request/source pairs cover five product groups × four modes × Inter O/selected Noto Emoji sources. Existing frozen test producers are treated as data/regression controls, not correctness proof. Whole final mechanical surfaces are not independently proven equivalent to arbitrary smooth source by these source-prism checks.

The original corpus runner/oracle depended on root JS readers missing from the frozen snapshot; no main fallback was used. The captured root C++ product bridge was built only as frozen child integration input. No inference about current main, Rust state, Worker, new parent root ASTF/probe/CSG, application release, backend, account/auth, printer or fit follows. Twelve derive variants were not run. Groove radial/section controls and normal resource cases use reviewed frozen producer oracles; arbitrary corner/tangent/near-collinear completeness is still unverified.

The frozen surface parity oracle was reviewed beyond vertex matching: same directed projected patch boundary and positive projected normal establish a common planar domain; a slab width plus vertex displacement bounds the full patch surface. On this corpus 32 byte-identical meshes and eight retriangulated LEGO cases passed, 88 paired patches, max bound 5.0884469795445387e-11 mm under unchanged 1e-8 mm comparison budget. Seven controls passed. Ordinary double arithmetic prevents treating this as a universal formally rounded proof.

Source child tests: 140/140 per target. Mechanics: 19/19 campaigns, 199 serialized inputs per target. Resource controls: 14 nominal mesh successes and two deliberate capped refusals per target. R2: 22/22 controls per target. Three native cancellation observers fired at stage≥3 and published no partial mesh; no hard query latency or WASM Worker cancellation guarantee. Known total error fields remain unverified, rather than fabricated from passing local bounds.

**Commands and exits.**

`commands.jsonl` records exact argv, cwd, UTC start, duration, exit and log for each journaled build/campaign. Individual case summaries/reproducer files preserve the nested actual child invocations and exits. `setup-and-harness-notes.json` records inline setup, metadata verification and corrections; one initial per-inline dependency assertion exit was not separately captured and is explicitly null. Read-only exploratory file searches are not represented as geometry campaigns.

| Journal entry | Exit | Seconds | Log |
|---|---:|---:|---|
| native-configure | 0 | 7.03 | `evidence/native-configure.log` |
| native-build | 0 | 78.44 | `evidence/native-build.log` |
| clipper-carry-patch | 0 | 0.11 | `evidence/clipper-carry-patch.log` |
| native-rebuild-declared-patch | 0 | 59.79 | `evidence/native-rebuild-declared-patch.log` |
| stage-corpus | 0 | 0.52 | `evidence/stage-corpus.log` |
| wasm-configure | 0 | 23.20 | `evidence/wasm-configure.log` |
| native-add-probe | 0 | 2.15 | `evidence/native-add-probe.log` |
| native-probe-build | 0 | 19.02 | `evidence/native-probe-build.log` |
| wasm-build | 0 | 107.93 | `evidence/wasm-build.log` |
| resource-native | 0 | 182.12 | `evidence/resource-native.log` |
| guards-native | 0 | 5.46 | `evidence/guards-native.log` |
| independent-native | 0 | 4.55 | `evidence/independent-native.log` |
| wasm-add-probe | 0 | 8.05 | `evidence/wasm-add-probe.log` |
| wasm-probe-build | 0 | 45.06 | `evidence/wasm-probe-build.log` |
| independent-wasm | 0 | 11.06 | `evidence/independent-wasm.log` |
| guards-wasm | 0 | 17.58 | `evidence/guards-wasm.log` |
| native-cancellation | 0 | 1.50 | `evidence/native-cancellation.log` |
| resource-wasm | 0 | 221.98 | `evidence/resource-wasm.log` |
| source-suite-native | 0 | 146.02 | `evidence/source-suite-native.log` |
| native-add-guard | 0 | 4.85 | `evidence/native-add-guard.log` |
| native-guard-build | 0 | 40.31 | `evidence/native-guard-build.log` |
| guard-slit-0p000002 | 0 | 0.18 | `evidence/guard-slit-0p000002.log` |
| guard-slit-0p0000002 | 0 | 0.14 | `evidence/guard-slit-0p0000002.log` |
| guard-slit-0p0000001 | 0 | 0.11 | `evidence/guard-slit-0p0000001.log` |
| guard-slit-0p00000005 | 0 | 0.12 | `evidence/guard-slit-0p00000005.log` |
| guard-slit-0p00000002 | 0 | 0.11 | `evidence/guard-slit-0p00000002.log` |
| mechanics-suite-native | 0 | 142.98 | `evidence/mechanics-suite-native.log` |
| corpus-native | 0 | 512.95 | `evidence/corpus-native.log` |
| independent-guard-readback-native | 0 | 0.61 | `evidence/independent-guard-readback-native.log` |
| full-source-surface-native | 0 | 1.33 | `evidence/full-source-surface-native.log` |
| full-source-surface-wasm | 0 | 0.34 | `evidence/full-source-surface-wasm.log` |
| corpus-wasm | 0 | 402.05 | `evidence/corpus-wasm.log` |
| independent-guard-readback-wasm | 0 | 0.28 | `evidence/independent-guard-readback-wasm.log` |
| independent-other-guards | 0 | 2.37 | `evidence/independent-other-guards.log` |
| corpus-audit-native | 0 | 28.10 | `evidence/corpus-audit-native.log` |
| surface-parity-controls | 0 | 0.67 | `evidence/surface-parity-controls.log` |
| surface-parity-corpus | 0 | 20.51 | `evidence/surface-parity-corpus.log` |
| source-suite-wasm | 0 | 212.33 | `evidence/source-suite-wasm.log` |
| corpus-audit-wasm | 0 | 42.48 | `evidence/corpus-audit-wasm.log` |
| full-source-expanded-native | 1 | 0.47 | `evidence/full-source-expanded-native.log` |
| full-source-expanded-wasm | 1 | 0.52 | `evidence/full-source-expanded-wasm.log` |
| full-source-complete-native | 0 | 0.44 | `evidence/full-source-complete-native.log` |
| full-source-complete-wasm | 0 | 0.49 | `evidence/full-source-complete-wasm.log` |
| mechanics-suite-wasm | 0 | 140.28 | `evidence/mechanics-suite-wasm.log` |
| rational-material-contract | 1 | 0.41 | `evidence/rational-material-contract.log` |
| rational-material-contract-checked | 1 | 0.40 | `evidence/rational-material-contract-checked.log` |
| rational-material-contract-final | 0 | 1.11 | `evidence/rational-material-contract-final.log` |
| final-reproduction-native | 0 | 5.68 | `evidence/final-reproduction-native.log` |
| final-reproduction-wasm | 0 | 7.26 | `evidence/final-reproduction-wasm.log` |

Failed harness runs were retained: an overbroad JSON glob included `.repro.json`; a Python local path variable was shadowed; formal P−A contact counting needed exact boundary cancellation before measurement. Corrections did not change production, frozen oracles, nominal input dimensions or any tolerance/cap. The initial report count was corrected from 200 to the observed 199 artifacts before seal. The git apply attempt returned 0 while skipping an ignored directory; byte hashes caught it and the exact carry hunks were then applied to the own copy. These failures are not hidden as product passes.

**Inventories and publication boundary.**

`source-before.json` and `source-after.json` both match all 218 frozen files and the input manifest hash `0b0a12030d0c9dede1ceacc80f2721ec43bc31d7078b1c0831779f9ce7f50cf9`. Final validation rechecks current snapshot bytes, initial seal, dependencies and selected binary hashes without rewriting those inventories. The evidence manifest uses relative paths and SHA-256, pins reports/reproducers/actual mesh evidence/commands/dependency source copies/build artifacts and safe metadata. It excludes credentials, cache contents, raw CLI events, stderr/debug/session profiles, and `reports/response.md`. The launcher writes response.md only after the final assistant message, so that file is intentionally not sealed. The manifest and its detached digest exclude their own self-reference.
