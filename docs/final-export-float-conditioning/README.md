# Final float conditioning and material readback

This delta implements two additive APIs in the existing Rust/C++ root Module:

- `prepareFinalFloat` → explicit proposal → `confirmFinalFloat` → STL, with
  `releaseFinalFloat`/primary lease cleanup. No STL is made by prepare.
- `finalSceneGeometry` → owned ARCH/1 binary64 material unions for a separate
  checker. It neither rounds to float32 nor grants a passing verdict.

See [API.md](API.md), [PROOF.md](PROOF.md), [EVIDENCE.md](EVIDENCE.md) and the
[TypeScript declarations](../../src/kernel/final-scene-export/float-runtime.d.mts).
The existing `finalExport`, AFEX wire, native exporter, Cargo/build/CMake and R3
payload authority guards remain unchanged. Root proposal IDs use the existing
monotone allocator and byte admission; no second Module, Worker, mesh codec,
external I/O or dependency was added to production.

This is implementation with self-tests, not a qualified independent review.
Inherited Astra/max; fast mode cannot be verified. Original source/snapshot and
old file leases remain owned and unchanged. Application consent/context CAS is
parent-owned; these APIs do not auto-approve conditioning.

## Reproduce after promotion

Use the repository's documented pinned toolchain and same-module native/WASM
build, including printing. No global install is required. Before each process
that writes, dot-source `tools/development/env.ps1 -Seat codex -RunId <your-run>`;
then override CARGO_HOME to `<your-run>/cache/cargo` and RUSTC/RUSTDOC to the
installed 1.98.1 binaries (nightly-2026-09-07 for build-std WASM). Seed the Cargo
registry by copying the existing repo-local registry into your own cache. Keep
all build outputs, EM_CACHE/TEMP and browser profiles in that run.

`ARCH_WASM_MODULE` points to the actual built `arch-kernel.mjs` (its paired wasm
must be adjacent). No earlier room or machine path is used by permanent tests.
`ARCH_NATIVE_BUILD` points to the same-source native archives and
`ARCH_PRINTING_ENABLED=1` enables the existing printing links.

1. Optionally stage a complete immutable test/source copy with
   `node tests/final-float/stage.mjs`. It reads current main by default, or
   `ARCH_FLOAT_SOURCE_ROOT`, into `$PROJECT_REVIEW_RUN/work/float-test-snapshot`.
   Existing differing capture bytes are refused. Run subsequent commands from
   that staged source root; its node dependencies are copied from read-only
   `.toolchain/app-runtime` and `.toolchain/printing-js`.
2. `node tests/final-float/make-inputs.mjs` creates deterministic authored SVG and
   current catalog default clicky/assembly request records inside the run.
3. Fullpath Cargo:
   `cargo test --manifest-path src/kernel/Cargo.toml --release --locked --offline --lib -- --test-threads=1`.
4. `cargo build --manifest-path tests/final-float/native/Cargo.toml --release --locked --offline`.
5. Run `$CARGO_TARGET_DIR/release/final-float-native-tests.exe` with four arguments:
   `$PROJECT_REVIEW_RUN/work/float-inputs/source.svg`,
   `$PROJECT_REVIEW_RUN/work/float-inputs/clicky.aprq`,
   `$PROJECT_REVIEW_RUN/evidence/native-root`,
   `$PROJECT_REVIEW_RUN/work/float-inputs/assembly.aprq`.
6. `node tests/final-float/file-oracle.mjs`.
7. `node --test --test-concurrency=1 tests/final-float/client-ready.test.mjs tests/final-float/runtime.test.mjs tests/final-float/worker.test.mjs`.
   Native results are required for byte-exact parity assertions.
8. Preserve and run `node --test --test-concurrency=1 tests/kernel/final-export-rpc.test.mjs`.
   When using a staged tree, set PROJECT_ROOT to that staged root for this Node
   process so its unchanged oracle resolves captured sources. Reinitialize the
   real repo env before any subsequent build process.
9. Run the installed TypeScript CLI with
   `--ignoreConfig --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck tests/final-float/api-types.mts`.

The browser suite launches real Chromium, Firefox and WebKit Workers with the
same bundled production engine-worker/client and injected unified Module. It
uses synthetic authored source and explicit fixture gate/material inputs; it is
not an end-to-end account, billing, controller or UI consent test. The comparison
harness does not instantiate an extra runtime inside the product Worker.
