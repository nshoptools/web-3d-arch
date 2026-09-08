# Source assembly ABI1 / semantics2

The authoritative declarations are `src/source_assembly.h`. Counts and ranges
are element counts. Pointers have natural target width; structs are not packed.
Native64/wasm32 sizes: request184/160, view320/272, indexed48/32; region104,
text120, lineage32, parameter40 and schedule40 on both. Mechanics source remains
128/112 bytes (ABI2); root ARCH1 and runtime ABI2 are unaffected.

```cpp
// Borrow canonical public contours plus caller-owned stable IDs/provenance.
ArchSourceResult* assembly = arch_source_build_indexed(&settings, &xy, &control);
ArchSourceView sv{};
if (!assembly || !arch_source_view(assembly, &sv)) { /* allocation failure */ }
const ArchMechSource* source = arch_assembly_source(assembly);
if (source) {
  ArchMechRequest request = callerMechanicalSettings;
  request.source = *source;
  request.parameters = sv.parameters;
  request.parameter_count = sv.parameter_count;
  // Identical product, schedule, material palette and revision are required.
  auto result = arch_mech_build_controlled(&request, jobControl, generation);
  // Copy source audit/lineage/contact metadata needed by the root snapshot.
  // Keep mechanics result alive under the root's normal snapshot lease.
}
arch_source_destroy(assembly);
```

The result owns every buffer reached by the source getter and source view. Inputs
are borrowed synchronously and never retained. Getter returns NULL for invalid,
resource, cancelled or kernel failure. Those results retain diagnostics but no
publishable geometry. No exception crosses C. Destroy after all readers stop.
The callback control is synchronous and not owned by the result; it must not
throw or reenter geometry. Root handles generation matching and lease transfer.

The raw entry point `arch_source_build` takes contiguous rings. The indexed helper
accepts root public ArchContour-compatible records, points and contour indices;
it expands shared points with bounds checks, never reads a private C++ Scene or
root triangle/vertex/Z buffers. Root source_index is a lookup into caller's stable
semantic/provenance table, not itself a stable ID. See the mapping/call graph in
`API-EARLY.md`. The source transform applies once to main source XY; prepared text
is already in final design mm.

Before passing new source tags to mechanics, require
`arch_mech_source_datum_extension_version()==1` from the supplied patch. Extension1
admits source-only height datums128..134 and slab kinds4/5 for detached bed text
and its base. Existing kinds0..3 keep their ABI2 meaning. Kinds4/5 use bed Z and
assembly group2, with identity preview; source-relative kinds use body_datum_z.
All other mechanics groups and preview transforms retain their meaning. Contacts
and semantics2 height intervals are in manufacturing Z; source slabs retain their local body/bed contract.
Require arch_source_semantics_version()==2 and arch_mech_semantics_version()==3.
See [ADR-002](ADR-002-height-faces.md) for exact face/reference and downward-span rules.

The patch also validates the exact slab union at the lowest body interval instead
of converting that supplied footprint through a mesh Slice. Positive Z overlap
is still checked. Its inward semicircular groove sweep uses cylinders on straight
edges and rolling sectors at reentrant vertices, avoiding redundant convex balls.
After CSG it uses Manifold AsOriginal/Simplify with an explicit numeric allowance
<=1e-7 mm per numeric stage, <=2e-7 mm combined (further bounded by mating and meshJoin tolerances). AsOriginal resets
internal triangle ancestry; semantic source IDs, material provenance, external
feature/part labels and user values remain in their existing tables. This is not
a manual vertex weld, face deletion or per-material epsilon offset. Regression
tests measure the actual groove profile, concave sector and material boundaries.

Default palette roles and prepared region materials remain distinct. User region
overrides take precedence over user role palette overrides. Input audit records
retain originals, including inactive settings. Material provenance is separately
available in lineage. Machine-export slot/color conflicts still require the
parent's explicit material adapter; no machine profile or filament is inferred.

The final candidate is a source composition component. Imported mesh CSG,
decoder/layout semantics and runtime/browser dispatch are separate owners.
Physical fit remains unqualified.
