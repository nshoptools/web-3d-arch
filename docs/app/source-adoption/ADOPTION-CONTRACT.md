# Source adoption and retained provenance — implementation contract

Run: 20260908-source-adoption-wave1. This is a bounded implementation candidate,
not an independent or configured review. Astra/max are inherited per caller;
fast/service-tier is not exposed. No child seats were called.

The public signature is in API-EARLY.md and src/app/adapters.d.mts.
Parent owns the product helper, SVG/raster/text adapters, workers and composition.

## Binding recipe

Pass the parent's product helper through createApplicationSources({ ...existingDependencies, prepareAdoption: parentProductHelper }) in src/integration/source-compositor.mjs. Its returned source adapter is frozen; use the factory option. Forward the complete SourceAdoptionInput. Return exactly version, ticket,
productBindings, materials and materialDefaults. Keep the original ticket unchanged.
The helper receives operation, immutable base state and immutable complete source, plus
an independent SHA-to-byte map. It may consult those bytes but must not retain them
across identity resets or mutate application state.

The controller supplies result.materials as both input lists when present; otherwise it
supplies the corresponding base list. This preserves existing result selection. There is
no new SourceResult.materialDefaults field. The helper decides durable material IDs and
automatic roles. The controller validates the result and stores only productBindings
in source.metadata and both material lists in app content.

Source imports, emoji imports and conversion use this hook when provided. Font and mesh
imports do not. The hook is optional; absence leaves the old adoption path intact.
A property present with a non-function value is rejected.

## Validation and transaction boundaries

The hook runs once after asset hashing and descriptor construction, before contentEdit,
candidateHash or creation of a pending proposal. No new job or transport generation is
allocated. After await, jobGuard and exact base object/head checks run before validation.
The normal queued edit still performs publication preflight and storage CAS.

The response is copied through the strict JSON validator (including forbidden prototype
keys, getters, cycles, nonfinite values and secret-key checks). Top-level fields are exact,
the original version/ticket must match, and canonical UTF-8 is bounded to 256 KiB.
productBindings is a plain JSON record. Complete merged source metadata is bounded to
64 KiB, including sourceContext and preparation metadata; a confirmed receipt is checked
against the same metadata budget before commit.

Both lists have at most 256 rows. Required fields:
id, label, color, slot, role, overridden, backgroundEligible, excluded.
Optional fields:
areaPercent, heightLayers, excludedReason, excludedCause.
Unknown fields, missing required fields, invalid values and duplicate IDs are rejected.
IDs/labels are nonempty and at most 200 characters; IDs cannot be control/prototype names.
Slots are null or 1..64. Role/color/height constraints follow the application schema.
areaPercent is finite 0..100. excludedReason is bounded to 2000 characters.
materialDefaults must contain exactly the material ID set. Since current validateState
only validates materials, this hook validates each list using that schema independently.

The source ID/revision, raw reference, raster/preview hashes, asset list, sourceContext,
and all other metadata remain controller-owned. A hook cannot return a replacement source.
Approvals bind the full adopted candidate state and asset hashes. Acceptance does not
rerun adoption; it verifies the existing proposal and appends the verified flat receipt.
Rejection, cancellation, stale source/project/base/head, or an online preflight failure
does not publish a new head. There is one normal history transaction per adoption,
subject to the existing explicit history-pruning approval if required.

Product binding semantics remain the injected helper's responsibility. Bounded JSON and
material validation are not geometry, fit, hardware, RenderOrigin or manufacturing proof.

## Confirmed SVG coordination

The two confirmation/receipt kind types now also permit 'svg'. The typed example in
tests/app/source-adoption.examples.ts shows arch-source-confirmation-receipt/1 with
kind svg, approvalHash, proposalHash, sourceHash, rgbaHash, settingsHash, projectId,
sourceRevision, acceptedAtRevision and optional artifactHash.

Parent owns the runtime source-approval.mjs kind allowlist update and the concrete SVG
confirmation adapter. This candidate deliberately does not modify that separately owned
file. With the frozen baseline runtime, a SVG confirmation still fails closed; the type
addition alone does not assert trusted render origin.

## Retaining original confirmed raster bytes

editSource still replaces current raster/preview refs. Before replacement it collects
only these known provenance paths:

- sourceConversion.original.hash, assets[].sha256, raster.sha256 and raster.pngHash.
- rasterPreparation.buffers[].hash, input.originalHash, input.rgbaHash,
  input.lineage.initialRGBAHash and input.lineage.initialPreviewHash.

Retention reads both known metadata structures regardless of confirmationReceipt.kind; a later raster receipt does not erase the original sourceConversion references.

A hash is retained only if it is a lowercase SHA-256 already present in the committed
source.assetHashes. It is not added just because metadata mentions it. Unchanged
raw/font/other asset refs and originalPreview continue to remain as before.

Consequently initial confirmed RGBA/PNG remain in the current source's own references
after editing and history pruning. Unreferenced intermediate edit RGBA/PNG leave those
references, and can leave the retained inventory once history no longer needs them.
The candidate does not retain all edit frames, infer arbitrary metadata hash paths, or
recover previously lost references by scanning historical assets.

No pixel algorithm is added: tests use the existing editing implementation, with an
explicit core client only in Node and actual Dedicated Worker transport in browsers.

At conversion/reprocessing, sourceJob intentionally builds references from the new adapter result. Parent raster-adapters.makeRGBA must include the verified original sourceConversion asset bytes required for replay (fonts, numeric SVG, raw, initial RGBA/PNG). This candidate does not import a whole previous packet or scan orphan bytes. The edit retention rule then protects those declared current refs.
