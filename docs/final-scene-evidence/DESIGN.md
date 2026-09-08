# Mesh qualification design

Implementation only; not a configured independent review.

## Exact representation and no repair
The checker starts with bounded ARCH/1 float64 vertices/uint32 faces. The transport reader checks array extents, finite coordinates and part coverage. It does not contribute a mesh verdict. Triangles are checked against the exact represented IEEE-754 coordinates. Each coordinate becomes a dyadic integer on a common power-of-two scale; ambiguous float plane-side filters fall back to BigInt determinants. There is no tolerance weld, arbitrary snap, small-face deletion, coordinate shift or manifold flag inherited from native success. Binary STL readback welds equal float32 coordinate tuples only.

## Topology and geometry
Each triangle has three distinct indices and an exact nonzero normal. Each undirected edge has exactly two oppositely directed incident faces. The incident face fan at every vertex must be one connected cycle; the pinched-two-tetrahedra negative control demonstrates why edge incidence alone is insufficient.

Face adjacency identifies closed components. Exact signed volumes and exact generic-ray containment determine nesting parity; inner cavity shells must be inverted relative to outer shells. Separate components are counted, not assumed intentional physical parts.

A bounded BVH enumerates overlapping triangle AABBs. A conservative floating determinant filter excludes strictly separated planes. Exact homogeneous-coordinate intersection computes coplanar triangle intersection dimension and noncoplanar plane-cut intervals. Same-part intersections may occupy only the indexed shared simplex. Crossing faces, overlapping coplanar interiors and nonindexed contacts reject.

Between parts, coincident faces with equal orientation, proper surface crossings and contained components reject interior overlap. Opposite coplanar faces are legitimate material interfaces. Noncoplanar contact edges need an adjacent opposite coplanar material plane; unclassified contacts stay unverified. Point-only/edge-only part contacts stay unverified. This conservative contact policy may refuse valid unusual arrangements; it does not relabel them invalid geometry.

The existing same-root AFGM API supplies independent readbacks. First check actual full-material unions and their overlaps. When there are multiple groups, a second request uses one explicitly neutral analysis key while preserving all original part/source indices, yielding the whole binary64 union. A single material group already covering every input part can be reused. Real material identity is never replaced by the analysis key; see ROOT-BOUNDARY.md. Legacy internal inspection STL works only where float32 can represent the result; its explicit format failures are preserved. Internal inspection bytes are never delivered to a user as an approved export. The union reader proves the supplied representation's topology/intersections, not exact numerical equivalence of the Boolean result to source intent.

## Work and memory limits
Default input: 64 MiB, 300k vertices, 600k triangles, 128 parts, 6M candidate triangle pairs and 8M containment triangle work units. Worker watchdog is at most 120 seconds and cancellable by termination. Callers can lower limits only. Exceeding a work limit is unverified. These are admission/work bounds, not an RSS cap or proof of arbitrary large geometry. Exact arithmetic may be costly at pathological exponents; binary64 dyadic conversion is bounded.

The Worker imports only the checker and transport reader. It owns no native Module, geometry lease, identity, project bytes beyond the supplied mesh, storage, credentials or UI. No fetch or dynamic code loading is performed by the checker.

## Evidence ownership and authority
Only the private WeakMap cache can supply FinalSceneEvidence. inspectModel is Halley's owned-model method and validates native semantics3/source2, head, source and material lineage. The provider additionally checks root/client ownership, epoch, exact ARCH generation, byte equality, native metadata and opaque session/head/revision before/after awaits. describe rechecks synchronous exact bytes and trusted current gate/material callbacks; a mismatch drops cache eligibility. onChange is notification only.

reset aborts private work, terminates its validation Worker and awaits pending publication barriers; it never releases caller-owned root/model or resets the shared engine. Parent must await reset during identity/project retirement and schedule qualify through normal authenticated controller work. No authorization comes from this provider's report, imported metadata or navigator.onLine.

The uint32 material source ledger comes from the parent explicitly. Full stable material IDs, semantic IDs and uint64 provenance strings remain intact. Color/slot is never used to invent an ID.

## What pass does not say
Snapshot pass plus union readback pass permits Ohm's ordinary geometry prerequisite for the qualified representation. It does not prove feature/design intent, printer bed/capacity, thin-wall manufacturability, watertightness after every future exporter/pose conversion, slicer compatibility, total pipeline error or hardware fit. Output files still need exporter readback. Geometry equivalence of a library Boolean and source intent remains a separate qualification field. All those limits are retained in provenance, not hidden in a generic success flag.
