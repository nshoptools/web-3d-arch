# RuntimeABI2 binding proposal and owned buffers

Status: implementation adapter proposal, not new exports in the main runtime. This crate's executable API is Rust process/decode plus RasterDocument::flat_geometry. The C declarations in runtime-binding-proposal.h are exact proposed wrappers for the parent to add to its existing module; no second kernel/module, codec or mesh is required.

Read baseline: src/kernel/native/runtime.h, src/kernel/src/abi.rs and snapshot.rs, 2026-09-08. Existing runtimeABI2 uses registered input handles, monotonically increasing generation, serial Worker calls, an atomic four-word control block and immutable snapshot leases. Existing arch_build_svg consumes its input and returns one primary ARCH/1 lease. Keep these public behaviors.

## Ownership and lifecycle

1. Controller source.ingest preserves original bytes/SHA and metadata in the SHA asset map. Encoded PNG/JPEG/WebP goes to prepare_encoded. An optional already-confirmed raster derivative goes to prepare_rgba with width/height, straight sRGB8 data and explicit renderer provenance. SVG is never passed to decode_image for implicit rendering.
2. Allocate every request buffer through arch_input_create, obtain its registered pointer, refresh the JS heap view after any allocation/growth, then copy bytes. Options use the fixed LE 200-byte block in the header. No callback address, object pointer or filesystem path is accepted.
3. control_reset(generation), then prepare. It consumes all valid request handles atomically even on failure; repeated IDs are an error. Rust owns the decoded SourceImage and/or RasterDocument. On success publish an immutable RASTER result with **one primary lease**. Reuse the parent's global ID and aggregate memory counters, while checking result kind.
4. Read original/resampled/final-label previews, diagnostics, shared raw/derived graphs and the derived proposal hash under that lease. Recreate typed arrays after memory.grow. Do not write returned buffers or retain them after last release.
5. Confirm only after the host transaction approves the displayed proposal. A registered 32-byte accepted-hash input is consumed; the old proposal lease is borrowed. Reprocess authoritative original/options with accepted_proposal_hash, and publish a new accepted immutable result lease. A stale token fails; never mutate an old proposal's status. Old readers remain valid.
6. geometryengine validates domain state and SHA asset map, then build_raster borrows that accepted lease. Check referenced original/renderer asset hashes match the prepared record. Convert each global derived point ID to mm then the parent's one global integer grid once; reuse it in both directions. Feed nonzero material contours and palette colors to the existing C++ Clipper/Manifold path. Build returns the current ARCH/1 primary snapshot lease. No raster-result lease is implicitly consumed.
7. If a Worker message fails, release the primary lease locally. acquire means an additional reader, not permission to read the primary. release once per reader. Last release invalidates all views. Existing generations/snapshots survive failures, stale confirmation or cancellation.

Failure returns handle 0 and a stable numeric arch_raster_error_code from the header. Parent maps Rust variants explicitly, preserving the existing <=512-byte synchronous UTF8 error message; do not cast Rust enum discriminants or retain error pointers across calls. Codes 100..103 cover adapter handle/generation/cancellation/lease failures.

Until the parent implements these wrappers, it must not claim arch_raster_abi_version exists. A missing capability is explicit unsupported. An additive raster capability function can coexist with arch_abi_version()==2 and unchanged arch_build_svg; parent decides any broader ABI version change.

The crate does not implement progress/cancel callbacks. Parent checks its atomic generation before/after decode/process/export and before publish/build, reports monotonic stage progress, and retains its watchdog for a synchronous Rust/codec call. No fictitious per-pixel cancellation guarantee. New native C++ callbacks and bbox paint optimization remain parent work.

## Typed arrays

flat_geometry(max_bytes) is implemented and returns owned vectors. It does not borrow the RasterDocument and contains no native pointers. It can be prepared for the contour preview before confirmation, so **the host must gate build on accepted status/hash**. The memory cap covers the new flat arrays, in addition to the original document and temporary closed-loop scratch.

