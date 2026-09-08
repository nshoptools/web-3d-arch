# arch-vector-source

Rust SVG ingestion for web-3d-arch. This crate returns bounded polygon **operands**
in millimetres, with original SVG bytes, source provenance, curves, clip graph,
diagnostics and an error ledger. It does not perform boolean operations,
material subdivision, triangulation, extrusion or mesh validation.

Implementation work for VEC-01, GEO-01/02 and the SVG input portion of G1.
Native implementation tests are not independent review or a complete G1 gate.

## API

```rust
use arch_vector_source::{parse_svg, ManufacturingStatus, ParseOptions};

let svg = r#"<svg xmlns="http://www.w3.org/2000/svg"
    width="20mm" height="10mm" viewBox="0 0 20 10">
    <path fill-rule="evenodd" d="M0 0H20V10H0Z M8 3H12V7H8Z"/>
</svg>"#;
let document = parse_svg(svg, ParseOptions::default())?;
assert_eq!(document.status, ManufacturingStatus::Contours);
assert_eq!(document.shapes[0].contours.len(), 2);
assert_eq!(document.source, svg.as_bytes());
// Resolve fill/clip/paint order in the kernel before extrusion.
// Do not treat the ledger's unverified total error as zero.
# Ok::<(), arch_vector_source::VectorError>(())
```

Entry point:
`parse_svg(svg: &str, options: ParseOptions) -> Result<VectorDocument, VectorError>`.

All public records/enums implement Serde Serialize/Deserialize. Public units are
f64 **mm**, X right, Y down, origin at the root viewport's top-left. There is no
automatic Y inversion or integer-grid quantization.

| Field | Contract |
| --- | --- |
| schema_version | 1 |
| source_hash, source | SHA-256 lowercase hex of exact input UTF-8 bytes; exact bytes retained, including BOM/CRLF/comments |
| display_graph | Inert lexical XML graph with parent links, namespaces, raw decoded attributes/text, original byte ranges and positions |
| source_paths | SVG path syntax extension v1: decoded original d, including A/a arcs and relative commands; original XML bytes remain authoritative |
| width_mm, height_mm | Some after successful usvg sizing; None for sources blocked in preflight |
| viewport_clip | Some closed root viewport rectangle in mm for parsed geometry; must intersect final paint regions |
| shapes | Ordered opaque paint operands; each fill or stroke is a separate shape |
| clips | Clip instances: union of parts, then intersections; see below |
| resolved_curves | M/L/Q/C/Z in mm after usvg/stroking, before adaptive flatten |
| diagnostics, ledger | Capability/omission explanations and conversion/error-budget accounting |

A shape has a deterministic paint-N ID, paint_order, paint_kind, mandatory
fill_rule (nonzero/evenodd), unpremultiplied RGBA, contours, clip_stack,
curve_record index and provenance. Every emitted manufacturing paint is opaque.
Contour closure repeats the first vertex. Winding, holes, disconnected islands
and zero signed-area/self-intersecting geometry are retained. No area threshold
deletes small accents. Degenerate contours may reach the topology stage; the
kernel must diagnose them rather than drop them silently.

Original source IDs are optional. A parser-only SVG copy inserts collision-free
IDs into elements lacking IDs, using roxmltree's original element ranges.
It never replaces the stored source. Provenance points to original source nodes
and spans, not offsets in this modified copy. reference_chain records actual
normalized group/clip ancestry; the original hierarchy remains in display_graph.
Generated usvg clip IDs without a reliable source match have null source spans;
clip parts still retain their own source provenance.

The display graph is a source/provenance representation, **not a safe DOM or a
fully computed CSS paint tree**. This library never renders it. Do not insert
stored SVG directly into live HTML; a host renderer needs its own isolated,
audited resource and script policy.

## Manufacturing status and failure behavior

- contours: safe subset parsed into operands. Fill rules, clip intersections,
  overlapping paint/material subdivision and seam topology remain to be resolved.
