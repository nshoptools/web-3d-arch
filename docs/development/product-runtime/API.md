# Product runtime ABI1

2026-09-08. Root runtime ABI2 / ARCH1 stays intact. This is a bridge into the
existing Rust/C++/HarfBuzz/lib3MF Module, not a second WASM. Source assembly ABI1
and mechanics ABI2 **semantics2**, source datum extension1, are required.

The [R2 release blockers](../../reviews/20260908-mechanics/R2-ADJUDICATION.md) remain open: strap bevel may remove a roof
without rejection, and source height MM/layer datum/reference may not meet the
actual start face. This bridge preserves those declared values byte-for-byte;
R1 success is not a qualification of those defects. It must propagate a later
source/mechanics rejection. Mechanics semantics is pinned to2 in this build;
a future semantics bump requires explicit compatibility qualification/update,
not suppression of its errors or parameter repair.

## Binding and operation

Import packProductRequest/createProductOperations/readProductSemantics from
src/core/product-operations.mjs. The packer consumes the unchanged
createMechanicsDomainAdapter(domain)(project) record pack. Parent selectRecipe
supplies all effective records, nine explicit material roles, one region mapping
for every actual canonical source part, optional text groups and bevel overrides,
applied upstream records1..7, persistent source/region/provenance IDs, source SHA,
authoritative current project SHA/head and revision. There are no generated
semantic IDs from colors or array order. BigInt or decimal strings preserve u64.

The integration boundary is src/integration/kernel-adapters.mjs and the
engine-worker/client pair. The integration adapter maps blocks using semantic parts and lineage;
the current part-index/color lookup is not a persistent identity mapping.

Worker recipe:
~~~js
{
  kind: 'product', packed: Uint8Array,
  source:
    {kind:'svg', source:svgText, thicknessMm:.2, longEdgeMm:0, toleranceMm:.001}
    // OR a live root original-source snapshot:
    // {kind:'snapshot', id, generation, epoch}
    // OR an explicitly confirmed root raster preparation:
    // {kind:'raster', acceptedHandle, epoch, thicknessMm:.2}
    // OR 1..33 original-source contexts; first is primary:
    // {kind:'contexts', contexts:[{id,generation,epoch,sourceHash}, ...]}
}
~~~

EngineClient verifies every non-inline source against its live ownership map and
Worker epoch. contexts[i].epoch is required at that boundary. Context slot is
routing, not identity; each region selects (contextSlot, sourceIndex).
Original source leases may be released after native prepare has copied/retained
them. Raw createProductOperations(Module) stays within one injected Module and
uses native registered IDs; epoch belongs to the Worker transport only.

Registered lifecycle (reset root control with a fresh generation first):
1. ops.prepare(recipe, generation) -> request handle.
2. ops.buildRequest(request, generation) consumes the request on every outcome.
3. Success -> one ordinary root snapshot primary lease. Read ARCH1 under that
   lease and ops.metadata(id) for a bounded independent metadata copy.
4. Release the primary with arch_snapshot_release exactly once. An extra reader
   requires arch_snapshot_acquire plus its matching release. The geometry is
   copied as typed vertices/triangles/parts into Snapshot, never mesh JSON.
5. Failed request -> ProductOperationError.code, optional .proposal. No partial
   model is published; every older leased snapshot remains immutable.

buildProductRecipe(Module, recipe, generation) is the focused Worker hook.
productSnapshotMetadata(Module,id) returns
{semanticBytes,descriptor,sourceMetadata}. Worker root metadata also retains
revision, source/canonical/request/head hashes and errorLedger. Copy bounded
metadata before another ABI operation. Refresh all WASM views after memory.grow.

The root source path actually parses SVG via the root vector reader, or takes a
confirmed root raster payload and constructs canonical ARCH1 context. It does
not use mechanics analytical fixture generators. Context bundles let already
prepared text outlines overlay the main source without repainting/removing the
main artwork. Shaping, glyph source/Unicode/variation hashes and text placement
remain the caller's upstream duties under INPUT-CONTRACT; this bridge retains
the supplied audit data and refuses unsupported native source features.

## Source preparation and proposals

