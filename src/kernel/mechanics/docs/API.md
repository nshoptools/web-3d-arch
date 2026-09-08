# Mechanics C ABI 2 — stitching contract

Current additive semantics are **3**, reported by `arch_mech_semantics_version()`.
[ADR-004](ADR-004-final-strap-guard.md) adds final strap roof/floor proofs.
[ADR-003](ADR-003-final-geometry-and-datums.md) still governs final cavity guards,
datum11 `mech:cap:skirt.bottom`, integer validation and interval conversion.
An interval reference of `UINT32_MAX` means an unaligned nominal start face:
floor/ceil/nearest are unavailable zero placeholders, never a proposal. All
struct sizes below stay unchanged. Source extension1 remains available.

Prepared source slab kinds4/5 are detached text/text-base measured from bed Z0,
in manufacturing group2 with identity preview transform. Kinds0..3 retain the
body-relative coordinates below. Preserve this distinction when borrowing
`ArchMechSource` from `ArchAssemblyResult`; retain its owner through the call.
The separately frozen source component's API defines canonical indexed rings,
provenance and the source result lifetime. It needs no private root Scene pointer.

Public header: `src/mechanics.h`; stable numeric parameter registry:
`src/parameter_ids.h` and `docs/catalog-lock.json`. `catalog-map.mjs` maps the
same IDs for the domain adapter. IDs 1–126 preserve the pinned catalog order;
127/128 are `strapTolerance`/`meshJoinTolerance`. Existing enum values use
catalog order; every C struct uses fixed-width integers and Float64 millimetres.
Internal C++ containers never cross the boundary. Runtime library does no I/O.

```cpp
// Construct borrowed, bounded source/parameter/palette buffers in the Worker.
ArchMechResult* result = arch_mech_build(&request);
ArchMechView view{};
if (result && arch_mech_view(result, &view) && view.verdict == AM_OK) {
  // Feed vertices/triangles/ArchPart-compatible parts into the host snapshot.
  // Attach semantic/role/curve/interval/proposal metadata before atomic publish.
}
// A failed result has NO parts or vertices, but retains diagnostics/proposals.
// Consume/copy everything needed before destroying. Existing results survive
// later builds and failures. Null means even the result allocation failed.
arch_mech_destroy(result);
```

`AM_OK=0` means construction completed. `AM_INVALID=1`, `AM_UNSUPPORTED=2`,
`AM_NEEDS_ACCEPTANCE=3`, `AM_KERNEL_ERROR=4`, `AM_CANCELLED=5`. It is not an oracle verdict or fit
certificate. `fit_qualification` is always 0 (unqualified). `export_blocked`
is set on failure and assembly preview; slot conflicts have an additional
diagnostic and must gate machine-project export in the host. The result never
exposes partial mesh arrays on failure. Diagnostic/semantic records can describe
work before failure and must not be treated as a successful feature set.
Count/offset arithmetic is checked within declared
limits. Native callers must provide valid borrowed pointers and lengths;
untrusted documents cannot supply native pointers.

## Input source and ownership

- `ArchMechSource` version **2**: immutable, normalized footprint rings on 1e6 units/mm grid,
  explicit fill rule, source/provenance IDs, optional material slabs, and exact
  recipe bindings. Public source bounds are +/-10,000 mm with 1,000 mm maximum
  footprint span; ordinary parameter size stays 12–160 mm. Up to 200,000 points,
  1,024 source slabs, 2,048 output parts and 2,000,000 output triangles.
- Every ring has a stable caller-owned semantic ID. Every slab has a stable ID
  and provenance table reference. Source IDs are uint64 and must survive
  values beyond JS Number's safe-integer range. Use BigInt/accessors.
- Each slab declares its role: body for `AM_SOURCE_BODY`, artwork/rim for
  `AM_SOURCE_ART`, text for `AM_SOURCE_TEXT`, text-base for `AM_SOURCE_TEXT_BASE`.
  Kind describes construction; role chooses the palette. Slab stride is now 72
  bytes, with u64 attachment ID at offset 64. Text kinds require that ID; other
  kinds require zero. No source/slab ID may ambiguously target two source patches.