| Array | Type / stride |
| --- | --- |
| xy | i64 x,y pairs; IDs are pair indices; divide by 1048576 for processing pixels |
| source_vertex_ids | u32 per derived vertex; UINT32_MAX for an interior derived point |
| edges | repr(C) FlatEdge, eight u32 / 32 bytes: from,to,left_label,right_label,left_region,right_region,chain,0 |
| loops | repr(C) FlatLoop, four u32 / 16 bytes: first_index,index_count,source_region,label |
| indices | u32 global derived IDs, with first ID repeated to close every ring |
| chains | repr(C) FlatChain, eight u32 / 32 bytes: first_edge,edge_count,first_source_edge,source_edge_count,first_curve,curve_count,component,0 |
| source_edges | u32 raw edge_id*2+reversed, per-chain offset ranges above |
| curves | six i64 / 48 bytes: from_x,from_y,control_x,control_y,to_x,to_y |

Raw graph XY is u32 pairs and source edge records are from,to,leftLabel,rightLabel,leftRegion,rightRegion (six u32). Region/label incidence is never inferred from color-equal positions. Missing regions use UINT32_MAX; void label is 0. Palette IDs are not necessarily dense among surviving materials. Only entries with final_pixels>0 are manufactured.

The authoritative source graph and full source loops remain in the owned Rust document; they need not be serialized through JSON. Raw graph and chain provenance suffice for source/derived overlays; the parent may expose more typed source-loop arrays for debugging if needed.

Raster RGBA/labels buffers stay owned by the leased document. Labels are row-major u16, working width*height elements. Original RGBA uses original oriented dimensions; resampled and label-preview RGBA use working dimensions. **The label-preview RGBA is not a rasterization of the curved output.** UI overlays/renders the shared derived curves/contours to show the geometry being accepted. Parent may encode a display PNG using its existing established encoder; this crate does not make a second hidden rendering decision.

## Result summary block

Proposed buffer kind 1 is exactly 256 bytes, LE; zero unused/reserved fields. Native host reads the same bytes as WASM. Multi-byte arrays are aligned on their scalar alignment. For WASM, getters return linear-memory offsets; for native, const pointers. A zero length means do not dereference the pointer.

| Byte offset | Field |
| --- | --- |
| 0,4,8 | u32 magic 0x50534152 (RASP), schema 2, header bytes 256 |
| 12,16,20 | u32 status (0 Ready / 1 Empty / 2 RequiresConfirmation), generation, flags |
| 24,28,32,36 | u32 input width,height; processing width,height |
| 40,44 | u32 material count, opaque region count |
| 48,52,56,60 | u32 raw vertex/edge and derived vertex/edge counts |
| 64,68,72,76 | u32 loop count, chain count, quadratic count, units per pixel 1048576 |
| 80,88,96,104 | f64 width_mm,height_mm,mm_per_pixel_x,mm_per_pixel_y |
| 112 | f64 derived_geometry_error_bound_mm |
| 120 | u64 total_linf_bound_units |
| 128..159 | 32-byte derived proposal SHA-256 (hex decoded, not UTF8) |
| 160..191 | 32-byte original RGBA SHA-256 |
| 192..223 | encoded source SHA or confirmed-render original source SHA; zero for ExplicitSrgb |
| 224,232 | u64 work units, estimated processing bytes |
| 240,244,248,252 | u32 attenuation exponent, rejected trial count, bound domain=1 final processed grid, reserved=0 |

Flags: bit0 encoded source retained, bit1 confirmed renderer origin, bit2 constrained identity, bit3 requires confirmation; other bits zero. Width/height and all counts must agree with buffer lengths before host creates views. Preview input must have exactly width*height*4 bytes with checked multiplication. Parent serializes summary explicitly, not a platform-dependent struct cast.

