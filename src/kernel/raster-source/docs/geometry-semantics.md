# Shared geometry semantics and bound derivation

Version: raster-parameters-proposal-v2; geometry algorithm shared-chains-binomial-monotone-capsule-quadratic-v1. These are implementation semantics proposed because the checked catalog supplies ranges/defaults, not formulas. They are not a claim that UI slider 35 means 35 microns.

The segmentation pipeline, including optional denoise/minA, precedes this module. Its immutable raw graph is the reference for all bounds below. The graph is scanned once to form maximal degree-two chains with a constant pair of incident regions. All non-degree-two vertices, viewport vertices and the lowest-ID vertex of each connected boundary component are pinned. The last rule provides a stable nesting witness and a deterministic anchor for closed chains; it can leave a visible corner on an isolated loop. That constraint is deliberate, recorded, and is not claimed to be rotationally invariant smoothing.

Each edge belongs to exactly one source chain. Region loops become directed chain references; the two material sides never construct separate masks or paths. Quadratics, flattening and any retry occur at chain level and are reused verbatim.

## Exact domain

S = 2^20 units/pixel, processing width and height <=1280. All stored coordinates, controls and interpolation results are integers; midpoint/filter/trim division uses signed nearest ties-even. Coordinates are nonnegative and bounded by the viewport. Arithmetic predicates use i128. Coordinates are <=1,342,177,280 units, so all orientation, projection numerators and accumulated signed areas fit i128 within the enforced edge cap. rstar's i64 AABB arithmetic also fits for this bounded 2D extent.

Quantization here is to a dyadic pixel lattice, not a global physical grid. The host's later nm quantization is a separate ledger stage.

## Smooth

One synchronous pass at an unpinned interior vertex is

~~~text
P'_i = P_i + round_even((P_(i-1) - 2P_i + P_(i+1)) / (4 * 2^n))
~~~

n is the recorded attenuation exponent, initially zero. Repeat smooth times (0..6). Source and filtered chains have corresponding vertices and linear segment parameters. At every parameter, displacement is a convex combination of endpoint displacements. Therefore the largest actual L-infinity vertex displacement bounds the entire source-to-filtered polyline correspondence, including rounding. We measure that displacement against the original raw chain after all passes; no accumulated floating error estimate is needed.

## Eps simplification

The radius is floor(eps*S/200) >> n. Zero bypasses. Recursively accept a chord if all replaced points admit a monotone linear retraction to that chord within this L-infinity radius; otherwise split the index interval in half. This balanced split bounds adversarial recursion and is not a claim of minimal vertex count.

For endpoints A,Z and D=Z-A, let N=abs(Dx)+abs(Dy), V=(-sign(Dy),sign(Dx)), C(P)=cross(D,P-A). Degenerate D is rejected. The retracted point is

~~~text
Q(P) = P - C(P)/N * V.
~~~

cross(D,V)=N, so Q lies on the chord's infinite line. abs(C)<=radius*N bounds the L-infinity displacement. An exact rational coordinate along D is checked to start at A, end at Z and never decrease or leave that interval. Thus the retraction extends continuously over all source segments, covers the full finite chord and cannot hide backtracking beyond an endpoint. It gives a monotone continuous correspondence in both directions, stronger than testing distance to an infinite line alone. All tests use integer products, not division or floating predicates.

## Tension / quadratic rounding

The reach cap is floor(tension*S/200) >> n. At a noncollinear interior corner P, trim toward each neighbor by at most that reach and at most 1/4 of the incident segment's L-infinity length. Rounded trim endpoints are E,F. Store Q(t)=(1-t)^2 E + 2t(1-t) P + t^2 F. Leave intervening straight segments and pinned endpoints unchanged. Adjacent trims leave at least half their segment. G1 tangent alignment is approximate up to the dyadic trim rounding; exact continuous tangency is not promised after integer rounding/flattening.

Both the original corner path E-P-F and the quadratic lie in the convex hull of E,P,F. More specifically, comparing Q(t) with the linear E-to-P path for t<=1/2 gives t²(E-2P+F); on the other half the coefficient is (1-t)². Its L-infinity norm is <= max(||E-P||inf,||F-P||inf)/2. We report the looser maximum actual trim reach as a conservative correspondence bound, including trim rounding.