- Slab intervals are from source body bottom, not from bed. Cap shifts the source
  by `U`, integral charm by flange+neck height; other bodies start at Z=0.
  Two XY-coincident slabs at disjoint Z survive independently. They have no
  implied 3D contact merely because a root planar ledger says they share XY.
- `AM_RAISED_BODY`: generator supplies the uniform body, caller supplies artwork
  slabs at or above body height and optional explicit text hosts. Text can have
  its own lower datum and disconnected marks. It accepts `noi` without rim/bands.
  `AM_PREPARED_SLABS`: caller supplies the whole body/artwork partition. Parent
  owns four styles, rim/bands/core formulas and resolved material seams. Slabs
  are checked for positive interval, opaque color, non-overlap in 3D and lower
  support matching the footprint. Self-contained synthetic slabs demonstrate
  this interface; they do not certify parent artwork algorithms.
- Source field bindings include all source preparation/appearance controls and
  `baseH`/`plateT`. They compare exact mode/value/datum/layer indices. A new size,
  source style or height requires a regenerated context. `arch_mech_source_field`
  returns 1 for delegated controls, 2 for body-height consistency bindings.
- A direct validated-mesh-part input is not in ABI 2. Parent can provide resolved
  slab rings/Z now. Mesh CSG and mesh-only source-part acceptance need a versioned
  extension with geometry oracle provenance, units, indexed topology and target
  IDs; no conversion of arbitrary mesh into fake slabs is proposed.

Attachments: up to 256 flat `ArchMechAttachment` records, stride 48. Offsets
0/4/8/12 are ring start/count/fill rule/role, 16/24 are lower/upper double Z,
32/40 are semantic/provenance u64. Role is text or text-base. Slabs sharing an
attachment must exactly match its bottom footprint and Z extent. Explicit
`eyelet_attachment_id` chooses the host for `ringTren=chu`; missing or mismatched
hosts reject. Source footprint covers the main body; the text host can lie
beside it. Its independent footprint is supplied, never inferred from glyphs.

Bevel overrides: up to 1,025 flat `ArchMechBevelOverride` records, stride 40.
Offsets 0/8 are exact source-body/slab target ID and provenance u64; 16/20/24/28
are enabled/shape/steps/origin u32; 32 is radius double. Origin must be USER.
Shape 0/1/2 means round/chamfer/steps; steps 1–12 and radius .2–3 mm. Disabled
overrides retain those values in a dependency feature. Orphans/duplicate targets
reject; they are never rebound by array position. `bevelGop` merges compatible
global regions but keeps individual overrides separate.

The zero-initialized request sets `abi_version=2`, `source.version=2` and
`schedule.version=1`; all reserved fields remain zero. New trailing source fields
are attachments/count, selected eyelet attachment ID, bevel overrides/count.
This is a breaking input layout change. ABI-1 structs cannot be passed to it.

## Parameters, schedule and palette

`ArchMechParam` stride 40: six u32 at offsets 0,4,8,12,16,20; value f64 at 24;
provenance u64 at 32. Modes: 0 scalar, 1 nominal mm, 2 explicit layers,
3 body-height auto (`ringH`), 4 body-midpoint auto (`legoRanhZ`). Auto modes require
stored zero. The adapter maps only auto-origin groove zero to mode 4; explicit
user zero is literal. Omitted parameters use the versioned trial preset. Entries preserve
origin (`auto/user/preset`) and provenance; duplicate/unknown IDs, nonfinite or
out-of-domain values fail. Inapplicable fields remain in the effective parameter
snapshot without participating. Hidden/dependency-disabled values are retained.

Schedule stride 40: version/source tags/reserved, exact h0/h integer values,
provenance reference to the parent's full immutable schedule record and SHA.
No second authority for schedule: `layerH` must match h. The API uses exact
integer arithmetic for boundaries and publishes the boundaries covering the
manufactured scene, plus resolved per-feature Z intervals and signed deviations.

