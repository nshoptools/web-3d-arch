# Rebuild and test

Run from the repository root. Every writing process inherits the assigned run
environment. Choose your own new RunId; none of these scripts depends on another room.

```powershell
. tools/development/env.ps1 -Seat codex -RunId source-library-check
$env:CARGO_HOME = Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:CARGO_TARGET_DIR = Join-Path $env:PROJECT_REVIEW_RUN 'work/rust-target'
$env:PIP_TARGET = Join-Path $env:PROJECT_REVIEW_RUN 'cache/python-deps'
$env:PYTHONPATH = Join-Path $env:PROJECT_ROOT '.toolchain/python'
$env:PYTHONDONTWRITEBYTECODE = '1'
$libraryNode = Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
$env:PATH = (Split-Path $libraryNode) + ';' + $env:PATH # this process only
$librarySource = $env:PROJECT_ROOT # or the explicitly assigned candidate overlay
$libraryOutput = Join-Path $env:PROJECT_REVIEW_RUN 'work/library-generated'
$libraryDeploy = Join-Path $env:PROJECT_REVIEW_RUN 'work/library-deploy'

& $libraryNode (Join-Path $librarySource 'tools/assets/source-library/build.mjs') --output $libraryOutput
& $libraryNode (Join-Path $librarySource 'tools/assets/source-library/deploy.mjs') --library $libraryOutput --output $libraryDeploy
```

Builder inputs always come from current `PROJECT_ROOT` asset locks/catalogs.
CLDR inputs, generator source and native file lock come from the invoked tool's
package. The offline output is only `src/assets/source-library/**` under the
requested directory; tools/source code are not implicitly copied. To test a new
unintegrated candidate, put its tools/tests/integration module alongside generated
data in that candidate root, or run its builder with `--output` equal to that own
candidate. After integration, tests can use the checked main package read-only.

```powershell
& $libraryNode (Join-Path $librarySource 'tests/source-library/run.mjs') --library $librarySource
python -B (Join-Path $librarySource 'tests/source-library/native.py') --library $librarySource --output (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/library-native')
& $libraryNode (Join-Path $librarySource 'tests/source-library/browser.mjs') --library $librarySource --deployment $libraryDeploy
& $libraryNode (Join-Path $librarySource 'tests/source-library/reproduce.mjs') --library $librarySource --output (Join-Path $env:PROJECT_REVIEW_RUN 'work/library-reproduction')
```

Compare the generated outputs to the checked package before testing its deployment;
the browser harness requires identical catalog/deployment/artwork/build-receipt bytes.
Reproduction requires a fresh directory and compares every generated file, including
all PNGs and pinned CLDR source files. Run the suites sequentially: they intentionally
share the current-run test staging directory.

`run.mjs` stages current main source-catalog/source-contract bytes and declaration
dependencies into the assigned run, records their hashes, runs Node tests and strict
TypeScript checking. Browser tests use the same staged production contracts in module
Workers and the real full deployment. Browser profile/download/temp paths stay in the
run; the existing pinned Playwright and browser binaries are read-only. No extra
runtime module is loaded. These tests are catalog/asset-reader tests, not root geometry
or product rendering tests. A root module environment override is not needed.

Native build dependencies are the existing read-only `.toolchain/python` packages:
uharfbuzz 0.56.1 (HarfBuzz 14.4.0), resvg-py 0.5.0 and Pillow 12.3.0. The independent
outline test also uses existing FontTools 4.64.0. The installed file hashes must match
`tools/assets/source-library/toolchain-lock.json`. No package installation occurs.
An intentional native dependency upgrade requires an explicit new lock and evidence;
do not merely edit the expected hashes after an unexplained mismatch.

For an explicit network recheck of the existing CLDR pin:

```powershell
& $libraryNode (Join-Path $librarySource 'tools/assets/source-library/sync-cldr.mjs') --output (Join-Path $env:PROJECT_REVIEW_RUN 'work/cldr-refetch')
```

It accepts only the exact pinned Unicode repository/commit, rejects redirects,
enforces byte bounds and verifies all three files before retaining them. Ordinary
builds stay offline. This is a refresh of the existing lock, not an automatic upgrade.

Existing repository asset checks, without main report writes:

```powershell
& tools/assets/verify-all.ps1 -Seat codex -RunId source-library-check
```

Use the actual assigned RunId, never a different worker's room. Do not add
`-UpdateReports` in a sidecar. A parent runtime change can make the old durable input
audit stale even when numerical checks pass; retain the exit and mismatch as evidence.
See EVIDENCE.md for the observed limitation.
