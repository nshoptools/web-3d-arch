# Same-root API version 1

`EngineClient` adds these methods, inside the existing
`kernel.operation(control, (client, generation) => ...)` scheduler:

```js
const proposal = await client.prepareFinalFloat(snapshotLease, finalOptions,
  {version:1, maximumDisplacementMm:0.00001, workLimit:50_000_000}, {generation});
// Show proposal.metadata and proposal.view(1..8). Prepare has no STL bytes.
// Application explicitly obtains consent and checks its current context/CAS.
const artifact = await client.confirmFinalFloat(proposal, proposal.confirmation,
  {generation:nextGeneration});
// artifact = {bytes: Uint8Array, metadata}; retained output is independently owned.
proposal.release(); // or client.releaseFinalFloat(proposal)
```

The numerical budget in this example is an explicit caller choice, not silent
consent or a printer-precision setting. Existing `finalExport()` behavior is
unchanged. Conditioning is qualified, non-inspection **union STL** only.

Proposal: `{version:'arch-final-float-proposal/1',id,epoch,confirmation,metadata,
view(kind),release()}`. Exact-object ownership is verified with the client's
private WeakMap; copies/forged objects and stale epochs are rejected. The
immutable descriptor is:

```ts
{version:'arch-final-float-confirmation/1',
 proposalHash:string, sourceHash:string, sourceGeneration:number,
 sourceRevision:string, optionsHash:string}
```

All hashes are lowercase SHA-256. ProposalHash binds original native geometry,
source SHA/revision/generation, canonical export settings/material mapping,
conditioning algorithm/options, candidate geometry, correspondence and proof
summary. OptionsHash binds every AFCP byte. Binary ABI pointer sizes/padding are
excluded from the canonical geometry-context hash. Confirm requires the exact
source/settings/proposal descriptor. The new job generation is separate from
source generation and is never substituted into the descriptor. Repeated exact
confirmation produces identical file bytes under a new output lease.

`view(1|3)` returns a defensive Float64Array copy (old/candidate XYZ).
`view(2|4)` returns old/candidate Uint32 triangle indices. Kinds5/6/7/8 are Uint32
old→new vertex IDs, retained source face IDs, removed source face IDs, contracted
source edge pairs. Every call gets a fresh WASM view before copying. No bulk
geometry appears in JSON. Editing the copies does not edit the proposal; direct
C pointer-contract violations are additionally detected by seal checks.

The proposal internally retains a source reader. The caller can release its
primary snapshot reader after successful prepare. Release does not allocate a
generation, cancel another job or start a Worker; after runtime retirement it
only retires the local opaque lease. Native IDs come from the shared root
monotone serial and are never reused in that runtime. A replacement Module's
numeric ID cannot reauthorize an old epoch. Account/project context ownership
and atomic approval publication remain application responsibilities.

## Material readback

```ts
client.finalSceneGeometry(root, {
 revision:string, expectedRevision:string,
 mapping:[{part,slot,rgba,source,materialSource}]
}, {generation})
// Promise<{bytes:Uint8Array, metadata:{
//   version:'arch-final-scene-geometry/1', sourceSnapshotSha256,
//   sourceSnapshotId,sourceSnapshotGeneration,revision:string,
//   format:'ARCH/1',geometry:'material-union', ...}}>
```

`serviceCapabilities.finalSceneGeometry` is true only after the actual version
export returns1. Output is owned ARCH/1 binary64 in source manufacturing mm;
header generation is source generation. No STL/f32 conversion, conditioning,
pose/bed transform or mesh passing verdict occurs here. `meshVerdict` is
`unverified`; native warnings do not replace the independent checker.

Legacy native format2 groups by `(slot,RGBA)`. Readback creates private dense
slots for the full `(slot,RGBA,materialSource)` key. Consequently distinct
materialSource IDs remain distinct even with matching color/slot; same full key
is unioned. Metadata.groups maps each output part to its original key,
inputParts and sourceIndices. ARCH part.sourceIndex is the output group ordinal.
Positive material overlap is retained for the checker using native inspection
mode; immutable R3 manufacturing/assembly/revision authority remains mandatory
before work and before publication. Input material mapping still must match
source indices. No equivalence to all future exporter settings is asserted.

