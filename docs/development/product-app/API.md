# Product AppBridge integration — arch-product-app/1

Implementation handoff, not independent review. Production files are product-adapters.mjs and product-adapters.d.mts. There is no Module factory, Worker, domain writer, source renderer, or geometry algorithm in this helper.

Qualified implementation dependency for this handoff: root ABI 2, product ABI 1, APMS/1, mechanics semantics **2**, source datum extension 1, frozen product-runtime-6fa96754c1bf3baf. PRODUCT_MECHANICS_SEMANTICS=2 is explicit. Parent's planned mechanics semantics3/source semantics2 upgrade must change the pin and rerun acceptance deliberately. No fallback is provided. R2 strap roof and actual-face/reference qualification remain open outside this delivery.

## Atomic source adoption

prepareBindings({projectId,state,source,canonicalContexts,sourceMaterials?,defaults?,textBindings?,sourceToleranceMm?}) is pure. state is the BEFORE-adoption domain state; source is the controller-created candidate SourceDescriptor with its reserved sourceContext. It returns:

- productBindings, materials, materialDefaults: the three data deltas for SourceAdapter.prepareAdoption.
- status: ready / proposal / blocked; expected: projectId, revision, canonical domain head, source ID/revision/raw SHA; adoptionHash over the complete proposal.
- changes, diagnostics, proposals: explicit defaults, slot/datum conflicts, continuity evidence and rebind choices.
- source/sourceMetadata: convenience immutable copies with ONLY metadata.productBindings added/replaced. Parent need not use these copies.
- identityLedgerHash, requiresCommit:true, geometryChanged:false, unqualified fit and printer state.

No bytes asset is added. ID tuples/full hashes live inside productBindings.identityLedger. No raw source/raster/preparation/sourceContext identity is changed. The parent must verify expected against its live head and source descriptor, resolve proposal/blocked results, then atomically include the three deltas in the same source-adoption transaction and proposal hash. The source confirmation receipt remains a separate existing controller operation. Do not call a commit from this helper.

Example for Huygens's hook (describeCandidate is the parent's checked compositor, not a new API supplied here):

    async function prepareAdoption(input) {
      const canonicalContexts = await describeCandidate(input);
      const plan = await prepareBindings({
        projectId: input.control.ticket.projectId,
        state: input.state,
        source: input.source,
        sourceMaterials: input.materials,
        canonicalContexts
      });
      // Controller owns the status/proposal/head-CAS branch.
      if (plan.status !== 'ready') return deliverAdoptionDecision(plan);
      return {
        productBindings: plan.productBindings,
        materials: plan.materials,
        materialDefaults: plan.materialDefaults
      };
    }

canonicalContexts = [{key,sourceHash,derivationHash,regions:[{nativeKey,sourceIndex,geometryHash,authoredKey,rgba,materialId?}]}].
Every canonical part is represented exactly once. sourceHash is the actual native context input SHA, referenced in source.assetHashes. The first SVG context must equal source.raw.hash. Text numeric SVG SHA is distinct from original text/emoji raw SHA and must reference metadata.numericSvgHash. Raster derivationHash is the persisted preparation approval hash. Additional text/layout contexts have a checked shaping/layout derivation hash.

geometryHash is SHA-256 of exact canonical contour/XY data in the parent's documented encoding, excluding generation, color, sourceIndex and transient handles. The test encoding is canonical JSON of integer-nm coordinate strings grouped by contour. A different encoding is permitted only if it is stable/versioned on both sides of a rebind. No hash from unverified source metadata certifies geometry. authoredKey is a unique authored element identity or null; repeated use/anonymous/generated paint numbers must not masquerade as authored identity. sourceIndex/nativeKey route current native arrays; they never generate persistent identity.

For an initial anonymous/disconnected region, prepareBindings allocates a source-scoped serial once and persists sourceKey='adopted:N' plus nextRegionSerial. This serial is a durable allocator, not a mesh index. Authored keys use authored:contextKey:authoredKey. Recolor/reorder/rebuild preserve IDs. Rebind reuses a key only on a unique authored key or unique exact canonical geometry match (or an unchanged exact context). A split/merge/unmatched edit returns a concrete source-identity-rebind proposal with retained/allocated/retired rows. Retired material/default records are retained as product.active:false; no region/override is silently dropped.

Persistent u64s are SHA-256(canonical JSON(['arch-product-identity/1',projectId,source.id,kind,sourceKey])) truncated to the first64 bits with bit63 set. Full digest and tuple are retained. Duplicate tuple, truncated collision, duplicate sourceKey or ambiguous selector rejects. IDs deliberately exclude color, part order, revision and geometry hash. The high bit separates these IDs from the small positional parameter-provenance table produced by the existing mechanics domain adapter. This is integrity/identity, not authentication.