- empty: parser produced no visible paint; an explicit diagnostic is present.
- requires_confirmed_raster: complex paint/alpha/effect needs an explicit,
  previewed and confirmed conversion. No rasterizer is implemented here.
- unsupported: an unaudited feature or omitted geometry was found.

The last two statuses retain the inert source records and return **zero**
manufacturing shapes. Unsupported features anywhere in the input conservatively
block the whole document, even in unused definitions. An existing valid shape is
not returned as a misleading partial import. A source geometry omitted by usvg,
including degenerate or display:none shapes, is diagnosed and blocks partial
output. Referenced clip children are included in the omission check.

Unsafe XML/resources, malformed values, cyclic references and budget violations
return VectorError with a typed code, message, source hash (except pre-hash input/
option limits) and source span when available. No partial document escapes an error.
A caller still owns the supplied source string on failure.

## Geometry support

- Paths: SVG M/L/H/V/C/S/Q/T/A/Z, absolute/relative, interpreted by svgtypes/usvg.
  Arc-derived cubics are approximations; the original arc extension is retained.
- Rectangles, rounded rectangles, circles, ellipses, lines, polygons and polylines.
- Groups, affine transforms, inherited static presentation attributes and a
  conservative inline style subset.
- Default SVG fill-rule nonzero, explicit evenodd, currentColor and solid colors.
- Solid stroke outlines using usvg Stroke::to_tiny_skia and tiny-skia-path 0.12.0.
  Cap/join/miter settings are preserved. Outline in local coordinates first,
  then apply the full transform, including nonuniform scaling.
- Root viewBox, preserveAspectRatio (meet/slice/none/alignment), absolute physical
  units (mm/cm/in/pt/pc/px/unitless) at 96 DPI. A viewBox-only root uses its
  dimensions in CSS pixels, as resolved by the pinned usvg. Relative root sizing
  is blocked; a document with neither a full absolute size nor viewBox is blocked.
- userSpaceOnUse and objectBoundingBox clips; transforms, per-part clip-rule,
  sibling union, nested group intersections, clip-on-clip and clip-on-clip-child.

Root overflow/nested viewports, full stylesheets/selectors, !important, CSS
transforms, percentage/em/ex geometry, text shaping, use/symbol/markers,
dashing, non-scaling strokes and unrecognized elements/attributes/properties
are intentionally not claimed. They produce blocked source records or typed
errors. Inline CSS escapes, at-rules, comments and executable constructs are
rejected. Even valid complex CSS outside the supported subset is conservative.

Masks, filters, gradients, patterns, opacity, embedded images and foreignObject
are preserved in source but not converted to supposedly lossless material regions.
Text must use the project's existing validated shaping/outline contract.
There is no font fallback and no bitmap-to-vector substitution.

## Clip and paint evaluation contract

For a shape: resolve its own contour set using fill_rule, intersect every
clip_stack entry, then constrain it by document.viewport_clip.

For each ClipRegion:

1. Resolve each ClipPart's contours using that part's fill_rule.
2. Intersect that part with all of its clip_stack entries.
3. Union the resulting parts.
4. Intersect the union with the ClipRegion's own clip_stack entries.

All coordinates are already in root mm; never apply source transforms again.
Clip instance IDs are keys, not indices. Linked instances can precede their
referencing instance in the clips array. The graph is acyclic and bounded.
A clip linked from another clip uses the original referencing coordinate basis,
not the first clip's objectBoundingBox/transform basis.

Then resolve paint operands in increasing paint_order (later paint above earlier
paint). Build a material-labelled planar subdivision and shared seam topology
with the kernel. Do not union all contours as though they used one fill rule or
ignore viewport/clips. Stroker output can overlap itself near joins: algebraic
shoelace area counts winding multiplicity and is not the filled-region area.

## Error budget

