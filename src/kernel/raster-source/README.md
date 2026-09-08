# arch-raster-source

Reusable PNG/JPEG/WebP and explicitly declared or confirmed rendered RGBA processor. Original encoded bytes and oriented RGBA remain intact. Segmentation produces one label grid; source unit edges, shared derived chains, material contours, previews and the approximation ledger remain distinct.

Wave2 uses **schema 2 / raster-parameters-proposal-v2**. Catalog defaults now execute: k=4, res=520, smooth=3, minA=5, denoise=1, eps=35, tension=65. This is an implementation proposal with tests, not independent review or approval of the catalog's previously unspecified formulas.

## API and migration

~~~text
decode_image(bytes, DecodeOptions) -> Result<SourceImage, RasterError>
process_rgba(rgba8, width, height, ProcessingOptions) -> Result<RasterDocument, RasterError>
process_image(&SourceImage, ProcessingOptions) -> Result<RasterDocument, RasterError>
document.flat_geometry(max_additional_bytes) -> Result<FlatGeometry, RasterError>
document.material_contour_vertex_ids(label) -> Result<Vec<Vec<u32>>, RasterError>
document.point_mm(derived_vertex_id) -> Result<[f64; 2], RasterError>
~~~

RGBA is contiguous row-major straight-alpha sRGB8. No production API reads files, network, fonts, UI or a clock, invokes a renderer, or calls an external callback. Recognizable SVG receives SvgIsNotRaster; unknown bytes receive UnsupportedFormat. The host owns rendering and preserves its referenced original.

~~~rust
use arch_raster_source::{process_rgba, ProcessingOptions, RasterError};
let pixels = [255,0,0,255, 0,255,0,255];
let options = ProcessingOptions {
    design_long_edge_mm: 20.0,
    ..ProcessingOptions::preserve_pixels()
};
let document = process_rgba(&pixels, 2, 1, options)?;
assert_eq!(document.material_count, 2);
assert_eq!(document.graph.edges.len(), 7); // analytic shared 10 mm seam
assert!(!document.requires_confirmation);
let flat = document.flat_geometry(1024 * 1024)?;
assert_eq!(flat.edges.len(), 7);
let rings = document.material_contour_vertex_ids(1)?;
for id in &rings[0] { let _mm = document.point_mm(*id)?; }
# Ok::<(), RasterError>(())
~~~

Default is now the operational catalog profile. ProcessingOptions::preserve_pixels() selects k=4/res=520 and all five cleanup/geometry settings zero, matching the previous exact-cell profile. Manual values remain in document.options; stale v1 parameter strings are rejected. catalog_candidates() remains an alias for the operational default.

**document.graph and regions remain raw final label-cell topology. New document.geometry is the authoritative manufacturing geometry.** Old raw accessors are explicitly named source_point_mm and source_material_contour_vertex_ids. Unprefixed manufacturing accessors refer to geometry.vertices IDs. Mixing these ID spaces is invalid. Original goldens remain unchanged; v1 raw tests explicitly select the pixel-preserving profile.

flat_geometry returns owned integer/typed arrays, including curve/source-edge provenance, for a native/FlatBuffers adapter. It is available before approval for preview, not manufacturing authorization. Material export checks confirmation. Serde supports persistence, but no JSON mesh is required or produced. Production C entry points remain the parent's responsibility; see [ABI proposal](docs/runtime-binding-proposal.h) and [host integration](docs/host-integration.md).

## Parameter semantics

Catalog defaults/domains came from the checked parameters-reference.json, which specifies UI ranges but no smoothing formula or mm mapping. These equations are explicit proposals justified in [geometry semantics and bounds](docs/geometry-semantics.md). The machine-readable counterpart is [parameters-proposal.json](docs/parameters-proposal.json).