Metadata kind 18 is proposed bounded TLV (<=1 MiB, excluding original bytes/pixels/arrays). Every record: tag u16, flags u16 (bit0 required/critical), payloadBytes u32, payload, then zero padding to 8 bytes. Unknown critical tag fails; unknown optional tag can be preserved/skipped. No duplicate singleton tags.

| Tag | Payload |
| --- | --- |
| 1 | singleton UTF8 semantics_version |
| 2 | singleton UTF8 geometry algorithm |
| 3 | singleton UTF8 palette algorithm |
| 4 | singleton UTF8 resampling algorithm |
| 5 | repeat diagnostic: codeBytes:u32,messageBytes:u32, code UTF8, message UTF8 |
| 6 | repeat confirmation reason UTF8 |
| 7 | repeat rejected geometry trial UTF8 (at most 13) |
| 8 | singleton EXIF primary value:u32 (0 absent), applied:u32 boolean |
| 9 | singleton eight u64: smooth/simplify/round/flatten bounds, source chain point count, simplified point count, output vertex count, curve count |
| 10 | singleton twelve u64: source alpha void/partial/opaque, processed alpha void/partial/opaque, alpha converted, denoise changed, palette recolored, background excluded pixels, excluded regions, unmerged small regions |

Keep original EXIF bytes in the encoded original / Rust SourceImage. Per-region merge decisions are typed bulk records if exposed; suggested separate kind 19: source_region/from_label/to_label/reserved as four u32, pixels/shared_unit_edges as two u64 (32-byte stride). They must not be expanded into an unbounded diagnostic string. Full structured Rust metadata is available directly inside the one module.

## Controller mapping and remaining limits

For the controller's optional derivative {width,height,data:Uint8ClampedArray,pixelSizeMm,preview PNGbytes}, verify data.byteLength equals width*height*4; copy its exact bytes into the registered buffer. Uint8ClampedArray is a byte view, not proof of color space or alpha policy. Carry renderer identity, settings SHA and confirmation ID in metadata, mapped to RgbaOrigin::ConfirmedRender. Do not invent that provenance from a PNG preview.

If pixelSizeMm is a positive scalar on the original derivative, set design_long_edge_mm = max(width,height)*pixelSizeMm after finite/domain checks. If it is an anisotropic pair or includes another crop/affine transform, do not average it: the current crate preserves the original aspect ratio under one long-edge extent. Parent must reject that mapping or explicitly implement/validate its intended transform. The working GridTransform may itself have distinct sx/sy after rounded resampling dimensions.

Keep original encoded bytes as the primary SHA asset and the confirmed raster derivative as a separate immutable SHA asset, along with optional preview PNG bytes. Neither a PNG display asset nor segmentation preview can replace the original. Acceptance is bound to the derived proposal SHA, not merely a source SHA.

The currently read runtime input cap is **16 MiB per registered input / four inputs**; crate defaults allow 32 MiB encoded input and up to 64 MiB decoded RGBA. The adapter must apply the tighter runtime cap (RGBA <=4,194,304 pixels for that input size) or parent must deliberately extend/chunk the registered-input transport. This sidecar does not silently alter that cap. Empty inputs fail typed. The raster limits block only tightens within crate hard ceilings and remaining host memory.

Current runtime snapshots allow <=8 published results, <=384 MiB aggregate and <=64 leases each. Raster originals/previews/graphs/flat arrays and pending confirmation reprocessing must join that accounting; don't count only the small result header. An accepted copy can temporarily coexist with its proposal; reject resource exhaustion without evicting live leases. Decoder estimates are not a substitute for the Worker watchdog.

After mm/nm quantization, revalidate finite <=10000 mm coordinates, incidence, collapsed features, winding, contact policy and geometry. Point contacts can survive 2D certification and still need an extrusion policy. Building mesh/printing and JSON-free ARCH/1 export remain parent scope.

