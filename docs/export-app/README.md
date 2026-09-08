# Application export composition v1

This additive component implements the seven EXP-01 application routes over the
existing runtime, printing serializers and injected committed-source / complete
viewport providers. It does not create a Module, EngineClient, native generation,
model lease, geometry parser, decoder, triangulator, or UI.

Use [the integration contract](API-EARLY.md) and the exact
[declarations](../../src/integration/export-adapters.d.mts). Parent owns application
composition, controller delivery/history of metadata, Worker/RPC, kernel lease
bindings and Halley's trusted product evidence. Existing kernelAdapters and the
frozen final-scene child remain untouched.

All seven IDs are always enumerated. `formats()` returns serialization readiness
and explicit reasons; it is not a printability certificate. Static `capabilities`
describe the implemented routing API. `model.stats` is not evidence. Final-scene
gates, stable IDs and independent mesh verdict must be supplied by the trusted
snapshot evidence getter. The adapter checks the actual ARCH part table and hash.
Source SVG / PNG do not require a matching model or inherit mesh-only gates.

The returned `arch-app-export/1` metadata contains the requested route/options,
actual filename/byte count/hash, source/material semantic IDs, service metadata,
warnings and qualification. 3MF includes its sealed printing manifest. Native ZIP
and section SVG keep their native manifest intact; stable full string/uint64
application IDs are in the application metadata, while the native manifest keeps
its explicit stable uint32 bindings. Parent must retain this metadata when
delivering the file; current controller delivery only copies bytes/name/MIME.

## Run the focused checks

Prerequisites are the repo's existing Node 24, TypeScript 7, Vite and Playwright,
installed printing dependencies, immutable slicer profile fixtures, and a single
root test Module exposing runtime ABI2, final-export child ABI1, lib3mf ABI1 and
`_arch_final_test_fixture`/`_arch_final_test_stats`. No dependency is downloaded.
The runtime comes from an explicit read-only path and is copied into the own run.

From an integrated checkout:

```powershell
./tools/export-app/run.ps1 -RunId YOUR-OWN-RUN `
  -ModulePath D:\path\inside\this\repo\arch-kernel.mjs -Browsers
```

From a candidate, call its `tools/export-app/run.ps1` with the same arguments and
optionally `-RepoRoot`. All overlay, output, browser profiles and caches stay in
that own run. The runner refuses a frozen run. Preparation copies only this
component's declared paths plus pinned dependency preimages; it never recursively
copies a repository root. It also works when invoked from an installed-layout
copy, where source and destination can be the same file.

`node-tests-runner.log`, `types-runner.log`, `browser-runner.log` and `runner.json`
record command outcomes. Serialized artifacts and machine-readable browser
records live in `evidence/export-app*`. Run the copied
`tools/export-app/check-evidence.mjs` after the selected suites to produce a
numeric/hash/parity report. Original failed development attempts are retained
separately; they are not included as passing evidence.

## Limits and proof boundaries

- Source SVG uses an injected validated vector/paint serializer. The committed
  synthetic paint provider is labelled a test double; the prepared-font test uses
  the real existing `geometryToSvg`. No shaping, decoder, canonical source or
  whole-source serializer is fabricated here. The output audit checks XML/root,
  active nodes and nonfragment resources; upstream validation still owns full SVG
  semantics, recursion, paint dependencies and parser security. Inline raster
  image hrefs are outside this bounded vector/paint output audit.
- PNG uses an injected complete-frame provider. Tests use a synthetic RGBA frame
  with the real portable PNG encoder. Header/dimensions/chunk CRC are checked;
  independent test pixel decompression reads the emitted PNG. This is not an
  arbitrary PNG decoder or proof of application viewport framing.
- 3MF project paths work in manufacturing pose with valid sealed P1S/U1 profiles.
  They are inspection-only while slicer/physical qualification remains
  unverified. No Core 3MF is relabelled as a project. Additional unbaked 3MF poses
  are explicitly disabled; STL supports pattern-down and rigid reflection.
- Native limits and cancellation are those of the existing final-scene service.
  STL output does not contain units/color; import it in mm at the recorded common
  origin. Section sequences are labelled individual samples, not a projection or
  generic CNC compatibility claim. No whole-pipeline geometric error guarantee or
  physical fit claim is added.
- Source assets: 256 dependencies / 64 MiB total. Source SVG: 16 MiB. PNG: 16M
  pixels, sides <=16384, output <=80 MiB. 3MF: 128 source hashes / parts and 64 MiB.
  Final outputs: <=128 MiB; JSON metadata and captured state: <=2 MiB. Native
  filename <=160 UTF-8 bytes avoids silent child truncation. No user option is
  dropped to fit a resource limit. Unknown/inactive options are rejected.
- One adapter job at a time. Reset aborts only its own jobs. Provider cleanup is
  awaited on success/error/cancel/stale and followed by another current-state
  check. Model/root ownership always remains with the controller/parent.

The Module tested here matches the parent's reported hashes (wasm `16080c...`,
mjs `65c5bf...`). The local Worker tests use an explicitly labelled transport
double over the actual services. Parent separately reported its real root RPC
checks and native/WASM parity; those are not counted as this component's tests.

## Dependencies / rights

No new production package or vendor source is added. Existing Manifold/Clipper2
and lib3mf remain in the same pinned root Module. This module reuses domain layer
validation, the ARCH reader, printing validation/readback, fflate 0.8.3 and
@xmldom/xmldom 0.9.12 through printing. Their original bytes, lockfiles and licenses
remain in their existing locations; copied inputs are hash-listed in the run.
Profile fixtures are internal testing data and are never executed or included in
the production adapter. No printer, slicer executable or external machine runs.
