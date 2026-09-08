# Committed source SVG adapter

This implementation adds a source-only provider for Ohm's current
SourceSnapshotProvider. It emits real SVG with model=null, using the parent's
existing unified Module and operation scheduler. It never constructs an app
ModelLease or a product recipe.

## Parent integration

```js
import {createSourceSVGExport} from './source-svg-export.mjs';
const sourceSVG = createSourceSVGExport({
  context: applicationContext, // also returns current assetsMap
  kernel,                     // existing ensureRuntime / operation
  sources,                    // existing createApplicationSources result
});
const exporter = createExportAdapters({
  ...existingBindings,
  context: applicationContext,
  sourceSnapshot: sourceSVG,
});
```

The final factory takes exactly context/kernel/sources. No optional helper is
required. API-EARLY's possible sourceContexts hook was exploratory; this file and
source-svg-export.d.mts specify the implemented binding.

Parent supplies `{state,userId,projectId,sessionKey,headHash,model,assetsMap,
exportOptions}`. Return null immediately after losing authorization. sessionKey
must change on account/project reset, including A -> B -> A; use the current
epoch:projectContextGeneration value. headHash is domainStateFingerprint(state).
assetsMap contains the current owned Uint8Array for each source.assetHashes entry.

After the source adoption transaction commits, await
`sourceSVG.refresh({control})`, then recalculate export formats. Apply the same
hook after restore/reopen, text/artifact recapture, source replacement, material
recolor/exclusion and confirmed raster conversion. Refresh is independent of
product build and printer qualification. Unaccepted conversion remains a source
decision; this provider cannot approve it. When only a raster gesture is committed,
first surface the existing source conversion proposal, commit the host's explicit
approval, then refresh.

Refresh is an async operation: retain its exact ticket and signal, serialize it
with other uses of kernel.operation, and cancel it when the context changes.
Sources' text and raster services also use that same scheduler. Never allocate a
native generation or instantiate another Module here. On auth/project/runtime reset,
call sourceSVG.reset() immediately and discard pending results; dispose() permanently
retires this provider. Its reset does not reset the shared Module or other clients.

describe(context) performs synchronous validation of a private prepared cache. It
does no shaping or I/O. It reports unverified with an actionable reasonCode until a
fresh proof exists. acquire requires the exact descriptor, export context/ticket
and owned dependency copies. Its lease serializes SourceSVGOptions
`{filename,inspection,units:'source',side:'source',color:'source'}`; release is
idempotent. A lease becomes unusable on source change/reset, replacement refresh
or retirement. Model presence, target fit and slicer qualification do not gate SVG.

## What is proved and retained

Every referenced dependency is copied before the first await/hash. Actual byte
hashes and the committed head are checked. Subsequent guards compare current bytes
to those private copies, including in-place mutation. Full material IDs, explicit
sourceKey/contextKey/nativeKey mappings, geometry hashes and complete identity
ledger tuples/hashes are checked; neither color/order nor truncated hashes selects
identity.

Raw SVG is passed through the actual bounded native parser and compared with
committed region bindings. Original bytes are copied unchanged only when they still
represent the current visible source and materials. This preserves curves,
fill-rules, holes, local paint definitions and transforms. Unsupported active,
external, bitmap-embedded or unoutlined-text SVG is rejected explicitly. Native
paint/alpha/gradient limitations still require the existing explicit conversion
route, rather than deletion or a monochrome fallback.

Text/mono emoji are freshly shaped with the actual same-Module text service and
retained font/artwork. Numeric SVG, manufacturing wrapper, original/normalized text,
selection, source records, variation/layout/assembly and claims are compared to
the captured source artifacts. Glyph offsets are not applied again. Normal NFD,
variation, multiline spacing and bend are exercised with real fonts. Self-hashed
uploaded outlines or provenance cannot replace fresh shaping.

