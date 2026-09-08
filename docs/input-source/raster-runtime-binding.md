# Raster runtime ABI 1 on root runtime ABI 2

Implemented in kernel/src/abi/raster_runtime. The root Rust static library links
arch-raster-source 0.1.0 (document schema 2) by path. This is the same allocator,
registered-input registry, ID sequence, atomic control block and ARCH/1 snapshot
registry as SVG. There is no second WASM module or bulk JSON geometry interface.
The root C header includes raster-runtime.h. Append patches/raster-exports.json
to the parent's existing exports, including HB and printing exports.

Parent Cargo additions printing-tests = ["test-fixtures"] and unified_printing
are preserved. Apply the supplied deltas to current main; do not replace its
build.rs, CMakeLists.txt or build.ps1. The isolated validation build links current
geometry + mechanics + HarfBuzz. Parent reports its unified printing build and
seven same-module 3MF checks passing; those are parent evidence, not this worker's
printing validation.

## Call lifecycle and leases

Reset a fresh root generation before prepare, confirm or build. Generations are
strictly increasing within the module. The Worker invokes ABI calls serially.
The main thread may read leased bytes and atomically access the control block;
it does not invoke registry mutation APIs concurrently.

prepare_encoded(input, options, limits, generation) detects PNG/JPEG/WebP.
prepare_rgba(input, width, height, options, limits, origin, generation) consumes
straight sRGB8 RGBA with exactly width*height*4 bytes. All arguments named input,
options, limits and origin are registered IDs from arch_input_create/ptr.
Options is required; limits=0 selects runtime defaults; origin=0 is required for
ExplicitSrgb. A pointer/offset is never accepted instead of an input handle.
Each distinct valid listed input is consumed once even on failure. Duplicates,
zero required IDs, stale IDs and wrong handle types reject the entire request.

Prepare success returns one primary immutable raster lease. No acquire is
needed for that reader. All prepare results require a separate confirm operation
before build, including status Ready and cases with no lossy warning.
confirm(proposal, hash_input, generation) consumes a 32-byte registered hash and
borrows the proposal. It checks the payload seal and compares the runtime
proposal hash. It does not repeat decoding or segmentation: the source/geometry
payload is already immutable and privately owned.

The first confirmation creates an accepted lease sharing the payload. A repeated
confirmation, through either the original or accepted handle, returns the same
accepted ID while it is leased, and increments its reader count. Every successful
return owns one lease and requires one release. The immutable accepted summary
retains its first publication generation. If that accepted ID has been fully
released, confirming a still-live original creates a new ID. Failure never
changes a prior raster or mesh lease.

arch_raster_acquire adds a reader and returns the same ID (0 on failure).
arch_raster_release returns 1 on release and 0 on invalid/wrong-type/stale ID.
The last reference invalidates that handle's summary; shared payload arrays
remain alive until their last prepared/accepted owner is released.
No ID is reused. Getters return null/0 for wrong kinds, wrong types or stale IDs.
Do not call snapshot_release/input_release for a raster lease.

All pointers are const, naturally aligned to 8 bytes and immutable while leased.
They carry no ownership by themselves. Recreate JS typed-array/DataView objects
after every potentially allocating call, because memory.grow changes heap views.
The root error pointer is the existing bounded UTF8 buffer; copy synchronously.
The raster numeric error code resets on prepare/confirm/build, not on getters.
Const views are a trusted Worker contract, not a security boundary against
arbitrary code writing the entire WASM heap. Payload integrity is rechecked
before confirm and build to detect accidental writable aliases.

## Exact request blocks

Options: exactly 200 little-endian bytes. At offsets 0..63 are sixteen u32:
version=2, bytes=200, semantics=2, k, res, smooth, minA, denoise, eps, tension,
alphaPolicy, cutoff, matteRGB, paletteCount, backgroundCount, originKind.
At 64 is f64 designLongEdgeMm; at 72 are sixteen u32 palette RGB values;
at 136 are sixteen u32 background labels. Colors use r | g<<8 | b<<16,
high byte zero. Unused colors/background entries and unused alpha fields must
be zero. Palette colors and background labels must be unique.

