# Application adapter binding 1 — AppBridge 0.3

2026-09-08. Implementation candidate; no configured review claim. Parent integrates from the checked file manifest after handoff. All candidate files remain in this run.

Factory: `createAppController({origin,deviceId,adapters,storeFactory?,fetchImpl?,clock?})`. Concrete defaults use main domain, storage and same-origin backend HTTP. Production never supplies analytical meshes, accounts, quotes or empty storage. Test doubles are named and confined to tests.

## Ticket, transport generation and model ownership

Every job input has `version:'arch-app-adapters/1', ticket:{id,userId,projectId,revision,generation}, signal, onProgress`. The adapter echoes the exact ticket. A controller ticket may cover multiple native source/build/export operations. Use one injected monotonic transport counter shared by those operations; ticket.generation is not the native counter.

Engine returns `ModelLease` or `{status:'proposal',model,changes:string[]}`. Lease fields: version, exact ticket, **generation**, leaseId, bytes():Uint8Array, stats, blocks, release(). generation must equal the ARCH/1 header generation. stats and blocks must derive from actual kernel output; fit/hardware verdicts remain unverified unless independently qualified.

The default `createEngineAdapter` retains the original KernelLease in a caller-supplied WeakMap<ModelLease,KernelLease>. It does not copy/release it prematurely: native Rust STL export needs id/epoch. Parent exporter retrieves that lease and calls `EngineClient.exportSTL(root,part,{generation:nextTransportGeneration()})`. Do not detach the input, release the root inside export, or expose a JSON mesh. A copied ARCH buffer is an optional display-only integration; it is not the production export binding.

Controller owns visible/preview leases. Exports temporarily retain them. Cancelled, stale, rejected and replaced outputs are released exactly once. A failed build keeps the previously committed model visible, but export is gated if visibleRevision differs from projectRevision.

## Viewport and remount

`createThreeViewportAdapter({ThreeViewport,onSelection,onDiagnostic,onCapabilitiesChanged})` wraps main ThreeViewport. attach(host) returns detach; controller attachViewport replays its visible lease and selection on every attach, including StrictMode detach/remount. A detached renderer may ignore setModel, while the controller retains its lease for that replay.

setModel({lease,revision,blocks}) is synchronous and borrows the lease only during the call. Three validates ARCH then copies into GPU arrays; it never acquires/releases the controller lease. Failure preserves the old render and controller visibility. Controller checks ticket/revision/access immediately before promotion without an intervening await. Camera mapping is world=(x,z,-y), with no manufacturing-coordinate edits.

Actions: fit, top, front, perspective, explode, toggle-grid, toggle-measure, center. setPrinter requires a verified bed polygon/maxZ. center returns a placement proposal; no automatic design mutation. No default bed dimensions or qualification are invented.

## Source originals, vector preview and editable derivative

source.ingest receives immutable owned file bytes, metadata, purpose, ticket and cancellation. It returns SourceResult or `{status:'proposal',result,changes:string[]}`. Required SourceResult fields: version, **exact ticket echo**, kind, metadata. Editing results and export artifacts also echo version/ticket; mismatches return ADAPTER_TICKET before publication/delivery. Optional assets are typed source/dependency/derived byte arrays; material slots are **null or 1..64**.

Separate trusted display field:
`preview?:{width,height,pixelSizeMm,png:Uint8Array,mediaType:'image/png'}`.
This can accompany an unchanged vector source. It does not imply conversion, raster editing, geometry validation or a mandatory proposal. Controller validates bounded dimensions, scale, PNG signature and bytes, stores its SHA-256 in source.preview, and includes it in source assets, history references, persisted snapshots and rescue exports. sourceCanvas uses only a PNG blob URL with editable:false and SOURCE_CONVERSION_REQUIRED for such vector previews. No preview means no canvas; it never implies editing readiness. Original SVG bytes are retained but never displayed as a raw SVG object URL.