createProductSourceOperations(Module) wraps the existing root raster ABI1.
prepare({kind:'rgba',bytes,width,height,options,limits?,origin?},g) or
prepare({kind:'encoded',bytes,options,limits?},g) returns a registered preparation
with summary256, metadata TLV, region/palette buffers and exact options200.
confirm(id, summary.slice(128,160), g) is an explicit separate acknowledgement,
returns its own accepted lease; release both handles at their respective end.
EngineClient.prepareRaster/confirmRaster expose the same flow with epoch leases.
Preparation never confirms or builds a model automatically.

For AM_NEEDS_ACCEPTANCE, .proposal has {id,semanticBytes,descriptor,sourceMetadata}
and EngineClient adds epoch. A failure with no applicable proposal remains a
block; it must not be replaced by bare extrusion. The descriptor binds native
request bytes, exact canonical source+metadata, supplied head and revision.
ops.confirm(id, descriptor, {headHash,revision}, freshGeneration) returns a
192-byte acknowledgement receipt only. EngineClient.confirmProduct and
releaseProductProposal provide the corresponding RPCs. Stale/tampered heads,
stale revisions and repeat acknowledgement reject. The parent must verify the
current project head again in its atomic domain transaction, apply the exact
user-selected proposal as a separate edit and explicitly build a new request.
No auto-size, auto-height, source fix or conditioning is performed by confirmation.

The controller must own and release .proposal on dismiss/replacement/logout/
Worker retirement, including proposals returned through an exception. The
existing UI proposal flow requiring a mesh is not an adapter for a native
no-mesh proposal: parent integration must connect a bounded proposal view.
The native metadata and receipt API are implemented/tested here; UI wiring is
outside this candidate. Acknowledgement is not a geometry or physical certificate.

## Byte contracts (little endian; no native pointers in input)

APRQ1 fixed header256:
| Offset | Type | Meaning |
|---|---|---|
|0,4,8,12|4 u32|magic0x51525041,version1,total bytes,product0..4|
|16..40|7 u32|parameters,materials,regions,texts,upstream,bevel,provenance-byte counts|
|44,48,52,56,60|5 u32|maxSlabs,maxPoints,maxOperations,maxMetadataBytes,flags0|
|64,72,80,88|4 u64|revision,source ID,provenance ID,eyelet text ID or0|
|96,128|2 x32 bytes|original source SHA256, current project head SHA256|
|160|40 bytes|ArchMechSchedule: 4u32(version,firstOrigin,regularOrigin,0),2i64(firstNm,regularNm),u64 provenance|
|200,208,216|3 f64|source, mating, export tolerance mm|
|224..255|32 bytes|reserved zero|

Follow in count order: params40, materials24, region selections112, texts120,
upstream params40 (exact IDs1..7), bevel overrides40, UTF8 provenance JSON.
Param40 = 6u32(field,mode,origin,datum,referenceLayer,layerCount), f64 value,
u64 provenance. Material24 = 4u32(role,RGBA,slot,origin),u64 provenance.
Selection112 = u32 sourceIndex,u32 contextSlot,ArchSourceRegion104. Ring start
must0; ring count0 selects all canonical contours of that exact source part.
A nonzero count must equal the exact canonical contour count. Every part must
be covered once. Region fields: 4u32(ringStart,ringCount,fillRule,overrideHeight),
3u64(semantic,provenance,textGroup),material24,height40.
Text120 = 2u64(semantic,provenance),2u32(placement,baseOn),2f64(basePad,baseRound),
height40,baseHeight40. Bevel40 = 2u64(target,provenance),
4u32(enabled,shape,steps,origin),f64 radius.

provenance.regionSources contains exact {contextSlot?:0,sourceIndex,sourceKey,
semanticId:decimalString}. SVG key is root paint sourceId/id; raster key is
'raster-region:'+the native region ID. It must agree with the source lease,
not merely with the packed region. Other provenance data is bounded data only.
Raster records1..7 are checked against actual accepted settings, including enum
res -> 360/520/720/960/1280. That check also applies to raster children of bundles.
SVG retains the supplied settings dependency records; no claim is made that
raster-only preprocessing was applied to vector input.

Context input: u32 version1,count1..33; then40 bytes per entry:
u32 snapshotID,u32 snapshotGeneration,32-byte original source SHA. Bundles copy
canonical XY/contour/index/part arrays and metadata, retain each source digest,
and reject products as sources, nested bundles, duplicates, stale handles,
mismatched original hashes and budget overflow.

