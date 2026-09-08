# Float export application API, current-main rebase

Constructor stays `createExportAdapters({operation, kernelLeases, context,
finalScene, sourceSnapshot, viewport, printing, options})`. Keep current
`createFinalSceneEvidence().describe`, private `product.inspectModel`, material
ledger, gate provider and `exportOptionsFor(id, context.state)`. The obsolete
frozen `createProductExportEvidence` factory is not restored. No stats inference,
second Module, generation allocator, source repair or primary lease release.

An exact typed `STL_FLOAT_COLLISION` on ordinary union STL can offer a proposal
only when actual current scene evidence is pass, inspection is false and the
current ready service reports finalFloat=true with all three documented methods.
The adapter uses common operation to call `prepareFinalFloat(actualRoot, AFEX,
{version:1,maximumDisplacementMm:Math.min(errorMm,.00001),workLimit:50000000},
{generation})`. The .004 mm option and candidate budget are not consent.

Returned `{status:'prepared-proposal',version:'arch-app-adapters/1',ticket,
proposalHash,changes,confirm(control),release()}` has no bytes or artifact.
Confirm uses the root's exact frozen six-field confirmation descriptor (version,
proposalHash, sourceHash, sourceGeneration, sourceRevision, optionsHash). It
rechecks original ticket, current state/head/session/options, evidence, exact
WeakMap/root ownership, metadata and source bytes before and after the RPC.
Only explicit confirm returns a validated ordinary artifact for the parent's
existing save/receipt flow. SourceMesh remains pass; modified output mesh is
unverified, with native bounds, original IDs and exact confirmation in metadata.

Original input and confirmation AbortSignal references are captured once, so
replacing either public property cannot redirect cancellation or leak listeners.
Duplicate/in-flight confirmations cannot produce another file. Release is
synchronous/idempotent through `releaseFinalFloat`, allocates no generation and
does not restart the runtime. Late prepare/confirm results, stale sessions, cancel,
reset and dispose retire temporary proposal state while preserving primary source.
ZIP/section, inspection, missing capability, unknown evidence and every other
serialization error retain their ordinary typed disabled/error paths.

This rebase preserves parent consent/profile/source/runtime fixes and adds only
the three production deltas listed in `root-hooks.json`. See
`ROOT-INTEGRATION.md` for exact scope, replay and qualification boundaries.
