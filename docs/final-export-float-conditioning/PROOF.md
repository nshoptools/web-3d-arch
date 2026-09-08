# Scientific scope and fail-closed limits

The current default clicky/noi native union has 2648 vertices and 5288 triangles.
224 distinct double vertex pairs round to identical binary32 positions. Each
pair is an actual edge after the union, and direct float conversion makes 448
triangles degenerate. The source parts already contain those close positions
across different parts, without those zero-length float edges. The observed pair
separations range from 1.1083798810022726e-9 to 4.208999703431974e-9 mm.

Exact cleanup was investigated first. Current Manifold `Simplify(0)` leaves 216
collisions/432 float-degenerate triangles; `Simplify(1e-8)` removes the collisions
but changes the geometric approximation/volume. Neither result proves an exact
representation-only cleanup. Existing automatic serialization guards are kept.

## Proposed transformation

1. Round each output coordinate to nearest binary32 once (canonical positive
   zero), grouping exact float bit triples. Only collision classes of size two
   are currently supported. Original exact coordinate aliases fail explicitly.
2. Each pair must be an edge. Contract in stable original ID order only if the
   full link-complex condition holds, including link edges, not just common
   neighbor vertices. The tetrahedron counterexample is explicitly tested.
3. Record old→new vertex IDs, retained source face IDs, removed face IDs and each
   contracted source edge. Check every retained triangle equals its original
   triangle's image. A removed triangle must map to an existing retained edge
   (or vertex), so its image is covered by the retained surface.
4. Check both complexes: unique faces, two opposite incident faces on every
   edge, each vertex link one connected cycle, component bijection and equal
   per-component Euler characteristic. Closed orientable surface topology and
   holes are retained by the link-condition contractions; torus inverse edge
   subdivision is tested. This is stronger than an Euler-only heuristic.
5. Outward-rounded interval arithmetic certifies original component orientation
   and positive dot product between each retained old/new face normal. A sign
   not provable with these intervals is an explicit limit.
6. Represent the final binary32 points exactly by per-axis dyadic scaling into
   checked i128 integers. All final triangle contacts/intersections beyond their
   permitted shared simplex are rejected with exact predicates. A deterministic
   sweep of axis-aligned boxes bounds tested pairs through the work counter.
   Overflow or unsupported exponent span fails, never falls back to epsilon.
7. Exact signed-volume predicates preserve each component's orientation. This
   version also requires a common strict AABB separating plane for every pair
   of components before and after processing. Nested/interlocking component
   bounds are unproved and fail closed.

For a triangle, its image uses the same barycentric weights on its moved
vertices. The norm of this displacement is at most the maximum vertex
movement. Exhaustive face correspondence plus coverage of removed images makes
this a **bidirectional surface Hausdorff bound**, not a vertex-sampling claim.
The outward bound for the tested default is 3.918571649315768e-6 mm. This bound is
relative to the captured native final union only. It does not bound upstream
SVG/usvg/grid/boolean error, printer fit, volume error, or ambient isotopy.

Reference for topology-preserving edge contraction: Dey, Edelsbrunner, Guha and
Nekhayev (1999), [Topology preserving edge contraction](https://research-explorer.ista.ac.at/record/3582).
No source code or numeric tolerance was copied from that paper. Manifold's
installed pinned source documents `Simplify` as a tolerance-bounded surface
change, not exact surface preservation; its own source/notice remains in the
existing kernel toolchain/dependency contract.

## Explicit limits

Qualified, non-inspection union STL only; no material ZIP or SVG conditioning.
At most65536 original vertices,131072 triangles,256 components, two root
proposals; caller's AFEX limits may be stricter. Pair clusters only, no original
coordinate aliases. Coordinates finite and <=10000mm. Requested displacement
must be >0 and <=min(0.004mm, AFEX output_error_mm); work units1..1e9. Unsupported
link/embedding/sign/component relationships fail typed. Dyadic coordinates must
fit the bounded per-axis range and every i128 operation. No generic remeshing,
mask tracing, arbitrary snapping, smoothing or hidden face removal is performed.

The working charge is a conservative admission model, including the configured
proof/native workspace, source copy, three output-budget reserves and fixed
metadata headroom. It is not allocator/RSS interception or a wall-clock timeout.
Actual source/candidate/metadata capacities are charged as root-owned resident
bytes; output leases share the legacy four-slot registry. Cancellation checks
use the same atomic generation control throughout native CSG, proof work and
publication. A genuine mid-proof cancellation is tested without timing sleeps.