Default flatten_tolerance_mm is 0.004. Adaptive de Casteljau subdivision measures
each interior control point's distance to the **finite chord segment**, after
transform to mm. The convex-hull property bounds the distance of an accepted
resolved Bézier to that segment. Distance to the infinite line alone is inadequate
for collinear overshoot. A zero-length chord uses point distance. On recursion or
vertex exhaustion the operation fails; tolerance is never silently relaxed.

This bound applies to **resolved Béziers**. usvg paths, dimensions and composed
transforms contain f32 uncertainty; stroking also uses f32. usvg/svgtypes use
kurbo with local arc approximation tolerance 0.1, which is not a global mm budget.
Original A/a commands and analytic primitive attributes remain available through
the versioned source extension and graph. Neither dependency arc approximation
nor stroke construction has a certified source-to-result bound in this crate.

The ledger records these stages as unverified and total_error_bound_mm is always
None. The accepted flatness statistic does not certify arithmetic roundoff.
The 1 nm target integer storage grid in GEO-02 is a downstream representation
choice, not accuracy achieved by this importer. The host must add its own checked
quantization, boolean, offset, triangulation and export ledger.

## Resource and I/O policy

usvg=0.48.1 is pinned with default-features=false: no text/system-font/memmap,
SVGZ or writer features are enabled by this crate. Both image resolver closures
unconditionally return None; resources_dir is None. Preflight runs before usvg,
rejects DTD/entities, XML processing instructions, scripts, event handlers,
xml:base, external/data/file hrefs and external/ambiguous CSS URLs. No file,
network, font or image resource I/O is performed by parse_svg.

Default limits: 1 MiB source, 8192 XML nodes, depth 64, 16384 source path/point
segments, 65536 resolved segments, 200000 emitted polygon vertices, 4096 shapes,
256 conservative clip expansions/instances, subdivision depth 24, absolute
coordinate/control domain 10000 mm. Source numeric values are limited to 1e6
user units; the explicit input cap is conservative even when a later scale could
shrink a huge source. Stroke-bearing input has an additional conservative 2048
source-segment limit; stroker resolution is capped at 4096. ParseOptions validates
hard ceilings. Counts are shared across shapes and clips; the fixed five viewport
vertices are not included in the flatten counter.

Clip longest-path depth and conservative DAG expansion costs are checked before
usvg. Unknown features and malformed values cannot rely on usvg's silent ignore/
fallback behavior. Valid but conservative false rejections are documented above.

These are size/complexity bounds, not an OS memory quota or a hard wall-clock
deadline on dependency internals. The host Worker still needs cancellation/
watchdog isolation for native work. This crate is not a process sandbox.

## Build, tests and integration

Copy this entire checked crate directory (including Cargo.lock, tests, docs,
examples and LICENSE) into the main project's chosen directory. No run-local
absolute paths are compiled in. The local [workspace] makes the crate independently
buildable; remove that empty section only if adding it as a member of a parent
Cargo workspace. The parent workspace then owns dependency resolution and must
preserve/verify the pinned graph.

```text
cargo test --locked --manifest-path <crate>/Cargo.toml
cargo run --locked --manifest-path <crate>/Cargo.toml --example g1_export -- rectangle-hole
cargo run --locked --manifest-path <crate>/Cargo.toml --example g1_export -- shared-seam
```

In this Windows repository, every writing process must first dot-source the
project development environment, override CARGO_HOME to its own run/cache/cargo,
and invoke the repo's cargo.exe by full path; see the supplied run-tests.ps1.
The script does not mutate the shared .toolchain Rust installation.

Tests use the exact frozen corpus-v1 fixture bytes and analytic dimensional/area/
winding oracles, plus sampled independent Bézier distances. See docs/TESTING.md.
No C ABI, Clipper2/Manifold integration, WASM, STL or printer validation is claimed.

Repository code retains the repository's internal license (LICENSE copied
unchanged). Third-party packages keep their own licenses; see docs/DEPENDENCIES.md
and the generated dependency inventory/notices. This package is not publishable
to crates.io.

