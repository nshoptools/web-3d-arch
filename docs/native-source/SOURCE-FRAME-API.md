# Source frame API 1 — binding contract

Implementation/self-tests; not an independent review. This extension uses the
existing root Module, registered inputs, generation/control and snapshot leases.

## Client

`await engine.sourceFrame(sourceLease, {
  version: 'arch-source-frame/1',
  sourceHash: '<64 lowercase hex of original asset, matching source metadata>',
  matrix: [a,b,c,d,txMm,tyMm]
}, {generation})` returns the ordinary owned SnapshotLease. Invoke within the
existing kernel.operation scheduler; retain sourceLease until it resolves.
Matrix convention: x'=a*x+c*y+tx, y'=b*x+d*y+ty.

The 2x2 linear block must be an exact signed permutation (eight D4 isometries).
Translation is finite, within +/-10000mm, rounded ONCE from the exact supplied
binary64 value to integer nanometres, nearest/ties-even. No general affine,
scale/shear or arbitrary-angle rotation. Every transformed point and full source
rectangle corner must remain within +/-10000mm. Linear geometry/IDs/incidence
remain exact on this grid; reflection reverses contour traversal and edge
directions once. Translation error is at most 0.5nm per axis (relative to that
binary64 request only). The API does not claim a total source/manufacturing bound.

Result is planar ARCH/1 with indexed integer XY, contours, parts and shared
edges; zero triangle/3D-vertex arrays. It is a source-assembly context, not a
finished product or export. Original source snapshot/metadata remain unchanged.
Use original lease for every new placement; applying twice is rejected to avoid
hidden accumulated rounding. Only svg/raster-source-context kinds are accepted;
product or bundled contexts are rejected.

`serviceCapabilities.sourceFrameVersion === 1` is obtained from the same Module
version getter and validated by the client, never inferred from method presence.

## Registered wire and exports

`uint32_t arch_source_frame_version(void)` => 1.
`uint32_t arch_source_frame(uint32_t input, uint32_t generation)` => one primary
snapshot lease or 0 with bounded root error. Consumes a valid input even on error.
No raw pointers, second allocator, AFEX fields or new token namespace.

Wire ASF R (`ASFR`) exactly112 bytes, little endian:
- 0:u32 magic0x52465341; 4:u32 version1; 8:u32 length112; 12:u32 flags0.
- 16:u32 source snapshot ID;20:u32 source snapshot generation.
- 24:32bytes original source SHA256.
- 56:6xf64 matrix [a,b,c,d,tx,ty].
- 104:8bytes zero. Reject trailing bytes/unknown flags.
Generation checks before work, bounded loop checkpoints and before publication.
Input charge/work reservation/result charge share the existing root byte cap.
Stale/released/foreign leases are rejected; unpublished results released on
postMessage/cancellation failure. Worker release queue prevents racing its job.

## Metadata

All metadata fields already present on the source lease are copied unchanged.
SVG root metadata contains paints, diagnostics and importLedger; ASFR does not
add bulk original SVG bytes or source curves to that JSON metadata. The native
SvgBuild.source and host source asset/curve records remain their owners.
For a text-rendered SVG, sourceHash here is the parsed SVG derivative hash from
the lease, not the hash of the original text/font recipe. The host retains and
validates that original text/font authority separately. For raster, it is the
accepted raster original source hash. Existing raster sourceRegions/options or
other fields are retained when present; no new grouping policy is implied.
`planarContextOnly:true`, `sourceAssemblyRequired:true` are added.
`sourceFrame` contains version, requestedMatrix, linearMatrix, translationGrid,
gridScalePerMm:1000000, rounding:'binary64-exact-nearest-ties-even/1',
translationErrorUpperMmPerAxis:0.0000005, sourceSnapshotId,
sourceSnapshotGeneration, sourceSnapshotSha256, sourceMetadataSha256,
geometrySha256 (result ARCH bytes), requestSha256 (exact ASFR input),
domainCornersGrid, totalErrorBoundMm:null. IDs/generation are lease provenance;
persisted original asset/settings remain the reproducible source authority.

Raster context metadata additionally includes sealed `widthMm`, `heightMm`,
`rasterFrame:{version:'arch-raster-frame/1',widthPx,heightPx,processedWidthPx,
processedHeightPx,widthMm,heightMm,mmPerPixelX,mmPerPixelY,
axis:'x-right-y-down',originMm:[0,0],source:'sealed-RASP/2'}`.
These values come from accepted RASP offsets24..36 and80..104; dimensions are
the complete image rectangle, including transparent/background margins.
No bounding-box inference, new raster processing or palette/areaPercent policy.

## Integration files

New src/core/source-frame.mjs (+d.mts), src/kernel/src/abi/source_frame.rs,
src/kernel/native/source-frame.h. Focused additions to engine-client/worker,
abi.rs, native/runtime.h and native/product-exports.json; one raster metadata
addition. No build/CMake replacement or app adapter edit is required.
