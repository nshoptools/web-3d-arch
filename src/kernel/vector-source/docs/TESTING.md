# Native verification and oracle scope

The implementation suite is tests/svg_contract.rs plus one finite-chord-distance
unit test in src/flatten.rs. It is not independent-seat review.

The two tests/fixtures/corpus-v1 SVGs are copied byte-for-byte from the repository's
frozen corpus and keep these SHA-256 hashes:

| Fixture | SHA-256 | Independent oracle |
| --- | --- | --- |
| rectangle-hole.svg | 07e2d061680bffe7915f733c40a3ea6bb6ed28de119d997a38947ead4bb55187 | 20x10 mm minus 4x4 mm = 184 mm²; hole interior unfilled |
| shared-seam.svg | 6deec001cb76b5d9c998d259ef9a8c84e3dfcf6b4f353e912ece3788bcbf5648 | two 10x10 mm rectangles, one 10 mm seam with reversed endpoint order |

Do not regenerate or modify these fixtures to change expectations.
Other synthetic SVGs are inline test inputs, not a new version of the frozen
corpus. Tests write no outputs into the source tree.

Coverage includes:

- Default nonzero, same/opposite winding, evenodd holes and disconnected open
  fill subpaths; independent ray crossing at off-boundary points.
- Physical units at 96 DPI, shape units, viewBox-only sizing, aspect ratio,
  viewBox offsets, group style/inheritance, reflection and nonuniform transform.
- Stroke caps, paint order, outline-before-transform and a closed stroke's hole.
- Clip sibling unions, per-part rules, group/nested clips, objectBoundingBox,
  linked-clip coordinate basis, child clipping, missing/cyclic/partial clips.
- Quadratic/cubic analytic samples (2001 parameter samples per curve) against
  polygon-segment distance at 0.001 mm flatten tolerance with a separately stated
  0.00001 mm allowance for the small test's f32 import effects.
  This sampling is a test oracle, not a global certified roundoff bound.
- Degenerate curve chords and collinear backtracking; source arc retention and
  ellipse/rounded-rectangle/anisotropically transformed arc area checks.
- Exact source UTF-8/BOM/CRLF/hash, original source spans and Serde round trips.
- External/data/file references, entity-encoded URLs, event handlers, scripts,
  unsafe CSS, XML/DTD/PI, malformed path/style/units/transform/aspect values.
- Blank/unsupported records; atomic failures for byte/node/depth/segment/vertex/
  recursion/coordinate budgets; clip DAG growth checked before usvg.

For simple contours, shoelace area is an analytic polygon oracle. For the closed
axis-aligned stroke, use independent cell integration between all x/y boundaries
and ray-crossing fill membership: the dependency stroker emits self-overlapping
inner-join loops, so algebraic shoelace counts winding multiplicity rather than
the actual nonzero filled area. The expected stroke area stays 12²-8² = 80 mm².

These tests do not prove general SVG rendering equivalence, formal numeric
precision, a full SVG/CSS sanitizer, memory quotas, C++ linkage, mesh correctness,
STL/3MF, browser/WASM or physical manufacture. Downstream G1 needs its own boolean/
seam/mesh/STL oracles. A passing analytic import test alone is not a G1 pass.

