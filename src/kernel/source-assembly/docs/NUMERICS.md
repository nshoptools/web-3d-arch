# Numeric, geometry and resource contract

The truth at this boundary is validated canonical XY, int64 at 1e6 units/mm,
opaque materials and explicitly oriented/fill-rule contours. Parent composes its
decoder/curve/raster uncertainty ledger with this result; this library does not
claim an original SVG curve or raster has zero approximation error. Input raw
edges below two grid units and same-region point contacts are rejected before
pinned Clipper2 can discard or reinterpret them. Disconnected regions and holes
are retained. No handwritten boolean, triangulator, parser or voxel mesher exists.

Main coordinates are transformed through one map keyed by original integer XY,
with ties-to-even rounding. Canonical artwork contours never pass through an
independent per-material offset or simplification. Support formulas run on the
common source union. All slab/footprint contours share final integer rounding
and one collinear endpoint ledger. Boundary splitting introduces no displacement.
3D contact area is measured only at matching interval planes or on common edges
with a positive Z intersection. XY overlap across a Z gap contributes no contact.

For each generated round radius r, choose an integer full-circle N divisible by4
so sagitta r(1-cos(pi/N)) <= min(tolerance/8,r/16), N<=4096. Offset profile error
is conservatively signed +/- sagitta plus 2e-8 mm for the pinned ClipperD precision8
boundary. Stage5 circle vertices are inside the analytic circle; arbitrary offset
orientation may be either sign. Final XY rounding adds sqrt(2)/2e6 mm. Initial
main transformation has the same bound. Generated support uses at most three
chained offsets for pad/closing. Text frame has one. Diagnostic erosion (stage6)
does not alter geometry and is excluded from manufacturing accumulated error.

Round closing can generate sub-grid edges at coincident tangencies. Only the
derived support uses pinned Clipper2 SimplifyPath on integer coordinates, epsilon
2 grid units. That epsilon alone is **not** taken as proof: every retained chord
is checked against its entire removed vertex chain with clamped segment distance.
Because the chain and chord share endpoints, the distance bound covers both
directions by continuous projection; maxima on each original segment occur at
its endpoints. Reject if measured bound >2e-6 mm or contour count changes. Record
the actual bound and prior rounding in stage7. No original artwork edge changes.
Adjacent derived vertices rounded to the identical integer point merge without
an extra displacement; non-adjacent repetitions remain an invalid point contact.

Conditional generated-support bound relative to canonical source:
three offset sagittas + two 2D quantizations + stage7 bound + 2e-8 mm per boolean
conversion on that path. The implementation conservatively counts every operation
checkpoint up to canonical slab capture (including checks that do not alter geometry);
it records the summed bound in stage100 and rejects it above the caller tolerance.
Contact-only checks after capture do not alter the artifact. At the maximum .002,
normal tested paths remain below .002. Very large or repeatedly derived inputs may
exhaust a small requested tolerance and are rejected. This is a local formula/path bound, not a claim for
arbitrary imported mesh booleans, topology below the input grid, or physical fit.
The separate mechanics patch declares its groove flattening and <=1e-7 mm numeric
library simplification budgets. No hidden material-seam offset is introduced.

Hard limits: 256 input material regions,32 text groups,200k input and aggregate
output points,1024 slabs,1e6 layer indices,10000 mm coordinate extent and caller
operation budget1..2,000,000. The caller may lower these. Expanded indexed buffers
are bounded before allocation; contour capture is checked before accumulation.
Any invalid/resource/cancelled/kernel result has no publishable source. Parameters,
diagnostics and proposals may remain available for inspection.

Cancellation is synchronous at C++ checkpoints before/after library operations
and during contour processing. Clipper2/Manifold CrossSection calls themselves do
not consume a Manifold ExecutionContext. The actual pinned Manifold header says
WithContext is consumed by Status for deferred CSG and by certain eager operations;
Volume, BoundingBox, GetMeshGL and other forcing queries do not all observe it.
The root runtime keeps its generation/lease checks and Worker watchdog; source
assembly does not replace that runtime or promise a device-independent latency.
