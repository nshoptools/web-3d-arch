# Canonical source regions and discrete source frames

This implementation corrects the exact Inter NFD Vietnamese source regression and
adds a bounded placement API for source assembly. It uses the existing Rust/C++,
HarfBuzz and printing Module. It is implementation testing, not independent review.

## Exact failure and correction

The retained text is E + U+0302 + U+0301, newline, ĐO; Inter wght620/opsz14,
size12mm, letterSpacing0.35mm, lineSpacing1.4, bend12 degrees. The source build
remains thickness0.2mm, longEdge0 (physical size), tolerance0.001mm.
Original and adopted SVG bytes are distinct, preserved fixtures with distinct
hashes and Clipper goldens. Neither fixture, font, size nor tolerance was changed.

Both sources produce901 initial integer-grid points in3 shapes; none of their
source edges is shorter than2 grid units. Union of the overlapping Đ subpaths
creates a1nm edge, retained by viewport clipping and a further Clipper union.
In the adopted frame it runs (2121279,38465) to (2121280,38465).
Cross products with its neighbors are -38464 and112873 grid-squared: it is
not redundant collinearity. Removing it would change geometry.

Previously build_svg resolved an owned ArchRegion, flattened it back into raw
Shape input, then applied the raw-input resolution guard a second time. The fix
passes the existing opaque canonical regions to the common native scene builder.
The raw Shape path keeps its original guard and normalization. The opaque path
does not reinterpret a derived intersection edge as a new raw source feature.
The shared downstream paint partition, seam construction, point-contact checks,
triangulation and Manifold validity requirements remain in force.

This is not snapping, simplification, vertex/face removal or a relaxed raw-source
tolerance. A directly authored1nm raw triangle still fails
REGION_BELOW_BOOLEAN_RESOLUTION. The new internal C++ entry accepts owned
ArchRegion objects, not unvalidated external path arrays. Rust holds every owner
through the synchronous call; the root input and snapshot registries remain the
only public ownership mechanism.

## Geometry evidence

Native, Node WASM and actual Chromium/Firefox/WebKit Workers retain all904
canonical boundary points,5 components and2 holes for each combined source.
Every point occurs at both extrusion endpoints; every boundary edge has two
side triangles. Oracles check exact integer cap area, closed edge incidence,
vertex links, component/hole Euler relation, winding and positive volume.

| Source | Area mm² | Volume mm³ at0.2mm |
| --- | ---: | ---: |
| Original |109.213707796534|21.8427415593068|
| Adopted |109.2137184651181|21.8427436930236|

The different areas are from distinct source frames and floating-point SVG
interpretation; the tests do not substitute one golden for the other.
Full geometry arrays match native and WASM byte for byte except the generation
header. Pinned Clipper stage output independently checks the exact boundary rings.

The authored rectangular T-junction/hole/accent fixture also has a separate
integer-grid oracle with exact185mm² area. Its SVG form uses physical units and
viewBox; usvg f32 interpretation changes area by0.00001mm². That test uses the
existing conservative affine-fixture envelope (documented in oracles.mjs);
all exact cap/boundary/side-facet checks still apply. It does not establish a
general SVG error bound.

## Integration

[Source frame API](SOURCE-FRAME-API.md) specifies ASFR/1, the exact112-byte wire,
typed binding, same-root lease/control behavior and metadata. The frame is only
a signed-axis permutation plus translation, not general affine geometry.
Its result contains planar indexed integer XY/shared edges and must go through
source assembly. It is not a product or printable mesh.

Raster context dimensions now come from the accepted RASP/2 complete image
rectangle, including transparent margins. The public raster context and product
source metadata both include rasterFrame. Existing per-label versus per-region
grouping behavior is unchanged. Original encoded/RGBA hashes and source metadata
are preserved; no palette, areaPercent or reconversion policy changes here.

The ready message has one additive sourceFrameVersion field, obtained from the
actual same-Module getter and cleared on retirement. No constructor/init message
shape is changed. Parent-owned runtime-integrity initialization/proof wiring is
not included in this delta. Root Cargo/build/CMake and app adapters are unchanged.

## Limits

- The source-frame capability accepts svg or raster-source-context only, rejects
  repeat application, and binds the exact original source hash and owned lease.
- Translation rounds the exact requested binary64 rational once, nearest/ties-even
  to nanometres; at most0.5nm per axis relative to that request. It does not bound
  SVG parsing, curve flattening, previous booleans, material conversion or print fit.
- General scale/shear/rotation, arbitrary mesh transforms and completed-product
  placement are outside ASFR/1.
- Geometry or topology failures downstream remain typed refusals; this focused
  correction does not resolve every previously reported curved-source refusal.
- Existing R3 manufacturing-export authority/assembly/revision guards and float
  conditioning code are byte-preserved. New source tests are not a replacement
  for the parent's whole-product/export acceptance suites.
- The host keeps original assets and curve/recipe records; native SvgBuild.source
  also retains its VectorDocument. ASFR copies existing lease metadata, including
  SVG importLedger, but does not add raw bytes/curves to root JSON metadata. Its
  matrix provides placement and does not rewrite the original curve records.

See [test instructions](TESTING.md), [recorded evidence](EVIDENCE.md), and
tests/native-source/fixtures/provenance.json for regeneration and provenance.