PRHD1 descriptor192:
magic0x44485250/version1/length192 at0/4/8; revision u64@16,
source generation u32@24,product u32@28; SHA256 original@32,
canonical@64,request@96,current head@128,proposal@160.
Hashes include domain separation:
- canonical = SHA256('arch-product-source-v1\0' || ARCH1 || sourceMetadata)
- request = SHA256('arch-product-request-v1\0' || canonicalSHA || APRQ1)
- proposal = SHA256('arch-product-proposal-v1\0' || descriptor[0:160] || APMS1)
Confirmation input232 = descriptor192 + authoritative head32 +revision u64.
No secret capability or globally authoritative project head is inferred from
these hashes; current state ownership remains the parent controller's duty.

## APMS1 typed semantic sidecar

Header256 +25 directory rows16. Magic0x534d5041/version1/total/tableCount at0..12.
sourceVerdict@16,mechanicsVerdict@20,exportBlocked@24,fitQualification0@28;
revision/source/provenance u64@32/40/48;product@56,sourceOperations@60;
source/mating/export tolerance f64@64/72/80; source XY transform6f64@88;
bodyDatumZ f64@136;globalBoundKnown u32@144 is0; **mechanicsSemantics u32@148=3**, **sourceSemantics u32@152=2**. Both are required; older sidecars are rejected. Source interval Z is manufacturing Z, with an unavailable reference exposed as null and conversionAvailable=false; it is never an implicit layer conversion.
Each directory is u32(tag,stride,count,offset), aligned8, nonoverlapping, bounded.
Native flat layouts are those of the checked source/mechanics headers.

|Tag|Stride|Records|
|---|---:|---|
|1|160|part info: feature index,role,slot,origin,assembly group,provenance,preview matrix|
|2|176|features: stable ID,kind,parameter,role,group,source/provenance,6 dimensions|
|3|48|local curve certificates|
|4|56|mechanics intervals and conversion deltas|
|5|200|mechanics diagnostics|
|6|168|mechanics proposals|
|7|8|layer boundaries|
|8|40|effective parameter records|
|9|40|source contacts (source slabs, not final 3D mechanics certification)|
|10|32|lineage: source ID,slab ID,material provenance,stage,band|
|11|40|source intervals|
|12|176|source diagnostics|
|13|32|source proposals|
|14|32|source error stages|
|15|104|input regions|
|16|120|input text groups|
|17|24|explicit role materials|
|18|40|upstream bindings|
|19|40|bevel overrides|
|20|1|bounded provenance JSON|
|21|72|prepared source slabs|
|22|40|source recipe bindings|
|23|48|source attachments|
|24|16|source rings|
|25|16|canonical source XY pairs i64, mm*1e6|

readProductSemantics validates layout/version/semantics and returns parts,
features,curves,intervals,diagnostics,proposals,parameters,sourceContacts,lineage,
sourceIntervals/sourceDiagnostics/sourceProposals/sourceErrors,inputRegions,
inputTexts,provenance and raw bounded typed tables. It copies no triangles.
parts.meshPart and featureIndex are current snapshot routing, not persistent IDs.

Semantics2 datum11 is mech:cap:skirt.bottom; body.bottom remains datum1.
Source extension tags128..134 remain art.bottom,rim.bottom,flat.bottom,
recess.top,core-cap.top,text.bottom,text-base.bottom.
Interval reference_layer UINT32_MAX means layer conversion unavailable:
JS exposes conversionAvailable:false and referenceLayer/floorDelta/ceilDelta/
nearestDelta:null. Native zero delta placeholders are never suggestions.
Original nominal MM parameter values and tags are retained without snapping.

