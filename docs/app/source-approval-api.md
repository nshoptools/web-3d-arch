# Source approval alignment — controller-owned binding v1

Run 20260908-source-approval-alignment; based on the frozen online-policy delta now integrated in main. No edits to frozen rooms/main. This API supersedes the earlier draft's replacement-on-conversion rule, following the parent's explicit preserve-ID/increment-revision binding. No Boole/Aristotle channel is exposed here; parent relays this path.

## Exact SourceContext (controller-owned, frozen before adapter invocation)

~~~ts
interface SourceContext {
 version: 'arch-source-context/1';
 operation: 'import' | 'convert';
 id: string;                 // candidate source ID
 revision: number;           // candidate source revision
 predecessor: null | {
  id: string;
  revision: number;
  rawHash: string;
 };
}
~~~

The controller passes `sourceContext` at the top level of SourceAdapter ingest/convert/selectEmoji input, beside original version/ticket/signal/onProgress. The same context is passed to acceptProposal and stored at candidateSource.metadata.sourceContext. The candidate descriptor ID/revision come from this context, never an adapter override.

- Initial import or another source/emoji import: operation import, new id, revision 0. predecessor is null for an empty project or the replaced source's exact id/revision/rawHash.
- source.convert (including reprocessing already edited raster): operation convert, SAME id as current source, revision=current source revision+1. predecessor is that exact current source id/revision/rawHash. Original raw bytes/kind are retained. Both predecessor and successor snapshots/assets remain available to history.
- Pixel gesture: same source ID, source.revision+1, using the existing editing command. That invalidates old source consent; the next conversion receives the current edited source as predecessor.
- acceptedAtRevision is the candidate DOMAIN revision, exactly original ticket.revision+1. It is distinct from sourceContext.revision.
- Example: import => A/source0; edit => A/source1; conversion => candidate A/source2 with predecessor A/source1; accept commits one domain transaction. Reject/stale/failure leaves A/source1.

Raster binding MUST set rasterPreparation.context.sourceRevision = c.sourceContext.revision for initial prepare and conversion. Its rgba input.parentSourceRevision must equal c.sourceContext.predecessor.revision (the input/current source revision). Keep projectId/ticket.revision baseRevision unchanged. Controller checks these bindings and never rewrites worker preparation hashes. A hardcoded candidate sourceRevision0 is rejected for conversion. Text acceptance already echoes candidate.revision; no flat receipt version change is needed.

## Descriptor and receipt

SourceConfirmation has exactly four REQUIRED fields:
`{kind:'raster'|'text'|'emoji',version:string,approvalHash:sha256,proposalHash:sha256}`.
No receiptField. Return envelope exactly:
`{version:'arch-app-adapters/1',ticket,confirmation,receipt}`.

Receipt has these REQUIRED fields:
`{kind,version:'arch-source-confirmation-receipt/1',approvalHash,proposalHash,sourceHash,rgbaHash,settingsHash,projectId,sourceRevision,acceptedAtRevision}`.
Optional artifactHash is accepted for the text adapter family (text AND emoji, matching its current code), never raster. Persist ONLY this flat receipt at source.metadata.confirmationReceipt. No mirrored rasterReceipt, receiptField or nested acceptance wrapper.

acceptProposal receives `{...originalControl,sourceContext,confirmation,source:candidateSource,assets:Map<string,Uint8Array>,acceptedAtRevision}`. sourceContext/source/confirmation are frozen; asset bytes are isolated copies. Worker returns only the exact common envelope above.

Controller checks original ticket/project, descriptor echo, candidate raw/raster digests, expected candidate source revision, accepted domain revision, and digest equality with candidate preparation settings/approval bindings. Worker owns canonical settings hashing and native confirmation. Optional text artifactHash must equal candidate.metadata.artifactHash. Explicit approval, candidate hash, live head/revision, online preflight and final CAS remain required. The hook cannot replace source bytes, geometry or policy.

## Integration status

Parent relayed and endorsed this exact binding. Both updated worker adapters were subsequently read and snapshotted. Raster now binds preparation context.sourceContext and sourceRevision to the supplied context; text forwards it through import/selectEmoji/convert and validates candidate context during acceptance. Checked snapshot hashes and test scope are recorded in the handoff.

metadata.sourceContext is provenance of the most recent source preparation. Pixel edits increment the source descriptor revision without rewriting past preparation/approval metadata. A subsequent conversion receives a fresh controller context based on that current edited descriptor. Font ingest does not allocate a source identity and omits sourceContext.

Engine prepareRecipe reprocessing still needs the host to route an explicit source.convert when the raster adapter reports RASTER_SOURCE_CONVERSION_REQUIRED. This alignment does not add a new engine proposal command or any UI4 followup.