Accepted raster/color is replayed through the existing raster prepareRecipe:
original/current RGBA, settings, lineage, all stored derived buffers and exact
persisted consent must match the real native replay. The accepted 31-buffer packet
supplies indexed contours, holes and islands. Its fresh native stable summary
and dimensions must match persisted display metadata; self-rehashing that metadata
cannot change the source viewport. This is a replay of committed consent,
not a new decision. The original encoded/color/font/graph source remains in project
assets. Replaying the accepted raster does not re-certify every original color
renderer or external artwork origin.

The current ROOT API exposes canonical SVG regions through a temporary
client.build({kind:'svg',thicknessMm:.2,longEdgeMm:0,toleranceMm:...}) snapshot.
It may internally extrude to obtain ARCH data. This temporary proof is released;
no completed 3D product or app model is required. Native mesh/parser limitations
on that temporary path remain explicit upstream limits. sourceGeometry and
rasterSourceGeometry are reused; the adapter only decodes already-validated
ring/index/int64 coordinates and writes SVG. It contains no SVG path grammar,
boolean, triangulator or text shaper.

## Coordinates and decisions

Original SVG keeps its own viewport and transforms. Numeric text keeps the real
text producer's source-coordinate SVG and export frame. The manufacturing wrapper
is recreated from fresh producer bytes and compared with the saved wrapper; its
inverse is applied once when current material changes require region serialization.

Native raster kind28 is already X-right/Y-down in mm, matching SVG. It must not be
reflected. Indexed integer nanometres serialize as exact base-10 mm strings;
indices, ring order and hole winding are preserved. The existing canonical hash
domain's label mentions y-up; that label is not used as a coordinate transform.
The source raster contract states Y-down explicitly. No change to that shared
hash protocol is proposed here.

Unchanged SVG plus committed text overlay nests the original SVG and the real
numeric glyph paths with the existing overlay frame; it retains curves. Current
material recolors/exclusions are applied by explicit mapping. When their paint
ownership requires canonical visible regions, the adapter returns a concrete
straight-segment SVG candidate and a changes description. Ohm hashes those actual
bytes and uses the controller's existing export proposal/confirmation. No
approximation is approved by this provider. Accepted raster's already-confirmed
indexed regions introduce no additional conversion; recolors/exclusions still
affect the exported graph. Excluding every region intentionally yields an empty
SVG with the same source viewport.

The artifact's qualification is source-region revalidation only. Total continuous
source error, physical fit, slicer and printer qualification remain unverified.
Pixel resolution or the integer grid is not micron accuracy. Export metadata
identifies the exact source/head/dependencies/output hash and current material
mapping. Original source assets are retained in the project, not embedded wholesale
in the SVG download.

## Limits and errors

The provider bounds 256 dependency hashes / 64 MiB combined bytes, 1 MiB per
native source SVG, 16 MiB SVG output, 2 MiB finite plain JSON, 100,000 JSON nodes,
depth24, 256 visible regions, 200,000 indexed points and four concurrent export
leases. Existing native/source/parser limits can be stricter. Zero-byte native
buffer records remain verified internally but are omitted from Ohm's positive-byte
dependency list. All other original/derived dependencies remain checked.

These are input/work bounds, not an RSS cap or a wall-clock guarantee. Owned copies,
SVG strings, parser storage and shared native memory coexist. Synchronous describe
does a bounded byte comparison; heavy shaping, raster processing and native proof
run in the existing Worker. No network/filesystem code, raw SVG DOM insertion,
object URL, Atomics.wait or main-thread waiting is added by this provider. Trusted
host services own catalog retrieval and the capability-tested private renderer
port, including WebKit fallback.

SOURCE_SVG_REFRESH_REQUIRED means refresh after commit/reopen.
SOURCE_SVG_REGIONS_REQUIRED / RASTER_SOURCE_CONVERSION_REQUIRED means complete the
existing adoption or explicitly approve the current source conversion.
SOURCE_SVG_DERIVED_CHANGED / REGION_CHANGED means recapture/rebind from exact owned
source inputs, not mark uploaded metadata trusted. ASSET_HASH and IDENTITY require
restoring exact dependencies or fixing full identity mappings. STALE/CANCELLED/
RESET/RUNTIME never publish a new snapshot. LIMIT is an actionable bounded-input
failure. Inspection mode never bypasses any of these checks.