| Parameter | v2 meaning |
| --- | --- |
| k: 2..16, default 4 | Maximum opaque colors; actual materials can be 0 or 1. Transparent label 0 never counts. Fixed palette or deterministic weighted farthest seeds plus up to 12 Lloyd means; nearest squared encoded-sRGB8 distance, integer ties-even, stable IDs. Not a perceptual DeltaE algorithm. |
| res: 360/520/720/960/1280, default 520 | Actual long-edge processing pixel cap, no upsampling. Other dimension uses ties-even, minimum 1. Exact rational area-overlap box filtering uses premultiplied encoded-sRGB and returns straight RGBA8. Not mechanical precision. |
| smooth: integer 0..6, default 3 | Number of simultaneous shared-chain binomial passes: P' = P + (previous - 2P + next)/4. Endpoints, junctions, viewport vertices and one component anchor stay fixed. |
| eps: integer 0..100, default 35 | Maximum simplification L-infinity deviation eps/200 processing pixels (default 0.175 px), rounded down to the dyadic lattice. Balanced recursive chord replacement must satisfy capsule distance and monotone projection. Zero bypasses. |
| tension: integer 0..100, default 65 | Quadratic corner-fillet reach cap tension/200 processing pixels (default 0.325 px), capped at 1/4 of each adjacent segment's L-infinity length. Old corner becomes quadratic control. This is corner roundness, not an undocumented cardinal-spline coefficient. |
| minA: integer 0..100, default 5 | Strict-less-than processed-pixel area threshold. One snapshot pass merges into an adjacent opaque region already >= threshold; shared-edge count, RGB distance and stable IDs break ties. No cascade, swaps, void target or removal of isolated accents. |
| denoise: integer 0..3, default 1 | Simultaneous 3x3 lower-median RGB passes over opaque neighbors; alpha occupancy stays unchanged. Channel medians can introduce colors; these decisions precede palette reduction. |

Each trial processes a shared chain once per stage; both material incidences reuse it in opposite directions. On embedding rejection, all three geometric strengths are scaled by 2^-n and recomputed from the source chains. Up to 13 trials (n=0..12) precede an explicit constrained identity fallback. Requested slider values never change. Rejections, gain, movement, reduction and bounds enter the ledger and proposal hash. A setting is not a promise that every tiny feature can be rounded at full strength.

## Geometry and bounds

Raw edges are exact boundaries of one processed grid. Regions are four-connected. Source/derived edges store left/right label and region incidence. Coordinates have X right, Y down: positive outer shoelace area, negative holes. Diagonal contacts remain separate islands sharing a pinned corner where applicable.

Derived positions and quadratic controls are integers in **2^-20 processing pixels**. This dyadic lattice makes predicates, filtering, simplification, subdivision and serialization deterministic across tested targets. It is not an nm or printer grid. Quadratics remain available before adaptive de Casteljau flattening: <=1/1024 px L-infinity flatness plus conservative 32 dyadic units for subdivision rounding, recursion <=16.

Validation checks exact i128 segment intersections/overlaps, fixed vertices, cyclic junction order, nonzero loop orientation, inherited material incidences and disconnected-component nesting against other component faces. A pinned rstar R-tree only accelerates broad-phase queries. Suppressing degree-two chains preserves abstract face walks. This certifies the resulting planar embedding relative to segmentation, not manifold extrusion or topology after host quantization.

geometry.ledger.total_linf_bound_units sums smooth correspondence displacement, simplification, corner rounding and flattening bounds. derived_geometry_error_bound_mm() uses sqrt(sx²+sy²), plus a small reporting-roundoff margin. Anisotropic grids keep distinct sx/sy; no scalar pixel size is substituted.

total_source_geometry_error_bound_mm remains None. Bounds begin at the **final label-cell boundaries**, after downsampling, alpha, palette and cleanup decisions. Arbitrary pixels have no certified continuous source contour. The host maps/quantizes each shared ID once to its global mm/nm domain, then revalidates collapsed edges, adjacency and holes.

## Decode and original source

Official unpatched pins: image 0.25.10, png 0.18.1, image-webp 0.2.4, zune-jpeg 0.5.15, zune-core 0.5.3; default image features disabled. Static VP8 and VP8L, PNG transparency, JPEG and all eight EXIF orientations have synthetic tests. Lossy VP8 has a reproducible official cwebp 1.6.0 fixture, archive/binary/source hashes, license and patent notices in [vp8-manifest.json](tests/fixtures/vp8-manifest.json).

PNG expands indexed/sub-8-bit gray to RGBA8. The official streaming decoder preflights framing/metadata without pixel output, then the high-level decoder decompresses. CRC errors, malformed ancillary data, unsupported metadata and trailing bytes fail typed. ICC/CICP/HDR, non-sRGB gamma, 16-bit PNG, animated PNG/WebP and CMYK/YCCK JPEG require unsupported color/precision/animation handling, never silent reduction.

