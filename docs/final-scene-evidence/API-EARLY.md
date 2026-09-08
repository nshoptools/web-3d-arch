# Final scene evidence v1 — current integration API

Implementation only, Astra/max inherited per caller; fast/service tier unverified. No configured independent review. Main, other rooms and toolchain are read-only.

## Parent composition
```js
const scene = createFinalSceneEvidence({
  kernelLeases: kernel.kernelLeases,
  operation: kernel.operation,
  inspectModel: input => product.inspectModel(input),
  context: exportContext,
  gateState: finalSceneGateState,
  materialSourceIds: materialSourceIdsFromState,
  workerURL: new URL('../core/mesh-qualification-worker.mjs', import.meta.url),
  onChange: () => controller.emit(),
});
// In a normal authorized controller stage AFTER model promotion:
await scene.refresh({model: exactVisibleModelLease, control});
// The refresh/qualify names are the same function.
createExportAdapters({...bindings, finalScene: scene.describe});
// Part of the private session/project reset barrier:
await scene.reset();
```

`context()` returns {state,userId,projectId,sessionKey,headHash,model}, or null after access loss. The model must be the EXACT visible owned ModelLease registered in kernelLeases. Do not wrap it or change stats. Promote first; exports remain disabled while asynchronous qualification runs. headHash is the native/domainStateFingerprint(state), not the journal manifest hash. Opaque sessionKey changes on identity/authentication reset.

`refresh/qualify({model,control})` returns {version:'arch-app-adapters/1',ticket,evidence}. It borrows caller leases without releasing them, uses the existing transport operation counter, and runs independent geometry checks in a separate JS Worker with NO native Module. Model/ARCH generation, root/client/epoch, head/revision, ticket, live gates/materials and bytes are checked before/after awaits.

`describe(record, context)` is synchronous for Ohm/Aristotle. Only the private WeakMap cache can supply ready evidence. It rechecks exact live ownership/context/bytes/metadata and drops stale eligibility. Errors return typed Unavailable. reset aborts private work, terminates the validation Worker and awaits publication barriers. Parent still owns release/reset of shared kernel/model/source workers.

## Gate and material authority
Concrete parent helper and timing: GATES-LIFECYCLE.md. planMaterialSourceIds now returns a full retained ledger with a required canonical SHA-256 digest; the synchronous resolver recomputes/verifies it.
`gateState(context,inspection)` returns exactly {key,invalidInput,kernelFailure,assemblyView,unappliedMeshEdit,projectScheduleHash?}, or null. Four booleans are mandatory. key must change with gate/build evidence. projectScheduleHash belongs to the actual built snapshot and retains the domain identifier prefix `sha256:`. Unknown gates block; no false/default values inferred from absence of errors.

`materialSourceIds(context,inspection)` supplies a unique positive u32 mapping for every used full materialId. It may return the COMPLETE current/retained table (up to256 rows), including unused IDs. The provider persists a normalized complete table plus canonical digest under evidence.provenance.materialSourceTable, bound to exact project/head/revision; native input still maps only actual source parts. The implemented helper and storage path are in MATERIAL-LEDGER.md. Allocate/persist during adoption BEFORE build, never during export. Full IDs, semantic IDs, slot1..64, RGBA and u64 provenance strings remain in FinalSceneEvidence.parts. No color grouping, numeric u64 narrowing or dense-label-to-slot inference.

Printing joins current app.materials by full ID, and selected sealed profile slots; no extra final-scene fields are needed. Polymer, extruder, printer bed and physical fit are outside this provider.

## Same-root AFGM/1 binding
Current types are in src/integration/final-scene-evidence.d.mts; ROOT-BOUNDARY.md describes the existing same-root API; no additional root delta is required.

Preferred method: client.finalSceneGeometry(root,{revision,expectedRevision,mapping},{generation}). AFGM output `bytes` contains separate material unions in binary64. The provider now consumes Boole's ACTUAL `metadata.groups` schema directly:
```ts
groups: {
  part:number, slot:number, rgba:number, materialSource:number,
  inputParts:number[], sourceIndices:number[]
}[]
```
Original full keys and all input memberships must match the submitted mapping. ARCH part.sourceIndex is only the output group ordinal; it is never a real filament slot. No extra metadata.parts aliases are requested.

Whole union uses the existing AFGM method again only after actual-material checks pass: all original part/source indices, one temporary analysis key {slot:1,rgba:0xffffffff,materialSource:0xffffffff}, one output group with complete original membership. A one-group actual-material readback can be reused directly. The independent checker qualifies the union in binary64. `unionMethod` and `unionAnalysisParts` distinguish analysis provenance; true materials/slots/parts never change. This supersedes the earlier `unionBytes` request and removes that root dependency. Both calls remain under the same controller job with separate monotonic transport generations and exact publication guards.

The old root fallback uses same-runtime internal inspection STL, checks its exact float32 representation and never offers those bytes for download. Default clicky on the pinned legacy pair fails STL_FLOAT_COLLISION. No implicit float conditioning is used; original double qualification is separate from export serialization/consent.

## Qualification scope
Checks cover exact represented triangle degeneracy, closed oriented edges, connected vertex links, component winding/nesting, self-intersection and inter-part interiors/shared boundaries. Work/size/watchdog limits and ambiguous contacts fail closed. The whole union gets a separate check. Native success, inspection=1 and stats never supply pass.

Geometry equivalence to source intent, thin features, total pipeline error, every future output conversion, slicer qualification and physical fit remain unverified/unqualified. Parent/exporter still checks actual output files and authorized publication. This provider does not itself authorize a session.