Increasing tension means greater permitted corner roundness. It does not mean a cardinal spline tension of 0.65; such semantics were not specified by the catalog.

## Adaptive flattening

Quadratic control points are tested with the same monotone finite-chord capsule at radius S/1024. The Bezier convex-hull property bounds the whole curve, not only samples; the retracted control coordinates are ordered, so the scalar Bezier projection is monotone and surjective. Otherwise de Casteljau subdivides until that test passes, at most 16 levels.

Each subdivision consists of two levels of rounded midpoint interpolation. Convex combinations do not amplify previous control perturbations; <=2 integer units per recursion level is a conservative envelope. The ledger therefore adds 32/S pixels to 1/1024 pixel whenever curves exist. The dense Bernstein-sample test is an additional regression check, not the basis of the bound. A depth/work/vertex limit produces a typed failure, never an unbounded endpoint shortcut.

The total L-infinity bound is the sum of these stage correspondences. Triangle inequality composes them. For the diagonal physical map diag(sx,sy), Euclidean displacement is <= B_inf*sqrt(sx²+sy²). The physical norm is evaluated as max(sx,sy)*sqrt(1+(min/max)^2) to avoid squaring a tiny extent to zero. Each dyadic unit must remain a normal f64 mm value or processing returns InvalidOptions. Reporting adds 8 f64 epsilons of relative margin. This does not bound the final host integer quantization, an arbitrary raster's continuous source, palette changes, printer fit or shrinkage.

## Topology certificate

A distance bound alone does not preserve topology. Every candidate additionally passes:

1. Finite viewport/pin checks; every declared pinned source point has its exact original coordinate.
2. R-tree broad-phase followed by exact i128 segment predicates. No proper crossing, overlap, zero edge, foreign coincident endpoint or endpoint in another edge interior. A meeting is allowed only at the same vertex ID.
3. Same canonical cyclic order of outgoing chain ports at each pinned vertex.
4. Same explicit loop/region chain incidence; all signed loop areas nonzero and of their original sign.
5. For every disconnected boundary component, compare its fixed anchor's winding against every other component's material face walks, using exact half-open horizontal ray tests. Compare the full sparse loop-ID/winding map, including hole walks, not just one opaque region witness.

Suppressing degree-two subdivisions gives the same abstract graph and face walks. Rotation plus no crossings preserves that combinatorial embedding; loop orientation fixes exterior/interior side. The anchor/winding maps fix the nesting of disconnected embeddings. This is the basis for the final planar-topology claim; no untested homotopy of intermediate iterations is assumed. Labels/regions stay attached to the exact same two chain incidences. Original four-connected islands, void faces and junctions therefore remain in that embedding. Optional segmentation changes before this module retain their own decisions/confirmation.

If invalid, retry from the raw chains with n=1..12. If all fail, publish the exact source geometry as constrained_identity with rejection reasons and confirmation required. Resource/depth failures are errors, not a fallback to cheaper settings. This finite constrained search is explicit; request values remain untouched. Tests exercise actual attenuation at maximum settings.

Point-touching regions can still be unsuitable for Manifold extrusion. Host quantization/boolean/extrusion validation remains required, and lies outside this certificate.

## Primary references and implementation boundary

[rstar 0.13.0](https://docs.rs/rstar/0.13.0/rstar/struct.RTree.html) supplies bulk-loaded R-tree AABB intersection queries only; exact package source was inspected. No CGAL code is copied or linked. CGAL's [Polyline Simplification package](https://doc.cgal.org/latest/Polyline_simplification_2/index.html) distinguishes intersection and nesting preservation and shared constrained polylines; those are useful acceptance criteria here. Our bounded filter, monotone capsule, integer fillets and explicit embedding validator are described above rather than attributed to a library that does not implement them.

The catalog copy/hash and formulas are in parameters-proposal.json. Geometry evidence comprises implementation tests and cross-runtime parity, not an independent review of this derivation.

