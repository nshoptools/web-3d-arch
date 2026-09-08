# Conditional numeric resolution of final mechanical guards

This correction addresses the demonstrated prepared-source roof slit and
concave strap notch. The child ABI remains 2, with existing typed metadata and
zero mesh on refusal. It does not qualify arbitrary input or physical printing.

Roof/floor queries first retain the **unsimplified** Boolean residual. Its full
minimum/maximum Z determines a positive clearance where possible. Neither a
small volume nor a simplified empty mesh is used in this first branch. A real
narrow void beginning above a positive intact roof can therefore remain valid.

The existing Boolean-contact cleanup remains necessary for ordinary faceted
sources: coincident faces can produce nonempty query fragments with tiny
computed positive volume. Rejecting every such fragment rejects ordinary Inter
and emoji products. Cleanup is a **conditional numerical fallback**, not a
general full-volume proof. Before the roof/floor fallback can simplify, it
requires source-resolution admission:

- Query allowance `b = min(1e-7, matingTolerance/1000, exportTolerance/1000)` mm.
- Every distinct supplied body/art slab Z level must be separated by more than
  `2b`. Exact common Z boundaries are retained.
- Referenced footprint/body/art rings are checked together, including rings
  from different slabs. Nonadjacent segment separation must exceed
  `2b + 64*DBL_EPSILON*10000` mm. The minimum of endpoint-to-segment distances
  is used after intersection classification; edge length alone is insufficient.
- Pinned Clipper2 integer cross-product signs classify crossing/collinear
  boundaries. Exact shared interfaces and shared junction vertices between
  rings are retained. This does not validate arbitrary junction arrangements.
- At most 20,000,000 segment pairs are visited, with cancellation checkpoints.
  Unused preserved rings are excluded from the geometric admission calculation.

Unresolved small separation returns `FINAL_GUARD_SOURCE_BELOW_RESOLUTION`;
crossing boundaries return `FINAL_GUARD_SOURCE_BOUNDARY_UNVERIFIED`; exhausting
the pair budget returns `FINAL_GUARD_SOURCE_RESOLUTION_WORK_LIMIT`. These are
`AM_INVALID`, export blocked, empty vertex/triangle/part buffers. Original source
and parameters are preserved. No geometry is snapped, merged or offset.

The 2 nm fixture label describes its axial source-grid shift. Its perpendicular
slit width is about 4.998438232e-8 mm, and its positive area is 2e-7 mm². It is
below the fallback's source-resolution domain even though its short edges are
2e-6 mm long. The gate therefore catches the actual oblique slit without
pretending an edge-length threshold is a thickness guarantee.

Strap construction also checks each local footprint edge before the old active
mouth scan can skip it. A finite parallel/near-parallel wall inside the nominal
transverse bore/mouth band cannot establish lateral containment and returns
`STRAP_CHAMFER_LATERAL_BREAKOUT`. The same check applies with zero chamfer and
at rotated axes. Ordinary axial mouths, intact lateral walls, capsule dimensions
and the active-mouth construction cap remain unchanged.

The raw branch still depends on the pinned Boolean backend's numerical model.
The admission test is a bounded supported-domain restriction, not proof against
every CSG-created fine feature, arbitrary source intersection, shared-junction
configuration, or roundoff case. Cavity wall/opening contact queries retain their
existing backend policy. Diagnostic 111/112/113 explicitly distinguish these
limits; simplified emptiness must not be represented as unconditional coverage.

Regression entry points are `tests/curved-guards/regression.py`, `controls.py`,
and `run-corpus.mjs`. The original prepared-source ABI counterexamples do not
establish that the application producer emits those exact slabs.

The retained supplementary R2 suite has 18/22 assertion passes on both targets.
Two negative roof/floor-gap requests remain blocked with empty geometry, but now
report `FINAL_GUARD_SOURCE_BOUNDARY_UNVERIFIED` before their previous error. Two
previously accepted synthetic cases are outside the new lateral admission:
the central 4x4 mm hole has parallel walls exactly at the nominal 2 mm bore
radius, and a detached 2x2 mm island has parallel walls at y=±1 mm inside that
bore band. They return `STRAP_CHAMFER_LATERAL_BREAKOUT`. This is a conservative
unsupported condition; no claim that the previous hole/island meshes were
unsafe has been established. The original assertions and their failures remain
unchanged. All 40 ordinary curved defaults and ten focused adjacent/positive
controls pass on native and WASM. The additional 12 variants and full child
resource matrix were deferred under the owner's urgent bounded handover.
