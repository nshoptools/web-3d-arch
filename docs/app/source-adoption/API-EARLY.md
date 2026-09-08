# Source adoption hook — early public API

Run 20260908-source-adoption-wave1; implementation, inherited Astra/max; fast/service-tier
unexposed, not configured review. Only source controller hook/types/tests/docs candidate.
Main and previous rooms remain read-only.

```ts
SourceAdapter.prepareAdoption?(input: Control & {
  purpose: 'source';
  operation: 'import' | 'convert';
  sourceContext: SourceContext;
  state: DeepReadonly<DomainState>;       // immutable pre-import/pre-conversion base
  source: DeepReadonly<SourceDescriptor>; // complete controller descriptor, new context
  materials: readonly Readonly<MaterialView>[];
  materialDefaults: readonly Readonly<MaterialView>[];
  assets: ReadonlyMap<string, Uint8Array>; // SHA-256 -> copied bytes (all staged assets)
}): Promise<{
  version: 'arch-app-adapters/1';
  ticket: Ticket;                        // exact original job echo, no extra generation
  productBindings: Record<string, Json>;
  materials: MaterialView[];
  materialDefaults: MaterialView[];
}>;
```

All return fields are required, no other top-level fields accepted. Product bindings
are a bounded plain JSON record owned semantically by the product adapter. Controller
stores it only at source.metadata.productBindings; it does not claim native geometry
validation. Each material/default list has at most 256 entries, validates against the
current application material schema, and has unique IDs; defaults must cover exactly
the returned material IDs. The complete source metadata after merging is <=64 KiB
canonical UTF-8 JSON (including sourceContext and any preparation metadata).
Total hook response is <=256 KiB canonical UTF-8 JSON.

Input lists are the source result's materials/defaults if result.materials is present
(current SourceResult uses that same list for both); otherwise the existing base lists.
This is the exact legacy selection before the hook. The hook may provide durable IDs
and automatic roles for a cold source. It is optional: absent hook keeps old behavior.

The controller calls once after building/validating all source assets, preview/raster
references and the SourceDescriptor, before creating next state, output hash or proposal.
Inputs are independent immutable JSON clones; bytes/map are independent copies.
Source ID/revision/raw/raster/preview/assets and preparation metadata are never replaceable
by the return value. Source context remains initial import = new ID/revision 0; conversion
= same ID/revision+1. Font and mesh imports skip this hook.

The awaited call stays under the original source job/control; jobGuard runs immediately
after resolution. Existing online preflight, publication guard, proposal hashing, explicit
approval/flat source confirmation receipt and storage CAS stay in force. No hidden commit
or second history step. Approvals include the adopted bindings/material lists in the
candidate hash. Acceptance does not rerun preparation or adoption.

Composition (parent-owned): assign the product helper to source.prepareAdoption. It must
return only the exact schema above and preserve version/ticket. No worker invocation,
transport generation, UI role-picking, or controller mutation belongs in this hook.

Coordination addendum (implemented in this candidate): SourceConfirmation.kind and
SourceAcceptanceReceipt.kind also include 'svg'; source-adoption.examples.ts contains
the flat SVG receipt shape. Parent owns the source-approval.mjs runtime allowlist change;
this candidate does not edit it or infer trusted RenderOrigin from an unapproved result.

Material validation rejects unknown keys and requires id,label,color,slot,role,overridden,
backgroundEligible,excluded. Optional keys are areaPercent,heightLayers,excludedReason,
excludedCause. IDs and labels are nonempty and <=200 characters. Both lists are checked
independently, including slots null/1..64 and duplicate IDs, before exact ID-set matching.
Metadata is bounded again after a confirmed flat receipt is attached.

editSource preserves known original provenance references already present in source.assetHashes:
sourceConversion.original.hash, assets[].sha256, raster.sha256/pngHash; and
rasterPreparation.buffers[].hash, input.originalHash/rgbaHash, plus
input.lineage.initialRGBAHash/initialPreviewHash. Unknown metadata hashes never introduce
new references. Raw/font/other unchanged source refs and originalPreview remain; an edited
RGBA/PNG can leave current source refs when it is not one of those declared provenance assets.
History continues to own its separate retention. No pixel algorithm or product adapter change.