Roles: 0 body, 1 artwork, 2 rim, 3 skirt, 4 stem/ribs, 5 tray, 6 fastener,
7 text, 8 text-base. Datum 10 names the selected attachment bottom;
the adapter uses `source:attachment.bottom`. Other datum IDs remain unchanged.
These are mechanics role IDs, not assumed equal to UI/global role IDs. Adapter
callers map them explicitly into `ArchMechMaterial`; the integrated domain keeps
parent-owned material overrides in `content`, so the parameter adapter does not
infer a palette from that opaque payload. Colors are opaque `0xRRGGBBAA`; slots
are 1–16. User role
overrides retain color, slot and u64 provenance. Source slabs have per-slab
material assignments. Precedence is an explicit user slab override, then a user
role override, then the slab's original material. This preserves individual
artwork overrides while allowing body/rim role changes in prepared sources.
The library does not remap slots or collapse colors.

`src/domain-adapter.mjs` injects the integrated domain module, reuses its project
and field validation, and packs parameter bytes. It is pure metadata/command
code and has no geometry implementation. It preserves heights/datum and rejects
unknown feature datums or an old inscribed tolerance convention being silently
reused for a circumscribed hole. `proposalCommand` produces the existing atomic
`parameters.set` command; parent must preview/commit with current revision/hash,
then rebuild source. Native proposal planning can accept a normalized parameter
draft with a relationship conflict; the strict adapter encodes committed valid
projects. Parent must use that draft planning path before domain commit for a
depth adjustment that otherwise violates the current body-height constraint.

## Output arrays and semantics

- `vertices_xyz`: double triples; `triangles`: u32 triples with global indices.
  `ArchMechPart`, stride 40, exactly matches native geometry `ArchPart`: vertex
  and triangle start/count, RGBA, source index, zero contour fields, volume.
  Here source_index is the feature table index. Contour/edge arrays are absent;
  mechanics does not forge root's planar shared-edge ledger after 3D cuts.
- `ArchMechPartInfo`, stride 160: feature/role/slot/origin/group, provenance and
  a 16-double column-major preview matrix. Manufactured vertices already include
  print-layout placement. Applying this matrix is for preview only. Parts have
  stable feature IDs even when a feature's output changes triangle counts.
- Features, stride 176: fixed 96-byte NUL-terminated ID; kind (add/cut/dependency),
  primary parameter ID, role/group, source/provenance u64, six doubles with the
  per-feature dimensions shown in ADR formulas/source. All effective input
  records are retained for the full contributing-parameter provenance.
- Curve records, stride 48: feature/N/side/frame u32, radius/min/max/tolerance
  doubles. Side 0 is pin radial (negative=inward), 1 hole radial
  (positive=enlarged void), 2 profile/sector displacement, 3 enclosing sphere
  cutter material displacement, 4 sheared mouth material displacement. For sides
  2–4, negative removes extra material; positive retains extra material. Frame 0
  is manufacturing; frame 1 is the local radial profile **before** mouth shear.
  Side 3 N is the library sphere resolution, not a triangle count. Profile and
  sector records are separate contributions; they are not a whole-source bound.
  See ADR-002 formulas. This is not a sigma, printer-fit band or general boolean
  error certificate. Circle records include explicit +/-2e-8 mm quantization.
- Z interval records, stride 56: field/datum/mode/reference, z0/z1 and floor/ceil/
  nearest signed endpoint deviations. Preview does not modify manufacturing Z.
- Diagnostics, stride 200, contain bounded code/field/message. Proposals, stride
  168, contain field, mode/datum/reference, before/after, applicability and reason.
  One proposal is not permission to commit. Inapplicable out-of-domain proposals
  retain the requested amount and keep the last valid project unchanged.

Counts and offsets are element counts. Pointers are 64-bit on tested native
x64, 32-bit linear-memory offsets on tested WASM. Pointer-containing structs
are **not byte-identical across targets**. Fixture metadata records actual
`sizeof` values; do not memcpy native request/view structs into WASM. Flat
non-pointer records have the same declared strides; use little-endian packing.

| Record | Native x64 bytes | WASM32 bytes |
| --- | ---: | ---: |
| ArchMechRequest | 224 | 200 |
| ArchMechSource | 128 | 112 |
| ArchMechView | 152 | 112 |
| ArchMechSlab / Attachment / BevelOverride | 72 / 48 / 40 | 72 / 48 / 40 |

