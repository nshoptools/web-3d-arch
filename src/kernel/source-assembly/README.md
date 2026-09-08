# Prepared source assembly 0.2.0

This component constructs source slabs for mechanics ABI2 from canonical XY
material regions and prepared text. Source assembly ABI1 now reports
**height semantics2**, paired with mechanics semantics3 and datum extension1.
Struct layouts and ownership remain unchanged.

The R2 correction binds every declared height to its actual manufacturing face
and layer boundary. Raised features count upward; recess/core caps count
downward. Legacy MM datum0/reference0 stays nominal and unspecified. An
off-grid face reports unavailable conversion, without a receipt, proposal or
input rewrite. See [the exact semantics](docs/ADR-002-height-faces.md),
[API](docs/API.md) and [parent-only root delta](docs/R2-ROOT-INTEGRATION.md).

The four source styles, rim/bands/core, model/bed text, material provenance and
contact ledger remain in this package. Source interval Z is manufacturing Z;
prepared slabs retain body-local kinds0..3 and bed-local kinds4/5. The immutable
result owns its buffers and borrowed ArchMechSource until destroy. Parent owns
root snapshots, primary leases, UI, export and final module binding.

Use [the portable R2 recipe](docs/R2-BUILD-AND-TEST.md) to build/test the checked
candidate together with the exact frozen preimages, with all outputs in a fresh
authorized run. It invokes pinned, read-only dependencies and performs no
configure download. The two CMake static targets can also reuse existing
arch_mechanics/manifold/Clipper2 targets in the parent's one-module build.
No root ABI, root CMake or root build script is changed here.

[ADR-001](docs/ADR-001-source-semantics.md) and [field formulas](docs/FIELD-BINDINGS.md)
retain the unchanged geometry decisions; their height-binding interpretation is
superseded by ADR-002. [Fixture adjudication](docs/R2-FIXTURE-ADJUDICATION.md)
explains every formerly positive invalid binding before its expectation change.
Exact original producers and requests remain in the frozen preimage/evidence.
Earlier [acceptance](docs/ACCEPTANCE.md) and API-EARLY notes are historical.

The C++17 target links pinned Manifold3.5.3 and the recorded Clipper2 derived tree.
Native uses strict IEEE options; Emscripten6.0.9 tests use pthread/fexceptions in
one fixture module. Exact source/license hashes ship in pins.json and licenses/.
No new dependency, triangulator, decoder or Boolean implementation is introduced.

Limits: canonical regions/text must already be prepared and validated. Source
curve/raster/shaping uncertainty stays with its owner; minFeature is component
support erosion, not every neck. Unsupported or unresolved geometry fails with
typed diagnostics and empty output, leaving explicit parameters intact.
Component native/WASM readback is not root/browser, slicer, printer or physical
fit qualification. Independent review and release adjudication belong to parent.