## Materials and defaults

Exact native roles: body, artwork, rim, skirt, stem, tray, fastener, text, textBase (0..8). Each binds an explicit material ID; each canonical source region also binds explicitly. Existing UI roles remain body/text/textBase/stem/tray/region/other; product.nativeRole records the native distinction. Multiple roles or regions with the same color retain separate IDs and blocks. Native intentional linkBody auto linkage is reflected in its actual material lineage; user overrides remain separate.

PRODUCT_MATERIAL_DEFAULTS is a NEW proposed, versioned material policy in this delivery, not a claim that the legacy catalog specified colors. All five products use neutral #30353b defaults; text/rim use #ffffff. Opaque source region colors come from the checked canonical source. Parent may pass a checked versioned defaults policy covering all five products and nine roles. The policy/hash/provenance is recorded in the adoption ledger. Existing valid common settings/user overrides/default records survive switch and rebuild. No parameter value is changed by initialization.

Auto slot:null is explicitly initialized, recorded in changes, choosing an already compatible single-color logical slot or the lowest empty slot1..16. Existing non-null slots are preserved. User slot:null blocks. Same slot/different colors returns PRODUCT_SLOT_CONFLICT plus a material-slot-remap proposal listing affected IDs and available slots; the helper never repairs an existing choice automatically. Capacity exhaustion blocks. These are MATERIAL slots; no printer profile, extruder count, filament, nozzle, accuracy or fit is inferred. Unselected printer remains null.

Initial automatic allocation uses ascending normalized RGB colors, choosing the lowest numbered compatible slot when more than one exists. Project/source UUIDs, derived material IDs and record order do not affect this choice. Equal colors may share a logical slot while retaining distinct durable material identities. `adoptionProvenance.slotAllocation` records `rgba-ascending-lowest-compatible-v1` for this policy. Existing saved slots, including automatic assignments from an earlier policy, are retained; there is no automatic migration of a saved design or its height bands.

No region height record is needed without an override: effective artH remains native authority. material.heightLayers requires an explicit matching mode2 record with actual datum/reference. Missing records produce a resolve-region-height-datum proposal with referenceLayer:null, never a guessed zero. Text height/base layer controls similarly need a checked text record; initializer returns a datum proposal when absent.

## Shared scheduler and borrowed sources

createProductAdapters({operation,kernelLeases,context,withPreparedSource,onGeometryProposal?,onSourceProposal?}) returns engine, prepareRecipe, mapModelLease, reset.

operation and kernelLeases MUST be the existing createKernelAdapters() members. context() returns authoritative {userId,projectId,state}. No second scheduler/counter/EngineClient/Module is created. Engine identity is arch-product-app/1. Each runtime mutation goes through the parent operation; copy/acquire/release/reset use the parent's serial raster registry.

withPreparedSource(context, consume) keeps every canonical source alive through the awaited consume call, then releases its source resources in finally. consume is called exactly once only for an approved, compatible ready source. Context includes immutable state/control/asset copies, validated bindings, effective mechanics domainRecord, verified persisted receipt, and optional run(invoke) forwarding to the SAME operation for SVG/text mutations. Existing raster facades already use that operation.

A borrowed envelope has:
{version:'arch-product-contexts/1',owner:existingClient,epoch,source,contexts,references,assertOwned,authorization,textStateHash,upstreamBindings?}.

source is an inline SVG recipe, an owned root snapshot, a bundle, or {kind:'raster-token',token,epoch}. Bundle entries may be {token,epoch,sourceHash} or owned SVG snapshot {id,generation,epoch,sourceHash}. references[i]() reads the current facade/lease reference; assertOwned checks live source ownership. No native pointers or numeric accepted raster IDs are accepted from AppBridge. Tokens never enter project/provenance JSON. Owner/current client/epoch are checked; the Worker resolves opaque tokens using its private live registry again.

The new existing raster callback is the intended integration:

    return raster.source.prepareRecipe(
      {...ctx.control, state:ctx.state, assets:ctx.assets},
      async ready => {
        // Parent compositor describes ready.packet (all31 verified buffers)
        // and checks the persistent region mapping. It returns the bounded
        // contexts/selector and upstream-record data described above.
        const described = await describeApprovedRaster(ready, ctx);
        return consume({
          ...described,
          version:'arch-product-contexts/1',
          owner:existingClient,
          epoch:ready.nativeSource.epoch,
          source:ready.nativeSource,
          references:[()=>ready.nativeSource],
          assertOwned:()=>assertSameLiveEpoch(existingClient,ready.nativeSource),
          authorization:ready.receipt,
          textStateHash:null
        });
      }
    );