Catalog defaults are k=4, res=520, smooth=3, minA=5, denoise=1, eps=35,
tension=65, physical long edge 45mm. Defaults do not flatten to a no-op.
Domains: k 2..16; res one of 360/520/720/960/1280; smooth 0..6; minA 0..100;
denoise 0..3; eps/tension integer 0..100; extent finite, >0 and <=10000mm.
Manual values are kept exactly. Semantics are raster-parameters-proposal-v2:
shared-chain binomial passes, eps/200-pixel simplification capsule,
tension/200-pixel quadratic reach, bounded flattening and topology attenuation.
See raster-source/docs/geometry-semantics.md. Slider integers are not mm.

Alpha: 0 rejects partial alpha, 1 thresholds with cutoff 1..255, 2 composites
partial alpha against the explicit encoded-sRGB matte RGB. Fully transparent
cells are void label 0 and are not a material. Alpha/palette/merge/resample
decisions and confirmation reasons are preserved.

OriginKind=0 means explicit straight sRGB8. OriginKind=1 requires the registered
origin block: source SHA256[32], renderer-settings SHA256[32], rendererUTF8Len:u32,
confirmationUTF8Len:u32, renderer UTF8, confirmation ID UTF8. Both strings are
1..256 bytes, valid UTF8 and contain no NUL. Exact block size is 72+lengths.
Encoded prepare rejects originKind=1. No SVG renderer, Canvas, font or image I/O
is invoked. Rendered RGBA retains its raw bytes and source/settings hashes;
the unprovided encoded original stays in the controller's SHA asset map.

Limits: optional 104 bytes: version=1, bytes=104, twelve u64 in header field order.
Values are checked before narrowing and must be positive and <= runtime defaults.
Increasing beyond the adapter's caps is a typed error, not silent clamping.
Effective values are returned in kind 21 and bound to the proposal.

| Limit | Runtime default / upper cap |
| --- | --- |
| source bytes / registered input | 16 MiB |
| header dimension | 32768 |
| decoded pixels | 4194304 |
| decoded bytes | 32 MiB |
| decoded metadata | 1 MiB |
| crate estimated working bytes | 96 MiB |
| processing pixels | 1280*1280 |
| unique colors | 262144 |
| source/derived vertices, edges, regions | 1000000, 2000000, 100000 |
| crate work units | 250000000 |

Root inputs retain the existing four-handle count cap. All owned input capacities
are charged, including consumed buffers until the consuming call finishes.
Prepared payloads are capped at 64 MiB including aligned storage plus a
conservative 4096-byte container charge; each handle adds a 1024-byte charge.
Maximum eight raster handles, 64 readers each. Shared payloads are charged once.
The aggregate root cap is 384 MiB, including snapshots, file outputs, inputs,
raster payloads and active reservations.

Prepare reserves workingLimit + 3*decodedLimit + 2*64MiB packing/flat storage +
32MiB quantization scratch + 2MiB metadata + 2*sourceInputBytes before processing.
With default limits that is 354MiB + 2*input bytes, in addition to registered/
retained ownership. Therefore legal per-field dimensions can still fail aggregate
admission; callers may deliberately request lower limits or release old results.
Quantization scratch admission uses 256 bytes per vertex + 384 bytes per edge +
4096, capped at 32MiB. Quantization has at most min(workLimit,10000000)
nonincident pair checks. Build reserves 128MiB and uses the root's existing
200000-contour-point and snapshot/output limits.

arch_raster_owned_bytes reports logical root ownership + reservations, not RSS,
allocator overhead or peak third-party allocations. These are conservative
admission and output limits, not interception of every Rust/C++ allocation or
an OS OOM guarantee. Decode and graph libraries retain their own explicit
bounds; keep the root watchdog and module maximum-memory configuration.

## Published buffers

All multibyte values are LE. IDs are dense within each specified graph and never
pointers. UINT32_MAX is absent region/source. Directed references encode id*2+
reversed. Region IDs refer to surviving opaque regions; void is label 0.

