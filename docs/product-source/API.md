# Product source contexts — integration contract

Implementation only. Public API version: arch-product-source-contexts/1. The existing product adapter remains arch-product-app/1; domain adapter, native metadata and checked runtime getters all require mechanics semantics 3 and source semantics 2. No mechanics2 fallback exists.

## Parent wiring

Use the parent's existing kernel, source compositor and current operation/generation scheduler:

~~~js
const contexts = createProductSourceContexts({
  kernel,
  sources: sourceServices, // createApplicationSources(...)
  context,                // () => ({userId, projectId, state, assetsMap})
  resolveTextBindings     // optional explicit actual-face decision
});
const product = createProductAdapters({
  operation: kernel.operation,
  kernelLeases: kernel.kernelLeases,
  context,
  withPreparedSource: contexts.withPreparedSource,
  onGeometryProposal: geometry.onGeometryProposal,
  onSourceProposal
});
const sourceAdapter = contexts.source;
const engineAdapter = geometry.wrap(product.engine);
~~~

geometry is the parent's createGeometryProposalBridge result. Its literal-true callback retains native proposal ownership. This delivery does not implement or replace that helper, controller jobs, engine-worker, engine-client, root ABI or build files.

Every native mutation uses the same kernel.operation and a fresh generation. ensureRuntime initializes/reads capability data without allocating a generation. The bridge owns no moduleFactory, Worker, WASM, persistent pointer or separate scheduler. App state persists source identities and hashes; native tokens and numeric snapshot identifiers stay in private, bounded callback borrows.

## Source adoption and captured artifacts

Pass contexts.source to SourceOperations. It delegates normal source/emoji/font services and wraps source ingestion/conversion/emoji selection before SourceOperations constructs the descriptor. Original font, selection, SVG, PNG, RGBA and contour derivations remain referenced. No asset bytes can be added by the subsequent prepareAdoption hook.

For existing parent routing, use this exact order:

~~~js
const plan = await contexts.captureArtifacts(control);
const reply = await sourceServices.source.convert(control);
const captured = await contexts.captureSourceResult(control, reply, plan);
// Parent now builds the immutable SourceDescriptor and reserves sourceContext.
// Parent invokes captured adapter's prepareAdoption before its commit/proposal hash.
~~~

A text RPC can invalidate an earlier pending text-conversion receipt. Therefore captureArtifacts runs BEFORE conversion. Direct captureSourceResult without a plan refuses pending text/emoji conversions. Never capture the same reply twice. A later text edit must capture new assets inside the parent's atomic source/text transaction; stale artifact hashes block a build.

prepareAdoption accepts the current SourceAdoptionInput: control, operation import/convert, sourceContext, base state, immutable SourceDescriptor, materials, materialDefaults and SHA-to-bytes Map. It checks current ticket/user/project/head, exact source context/predecessor, revision, raw size/hash and all declared asset hashes.

Its Promise resolves EXACTLY these five keys:

~~~js
{ version: 'arch-app-adapters/1', ticket,
  productBindings, materials, materialDefaults }
~~~

There is no status property. Parent commits only these fields with source adoption. No source id/revision/raw/raster/preparation metadata is rewritten by the hook.

A ready canonical graph produces arch-product-bindings/1. Original color/bitmap without numeric outlines, and rendered RGBA not yet segmented, produce arch-product-bindings-pending/1: exact project/source/revision/rawHash, reason, requiredAction source.convert-raster, canonicalGeometry false and requiresExplicitSourceApproval true. This permits original-source retention; engine.build explicitly throws PRODUCT_SOURCE_CONVERSION_REQUIRED. Color rendering and raster segmentation remain separate existing source consent steps.

Rebinding, conflicting material slots and unresolved actual-face datums produce PRODUCT_ADOPTION_DECISION_REQUIRED or PRODUCT_ADOPTION_BLOCKED with details.plan. prepareAdoptionPlan exposes the exact bounded plan and adoptionHash. Parent handles the decision and retries against the still-current ticket. The bridge never accepts a source, geometry or identity proposal itself. onSourceProposal is the parent's ownership callback for a changed/unapproved raster encountered during a later build.

## Bounded material extension

The proposed controller delta is reports/controller-material-extension.patch in the handoff run. It adds ONLY product to the existing exact material allowlist, invokes validateProductMaterialExtension when present, and adds the optional typed property to MaterialView. Existing MaterialView fields and validation remain required.

ProductMaterialExtension is exported from product-adapters.mjs/.d.mts:

~~~ts
{
 version: 'arch-product-material/1';
 active: boolean;
 origin: 'auto' | 'user' | 'source';
 sourceId?: string;
 sourceKey?: string;
 nativeRole?: 'body' | 'artwork' | 'rim' | 'skirt' | 'stem' |
              'tray' | 'fastener' | 'text' | 'textBase';
 identityTuple: readonly [
   'arch-product-identity/1', string, string, 'material-key', string
 ];
}
~~~

The validator returns a frozen clone, rejects unknown keys, caps canonical JSON at 4096 UTF-8 bytes, and requires NFC/control-free nonempty tuple strings of at most 200 UTF-8 bytes. Active records require nativeRole. Region sourceKey requires sourceId matching tuple[2] and tuple[4] equal to region:+sourceKey. Active role records require role:+nativeRole. Inactive retained records preserve their identity tuple.

