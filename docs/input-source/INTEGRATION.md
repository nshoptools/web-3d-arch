# Standalone source adapter API

Import src/input/index.mjs (types: index.d.mts), or the individual text-source.mjs and native-color-renderer.mjs modules. Only relative pure ESM imports occur in production. Initialization and asset access belong to the parent Worker:

~~~js
import * as hb from './harfbuzz-engine.mjs';
import {createFontSourceWithHarfBuzz} from './font-source-core.mjs';
import {createTextSourceAdapter, createNativeColorRenderer, VERSION}
  from './index.mjs';

// engine is the parent's already-created arch-kernel ABI2 instance.
// If the parent initialized hb already, do not initialize it again.
hb.initializeHarfBuzz(engine);
const adapter = createTextSourceAdapter({
  createFontSource: (bytes, entry) =>
    createFontSourceWithHarfBuzz(bytes, entry, hb),
  readBytes: hostReadCatalogBytes,
  collections: hostSelectedCatalogCollections,
  renderer: createNativeColorRenderer({
    engine: hostBrowserEngine,
    version: hostQualifiedBrowserVersion,
  }),
});
const control = {
  isCurrent: expected =>
    expected.sourceId === currentSource.id &&
    expected.revision === currentSource.revision,
  onProgress: progress => hostPostProgress(progress),
};
const prepared = await adapter.prepare({
  version: VERSION,
  kind: 'text',
  id: 'text-job-1',
  expected: {sourceId: currentSource.id, revision: currentSource.revision},
  text: 'Tiếng Việt\nĐặng',
  font: exactInterCatalogEntry,
  size: {value: 24, unit: 'pt'},
  variations: {wght: 600, opsz: 24},
  lineSpacing: 1.2,
  letterSpacingMm: 0,
  bendDegrees: 0,
  align: 'left',
  placement: {xMm: 0, yMm: 0, rotationDegrees: 0},
}, control);
~~~

For the separately qualified bounded main-thread color renderer, see MAIN-CANVAS-BRIDGE.md. Inject createColorRendererClient(privatePort) as renderer after the host explicitly attaches its endpoint. WebKit needs that bridge for actual native color preview on this Windows toolchain; createNativeColorRenderer still reports its real Worker canvas gap. The bridge has the lower 512-pixel/4,096-paint-operation limits and never downscales a request automatically.

Font bytes are not embedded in the command. readBytes receives a cloned trusted catalog record and {signal}; it must resolve only host-authorized assets. It returns Uint8Array or ArrayBuffer. The adapter copies and verifies bytes and SHA-256, then calls the supplied font reader, which checks actual UPEM/variation axes. It never opens a URI itself. Preserve font license, source revision and original catalog metadata in those records.

Build collections from src/assets/emoji/collections.json and its selected catalogs. A color collection has id, style, items, explicitly available fonts, optional aliases and components. Each font record includes id and exact hash. A monochrome collection additionally has defaultFontId and fontHash matching its catalog. Do not add color-only components to monochrome. SVG selections need the chosen item's vectors entry plus its exact bytes count from assets-lock.json. Collections and metadata are trusted, bounded host inputs; this is not a catalog network loader.

~~~js
const preview = await adapter.prepare({
  version: VERSION,
  kind: 'emoji',
  id: 'emoji-job-1',
  expected: {sourceId: currentSource.id, revision: currentSource.revision},
  collectionId: 'noto-color-emoji',
  text: '👩🏽‍💻',
  source: {kind: 'COLRv1', font: exactNotoColrv1CatalogEntry},
  size: {value: 20, unit: 'mm'},
  raster: {width: 512, height: 512},
}, control);

// Present preview.conversion and the actual image to the host's confirmation flow.
// A renderer-gap result has no conversion and cannot be confirmed.
if (hostConfirmedExactProposal && preview.proposalHash) {
  const accepted = await adapter.confirm({
    id: preview.id,
    expected: preview.expected,
    proposalHash: preview.proposalHash,
    decision: 'accept-source-conversion',
  }, control);
  // accepted.rasterInput is bounded, actual RGBA8 plus pixelToSourceMm.
  // Parent now proposes/accepts color reduction, then calls its Boole raster path.
}
~~~

Other explicit sources:

| Selection | Result | Coordinate interpretation |
| --- | --- | --- |
| Text / monochrome font | kind=paths; shared commands, glyph instances, optional numeric SVG | path mm coordinates plus instance matrix; already includes design placement |
| SVG | kind=svg; originalSvg, original metadata, sourceToMm | matrix maps raw viewBox user coordinates into canonical mm; parse original bytes through existing validated parser |
| COLRv1 | kind=color-source; shape, full paint graph, original font, preview/proposal or gap | paintToSourceMm applies font-units scale, glyph x/y once, then placement |
| CBDT/CBLC | kind=color-source; shape, embedded PNG/font hashes, native bearings, preview/proposal or gap | bitmapBoxMm is before placement; preview pixelToSourceMm includes placement |

The selected SVG's em-like size denotes its viewBox height; font sources use font em. These original sources can have different intrinsic proportions and appearance. The host must not relabel one as another.

For generated text SVG, the parent parser normalizes the root viewport into its own mm frame. Apply svgExport.parserViewportToSourceMm to recover canonical source coordinates, or consume geometry directly. For original SVG, the parent parser must return its validated viewport dimensions/transforms; combine its viewport normalization with sourceToMm. Do not assume SVG user units already equal mm.

Every text instance records its cluster range in canonical UTF-16 plus the corresponding original range, actual glyph positions, variation coordinates and line/run identity. Do not add xOffset/yOffset again. Empty glyphs have no ink but remain in layout. Place baseline/line/cluster geometry once; do not apply the request placement again to already placed instances or preview pixel transforms.

prepare is atomic with mandatory isCurrent checks before work, after asynchronous asset/hash/render/yield boundaries, and immediately before return. cancel(jobId) cancels an active job or clears a pending proposal. AbortSignal and late revision changes have equivalent publication protection. Send cancellation/revision messages to the Worker; the default yieldControl uses timer tasks so those messages run. An injected scheduler must also yield to tasks for message-driven cancellation. Avoid supplying a perpetual microtask-only scheduler in production.

prepare returns owned arrays. Changing or transferring returned arrays cannot alter cached fonts or the internally retained proposal. Confirm requires the exact pending id, expected token and proposal hash and rechecks current revision. New preparation supersedes the previous pending proposal. The adapter never increments a project revision, persists, edits original bytes, writes history or sets final budgets. Host storage/controller remains authoritative.

Important failures include INVALID_INPUT, INVALID_VARIATION, HASH_MISMATCH, MISSING_GLYPH, ITEMIZATION_REQUIRED, UNKNOWN_COLLECTION, UNKNOWN_EMOJI, COLLECTION_SOURCE_MISMATCH, CATALOG_GLYPH_MISMATCH, FONT_READER_ERROR, RESOURCE_LIMIT, BUSY, CANCELLED, STALE_SOURCE, CONFIRMATION_REQUIRED and NO_PROPOSAL. Renderer gaps are explicit source-preserving preview results. New/unknown paint operations fail rather than disappear.

Resource constraints:

| Bound | Enforced value |
| --- | --- |
| Font bytes / generic asset bytes | 16,000,000 each |
| Original SVG accepted by this adapter | 1,048,576 bytes |
| Cached font readers | 4 and 64,000,000 bytes total, no eviction/reload |
| Text | 500 graphemes; 16,000 UTF-16 units; 64 lines; 128 runs |
| Prepared geometry | 4,096 glyphs; 100,000 unique path commands |
| Paint | 65,536 operations; stack depth 32; 2,048 color stops |
| Bitmap decoding | PNG max 4,096 edge and 4,194,304 decoded pixels |
| Preview | 5..1,280 each edge; max 1,638,400 pixels / 6,553,600 RGBA bytes |
| Coordinates / em | ±10,000 mm control hull; .001..1,000 mm em |
| Work / lifetime | 5,000,000 accounted units per preparation; 256 preparations per adapter |

These bound the adapter's work products, not all native memory. Hash/copy/readback can temporarily duplicate buffers. Typical Inter + Noto mono/COLRv1/CBDT bytes total about 18.5 MB; reader copies, HarfBuzz heap, outlines and the preview/proposal add memory. Four maximum-size fonts can consume substantially more than the 64 MB cache counter. The supplied reader uses native objects/finalizers and performs synchronous bounded extraction within the Worker. The parent must use a Worker/heap watchdog and recycle on its memory/time policy (recommended per-source deadline 10 seconds and total Worker cap aligned with the parent's 384 MiB budget). No wall-clock preemption or global heap budget is falsely claimed by this adapter. The project can retain eight imported fonts while a source Worker activates at most four.

Byte hashing and artifact hashing are SHA-256. artifactHash covers source, actual arrays, commands, transforms and metadata, with binary fields represented by length/hash. proposalHash binds artifact identity, expected token and conversion details. Source-asset bytes, original PNG and original Unicode survive independently of a proposed preview.
