# Trusted generated base — implementation contract

Factory:
createMeshGeneratedBase({kernel, sources, context, engineIdentity})

Use the existing kernel.operation, ensureRuntime and kernelLeases, the existing
createApplicationSources result, and applicationContext's CURRENT authority.
No new Module, EngineClient, provider, controller, ABI, Worker or build change.

## Parent API

const operand = await generatedBase.prepare({
  control, savedBaseState, assets, mode: 'prepare'
});
try {
  operand.check(control);
  // mesh.prepareApply(..., {control, model:operand.model, ...})
  // Retain until the native proposal is confirmed OR discarded.
} finally { await operand.release(); }

Use mode:'prepare' for first apply AND explicit reapply, including a current
mesh.applied=true state. For reapply, clone CURRENT state, set mesh.applied=false
and delete mesh.metadata.meshCsg in savedBaseState. No other generated recipe,
source, material, height, datum, profile/schedule parameter may differ.
Use mode:'replay' for reopening/undo/redo of the exact stored recipe. Its saved
state asset/fingerprint/engine/required tuple must match current meshCsg.
Omitting mode retains compatibility inference (applied -> replay), but parent
composition should always pass the explicit intent.
currentState is optional comparison data; it cannot override context().

assets is a Map<SHA256,{hash,byteLength,kind,bytes:Uint8Array}>. The service
copies/validates canonical saved-state bytes and every referenced source asset,
checking them against the CURRENT source/mesh inventory. Normal source guards
then validate exact original/numeric SVG bytes, raster receipt/31-buffer graph,
geometry hashes, stable region routes, materials and declared face references.

Result:
{version:'arch-mesh-generated-base/1', model, inspection, exportDescriptor,
 binding, check(control?), assertCurrent(control?), operation(invoke), release()}
release is async and idempotent. Parent synchronous proposal disposers must
track/handle that promise; await it in async finally/reset paths.
One live scope maximum. reset retires scopes, dispose also forbids new scopes;
neither resets the shared parent runtime or shared source service.

The callback alternative withBase({control,mode,base,assets},consume) accepts the
existing arch-generated-base-replay/1 descriptor and releases in finally.
A successful consumer may intentionally commit/adopt CSG and change context:
the service does not manufacture a stale error AFTER durable acknowledgement.
Publication/error recovery is still the existing mesh host transaction's job.

## Private root adapter hook

Inject generatedBase.verifyGeneratedBase into createRootMeshAdapter.
verifyGeneratedBase({model,control}) returns binding or throws. It recognizes
only THIS factory's live private model registry, same original ticket AND
signal, user/project/session/current revision/head, source inventory, native
client epoch and kernelLeases entry. Copied models/flags/functions fail.

Parent root adapter keeps ordinary model===context().model behavior. A separate
generated scope may satisfy first-apply authority only through this callback.
Replay also requires it; never substitute the visible derived mesh as a base.
Check before async/native work and after native preparation, comparing
binding.current.{userId,projectId,revision,headHash} with the root authority.
Keep all existing native/root manufacturing/export/CSG/current-head guards.
No root patch is supplied here because parent owns the staged CSG adapter.

Do not render or export operand.model. It is generatedBaseOnly and its native
head is CURRENT authority, while binding/APMS provenance preserves original
saved revision, state asset SHA, state fingerprint, generated execution
fingerprint, original source hash/revision, current identity and context hash.
It is registered for the CSG consumer, but not in the main product inspector.

## Explicit import-stage separation

The saved/current state can keep impOn=true. Only the private generated
execution projection substitutes catalog defaults for:
impOn, impOp, impScale, impX, impY, impZ, impRX, impRY, impRZ, impVox,
meshJoinTolerance, and omits app.mesh. All original/current entries are recorded
under delegatedImportFields (inactive migration-only impVox can be null).
No state or assets are committed/changed. All other generated settings, source
bytes, material overrides, geometry/region identities and datums remain exact.
Normal product instances still reject impOn and unrecognized generated tokens.
Reapply records replacedRecipeHash. Replay never relaxes its stored-base checks.
Native proposals/refusals remain failures; the service never confirms a source,
height, topology or resolution change to obtain a model.

Limits: one scope, 2 MiB canonical state, 10,000 asset refs, 64 MiB per asset,
128 MiB aggregate including state; existing source/product budgets also apply.
Current asset equality checks can scan those bounded bytes on guard boundaries.
No total numeric error/fit/printer/post-CSG qualification is inferred.

## Bounded evidence and known gaps

Canonical Node24.19 WASM is 064f52946188df285fc1328e7e2607a7cbdb174a82f85eded2e949a71f4c1b3c,
wrapper cd92ea536fcdff3f53bed29fc42022229f8e2cd24a942fa87237fa89fed58828,
checked against docs/releases/20260908-internal/evidence/canonical-build-receipt.json.
Two actual Node/WASM groups exercise SVG/shared boundary/hole and accepted raster
31-buffer graph with a hole, first apply, reopening at a new revision/head,
reapply with changed size, exact geometry bytes except generation, existing
independent mesh oracle, raw bytes/provenance, forged models/tokens, changed
source/asset/project, cancellation/session/reset/runtime retirement and native
result returning after reset. One Module is instantiated by the test runtime
and receives the pinned owned wasmBinary; no additional geometry provider.

The saved mesh recipe in tests is a labelled persistence fixture produced and
validated by the existing pending createMeshReplayRecord/replayMeshRequest.
The import bytes in that fixture are deliberately NOT processed by CSG.
This suite qualifies generated operands, not imported mesh parsing, CSG,
durability, compiled/browser RPC, whole application or release acceptance.

Observed MAIN gap preserved in node2..node6 and raster-seed-diagnostic evidence:
product-source-contexts.acceptSourceProposal passes a callback to
sources.raster.acceptProposal, but current raster-adapters accepts only c.
Fresh controller raster adoption therefore exits before its second stage.
The raster positive fixture uses actual production ingest/accept -> canonical
prepareAdoption -> persisted receipt -> native build, explicitly separate from
that unintegrated controller callback. No old expected fixture was weakened.
This delivery does not fix that separate source-adoption integration gap.

ASFR1 and datum-probe1 getters are required/pinned; this bounded delta did not run
a fresh text-frame/ASFR transform corpus or any browser suite. Existing parent
qualification remains separate. Parent joint CSG build/qualification is required.
Implementation only. Astra/max requested/inherited; fast/service-tier/runtime
model configuration not independently verifiable here; configuredReview=false.
