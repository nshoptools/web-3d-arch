# Export application adapter — early integration contract 1

Status: constructor/source/declarations implemented. The checked handoff records
the final private-overlay test results. Read `src/integration/export-adapters.d.mts` for
the exact current types. This document is published before the final test seal.

Owner: new `src/integration/export-adapters.mjs` and `.d.mts`, focused tests and
documentation only. Root Worker/RPC, Halley's product binding, controller and
composition remain parent-owned. Frozen final-scene-export is read-only.

```js
const exporter = createExportAdapters({
  operation: kernel.operation,
  kernelLeases: kernel.kernelLeases, // WeakMap<ModelLease, {root, client}>
  context,                       // authoritative current application context
  finalScene,                    // synchronous trusted product evidence getter
  sourceSnapshot,                // committed validated vector/paint provider
  viewport,                      // complete frame capture provider
  printing,                      // sealed profile/schedule/material provider
  options: (formatId, context) => context.exportOptions[formatId],
});
// Parent chooses this exporter in application composition. The existing legacy
// kernel adapter remains unchanged; its stl/stl-parts-zip IDs are not reused.
```

| Public format ID | Prerequisite | Existing service |
|---|---|---|
|`svg-color`|committed-source|sourceSnapshot validated source SVG serializer|
|`svg-section`|matching-model|client.finalExport, AFEX format 3|
|`3mf-bambu-project`|matching-model|client.export3MF, **format: project**, Bambu adapter|
|`3mf-snapmaker-project`|matching-model|client.export3MF, **format: project**, Snapmaker adapter|
|`stl-material-zip`|matching-model|client.finalExport, AFEX format 2|
|`stl-union`|matching-model|client.finalExport, AFEX format 1|
|`png-viewport`|renderer|viewport complete-frame PNG capture|

Factory returns the current `arch-app-adapters/1` ExportAdapter. Formats are
always enumerated, even with model:null; missing evidence/bindings remain
visible with a typed reasonCode and fail/unverified/unsupported verdict.
Missing evidence never becomes a guessed AFEX INVALID_INPUT bit.

Call graph for native formats:

```
controller retains ModelLease and creates its operation ticket
  -> adapter captures current session/head/options and trusted final evidence
  -> operation(control, (current, generation) => {
       assert(current === kernelLeases.get(model).client)
       return current.finalExport(root, afexOptions, {generation})
       // or current.export3MF(root, request, {generation, format:'project'})
     })
  -> validate owned bytes + output identity/hash + provenance
  -> recheck current session/head/lease/options/provider token
  -> exact ticket ExportArtifact (or explicit source approximation proposal)
```

`afexOptions` is the plain **command** object accepted by frozen
`encodeFinalExportOptions`; mesh is never JSON. Parent's new finalExport RPC
packs it and uses `exportFinalFileBytes` inside its existing Module. Only the
injected common operation allocates a native generation. No EngineClient,
Module, generation counter, native snapshot registry or transport is created.
The application adapter never releases the model/root caller lease. Parent's
existing printing RPC acquires/consumes its own additional reader in finally.
`afexOptions.generation` is deliberately omitted: the parent's implemented
`EngineClient.finalExport` fills it from the exact owned root lease. The separate
`{generation}` comes exclusively from common operation. `serviceCapabilities.finalExport`
must be true. Parent's reported root RPC qualification is separate from this
worker's tests; the application tests label their direct service transport double.

## Context and Halley product evidence binding

`context()` returns `{state,userId,projectId,sessionKey,headHash,model,
exportOptions}`. sessionKey is an opaque identity that changes on logout,
reauth/access reset; headHash is the authoritative committed head, not a value
taken from an imported document. Context getters/provider getters are synchronous.

`finalScene({root,client}, context)` returns either a readiness error
`{status:'unverified'|'disabled',reasonCode,reason,verdict}` or:

```
{ status:'ready', key, projectId, revision, headHash,
  snapshotId, snapshotGeneration, epoch, snapshotSha256,
  gates:{invalidInput, kernelFailure, assemblyView, unappliedMeshEdit},
  meshVerdict:'pass'|'fail'|'unverified',
  projectScheduleHash, // required by the two 3MF routes; actual build's domain schedule
  sourceHashes:[{id,sha256}],
  parts:[{partIndex,sourceIndex,slot,rgba,materialSourceId,
          semanticId,materialId,sourceSemanticIds,materialProvenanceId?}],
  provenance }
```

All four gate booleans are explicit, trusted and required. Unknown validation
state disables with `FINAL_SCENE_EVIDENCE_UNVERIFIED`. Model.stats.verdict is not
a substitute for an independent scene verdict. The getter's `key` changes when
semantic evidence or qualification changes without a document revision.

