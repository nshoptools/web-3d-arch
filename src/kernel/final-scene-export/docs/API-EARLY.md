# Final scene export: additive proposal 1 (implementation in progress)

Historical early proposal, retained for integration traceability. The completed
contract is [API.md](API.md); acceptance and exact hooks accompany the frozen
handoff. Future-tense statements below describe the earlier publication only.

Owner: this candidate owns `src/kernel/final-scene-export/**` only. Parent owns
root `abi.rs`, CMake, build.rs, build.ps1, Worker/client and product runtime.
Headers in `native/` are the concrete proposed ABI. No root source was edited.

Call graph:

```
parent committed final snapshot + trusted project gates/revision/material map
  -> root arch_control_reset(freshGeneration)
  -> root arch_input_create/ptr(AFEX/1 options + material map + UTF-8 filename)
  -> arch_export_final(snapshotLease, optionsHandle, freshGeneration)
       child pins root ARCH/1 snapshot; decodes checked aligned native arrays
       -> arch_final_scene_prepare(ArchSceneView, map, options, root control)
          Manifold ingest -> actual 3D union / material groups -> final Slice
       -> Rust STL / ZIP-store / section SVG encoder + manifest
       -> atomic immutable final-output publication (root allocator/budget)
  -> arch_final_output_ptr/len + metadata_ptr/len -> copy/download -> release
```

Do not route source SVG, PNG or 3MF into this module. It accepts the completed
post-CSG mesh, not the original slab footprint or a private C++ Scene. Root's
PLANAR ledger is ignored. Material grouping is exactly `(slot, color_rgba)`;
all source IDs remain listed in the manifest even when several parts merge.

## AFEX/1 wire descriptor (little-endian, no embedded pointers)

| Offset | Type | Meaning |
|---:|---|---|
|0..47|12 u32|Native options header in `ArchFinalOptions` field order|
|48,56,64,72|f64|Z start/end/step in mm, output position-error limit in mm|
|80..175|12 f64|Explicit row-major rigid 3x4 export isometry, or twelve zeroes|
|176..207|8 u32|Native resource limits and reserved=0|
|208|u32|Magic `0x58454641` (AFEX)|
|212|u32|Wire version 1|
|216|u32|Expected source snapshot generation (not export job generation)|
|220|u32|Gate bits: invalid input=1, kernel failure=2, assembly view=4, unapplied mesh edit=8|
|224|u32|Independent mesh verdict: unverified=0, pass=1, fail=2|
|228|u32|Explicit inspection export 0/1; must equal native inspection_mode|
|232|u32|Mapping count; exactly snapshot part count|
|236|u32|UTF-8 filename byte count (1..240)|
|240,248|u64|Source project revision and expected project revision; equal, nonzero|
|256..|24-byte records|`ArchFinalMaterial` fields: part, slot, RGBA, source_index, material_source_id, reserved=0|
|after map|UTF-8 bytes|Filename stem; no terminal NUL, sanitized and reported|

The Worker binds gates/revisions from trusted committed state. A document may
not supply pointers, handles or a self-attested qualification. Exact source
generation is additionally checked against ARCH/1. Inspection keeps warnings;
it cannot bypass mandatory gates or make an unrepresentable boolean valid.

## Geometry and output semantics

* STL union uses Manifold union of every final part. It never concatenates
  intersecting shells. STL ZIP unions each explicit pair, keeps common axes and
  one common transform/translation, and includes manifest.json in UTF-8.
* SVG uses Manifold Slice on the final solids at the requested Z. Single mode
  requires start=end, step=0. Sequence mode uses inclusive start+i*step with an
  exactly integral number of nanometre steps; separate labelled SVG groups,
  not a projection/union of a Z range. Native library convention is bottom
  included, top excluded; no epsilon is silently added to selected Z.
* SVG mm/inch is explicit; source Z always mm. Front maps XY to `(x,-y)` in SVG,
  back maps to `(-x,-y)` (view from -Z). Color is black union or explicit mapped
  opaque RGBA. Manufacturing part coordinates and snapshot are never modified.
* Pattern-down is a 180-degree X rotation `(x,-y,-z)` followed by one common Z
  translation to rest the complete scene at zero. General explicit rigid
  isometries may reflect; negative determinant reverses triangle winding.
  Matrix, determinant and translation are recorded. It is never a camera pose.
  SVG Z selection is before this export pose; slice XY uses front/back only;
  non-identity export poses with SVG are rejected as conflicting semantics.
* Scope admission bounds and checks between library operations preserve prior
  leases. They are not an interception of all Manifold allocations. Status on
  a deferred tree observes attached ExecutionContext; Slice/GetMesh/Volume do
  not necessarily observe it. Watchdog ownership remains with the root host.

Integration requires only a Rust child `mod` hook and a CMake child target plus
link/export entries. Do not move root State/CONTROL. The implementation will
ship exact preimage hashes and focused hooks; no whole-root replacement patch.
Native/WASM layout descriptors and tests will accompany the checked handoff.

Integration steering recorded: mechanics/source R2 belongs to the parent's
other implementation task. This exporter never repairs those inputs or infers
validity from a mechanics version getter. Parent supplies `INVALID_INPUT` for
invalid upstream geometry/parameters, including final wall/roof/datum verdicts;
that mandatory gate rejects every format even with inspection enabled.
`runtime-helper.mjs` is an optional small AFEX pack/file helper for the parent's
new text/product Worker dispatcher. No Worker/client replacement is supplied.