JPEG uses strict safe scalar zune-jpeg with <=64 scans. WebP uses image-webp with dimension/metadata limits before pixel buffers. Untagged JPEG/WebP RGB is an explicit sRGB assumption requiring confirmation. Known ignored PNG text/physical-resolution/background metadata remains in original bytes with diagnostics. Unknown WebP/JPEG chunks follow the pinned codecs; secondary/XMP orientation is not applied.

EXIF primary IFD0 orientation uses image. Present but missing/unrecognized primary orientation returns OrientationUnknown; absence means identity. Whole-EXIF correctness and contradictory secondary tags are not certified. The pinned simple VP8L decoder wraps a maximal 16384 header dimension to zero, rejected by the outer guard; no guessed correction/cache patch.

SourceImage retains bytes/hash, format, raw EXIF, encoded/oriented dimensions, oriented RGBA/hash, alpha and diagnostics. process_image re-decodes and compares authoritative buffers before processing, costing a second decode. process_rgba preserves supplied RGBA and ExplicitSrgb or ConfirmedRender provenance. Original vector/complex paint and host PNG preview remain host assets.

Partial alpha requires explicit Threshold or MattePartialEncodedSrgb; alpha zero stays void. No implicit white background. Border-connected background exclusion is separate and opt-in. Errors return no partial document; the caller retains original bytes.

## Confirmation and preview

Actual downsampling, alpha conversion, recoloring, denoise, background removal, merging, geometry changes, attenuation and decoder color assumptions are listed. The proposal SHA-256 covers source buffers/dimensions, encoded hash, all options except acceptance, actual labels/palette/preview/raw topology and **all derived geometry, curves, provenance, certificate and integer bounds**. Stale acceptance fails ConfirmationMismatch.

Show original RGBA, resampled_rgba, processed_rgba and the **derived contour preview**. processed_rgba is the label-color preview; it does not rasterize smoothed geometry. Render contours from geometry/flat arrays for the actual approved shape. PreviewComparison measures premultiplied encoded-sRGB changes on the processing grid, not perceptual/geometric error.

After a host transaction approves, reprocess with accepted_proposal_hash. Mutable/serde records are not signed authorizations: reprocess untrusted state, never flip the flag manually. Ready means no pending approximation acknowledgment, not printer fit or independent review.

## Limits and validation

Defaults: source 32 MiB; dimension 32768; input/decoded pixels 16,777,216; decoded estimate 256 MiB; metadata 2 MiB; cumulative processing estimate 512 MiB; processing grid <=1280²; colors <=262144; vertices <=1M; edges <=2M; opaque regions <=100k; deterministic work <=250M units. Limits::validate enforces hard ceilings. Raw/derived graphs each respect count limits and share cumulative byte/work limits. flat_geometry adds an explicit <=512 MiB cap for returned arrays; transient contour scratch is additional.

Headers precede pixel allocation. Physical transforms that underflow a normal f64 value for one dyadic unit are rejected. Invalid/nonfinite options, count overflow, dimensions, subdivision, work and resource limits fail typed. Work units are algorithmic work, not milliseconds. Dense boundaries or nesting may exhaust the budget below the nominal pixel cap; settings are not silently lowered.

Codec scratch estimates are not hard process-memory guarantees; image-webp documents allocations outside its memory limit. Caller-owned originals, documents, flat output and leases add to host memory. A Worker deadline remains necessary. Raster code has no progress/cancel callbacks; parent can check control before/after synchronous calls and use its watchdog during uninterruptible work.

Native and native/WASM runners are under scripts/. They prepare the run, override Cargo home/targets/temp and use pinned Rust/emsdk read-only. Test evidence stays outside the checked crate under evidence/. The Worker harness transfers a binary report from Rust memory, with typed fingerprints and no mesh. Actual engine versions/pass results are in the handoff.

Unchanged v1 goldens plus new tests cover analytic filtering, quadratic samples, independent bidirectional distances, shared incidence/area conservation, junctions/nesting, exhaustive default/max sliders, resources, flat ownership and confirmation. These are implementation tests.

Cargo.lock and [dependency inventory](docs/dependencies.json) pin sources/checksums/licenses. [Notices](THIRD-PARTY-NOTICES.md) remain separate from the unchanged project internal-use LICENSE. Primary APIs: [rstar 0.13.0](https://docs.rs/rstar/0.13.0/rstar/struct.RTree.html), [png 0.18.1](https://docs.rs/png/0.18.1/png/struct.Decoder.html), [official WebP tools](https://developers.google.com/speed/webp/docs/cwebp). No custom codec or mesh implementation.

