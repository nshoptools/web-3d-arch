# Reproduce the permanent raster app suite

Prerequisites: existing repository Node24.19.0, Playwright with Chromium/Firefox/WebKit,
the existing TypeScript compiler under .toolchain/app-runtime,
and a matched main root arch-kernel.mjs + arch-kernel.wasm built inside the repository.
No test command installs, downloads, builds or modifies a toolchain.

Set ARCH_KERNEL_MODULE to the exact path returned by tools/kernel/build.ps1 for its
wasm target. That main builder normally emits work/module/arch-kernel.mjs under its
selected run; the required product runtime and optional Printing build use the same output location. The test runner
does not search old runs or select a binary by modification time.
If ARCH_KERNEL_MODULE and -ModulePath are absent, it requires that documented build
output in the CURRENT assigned run. It never substitutes another module.

From repository root:
```powershell
# ARCH_KERNEL_MODULE must already identify the checked main build.
& ./tests/raster-app/run.ps1 -Seat codex -RunId raster-app-check -Label main
# Equivalent explicit input:
& ./tests/raster-app/run.ps1 -Seat codex -RunId raster-app-check -Label explicit -ModulePath $env:ARCH_KERNEL_MODULE
```

run.ps1 dot-sources tools/development/env.ps1, then overrides CARGO_HOME/targets to
the selected run. Rust/Rustdoc and Node executables are read-only. The tests themselves
do not invoke Cargo. Browser profiles/downloads/TEMP/cache stay in the assigned run.

Each label is single-use: a second invocation must choose a fresh label. Staging is
at work/raster-app-stage/<label>; evidence at evidence/raster-app/<label>. The runner
copies dependency closure from CURRENT main src, root ABI/build records, selected
Module and these permanent tests/fixtures. It verifies fixture SHA256/byte lengths,
required raster/product/root exports and unchanged inputs during capture. Input paths and digests are in
staging.json. Tests execute staged bytes only, including controller validators.

The staged TypeScript check requires a releasable product ModelLease and rejects
heap-handle/packet substitutions. It checks the proposed additive callback contract
separately from the current standalone production declaration.

integration-tests.json records actual engine versions, groups, parity, cancellation,
ownership, transfer/detachment, termination and module factory count. Exit0 means all
four requested engines passed; exit1 means test/launch/parity failure; exit2 means
staging/prerequisites unavailable. Missing engines are never silently skipped.

To test relocation/path guards separately after preparing the SAME own environment:
```powershell
. ./tools/development/env.ps1 -Seat codex -RunId raster-app-portability
$env:CARGO_HOME = Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:CARGO_TARGET_DIR = Join-Path $env:PROJECT_REVIEW_RUN 'work/rust-target'
# Preserve explicit ARCH_KERNEL_MODULE from the selected main build.
& ./.toolchain/emsdk/node/24.19.0_64bit/node.exe --test ./tests/raster-app/portability.test.mjs
```

The portability test rejects path escapes/bad Module names without creating output,
copies only the permanent test directory to another path in the assigned run,
changes working directory, stages current main again and runs the real Node suite.
No component, controller or Module is read from a frozen worker candidate.
Set ARCH_RASTER_PORTABILITY_LABEL to a fresh label when repeating.

These commands only write the assigned run. Promote permanent test/docs files through
the parent's checked allowlist; never copy a staging tree back over production.