`raster?:{width,height,pixelSizeMm,data:Uint8ClampedArray,preview:Uint8Array,previewMediaType:'image/png'}` describes an actual editable derivative, separately hashed RGBA and PNG. Returning raster for vector input requires confirmation. `{type:'source.convert',target:'raster'}` calls source.convert on the exact source/state/assets and always prepares a confirmation. Accept publishes the derivative and preserves raw originals. Adapters must report any losses/approximations explicitly.

Editing default uses the existing **Dedicated Worker RPC** in src/editing/worker.mjs. Pixel algorithms execute there. Parent may inject a createEditingClient factory to resolve deployment URLs and a Worker-capable portable encodePNG(image,{signal}); WebKit Worker OffscreenCanvas2D is not assumed. Pure core injection is for explicitly named Node tests only. editSource(EditorGesture) checks source/project revisions, maps the seven tools to the existing editing contract, and publishes returned RGBA/PNG only after atomic storage commit.

## Confirmations and history — implemented policy

All prepared source/build/export changes use `{type:'proposal.accept',id,confirmed:true}` through CommandResult.confirmation.retry. The proposal binds exact source/options/output hashes, live head and revision, user/access epoch, and cancellation. Changes invalidate it; no early commit. Internal acceptChange is reached through this normal command, not an unexposed UI method. previewBuild/commitBuild remain explicit controller integration extensions.

History uses planHistoryMove → restoreDomainSnapshot with validateProject → acceptHistoryMove, followed by CAS publication. Three or more undo/redo steps preserve increasing domain revisions while rejecting real stale branches. Pruning the 20-transaction / 24 MiB budget is confirmed and keeps current valid state and deduplicated byte references. Stored project and history assets are immutable; no JSON mesh or fake undo mutation.

## Identity, reset and backend navigation

Every online request targets same-origin /api/v1, includes cookies/CSRF as required, rejects redirects and checks scoped identity. Settings and BYOK metadata are per user; no shared credential fallback. The dynamic AI registry exposes legal sizes/qualities/model versions; callers choose size and quality explicitly. Quote → consent → submit maps to backend routes; cancellation and close-unknown retain actual accounting semantics.

OIDC policy is implemented and authorized: after the just-completed trusted same-origin POST /auth/start, same-tab navigation to its authorizationUrl is allowed. Validate at most 8192 characters, HTTPS, no username/password/fragment. Never take navigation targets from projects/settings/query/errors. This is navigation only: no external fetch or JS loading exemption.

Logout, authVersion or user change abort jobs, release private leases/URLs, clear controller state and invoke adapters.reset(). Without a top-level reset the controller invokes per-adapter reset/clearPrivateState/dispose. Parent reset must terminate source/geometry/editing Workers and private SAB state, lazily recreating Workers next use; initialization waits for completion. Static public fonts can be reloaded.

Online lease verification defaults to Ed25519 WebCrypto. Unsupported cryptography is an explicit gate. Optional allowAuthenticatedLeaseResponse:true accepts only a fresh just-received authenticated HTTPS assertion when WebCrypto reports NotSupportedError, never persisted tokens or arbitrary offline payloads. This policy choice is exposed for parent adjudication; tests report WebKit's exact capability separately.

## Storage and remaining injected seams

Default storage policy: prefer-opfs, allowIDBFallback, fallbackWhen ['unsupported','verification-failed']; fresh write/read/hash probe, never UA selection or mid-commit fallback. CAS is authoritative even with navigator.locks. State/history/head publication precedes visible rebuild; no atomicity across GPU and disk is claimed. Post-commit acknowledgement loss is recovered only after reading the same transaction and exact document.

Source codecs, native exporter, trusted PNG encoder, printer qualification, public font/emoji catalogs, file delivery, mirror directory and permanent purge are explicit parent adapters. Missing bindings return capability/error gates. pickMirrorDirectory invokes the actual picker immediately in the activation stack. Delete is a recoverable CAS tombstone. Unknown schemas remain gated/raw-exportable without invented product identity. Cloud replica remains an independent interface needing remote CAS/conflict copies, not silent last-writer-wins.
