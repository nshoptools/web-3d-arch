# Reused dependencies and notices

The exporter adds no new downloaded or global dependency. Native code statically
links the existing root Manifold and Clipper2 targets in the same native/WASM
binary. Manifold 3.5.3 is based at revision
`0edd9d54876f3135e431575214dd6d8a72866fee`; the supplied checkout contains its
public ExecutionContext extension. `pins/dependency-sources.json` records the
actual complete reused source tree (excluding Git administration), so the
upstream revision alone is not represented as the compiled bytes.

Clipper2 original and derived trees are separate. Original archive revision
`46f639177fe418f9689e8ddb74f08a870c71f5b4` is verified by SHA-256; the derived
tree applies the supplied Manifold no-iostream patch. Its aggregate hash is
verified against the root lock. This worker only reads these trees; CMake
downloads are disabled. The original notices and applied patch are copied here:

* `manifold-LICENSE.txt`: Apache License 2.0.
* `clipper2-LICENSE.txt`: Boost Software License 1.0.
* `clipper2-no-iostream.patch`: exact existing carry patch, not a new export patch.

Rust uses the root's already locked `sha2` and `serde_json` dependencies, plus
the standard library. It declares no new Cargo package/dependency. The private
kernel manifest and captured Cargo.lock identify the checked host build; the
parent keeps the existing root dependency notices at distribution. Root
HarfBuzz/build/runtime dependencies are reused unchanged, not newly vendored
under this exporter. Test-only Playwright, XML and ZIP readers remain tooling.

Run `node tools/provenance.mjs` after selecting a fresh development run to
verify all recorded source/license bytes. `--capture` is a maintainer operation
restricted to an unfrozen candidate inside that run; it cannot write main.