describeApprovedRaster/assertSameLiveEpoch are explicitly injected parent functions, not exports claimed by this module. The accepted/prepared source proxies remain owned by raster.source.prepareRecipe's finally until the finished root ModelLease exists. No second prepare/quantization or manufactured source IDs is needed. A changed/unapproved source preserves the original source-proposal branch; the consumer is not invoked.

prepareRecipe(input,consumeRecipe) is callback-only: it cannot return a usable token outside the borrow. The recipe lease becomes invalid when the callback ends. Parent may call client.build and mapModelLease INSIDE that callback instead of replacing its engine adapter; mapModelLease requires that live registered prepared recipe and exact owner/generation. engine.build performs this sequence itself and returns the independent root-backed ModelLease. Caller releases a root if manual mapping fails.

State, ticket and bytes are captured before asynchronous dispatch. Domain fingerprint is the existing storage/history.mjs canonical fingerprint (revision excluded); revision is checked separately. Raw referenced bytes, stored identity ledger, context hashes, native source SHA, native request hash, exact head/revision, all region/material coverage, same client/epoch and ticket are checked. Late head/auth/ticket changes or cancellation release an unpublished result. Retained old models remain readable only for the same user/project until released/reset; they do not become a new head.

## ModelLease and proposals

ModelLease.blocks use native feature IDs and per-part lineage. kind comes from the native role; materialId comes from native slab/material provenance, not the first matching color. Extra block fields: role, sourceSemanticIds, partIndex (routing only), featureIndex. kernelLeases stores the parent's exact {root,client} record. Model bytes remain in the root immutable snapshot; no bulk triangle JSON/copy is created. Source leases have already been released when engine.build returns.

model.product contains the exact native head, semantic parts/features/curves/intervals/diagnostics/proposals/error ledger, persistent identity evidence and exportDescriptor. Preview transforms remain distinct from manufacturing coordinates. Material count counts distinct material IDs, not colors. Native warnings/unavailable conversion sentinels and totalErrorBoundMm:null remain truthful; stats.verdict is unverified and fit remains unqualified. No printer/slicer/export CSG qualification is claimed.

AM_NEEDS_ACCEPTANCE is a no-mesh native proposal. onGeometryProposal must synchronously return literal true to take ownership; otherwise it is released and PRODUCT_GEOMETRY_PROPOSAL_UNHANDLED is thrown. Returning a Promise does not transfer ownership. The callback gets {ticket,code,head,metadata,confirm(control),release()}. Native invalid/unsupported results are PRODUCT_NATIVE_BLOCKED with native diagnostic fields, not offered as acceptable geometry.

confirm is for the parent's explicit consent path only, after authenticated preflight/head CAS. It acknowledges the original descriptor/request/head once; even a failed attempt consumes the helper proposal. It never commits a domain command, repairs a height, or creates a mesh. Parent separately previews/commits the approved domain action and rebuilds under a fresh ticket. AppBridge jobs currently expects proposal.model; add the no-mesh callback branch rather than fabricating a ModelLease. Source proposals use onSourceProposal with the same literal-true ownership convention and PRODUCT_SOURCE_PROPOSAL_REQUIRED.

## Exact limits and explicit gaps

- Source metadata including inline binding/identity ledger:65536 UTF-8 bytes; binding record at build:60000 bytes. This is a byte cap, so long IDs/history can hit it before count caps. Refuse; no truncation.
- 1..33 canonical contexts, 1..256 regions, <=32 text records, <=256 current+inactive material records/defaults, <=256 retired region rows, <=1024 identity records. Default per-region materials plus nine roles can hit256 before256 regions. Shared material IDs are permitted only by explicit binding.
- Stable strings<=200 UTF-8 bytes, NFC, no control characters; nonempty opaque RGBA, slots1..16.
- Owned source asset capture<=128MiB; each checked asset<=64MiB; inline SVG<=1MiB. Product request<=2MiB, provenance<=1MiB, APMS<=8MiB, public semantic+descriptor JSON<=16MiB.
- Root inherited constraints remain in force: source points/indices200k, slabs1024, operations100k, eight root snapshots, four product requests/four proposals and384MiB accounted root bytes. Library scratch/RSS is not a verified process cap.
- impOn: IMPORT_CSG_UNAVAILABLE until parent integrates actual import CSG. No bare-extrude fallback.
- Text overlay numeric contours plus exact133/134 record/reference plumbing are tested. Font shaping/rendering is the parent's checked text service. text.bevelEnabled, positive absolute baseWidthMm and text-as-source layer semantics are explicit unavailable errors; not ignored. Text per-object datum resolution remains dependent on actual source/mechanics semantics. No R2 datum workaround.
- Background/source exclusions require a newly prepared canonical source; an excluded mapped material blocks. Region heights without datums block. Selected unsupported tolerance conventions propagate the existing mechanics adapter error.
- Native export descriptor mapping is supplied; final-scene union/group/SVG section is the separate parent's exporter.
