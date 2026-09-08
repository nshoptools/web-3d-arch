# Raster binding and source confirmation v1

Production entry points remain createRasterOperations(existingModule),
createRasterDispatcher(operations), createRasterTransport({call,cancel}) in
[src/core/raster-operations.mjs](../../src/core/raster-operations.mjs), and
createRasterAdapters({runtime}), rasterOptionsForState, createRasterRecipeHelper in
[src/integration/raster-adapters.mjs](../../src/integration/raster-adapters.mjs).
No factory creates a Worker or instantiates another Module.

## Controller-owned identity

The controller freezes this top-level input BEFORE ingest/convert:
```ts
interface SourceContext {
 version:'arch-source-context/1';
 operation:'import'|'convert';
 id:string;
 revision:number;
 predecessor:null|{id:string;revision:number;rawHash:string};
}
```

Import allocates a new ID/revision0; predecessor is null or the exact replaced source.
Convert/reprocess preserves ID, targets current source revision+1 and retains original
kind/raw bytes. A previous pixel gesture has already incremented the input revision.
The same context is passed to acceptProposal and stored at metadata.sourceContext.

Preparation context.sourceRevision targets the candidate, while RGBA
input.parentSourceRevision is its predecessor. The entire context is also stored in
rasterPreparation.context.sourceContext and hashed into approvalHash. Target changes
cannot reuse consent even when native proposalHash is identical.

ingest needs frozen state + sourceContext; convert additionally needs current source,
SHA asset map and target:raster. All prepare results are proposals, including defaults
k4/res520/smooth3/minA5/denoise1/eps35/tension65 (longEdge45mm). Manual values and policy
stay exact; changing them requires fresh confirmation.

## Exact common hook

Descriptor has exactly four required fields:
```js
{kind:'raster',version:'arch-raster-confirmation/1',approvalHash,proposalHash}
```

After explicit user approval, exact candidateHash and current project/head/online guards:
```js
const answer = await source.acceptProposal({
 ...originalControl, sourceContext, confirmation,
 source:frozenCandidateSource, assets:isolatedSHAByteMap,
 acceptedAtRevision:candidateState.revision // original ticket.revision+1
});
```

Only return:
```js
{
 version:'arch-app-adapters/1',ticket:originalControl.ticket,confirmation,
 receipt:{
  kind:'raster',version:'arch-source-confirmation-receipt/1',
  approvalHash,proposalHash,sourceHash,rgbaHash,settingsHash,
  projectId,sourceRevision,acceptedAtRevision
 }
}
```

Persist only receipt under source.metadata.confirmationReceipt. sourceRevision is
the candidate SOURCE revision; acceptedAtRevision is the DOMAIN revision. There is no
receiptField, nested acceptance wrapper or duplicate rasterReceipt. The hook changes
neither source bytes, pixels nor geometry. Controller owns guards after awaits/CAS.

metadata.rasterPreparation and metadata.sourceContext are non-approval reproduction
metadata. Original encoded bytes, oriented/editable RGBA, initial PNG/RGBA, confirmed
render origin, labels/shared curves/topology/error ledger are SHA-referenced assets.
A preparation metadata hash is not user consent.

prepareRecipe can replay exact durable consent across reset/reopen without new source
identity. Changed/unapproved data requires an explicit convert SourceContext; otherwise
RASTER_SOURCE_CONVERSION_REQUIRED routes the caller through source.convert. It never
allocates an ID or auto-accepts. Legacy unbound drafts may provide verified lineage
when reprocessed, but cannot be accepted/replayed as current approval.

## Root ownership, geometry and lifecycle

The existing root scheduler supplies fresh native generations; app ticket.generation
is not substituted. Native inputs use registered owned buffers. Getters recreate views
after memory growth and return separate ArrayBuffers. Packet/header/TLV/cross-reference
validation happens before exposure. No bulk JSON geometry crosses this interface.

prepareRecipe and the recipe helper provide exact kind28 BigInt64 indexed XY on the
shared vertex IDs, edges/incidence/loops/curves/palette/labels/certificate. The 1nm grid
does not imply source or printer accuracy. Parent owns validated product/mechanical
assembly. buildSourceContext returns a flat ARCH/1 source context, not a final product.

With a LIVE Module, await source.reset()/transport.reset() releases only this
binding's readers through the raw serial registry channel. Unrelated snapshot/control
semantics remain intact. That registry path must bypass live AppTicket requirements
and the controller operation invoking reset.

When EngineClient has terminated the Worker:
```js
existingClient.terminate(); // parent-owned termination/identity invalidation
rasterTransport.retire();   // synchronous, terminal, no RPC
await sourceExtension.reset({runtimeRetired:true});
```

reset() after retirement and release of retired tokens are local no-ops. Outstanding
waiters reject immediately; late replies cannot publish or release old tokens into a
replacement Worker. Cleanup never waits on the invoking controller operation. New
work needs a new facade around the parent's already initialized replacement Worker.
The Worker termination tests are distinct from live-Module reset tests.

Caps: native packet64MiB, TLV1MiB/4096records, full source metadata64KiB, each PNG32MiB,
aggregate SourceResult assets128MiB; native aggregate budgets may reject sooner.
These are admission limits, not whole-process RSS or real-time guarantees. Partial
alpha needs explicit policy; no white matte, SVG rasterization, decoder fallback or
color-management guess is introduced.

The optional product consumer and its exact final cleanup are documented in
[CALLBACK-LIFECYCLE.md](CALLBACK-LIFECYCLE.md). It returns a separately owned finished
ModelLease; cancellation after consumer fulfillment must release that lease.
