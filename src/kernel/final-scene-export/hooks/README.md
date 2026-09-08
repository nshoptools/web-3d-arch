# Focused parent integration hooks

Only install the checked `final-scene-export/**` component. Parent retains
ownership of root Rust/CMake/build scripts and the evolving text/product RPCs.
The handoff contains preimage hashes and the exact small hooks applied to the
private overlay; it contains no replacement engine-worker/client files.

`root-hooks.json` records each exact replacement and the SHA before that step;
multiple build.rs replacements have **sequential intermediate** preimage hashes.
`preimages.json` records the original captured root file hashes before any of
these private hooks. Parent may adapt the small hooks to concurrent main changes;
these hashes are evidence, not permission to overwrite a different main file.

1. `src/kernel/src/abi.rs`: add the child without moving State or CONTROL:
   `#[path="../final-scene-export/rust/mod.rs"] pub(crate) mod final_scene_export;`
2. Optional native Rust caller/test surface in `src/kernel/src/lib.rs`:
   `pub use abi::final_scene_export::*;`
3. After the existing Manifold/Clipper targets, add the CMake child:
   `add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../final-scene-export" final-scene-export)`.
4. Add static `arch_final_scene_export` to build.rs library list and add
   `final-scene-export/Release` (MSVC) / `final-scene-export` (Emscripten) archive
   search paths. Track its real archive with cargo:rerun-if-changed as root does.
5. Merge `native/exports.json` into the existing same-Module export symbol list.
   This does not remove or replace the text/raster/geometry/printing symbols.
6. Parent's serial Worker resets a fresh generation, binds trusted committed
   gates/revision/mapping, then calls arch_export_final. Optional
   `runtime-helper.mjs` packs AFEX/1 and copies/releases the final-file result.
   Keep the source caller lease throughout the call. On Worker death, retire
   this Module's final-output leases with the existing root watchdog protocol.

Test-only hooks add the `final-export-probe` example and
`ARCH_FINAL_EXPORT_TESTS=ON` plus `_arch_final_test_fixture`/`_arch_final_test_stats`.
Do not expose those fixture functions in production. Native headers and
AFEX descriptor tables are authoritative. The new child version is 1; root
runtime ABI2 and ARCH/1 remain unchanged. A later mechanics semantics getter
change does not alter this mesh-only export binding.