prepareBindings initializes all nine roles from explicit checked product defaults. It preserves valid common settings and user overrides, uses existing role enum values including other, and emits backgroundEligible. Material and default IDs have equal, unique coverage. Null non-overridden slots are initialized explicitly; user-null slots and same-slot/different-color selections block or propose a remap. Slots 1..16 are a logical native material plan, without printer/extruder qualification. Same-color distinct roles remain distinct materials.

## Canonical geometry and durable identities

sourceGeometry reads actual ARCH1 canonical integer XY and native paint metadata. It verifies part/contour ownership, sourceIndex routing, native source ID uniqueness, opaque RGBA and the real sourceHash. Rings use a deterministic O(n) least cyclic rotation, preserving winding. Sorted ring hashes form a versioned region hash. Color and native part order do not enter this geometric hash. No contour simplification, color-derived identity or analytical fixture is substituted.

rasterSourceGeometry decodes actual accepted packet buffers 13/14/28 and palette7. Adoption reconstructs the stored graph from the receipt's 30 persisted SHA-addressed rows 2..31; it does not invent header1. Build uses the real 31-buffer packet inside sources.raster.prepareRecipe(c, consume), the persisted authorization receipt and live opaque token. It never resegments the accepted graph to obtain another handle.

prepareBindings persists sourceKey during adoption. Unique authored identity or uniquely proven geometry can preserve a prior sourceKey. New anonymous/disconnected regions get durable serial allocations with full project/source/key provenance. Edited/conversion graphs create explicit retained/allocated/retired rebind proposals. Native sourceIndex is routing only.

Current context hashes, rawHash, source revision, geometry hashes, complete region coverage and material coverage are checked again inside the native borrow. All canonical snapshots, including overlay sources, survive the awaited consumer. Finally releases them. Changed owner, epoch, head, ticket, cancellation or private reset rejects late delivery and releases a returned late model.

## Text source frames and actual layer references

The root text producer emits original numeric SVG, source assets, shaping/curve provenance and parserViewportToSourceMm. A checked derived affine SVG wrapper restores manufacturing Y orientation, keeping the original SVG/path bytes. Source artwork uses a recorded normalized origin because source assembly centers/scales artwork. Beside overlays preserve the producer's absolute manufacturing coordinates. The derived wrapper is parsed by the same root SVG parser and is never inserted as dynamic DOM SVG.

Raw SVG files and raster contexts are parsed X right/Y down; `withPreparedSource` places each such art context in the manufacturing frame (X right/Y up) with one native source-frame reflection, `[1,0,0,-1,0,heightMm]`, after canonical region identity has been taken from the unplaced lease. A raster context is registered first (`buildSourceContext`) and framed through its token. Text and emoji numeric SVG art comes through the manufacturing wrapper and is not reflected. The legacy `product-context-bundle/2` transport predates the frame ABI and hands contexts over unplaced. See docs/native-source/SOURCE-FRAME-API.md.

Negative absolute overlay bounds currently require a native affine SourceContext API and block PRODUCT_TEXT_SOURCE_FRAME_UNSUPPORTED. The helper does not move text into the viewport. Both wrapper bytes and derivation hash are regenerated and checked from retained original SVG before use. Source/text state hashes reject stale shaping or placement.

Beside text uses the actual AS_SOURCE_BED_TEXT contract: base starts at manufacturing bed (datum134, reference0), text starts at the declared base's top (datum133, reference base-layer count). Native semantics3/source2 verifies these actual faces. On-model layers need resolveTextBindings or an existing still-current explicit binding; no default reference-zero guess is used.

The optional callback receives control, frozen state/source, actual canonicalContexts and required {heightDatum:133, baseDatum:134, coordinateFrame:'manufacturing-z', mechanicsSemantics:3, sourceSemantics:2}. It returns {texts, eyeletTextKey?, contextTextKeys?} or null. Explicit MM references are also preserved and verified by native R2. Existing product.prepareHeightBindings derives decisions from a live current model; geometry proposals remain separate from source adoption/domain commits. Source intervals already use manufacturing-z; unavailable layer conversion stays null. No bodyDatumZ offset is added.

## Limits and claims

The source bridge enforces at most 33 contexts/256 regions in total; 200000 canonical points, 600000 contour indices, 66666 contours and 64 MiB of snapshots/packet bytes summed across a borrow; source assets at most 10000/128 MiB; one SVG at most 1 MiB; metadata64 KiB; overlay artifact16 KiB; adoption envelope256 KiB. Coordinates are bounded to +/-10000 mm. Native limits can reject earlier. No limit implies that every permitted input has acceptable latency.

Canonical integer coordinates reflect the actual root grid. They do not establish a new error-budget prior. Frame derivations record totalErrorBoundMm:null; the actual native error ledger and unverified whole-pipeline bound are preserved. Mesh oracles in these implementation tests never promote independentMeshVerdict, fit qualification, printing compatibility or final-scene authority.

product.inspectModel({model,control}) exposes current native lineage/parts/material/slot/sourceIndex for parent export mapping, while verifying lease, head and metadata hashes. It does not fabricate export gates. Import CSG remains a separate provider and impOn continues to block when unavailable.

See ISSUES.md for measured native capability gaps and TESTING.md for the frozen test boundaries.