| Kind | Data |
| --- | --- |
| 1 | 256-byte RASP summary below |
| 2 | Original encoded bytes; empty for RGBA prepare |
| 3, 4, 5 | Original, resampled, final label-preview RGBA8 |
| 6 | Row-major u16 labels; width*height |
| 7 | u32 stride24: label, RGBA (R low byte), initialPixelLow/High, finalLow/High |
| 8 | u32 x,y source grid vertices |
| 9 | u32 stride24: from,to,leftLabel,rightLabel,leftRegion,rightRegion |
| 10 | i64 x,y derived dyadic points; scale 1048576 units/pixel |
| 11 | u32 original source vertex ID or UINT32_MAX per derived point |
| 12 | u32 stride32: from,to,leftLabel,rightLabel,leftRegion,rightRegion,chain,0 |
| 13 | u32 stride16: firstIndex,indexCount,region,label |
| 14 | u32 derived vertex indices; closed rings include repeated first ID |
| 15 | u32 stride32: firstEdge,edgeCount,firstSourceEdge,sourceEdgeCount,firstCurve,curveCount,component,0 |
| 16 | u32 directed raw source edge references for each chain |
| 17 | i64 stride48: quadratic fromX,fromY,controlX,controlY,toX,toY |
| 18 | Bounded metadata TLV, described below |
| 19 | stride32: four u32 sourceRegion,fromLabel,toLabel,0; u64 pixels,sharedUnitEdges |
| 20,21,22 | OptionsV2, effective LimitsV1, original origin block |
| 23 | u32 stride48: id,label,pixelLow,pixelHigh,x0,y0,x1,y1,touchesBorder,firstLoop,loopCount,0 |
| 24 | u32 stride16 raw loops: firstDirectedEdge,count,region,label |
| 25 | u32 directed raw edges for raw loops |
| 26 | u32 label adjacency pairs from the certificate |
| 27 | u32 pinned raw source vertex IDs |
| 28 | i64 x,y global mm points in units of 1nm; SAME IDs as kind 10 |
| 29 | u32 directed chain references for derived loops |
| 30 | u32 stride16: sourceRegion,sourceLoop,firstChainReference,count |
| 31 | Exact original EXIF bytes when present |

Summary u32: offset 0 magic 0x50534152; 4 schema2; 8 size256; 12 status
0Ready/1Empty/2RequiresConfirmation; 16 first-publication generation; 20 flags
bit0 encoded, bit1 confirmed renderer, bit2 constrained identity, bit3 source
proposal needs confirmation, bit4 this lease accepted. On accepted leases bit3
clears and status 2 becomes 0; original reasons remain in metadata.
24/28 original dimensions; 32/36 processed dimensions; 40 material count;
44 region count; 48/52 raw vertex/edge counts; 56/60 derived vertex/edge counts;
64 loops; 68 chains; 72 quadratic spans; 76 dyadic scale.
f64 at 80/88 width/height mm, 96/104 mm per processed pixel x/y,
112 geometric bound mm relative to final labeled cells (before root quantization).
u64 at 120 summed dyadic L-infinity geometric bound.
128..159 runtime proposal hash; 160..191 original RGBA hash;
192..223 encoded-original or confirmed-render original-source hash (zero for
ExplicitSrgb). u64 at 224 crate work units, 232 estimated working bytes.
u32 at 240 attenuation steps, 244 rejected trials, 248 bound domain=1 (final
label grid), 252 reserved0. This is not a printer or source-continuous error bound.

## Metadata TLV

Each record: tag:u16, flags:u16 (currently 0), payloadLength:u32, payload bytes,
zero padding to 8 bytes. Total <=1MiB. Unknown noncritical tags may be skipped.
Tags 5/6/7/14 repeat; other present tags are singleton.

| Tag | Payload |
| --- | --- |
| 1..4 | UTF8 semantics, geometry algorithm, palette algorithm, resampling algorithm |
| 5 | u32 codeLength,messageLength; UTF8 diagnostic code,message |
| 6,7 | UTF8 confirmation reason / rejected topology trial |
| 8 | u32 EXIF orientation (0 absent), applied |
| 9 | eight u64: smoothing,simplification,rounding,flattening bounds in dyadic units; source,simplified,output vertex counts; curve count |
| 10 | twelve u64: input transparent/partial/opaque, processed transparent/partial/opaque, alphaChanged,denoiseChanged,paletteRecolored,backgroundPixels,backgroundRegions,unmergedSmallRegions |
| 11 | four u32 components,loops,holes,junctions; u64 intersectionPairs,nestingRayTests |
| 12 | u64 changedPixels,alphaChangedPixels; f64 maxAbsPremultipliedRGBAError,meanSquaredError |
| 13 | UTF8 preview comparison domain |
| 14 | u32 hasBound,stageLength,noteLength,0; f64 boundMm (0 when absent); UTF8 stage,note |
| 15,16 | UTF8 boundary algorithm / root quantization policy |
| 17 | u32 sourceFormat (0RGBA/1PNG/2JPEG/3WebP), encodedWidth,encodedHeight,downsampled |
| 18,19 | UTF8 pinned decoder / topology certificate algorithm |
| 20,21 | UTF8 color interpretation / note |
| 22 | u32 declaredSRGB, colorInterpretationNeedsConfirmation |
| 23 | 32 bytes original raster-source crate proposal hash |
| 24 | f64 boundaryApproximationPixels,processingPixelDiagonalMm; u32 hasSourceTotalBound,paletteIterations; f64 sourceTotalBound (0 if absent) |
| 25 | u64 conservative quantization sweep radius in dyadic units,checkedPairs; f64 per-axis mm conversion+rounding bound |
| 26,27 | UTF8 source coordinate convention / original source quantization note |

