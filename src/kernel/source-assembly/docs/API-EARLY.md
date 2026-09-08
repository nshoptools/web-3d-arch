# Early integration contract — source ABI 1, semantics 1

Published 2026-09-08 while implementation/oracles are in progress. Header:
`src/source_assembly.h`. Reusable static target: `arch_source_assembly`; it links
the already-defined `arch_mechanics`, `manifold`, `Clipper2::Clipper2` targets.
No dependency on root private `Scene`, Rust runtime, SVG decoder or JSON.

```c
typedef struct ArchSourceResult ArchAssemblyResult;
ArchAssemblyResult *arch_source_build_indexed(
    const ArchSourceRequest *settings, const ArchSourceIndexed *canonical,
    const ArchSourceControl *control);
const ArchMechSource *arch_assembly_source(const ArchAssemblyResult *result);
int arch_source_view(const ArchAssemblyResult *result, ArchSourceView *out);
void arch_source_destroy(ArchAssemblyResult *result);
```

The opaque result owns all prepared source ABI2 slabs, rings, XY, attachments and
exact recipe bindings. Getter returns a stable borrowed const pointer only for
AS_OK. Keep that result alive throughout mechanics build; mechanics owns its
result after build. Input settings, canonical arrays, materials and texts are
borrowed for the synchronous source call only. Distinct calls own distinct data.
Failure returns a result with diagnostics and no publishable source; NULL is an
allocation failure. No exception crosses C. No global current context.

Recommended compact call graph:

```text
Rust runtime ABI2: acquire/retain source snapshot primary lease
  -> existing decoder/layout/shared-region canonicalization
  -> public ArchSceneView (ABI1) + stable semantic/provenance sidecar
  -> small C++ helper fills ArchSourceIndexed and ArchSourceRequest
     -> arch_source_build_indexed(settings, canonical, root-control adapter)
        -> pinned Clipper2/Manifold source XY + Z partition formulas
  -> arch_assembly_source(assemblyResult)
  -> ArchMechRequest { source = *borrowed, parameters = sourceView.parameters,
                       same schedule/materials/product/revision }
  -> arch_mech_build_controlled(...)
  -> arch_source_destroy(assemblyResult)
  -> root ARCH/1 mesh snapshot packing + atomic runtime ABI2 lease publication
  -> release source lease
```

Use a C++ helper for request construction; Rust needs only opaque result handles
and public C structs (`repr(C)`, target pointer width, no packed pointer structs).
This candidate supplies the generic indexed-to-rings helper already. Parent's
helper need only fill per-region metadata and settings; it does not run geometry.
Rust can alternatively construct the same structs directly. Do not extract a
context pointer from persisted JSON. Root owns generation validation, cancellation
flag lifetime and stale-result rejection. Source control is synchronous boundary
callbacks and can wrap root `ArchBuildControl`; progress has a budget argument.
It does not claim Clipper2 calls are interruptible mid-operation. Mechanics uses
its independently documented Manifold ExecutionContext/control semantics.

Root ABI1 mapping (read 2026-09-08):

| Root public data | Generic source input |
|---|---|
| points_xy + point_count | ArchSourceIndexed.xy + point_count, int64 pairs at 1e6/mm |
| contours (index_start,index_count,part,reserved) | ArchSourceContour: identical four-u32 layout |
| contour_indices + contour_index_count | indices + index_count |
| parts[].contour_start/count | regions[].ring_start/count |
| parts[].color_rgba | regions[].material.rgba, opaque only |
| parts[].source_index | lookup **caller sidecar** stable source ID and provenance |
| root triangles/vertices/Z/edges | not consumed; planar edges do not establish 3D contact |

The region array follows root part order for contour ownership, but **semantic_id
must not be derived from its array index or color**. Caller supplies persistent
uint64 IDs for SVG paint objects, shapes and prepared glyph groups, and provenance
table keys. Same material can have distinct source IDs; override and reordering
must preserve them. Input fill_rule is explicit (normalized root contours nonzero).
Source IDs are emitted in the lineage table, including generated support/core
slabs. uint64 values stay uint64 through C/Rust; JS bridges must use BigInt or
lossless split integers. Material slots are explicit 1..16 and USER origin wins.

Root ARCH1 currently has no opaque 2D-only scene handle. Either use its existing
public contour view while keeping the lease alive, or fill these same generic
flat buffers directly from the canonicalization stage to avoid an unused extrusion.
Do not treat a multi-Z root scene as a 2D paint partition: normalize the intended
source visual region graph upstream, independent of existing mesh contacts.

Text inputs use the same canonical regions with nonzero text_group. Text groups
carry prepared final XY, height/base height, base pad/rounding and placement;
layout, font selection, tracking and curvature are already applied upstream.
Main source XY is uniformly scaled to `size` and centered; overlays are final mm.
`eyelet_text_id` selects an exact generated attachment, never a guessed bbox.

All effective mechanics fields are returned unchanged. Exact source recipe
bindings include catalog delegated fields and baseH/plateT. Upstream bindings
IDs1..7 (k/res/smooth/minA/denoise/eps/tension) must match the effective records,
including origin/provenance. The assembler owns fields8..14 and25..33 plus source
Z from23/24. See ADR-001 for formulas and activation. Root keeps other parameters.

Source semantic extension needed for explicit layer spans: tags128..134 (enum in
header). The optional tested bridge admits them only on delegated source height fields,
with no ABI2 layout change, and exposes
`uint32_t arch_mech_source_datum_extension_version(void)` returning1. Unpatched
frozen wave2 rejects these tags; negotiate this capability before passing them.
It also adds slab kinds4/5 for detached bed text/base and assembly group2 with an
identity preview transform. These slabs/attachments use bed Z; kinds0..3 keep
source-body-relative Z. `body_datum_z` reports the actual origin of the latter.
Contacts report manufacturing Z. Detached text stays outside the body footprint
and is checked against the final secondary-part placement; collision is invalid,
never an automatic relocation. Existing mechanical datum paths retain their ABI2
meaning. The checked patch is `compat/mechanics-source-integration.patch`.

Current measured C layout (natural alignment, no packing): request184/160,
view320/272, indexed48/32 bytes (native64/wasm32); region104, text120, lineage32
bytes on both. Mechanics struct layouts remain request224/200, source128/112.

Source build is manufacturing-only. Its contact table distinguishes shared vertical
faces with positive Z overlap from actual horizontal faces. It is not the root
planar visual ledger. Mechanical preview transforms apply only after manufacturing
generation; source inputs and returned slabs never move for an assembly view.