## Native entry points and registered wire

All functions are in the **same root ABI2 Module/allocator**. Mutation calls are
serial; only generation-tagged cancellation atomics may be updated concurrently.
Root registered input handles are consumed on every path, including malformed
wire, stale generation, forged handle and cancellation. Caller offsets are never
accepted. Read existing `arch_error_*`/control for failures.

- `arch_final_float_version() == 1`
- `arch_final_float_prepare(snapshot,input,jobGeneration) -> proposal ID`
- `arch_final_float_confirm(proposal,input,jobGeneration) -> final-output ID`
- `arch_final_float_buffer_ptr/len(proposal,kind)`; len is bytes
- `arch_final_float_release(proposal) -> 1 if released, otherwise0`
- `arch_final_scene_geometry_version() == 1`
- `arch_final_scene_geometry(snapshot,input,jobGeneration) -> final-output ID`

Use existing `arch_final_output_ptr/len`, metadata getters and
`arch_final_output_release` for files/readback, never snapshot/input release.
Proposal has one primary lease (no acquire); it internally owns a snapshot reader.
Kind9 on the proposal is bounded UTF-8 JSON metadata only. C arrays are read-only
borrows valid until release, and their JS views must be recreated after growth.
Worker copies/releases final-output leases before returning owned Uint8Array.

Separate little-endian envelopes; **no AFEX reserved word is reused**:

| Envelope | Exact fields |
| --- | --- |
| AFCP/1 | 64-byte header then complete unchanged AFEX/1 bytes: magic0, u32 version1 at4, header64 at8, total at12, AFEX length16, zero20..31, f64 maxDisplacementMm32, u64 workLimit40, zero48..63. |
| AFCC/1 | Exactly128 bytes: magic0, version1 at4, size128 at8, flags0 at12, sourceGeneration u32 at16, zero20, sourceRevision u64 at24, raw32 SHA source32/proposal64/options96. |
| AFGM/1 | Header64: magic0, version1 at4, header64 at8,total12,mapping count16,sourceGeneration20,revision u64 at24,expectedRevision u64 at32,zero40..63. Then six-u32 mapping records (last reserved0). |

At most two proposals and four shared final outputs; shared root admission384MiB.
Proposal geometry caps65536 vertices/131072 triangles/256 components; metadata
<=64KiB. Confirm output respects AFEX budgets. Readback caps200000 vertices,
400000 triangles,256 groups,4096 input parts,16MiB output,256KiB metadata,196MiB
working reservation. Float prepare reserves configured workspace, source-copy
length, three AFEX output budgets and4MiB headroom, then charges actual retained
capacities. These are admission estimates, not RSS interception. Typed limits
and scientific scope are in [PROOF.md](PROOF.md).

Declarations: `src/kernel/final-scene-export/float-runtime.d.mts` exports the
client interface and injected-module helpers. New C headers are
`native/final-float-runtime.h` and `native/final-scene-geometry-runtime.h`.
No production Cargo dependency or root build/CMake change is required; the
existing final-scene native export list adds the eight runtime symbols.

## Printing ABI proof on ready

The ready RPC obtains `printingVersions:{rootABI,arch3mfABI,kernel3mfABI}` by
calling the actual same Module getters. Both printing getters absent means null;
a partial/incorrect non-null tuple is rejected by EngineClient as
`PRINTING_ABI_MISMATCH`. The client exposes the validated frozen object
`{rootABI:2,arch3mfABI:1,kernel3mfABI:2,epoch:client.epoch}` under
`serviceCapabilities.printingVersions`. Retirement clears it to null; a new
Worker obtains a new proof. It does not infer ABI from method presence and does
not claim Module content hashes. The parent release loader joins its separately
verified module/wasm byte hashes with this live-epoch ABI evidence.
