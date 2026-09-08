# ADR-CP-001 — exact shared output boundaries and bounded curved feature work

Accepted for this implementation candidate on 2026-09-08. Supersedes no nominal
parameter, datum, fit, export, or consent decision. ABI and semantics versions
remain mechanics 2/3 and source 1/2, datum extension 1. Scope is PSB-03's 22
common curved-source refusals. All dimensions are manufacturing millimetres.

## Source composition

The existing four art-mode formulas, field bindings, material IDs and Z schedules
remain authoritative. The old path independently rounded the double-grid result
of `Pbody − artwork` and its artwork to the output integer grid. ClipperD's binary
grid and the 1e6 units/mm ABI grid differ. Paired endpoints could differ by one
output unit, leaving cracks even when the floating area predicate looked small.

Capture the final integer artwork paths and body paths first. Pinned Clipper64
computes the Chìm/Phẳng complement from those **same paths**, preserving collinear
vertices. The recessed under-art rim uses their integer union. The existing line
ledger inserts shared endpoints once. A new exact directed-edge conservation
check requires the complementary material boundaries to cancel against the host
footprint. The check is topological, separate from area tolerances, PLANAR seam
metadata and actual 3D Z-interval contacts. It does not declare contact between
disjoint intervals. Existing volume/contact and bottom-support guards still run.

No per-material offsets, new input shaper, Boolean, triangulator, source parser,
vertex weld or synthetic source replacement was introduced. Holes, disconnected
artwork, user material roles, semantic source IDs and original request records
remain in the buffers. The existing output grid allowance and operation ledger
include the additional integer Boolean operations; budgets still fail closed.

## Strap mouths

The input scan is bounded by the existing 200,000 source-point limit. Only an
edge intersecting the actual transverse mouth band and having at least 2e-6 mm
of active span consumes one of the unchanged 512 mouth-edge slots. The same
predicate already selected the geometry; the old cap counted unrelated edges.
Diagnostic 114 reports scanned and active counts. Slope, curve angular limit,
exterior-wall intersection, lateral breakout and final roof/floor guards remain.

## LEGO groove

The feature is the declared circular distance tube around the **outer** footprint
segments, intersected with each host material at subtraction. Its interior
cross-section is the specified semicircular border groove. Full circular strips
place the other half outside the host without adding an arbitrary extension or
changing the radius. A half-strip cap coincident with the curved source wall
created an actual geometric point contact in the first implementation attempt;
the normal point-contact guard rejected it. Reentrant vertices retain bounded
rolling sectors. Convex interior corners are covered by their incident strips.
Holes are not silently selected as groove boundaries.

The pinned `Revolve` implementation interprets an explicit segment count greater
than two over the entire requested sweep. Counts at most two invoke global
Quality instead. We use `max(3, ceil(sweepAngle*n/(2*pi)))`, with angular step
at most `2*pi/n`; the preflight counts that actual partial sweep. Passing a
full-circle count to a tiny turn oversampled it and produced sub-resolution
triangles in the 50/60 mm tight-tolerance corpus.

For a turn smaller than three angular steps, symmetrically extend its support
to three steps into the adjacent strips. No required sector is omitted. All
additional support is a subset of the same bounded vertex ball, so its points
remain within the declared distance tube plus the allocated radial error. This
avoids microscopic wedge caps without creating a complete sphere at every
nearly collinear source corner. For radial profile bound `e <= tolerance/4`
and `sec = 1/cos(pi/n)`, every corner point lies within
`(radius + e)*sec`, and the angular chords enclose the nominal profile. The
extension does not increase this analytic bound. User radius and tolerances
remain unchanged. Synthetic 1e-6/.001/.2 mm notches independently probe these
rolling sectors at three sizes/tolerances; results are reported separately.

Pinned Manifold performs extrusion, revolve, all unions and subtraction. A batch
of at most 32 primitives is reduced into a binary union frontier. Limits are:

| Resource | Bound |
|---|---:|
| Source points / scanned outer edges | 200,000 |
| Angular segments | 4,096 |
| Estimated primitive triangles, before construction | 2,000,000 |
| Actual primitive triangles | 2,000,000 |
| Each evaluated result / resident frontier triangles | 2,000,000 |
| Sum of evaluated result triangles | 32,000,000 |
| Published scene triangles | existing 2,000,000 |

