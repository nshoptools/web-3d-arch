# AFGM/1 root boundary — existing API, no new root delta

Implementation binding. Boole owns root Rust/C++/wire/ABI and EngineClient/engine-worker. This candidate adds only the independent qualification sidecar/Worker.

## Exact current method
```ts
client.finalSceneGeometry(rootLease, {
  revision:string, expectedRevision:string,
  mapping:{part:number,slot:number,rgba:number,source:number,materialSource:number}[]
}, {generation:number}): Promise<{
  bytes:Uint8Array;
  metadata:{
    version:'arch-final-scene-geometry/1';
    sourceSnapshotSha256:string; sourceSnapshotId:number;
    sourceSnapshotGeneration:number; revision:string;
    format:'ARCH/1'; geometry:'material-union';
    grouping:'slot-rgba-materialSource/1';
    groups:{
      part:number; slot:number; rgba:number; materialSource:number;
      inputParts:number[]; sourceIndices:number[];
    }[];
    coordinateFrame:'source-manufacturing-mm';
    sourceUnchanged:true; meshVerdict:'unverified';
    nativeWarningFlags?:number; boundsMm?:number[];
  };
}>;
```

This supersedes the earlier request for an additional unionBytes buffer. No new root method, output field, Module, float proposal or root verdict upgrade is required.

## Two readbacks under the same controller job
1. Independently qualify the original owned binary64 snapshot.
2. Submit the actual inspected material mapping. AFGM unions each full (slot,RGBA,materialSource) key. Validate source SHA/id/generation/revision and exact nonduplicated input coverage. Independently check this material readback, including positive material overlap.
3. If that readback has one group covering all original parts, it already represents the whole union. Reuse its independently checked report.
4. Otherwise submit a second AFGM request on the SAME owned source. Preserve each original part index and source index, assigning every part the one temporary analysis key {slot:1,rgba:0xffffffff,materialSource:0xffffffff}. This requests the union of all original solids. Require exactly one output group and every original input part/source index once. Independently check its binary64 topology, winding and intersections.

The neutral key is ANALYSIS ONLY. It never replaces actual material identity, app.materials, slots, original ARCH bytes, native build bindings or FinalSceneEvidence.parts. Real material mappings and the full-ID table/digest remain separate evidence. unionMethod and unionAnalysisParts identify this readback explicitly.

Each native call uses the injected monotonic transport counter; the controller ticket and source snapshot generation remain unchanged. Every await rechecks exact visible model/root ownership, source bytes and native metadata, project/head/revision/session and live gate/table bindings. A failure/cancel publishes no evidence. The root closes its temporary result owner before returning copied bytes; the provider never releases the shared source lease.

## Private dense labels
AFGM ARCH part.sourceIndex is only an output group ordinal. Actual original slot/RGBA/materialSource and input membership come from metadata.groups. No metadata.parts aliases are needed. The checker validates exact group count/ordinal/RGBA and real mapping on the first readback, then the explicitly different analysis mapping on the second. Dense labels cannot become filament slots.

Native inspection=1 is readback admission only, not geometry approval. Positive overlap remains visible in the original/material paths. No float conversion, pose, manufacturing coordinate shift, implicit weld/repair or conditioning is used.

## Pins and observed evidence
The old f13 pair and legacy failures are preserved separately. Default clicky original doubles passed while legacy STL returned INVALID_SERIALIZATION:STL_FLOAT_COLLISION; no implicit consent workaround was used.

The actual native AFGM analysis-group experiment passed all five product unions (including clicky), source bytes unchanged; evidence/afgm-analysis-union-r1 stores exact readbacks, mappings and reports. That experiment used the separately pinned cf4 pair and is not a production browser claim.

Final browser tests use inputs/production-input-r1.json: current main core and production MJS 950225880c23476f9a6523111ac5a33aebb24f1d89bfa1d8f60bff1b1cc1c375 + WASM 211b392f097eb55c8b52898e7b6123cb4b4b4539bfc68a5223d2f9e4c4d0e4cd, copied and verified before testing. This production pair has no test-fixture exports.

Global pipeline error, Boolean equivalence to design intent, output serialization qualification and physical fit remain separate unknowns. No native success is a checker pass.
