# Integration recipe for parent

This candidate adds a sidecar; parent retains controller, source/product wiring, viewport, printing, authorization and the root Module.

```js
const scene = createFinalSceneEvidence({
  operation: kernel.operation,
  kernelLeases: kernel.kernelLeases,
  inspectModel: input => product.inspectModel(input),
  context: exportContext,
  gateState: finalSceneGateState,
  materialSourceIds: persistentMaterialSourceLedger,
  onChange: () => controller.emit(),
});
const exporter = createExportAdapters({
  operation: kernel.operation,
  kernelLeases: kernel.kernelLeases,
  context: exportContext,
  finalScene: scene.describe,
  sourceSnapshot, viewport: viewportProvider, printing: printingProvider,
  options: exportOptions,
});
```

1. Promote an actual owned product model through the normal authenticated controller path. exportContext.model must be that exact visible ModelLease; a draft or a structurally equal object does not qualify.
2. Submit scene.qualify({model, control}) as a normal cancellable controller job after promotion. Parent preflights access and authentic session before scheduling and publication. This is asynchronous work; never fire it directly from a synchronous formats() call. An unqualified new model stays unavailable until proof is complete.
3. Keep exportContext.headHash equal to native domainStateFingerprint(state), with state.revision separate. A storage manifest SHA is not this hash.
4. finalSceneGateState(context, inspection) supplies the four gates with a bounded versioned digest key (see GATES-LIFECYCLE.md). A parent's equivalent callback may use its private immutable build record. Hash long canonical JSON keys; the key limit is240 characters. Do not derive these from imported project fields, native mesh success, visible stats or lack of errors. Native product ownership/source/mechanics are also checked independently.
5. persistentMaterialSourceLedger(context, inspection) supplies all used full material IDs mapped to unique positive uint32 transport selectors. A complete current/retained table is also accepted; evidence retains the full table and digest, while native input only contains actual source parts. No conversion of a uint64 provenance ID to Number, hash truncation, color grouping or slot-as-identity. Keep full IDs in saved state/receipts.
6. If supplying projectScheduleHash for 3MF, retain the hash from the build that created the model. The printing provider's current edited schedule does not prove the built snapshot's schedule.
7. On project/session/access loss, stop scheduling, abort controller work and await scene.reset() with the parent's private-worker reset barrier. scene.reset neither releases the model nor retires the shared engine. Parent performs those ownership actions.
8. Release caller model leases only through existing controller ownership. The sidecar borrows them and observes retirement through the kernel WeakMap, epoch and live bytes.
9. Native finalSceneGeometry is the production binary64 readback API in ROOT-BOUNDARY.md. The material request and (when needed) neutral analysis-union request use the same borrowed root under distinct transport generations. Do not fabricate the capability. Legacy roots use the existing inspection STL operation internally; float32 collision errors remain blocked and temporary bytes are never offered for download.
10. The current parent product-services.mjs callback uses canonicalJSON as gate key. Replace that key with a versioned SHA-256 digest, or use finalSceneGateState; plain JSON exceeds the provider's240-character key admission limit. Generic exportBlocked remains an upstream blocker and must not be described as a specific assembly mode without the actual assembly parameter. These are parent composition changes, outside this new-file manifest.

Do not mark a build mesh pass merely because qualify started or product.inspectModel resolved. Read the resulting evidence.meshVerdict and its vector. Native upstream invalid gates are never bypassed by inspection. A caller can supply validationClient only as an explicitly named test/deployment transport; production default is the real bounded Worker.

## Public unavailable reason examples
SCENE_NOT_QUALIFIED; SCENE_MODEL_UNOWNED; SCENE_MODEL_STALE; SCENE_CONTEXT_CHANGED; SCENE_BYTES_CHANGED; SCENE_METADATA_CHANGED; SCENE_ARCH_GENERATION; SCENE_UPSTREAM_BLOCKED; SCENE_GATES_UNKNOWN; SCENE_MATERIAL_BINDINGS; SCENE_UNION_BINDING; MESH_*_BUDGET; MESH_WATCHDOG.

Errors during qualify reject the job and publish no new cache entry. Parent should surface that error code as a capability reason. Existing visible committed geometry and stored head are untouched. describe never throws to Ohm.