New feature IDs are `mech:lego:perimeter-groove`, `source:bevel:top:<sourceId>`,
`source:bevel:text:<sourceId>`, `source:bevel:step:<sourceId>:<ordinal>` and
`source:bevel-override:<sourceId>`. Joining global same-Z regions uses the minimum
member ID deterministically; parent must rebuild target mappings after splits.
Text eyelet `mech:keyring` carries its selected attachment as `source_id`.
Feature dimensions for groove are `[radius,centerZ,remainingRoof,0,0,0]`; bevel top/text
`[radius,shape,absoluteTopZ,0,0,0]`; steps `[z0,z1,inset,globalLayerIndex,0,0]`;
override `[enabled,radius,shape,steps,origin,0]`. Mouth chamfer dimensions are
`[axialLead,radius,slotLength,angle,uExtent,shearAmplification]`. Existing feature
dimensions and constructive formulas remain in ADR-001 except where ADR-002
supersedes them. Features label provenance, not one guaranteed connected mesh.

## Cancellation control

`arch_mech_build` remains synchronous. Optional `arch_mech_build_controlled`
receives a single-use control and the exact generation in 1..UINT32_MAX-1.
Revision and cancellation generation are separate. A stale generation or reused
control returns INVALID, with no mesh. `arch_mech_control_cancel` returns 1 only
for the exact generation and 0 for null/stale; a matching cancel is idempotent.
Destroy the control only after both build and all observers have stopped.

Stages: 0 new, 1 validation, 2 source, 3 surfaces, 4 mechanics, 5 finish,
6 complete, 7 failure, 8 cancelled. (The native cancellation fixture waits for
stage >=3 before its observer cancels.) Progress is the pinned library's current
evaluation progress in [0,1], not a monotonic overall percentage.

The generator uses checkpoints and `WithContext(...).Status()` on deferred
operations. Other forcing queries such as Volume/GetMeshGL/BoundingBox do not
themselves observe context in the pinned header, and derived Manifolds drop an
attachment. Bounded loops and the host watchdog cover operations without a
cooperative entry point. Single-thread WASM needs a host shared-memory observer
or Worker termination; JS cannot call cancel while that thread is inside C++.
Tests prove current/stale/cancelled result handling and native concurrent
cancellation, not hard interruption latency for every library query.

## Root runtime integration — version 2

Parent's `src/kernel/native/runtime.h` is now runtime ABI **2**, while native
geometry and packed snapshot stay **1**. Mechanics ABI is independently **2**.
The standalone fixture writes ARCH/1 solely to reuse the independent reader;
it is not a replacement runtime publication API.

Suggested parent extension (not an edit to root): add an `arch_build_mechanics`
job entry beside `arch_build_svg`, using the **same ABI-2 state/lease manager**.
One Worker calls serially. Reset strictly increasing generation first; parse
and consume the job input once even on failure; construct the candidate; check
the generation-tagged cancellation before publish; copy/own the flattened
buffers in the host's snapshot storage; destroy the mechanics handle only when
its buffers have been consumed. Publish only a current successful generation.

Success transfers **one primary owned lease** to EngineClient. Do not call
`arch_snapshot_acquire` again for that primary reader. Additional readers
acquire/release their own lease; failed message delivery releases the primary
lease in the Worker. A cancel for N cannot cancel N+1. Keep old leased snapshots
immutable, refresh typed-array views after memory.grow, copy transient error
bytes synchronously and retain metadata with the snapshot lease. C++ calls are
synchronous; use the existing bounded Worker watchdog for uninterruptible
library work. This candidate does not claim to implement that host lifecycle.

The semantic arrays are flat binary records and can grow with the scene. Parent
should retain them in a binary sidecar owned by the same primary snapshot lease;
keep runtime JSON metadata small and bounded. Do not append unversioned bytes
to ARCH/1 or serialize mesh/semantic bulk arrays into UI JSON. This sidecar and
the new job dispatch require parent integration; the existing runtime ABI-2
lease rules remain authoritative.

To link, add this candidate as a CMake subdirectory with
`ARCH_MECHANICS_FIXTURES=OFF` after main creates target `manifold`; target
`arch_mechanics` reuses it and `Clipper2::Clipper2`. Link that static target with
Rust and the existing kernel in the single Emscripten module. The production
library does not require the fixture's NODERAWFS or test filesystem support.