Halley can use `productExportDescriptor` for stable parts/material/source IDs,
then bind independently measured scene verdict and authoritative gates. Current
descriptor partIndex is routing; it must not become semanticId/materialId.
AFEX materialSourceId is uint32: parent must supply a stable collision-free
binding when native provenance is uint64/string. **No truncation/hash guess.**
The adapter validates every part against actual ARCH/1 part sourceIndex/RGBA.
Missing mappings disable only dependent formats with a named reason.
The app compares `snapshotSha256` to actual owned ARCH bytes before dispatch.
`model.stats.verdict` is never read. A known valid upstream source may carry an
independent mesh verdict `unverified`/`fail` and enable explicit inspection.
Unknown upstream gates cannot be bypassed by inspection. Record the oracle's
identity/hash/scope in `provenance`; parent remains responsible for producing the
trusted evidence getter from actual proof, never from imported project JSON.

## Non-mesh providers

`sourceSnapshot.describe(context)` returns a ready descriptor with key,
sourceId/sourceRevision/rawHash, `representation:'validated-vector-paint'`,
validation verdict pass, serializer identity, dependency hash/length records
and provenance. It must represent the committed source, not preview pixels or
unpromoted text/shaping state. `acquire(descriptor, controlAndContext)` returns
an owned source lease with `serializeSVG(options, control)` and `release()`.
Its output is validated SVG bytes from that representation. Original curves,
paint, units, clips/holes/text provenance are serializer responsibilities;
unsupported source semantics produce a precise disabled capability. Parent
may compose existing text geometryToSvg or its validated canonical SVG source
serializer. The app adapter never parses/reconstructs geometry or fetches fonts.

`viewport.describe(context)` returns key, frameKey, width/height,
displayedRevision, displayedLeaseId (nullable), view kind and provenance.
`capture(descriptor, controlAndContext)` returns PNG bytes and the same key /
frameKey with a release callback if it owns temporary resources. frameKey is a
render-state revision (camera/model/source-view/canvas generation), not every
requestAnimationFrame tick. Any change during capture rejects that output.
An older displayed model is permitted and stays labelled with its actual
displayedRevision; a screenshot is never relabelled as current manufacture.

## Printing and options

`printing.describe(adapterId, context)` supplies readiness key, sealed
printerProfile and schedule, materialTable, `runtimeAvailable:true` and provenance.
The runtime availability value is explicit because the current root ready RPC
has no printing capability bit. It must come from the parent runtime binding.
This adapter calls
the existing printing validateProfile/validateSchedule/validateMaterials before
dispatch, builds exact stable part mappings and sends format:'project'. The
returned package manifest must name the requested vendor adapter. A neutral
Core package cannot satisfy either project route. Current printing services
are inspection-only; explicit inspection intent is required and unverified
slicer/physical checks remain unverified. No profile defaults or remap is made.
The domain schedule is validated with existing `domain/layers.mjs`, then its hash
must equal finalScene.projectScheduleHash. Its first/regular millimetres and
user/profile origins must equal the sealed printing schedule. Profile-derived
heights also require the same profile ID. Missing evidence disables only 3MF as
`FINAL_SCHEDULE_EVIDENCE_UNVERIFIED`; a numeric/origin mismatch is
`PRINTING_PROJECT_SCHEDULE_MISMATCH`. No layer-height default is selected here.

Each enabled route requires explicit options from the options callback, because
controller.exportFile(id) has no options parameter. At minimum: filename and
inspection boolean; mesh routes require orientation/rest/isometry values.
Section additionally requires single/sequence Z values, mm/in, front/back and
black/material color policy. The final declaration file fixes the exact shape.
Native `errorMm` is explicit, 1e-9 through .004 mm. Optional `limits` order is
vertices, triangles, groups, sections, sectionPoints, **outputBytes**, **workingBytes**,
reserved zero, identical to ArchFinalOptions. Default limits belong to the frozen
helper. App output cannot exceed 128 MiB; 3MF readback is bounded to 64 MiB.
Native filenames are limited to 160 UTF-8 bytes to avoid the child silently
truncating a longer request; Unicode and readable sanitization warnings remain.
3MF currently supports the already-baked manufacturing pose only; unsupported
pose requests are rejected, never ignored. Source SVG uses its original unit
and paint policy; PNG uses the captured frame's camera and dimensions.

Output extends ExportArtifact with metadata (provenance, actual byte hash/name,
warnings and qualification). **Controller currently delivers only bytes/name/MIME**:
parent composition/UI must retain/surface this metadata for STL/PNG sidecar or
export history; this worker does not edit that controller. Vendor/ZIP native
manifests remain intact. No format is renamed to hide a capability gap.

Provider-owned resources release in finally, including output validation,
abort, reset, stale head/source/frame and retired root lease. Reset invalidates
only this adapter's pending jobs; it does not dispose the shared runtime/model.
The final current-state check runs **after asynchronous provider cleanup** as
well. Source/viewport callbacks receive copied domain data and private asset bytes.
Final evidence distinguishes real WASM/printing/serializer execution from
explicitly named provider test doubles.
