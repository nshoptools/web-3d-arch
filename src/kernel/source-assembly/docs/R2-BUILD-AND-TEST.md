# Portable R2 build and tests

Recorded 2026-09-08. The checked candidate consists only of mechanics and
source-assembly packages. The original 77 package files are preserved under
the handoff room's inputs/preimage. docs/r2-preimage-manifest.json pins every
preimage byte. Keep that tree read-only; do not rerun tests in a sealed room.

From the repository root, select a NEW authorized run ID. Replace the two input
paths below with the received immutable candidate/preimage locations. The
script derives the repository, validates paths/reparse points, dot-sources
tools/development/env.ps1 for codex and the run, and checks dependency/preimage
hashes before building. No global install or configure download occurs.

~~~powershell
$r2Candidate = '<received candidate root>'
$r2Preimage = '<received inputs/preimage root>'
$r2Run = '<new authorized run ID>'
& "$r2Candidate/src/kernel/source-assembly/tools/r2-check.ps1" -RunId $r2Run -PreimageRoot $r2Preimage -Target native
& "$r2Candidate/src/kernel/source-assembly/tools/r2-check.ps1" -RunId $r2Run -PreimageRoot $r2Preimage -Target wasm
. ./tools/development/env.ps1 -Seat codex -RunId $r2Run
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:CARGO_NET_OFFLINE='true'
$env:ARCH_SOURCE_TEST_ID='r2-new-source-regression'
node "$r2Candidate/src/kernel/source-assembly/tests/r2-parity.mjs"
node "$r2Candidate/src/kernel/source-assembly/tests/parity.mjs"
node "$r2Candidate/src/kernel/mechanics/tests/parity.mjs"
$env:ARCH_MECHANICS_FIXTURE="$env:PROJECT_REVIEW_RUN/work/r2-portable-native/Release/mechanics_new.exe"
node "$r2Candidate/src/kernel/mechanics/tests/cancellation.mjs"
node "$r2Candidate/src/kernel/mechanics/tests/remediation-domain.mjs"
node "$r2Candidate/src/kernel/source-assembly/tests/r2-domain.mjs"
~~~

The script's -BuildOnly option configures/compiles without running fixtures.
Outputs are work/r2-portable-native or work/r2-portable-wasm and evidence/reports
inside the selected run. It builds the final packages, the frozen libraries,
the original fixture producers, and enriched old/new probes. The old probes
link frozen implementations, so same-input old results are observed, not
simulated. Historical source baseline can be run separately by selecting its
original tests/run.mjs, ARCH_SOURCE_FIXTURE=.../source_old.exe and a distinct
ARCH_SOURCE_TEST_ID; do not overwrite the final regression report.

Both target recipes run R2 analytic reproductions, the source regression,
prior mechanics remediation and the component suite. Parity independently
reads both ARCH/1 outputs; exact byte matches supplement topology, geometric
planes, volume and signed-section oracles. R2 same-input cases include both
accepted blockers, explicitly declared MM/layers bindings, h0=.16/.25 and
other schedules, downward spans, flat/rim/text/body datums, bands, holes,
material partitions and failure/old-owner invariants. Original invalid
fixture adjudications are in R2-FIXTURE-ADJUDICATION.md.

Native: CMake4.4.3, Visual Studio18 2026 / MSVC19.51.36256.0. The two package
targets use /fp:strict. WASM: Emscripten6.0.9, Ninja1.13.2, Node24.19.0; the
harness supplies -pthread -fexceptions to compilation/linking, shared memory
growth, 4MiB stack and Node raw filesystem I/O for private fixture output.
Package targets add -fno-fast-math -ffp-contract=off. Node fixture modules are
test artifacts, not browser artifacts. No Rust build or root module is tested
by this recipe; parent retains its own root ABI/export/allocator checks.

Manifold3.5.3 revision0edd9d54876f3135e431575214dd6d8a72866fee and Clipper2
revision46f639177fe418f9689e8ddb74f08a870c71f5b4 are reused from the prepared
read-only .toolchain trees. Internal Manifold parallelism and configure
downloads are OFF. CMake does not fetch dependencies. The pinned Clipper2
carry-patch removes an iostream-only issue; original archive/derived tree and
both licenses are retained and verified using mechanics/tools/verify-pins.mjs.
See pins.json and licenses/README.md in each package for exact source URLs,
SHA-256 values and notices. No new third-party source or license was added.

The final handoff reports actual run counts and hashes. Previous debugging
logs are iteration history; only the final test manifests define qualification.
No printer/slicer, hardware fit, browser/root release or independent-review
claim follows from these tests.