productExportDescriptor(rootLease,{headHash,revision,materialBindings?}) supplies
stable parts and group(slot,RGBA) mapping, checking live lease/generation/head.
Material bindings use explicit stable IDs and material provenance. Source slab
geometry provenance differs from material provenance: the latter is resolved
through typed source lineage. A mismatch blocks mapping, never chooses a color
match. By default bindings come from provenance.materials. The descriptor
retains every part/feature/material/source ID, assembly group and preview matrix.
parts.sourceId retains the native feature source (possibly a derived slab);
parts.sourceSemanticIds resolves its original persistent input IDs via lineage.
Use those original IDs for source selection, not a mesh index or color.
Manufacturing coordinates are already applied; preview transforms are NOT
export transforms. Groups preserve member IDs; final-scene union/group geometry/
SVG section remain Ohm's separate exporter modules. It does not invent profile,
polymer, extruder, compensation, or machine suitability. Same slot with different
colors remains an explicit diagnostic requiring a separate adapter remap before
machine-project export.

## Limits, errors and cancellation

Root existing limits:8 snapshot records,64 readers each,4 registered inputs,
2 outputs,384MiB accounted root bytes. Product adds4 requests,4 proposals;
wire2MiB,provenance1MiB,source metadata2MiB,APMS8MiB;
256 input regions,32 text groups,33 contexts,9 material roles,slots1..16,
200k canonical points/contours/indices,1024 slabs,100k requested source operations,
2048 final parts,2M triangles,2M vertices; ARCH1 still capped256MiB.
Source tolerance [0.00001,0.002]mm; mating [0.000001,0.001]mm;
export [0.000001,0.004]mm. Source/derived libraries may refuse below these caps.

Known transient admission reserves128MiB for SVG preparation,64MiB for context
combination,192MiB for product assembly/mesh/sidecar stages. This accounts owned
buffers and prevents registry overcommit; it is NOT an allocator interception,
RSS certificate or claim that arbitrary CSG stays below that native memory use.
WASM memory maximum1GiB and Worker watchdog remain the hard process boundaries.
A library OOM/trap may retire the Worker rather than return a recoverable error.

Root control generation1..UINT32_MAX-1 is strictly increasing; cancellation is
tagged by generation. Source assembly polls the shared control at checkpoints.
Mechanics uses its existing private controlled ABI; the current bridge observes
root cancellation before and after that synchronous call. It cannot interrupt
an in-progress monolithic Manifold/mechanics operation via the root cancel word.
Worker cancel grace/watchdog terminates it and retires that epoch's leases.
No bounded cancellation latency inside every library operation is claimed.

Errors return0 in CABI plus root safe code, or ProductOperationError/EngineError.
Representative groups:
- PRODUCT_SOURCE_* / PRODUCT_CONTEXT_* / PRODUCT_SEMANTIC_BINDING_MISMATCH:
  invalid, stale or mismatched source ownership.
- PRODUCT_REQUEST_* / PRODUCT_PARAMETER_* / PRODUCT_UPSTREAM_* / PRODUCT_LIMITS:
  invalid pack, omitted active record, stale preparation settings, budget.
- PRODUCT_BLOCKED: source/mechanics rejection, diagnostic sidecar when available.
- PRODUCT_NEEDS_ACCEPTANCE: native no-mesh proposal retained for explicit action.
- PRODUCT_CONFIRMATION_HEAD_MISMATCH / PRODUCT_PROPOSAL_ALREADY_ACCEPTED.
- CANCELLED / STALE_GENERATION; Worker SNAPSHOT_RETIRED / ENGINE_WATCHDOG.
Inputs/requests are consumed on failure; retained snapshots never replaced.
Forwards diagnostic strings as data; none are executed as commands or markup.

Unsupported imported mesh impOn is explicit mechanics rejection on all five
products. Other source-library limitations are propagated without clamp,
geometry substitution or ignored active parameters. No conditioning is applied.

## Evidence and scope

Portable tests require own project-env run, checked libraries, same root native
and WASM build, pinned Playwright and per-run profiles. PRODUCT_NATIVE_EXE and
PRODUCT_RUNTIME_MODULE may select the checked native probe/module; test output
is always PROJECT_REVIEW_RUN/evidence. The isolated build driver is only a
reproduction aid in this run, not a replacement for parent's build scripts.

Run-native defaults/all, run-native-raster, run-native-special, runtime.test,
browser.test, and oracles document actual authored SVG/two-color raster/hole/
prepared-text fixtures. Browser fixtures depend on run-native-special outputs.
See TESTING.md and the final manifest/evidence hashes. These are implementation
self-tests and reused mesh/spatial oracle code, not independent review.
No slicer/physical fit or total pipeline error qualification is claimed.