These count bounds are not a hard allocator or latency limit inside a single
library Boolean. Preflight is conservative and actual construction/evaluation
is measured too. The radial flattening and sector bounds are unchanged; the
existing explicit shared-cutter topology tolerance is at most 1e-7 mm. Requested
radius and tolerance are not changed to meet the resource bounds. Diagnostic 113
reports edges, estimate, primitive and evaluated triangle work. Arbitrarily dense
or sharp sources can still be refused with the concrete resource diagnostic.

## Final strap roof/floor proof

R2's final-scene guard is retained, including its complete projected-facet proof
and rejection witnesses. The existing sufficient uniform-envelope query can
return an actual recessed void plus near-zero contact fragments reaching the
tunnel's extreme Z. Those fragments can belong to the same positive-volume
component; decomposition or a small-volume threshold is insufficient.

When that sufficient proof fails, read exact horizontal levels from the **final
union's faces**, choose the nearest enclosing levels, and test the complete host
footprint prism between each level and the tunnel envelope. The host footprint
is a conservative superset of the clipped tunnel's XY shadow. A floating roof
cannot cover the gap at the prism's start. No ray or representative point can
accept a model. Input height fields are not used as a substitute for final faces.

Only query copies are simplified. Two simplifications share the existing budget
`B = min(1e-7, matingTolerance/1000, exportTolerance/1000)` equally. Each query's
library tolerance must fit B/2. Empty/zero residual means full coverage;
otherwise its complete bbox bounds the first missing Z, exactly as in the
original uniform proof. Nonzero residuals are retained, never dismissed by a
volume epsilon. The entire B is subtracted from both strictly positive clearance
lower bounds. The source query copy uses SetTolerance so the same half-budget
also propagates to its Boolean; final material tolerance is not changed.

At most four additional interior planes are obtained by halving the distance
from each measured face to the tunnel envelope. Every query starts at that same
envelope and tests the **entire** intervening volume; it cannot jump over a gap
under a detached roof. Each query uses the same query-solid copy, not a previous
residual, so alternative queries do not accumulate geometry changes. At most ten
residual queries are made, each bounded to 50,000 faces. Their output is a
conservative clearance lower bound, not a substituted nominal height or a new
manufacturing skin. The original full-domain facet proof remains the fallback.
Manufacturing parts, previews and public export
gates are untouched by these queries. This is a sufficient bounded library
geometry check, not a new whole-pipeline Hausdorff or physical-fit qualification.

## Cancellation and integration

Every bounded construction/evaluation boundary checks cancellation, and deferred
CSG is evaluated with `WithContext(...).Status()`. The actual pinned headers say
that Volume, BoundingBox, GetMeshGL and some other queries do not consume context.
No promise is made that one large library operation is immediately interruptible.
No root registry, generation allocator, snapshot lease, Worker or export hook is
changed. The parent rebuilds its one production Module after applying the delta.

## Native/WASM surface parity oracle

Byte identity is recorded but is not a geometry contract. The first comparison
requiring identical triangle indices failed on alternate diagonals and vertex
ordering around curved LEGO facets. Each target independently passes the numeric
mesh/topology/source oracles. Surface parity version 2 additionally establishes
a per-material bijection of vertices within the same 1e-8 mm comparison budget,
without modifying either input mesh. Exact matches are assigned first; ambiguous
or non-bijective matches fail.

Oriented triangle cycles that match are removed from the comparison. Remaining
faces are split into patches at common edges. Paired patches must have identical
complete directed boundary ledgers and consistently oriented triangles. Their
vertices must lie in a plane slab whose width, plus the maximum vertex mapping
displacement, is within the unchanged budget. This proves a bound on the full
paired surfaces, including alternate diagonals; checking only corresponding
vertices would not establish that. Adjacent curved facets are not incorrectly
required to share one plane. Folded diagonals, reversed normals and excessive
displacement are negative controls. Seven standalone oracle controls precede
the actual 52-model parity check. Actual bounds, byte equality and patch details
are retained in `reports/curved-parity.json`.