The preview is the processed label grid, not a rasterization of the smoothed
contours. Parent may overlay kinds 10/12/17 or 28/12; PNG encoding is the parent's
existing safe source-preview/png-encode path. No Canvas capability is required.

## Confirmation hash and quantization

SHA256 input: ASCII arch-root-raster-proposal-v1 followed by NUL; canonical
256-byte base summary; then for kinds 2..31, u32 kind, u64 length, exact bytes.
Canonical summary has generation0, proposal-hash bytes zero, no accepted flag,
and estimated-working-bytes at 232..239 zero. That counter depends on usize
width and is diagnostic only; it remains visible in the actual summary.
All source bytes, derived points including kind28, labels, palette, graph,
curves, certificate, options, effective limits and decisions are hash-bound.
The crate hash is retained in TLV23; never substitute it for the runtime hash.

The global kind28 table is produced once with root quantize_mm ties-to-even.
A conservative straight-line deformation check requires disjoint swept tubes
for nonincident edges and stable rays at incident vertices. Exact i128 SAT
predicates test source dyadic capsules; RTree only supplies candidate pairs.
A determinant/dot margin controls incident rays, edge collapse is forbidden,
and every ring retains nonzero signed orientation. This preserves the planar
embedding, hence holes, islands and adjacency under this conversion. Narrow
or near-contact configurations without that conservative certificate return
QUANTIZATION_UNCERTIFIED, rather than silently erasing or repairing topology.

The sweep radius includes 0.5nm rounding per axis, a conservative binary64
conversion term over the 10000mm domain, and two dyadic units. It is not added
to any fictitious source-continuous or printer-fit guarantee. Subsequent C++
boolean/mesh operations have the existing root guards; their aggregate
numerical error remains separate from this source certificate.

## Build and source assembly

arch_build_raster(accepted, thicknessMm, generation) checks acceptance,
integrity, thickness finite and 0<thickness<=10000, and uses global kind28
points for every material contour. It preserves nonzero winding and rings,
translates palette RGBA-byte ordering to root RRGGBBAA, and calls the existing
controlled C++ geometry path. It returns a root ARCH/1 primary lease. Part.source_index indexes surviving labels in ascending label order (derive that list from unique labels in kind13); colors are the root RRGGBBAA values.
Its small metadata says kind=raster-source-context and sourceAssemblyRequired=true.
This is flat material extrusion only, not an assembled product or mechanical
parameter implementation. Empty source yields explicit EMPTY_CONTEXT at build.

The controller keeps original encoded bytes and SHA asset records. For a
confirmed raster derivative with isotropic pixelSizeMm, prepare extent is
max(width,height)*pixelSizeMm. Keep the raster lease while source assembly needs
labels, original, curves or topology; mesh snapshot lifetime is independent.
Anisotropic/affine placement belongs to a versioned assembly adapter; do not
invent a scalar size or reuse an old acceptance after changing extent/options.

Prepare checks cancellation before work, after decoder and after processing,
during packing/quantization and immediately before publication. Underlying
decoder and segmentation calls have no interrupt callback. Main-thread atomic
cancellation can therefore be observed at the next checkpoint; keep the Worker
watchdog. Build also uses root C++ progress/cancel callbacks. No partial result
is published on error, stale generation or cancel. Cancellation's final check
is the publication linearization point: a later cancellation concerns a job
that is already complete.
