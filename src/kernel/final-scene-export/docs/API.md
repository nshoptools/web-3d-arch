# Final scene export API, version 1

Implemented additive child of root runtime ABI2. Packed snapshots remain
ARCH/1; `geometry.h` remains native ABI1. This component owns only
`src/kernel/final-scene-export/**`. The parent applies the focused integration
hooks and supplies trusted state from its serial Worker dispatcher.

## Call graph and authority

```
committed final snapshot lease + trusted revision/gates/verdict/material map
  -> arch_control_reset(fresh export generation)
  -> arch_input_create/ptr(AFEX/1 command bytes)
  -> arch_export_final(snapshot, options, fresh export generation)
       consume options on every path; internally pin source snapshot
       ARCH/1 -> checked aligned borrowed-native adapter (no JSON mesh)
       -> arch_final_scene_prepare(ArchSceneView, map, options, root control)
          actual meshes -> Manifold union/groups -> final mesh Slice
       -> Rust STL / ZIP32 / section SVG and metadata encoders
       -> atomic publication of immutable final-output owner
  -> copy output bytes + metadata -> arch_final_output_release
```

`runtime-helper.mjs` supplies `encodeFinalExportOptions` and `exportFinalFileBytes` for
this call path. The exact exported helper names are listed in that source.
It takes trusted gate flags and verdict explicitly; there is no validity
default. Metadata JSON is permitted; mesh vertices/faces never cross as JSON.
The source scene may originate from SVG, shapes, text, raster or imported mesh.
It must already contain all committed mechanical/CSG operations. No decoder,
source reconstruction, material reassignment or mesh repair runs here.

The exporter cannot establish project semantics from triangles. Parent binds
`INVALID_INPUT` for any invalid source/parameter/wall/roof/datum verdict, and
keeps the source revision and mesh verdict together. Those gates cannot be
bypassed by inspection. The mechanics/source R2 task and any future semantics
getter belong to the parent/assigned worker, not this component.

## Public functions and owners

| Function | Result and ownership |
|---|---|
|`arch_final_export_version()`|Child runtime version 1. Root version remains 2.|
|`arch_export_final(snapshot, options, generation)`|Nonzero final-output handle transfers one primary output lease; zero means no publication and root error text is available. Registered options input is consumed on **all** paths.|
|`arch_final_output_ptr/len(handle)`|Borrowed immutable file bytes; invalid handle gives null/0.|
|`arch_final_output_metadata_ptr/len(handle)`|Borrowed UTF-8 manifest bytes; invalid handle gives null/0.|
|`arch_final_output_acquire(handle)`|Adds one reader lease and returns file pointer, or null.|
|`arch_final_output_release(handle)`|Releases exactly one final-output lease; last release invalidates both byte buffers. Invalid/wrong-kind handle returns 0.|
|`arch_final_native_abi_version()`|Native child version 1.|
|`arch_final_native_layout(kind)`|Native sizes/offsets below; unknown kind returns 0.|
|`arch_final_scene_prepare(scene, map, count, options, control, error, capacity)`|Opaque `ArchFinalExport*` owning all prepared output arrays, or null and a bounded NUL-terminated reason. Inputs/control are borrowed only through completion.|
|`arch_final_scene_view(result, out)`|Copies POD view with borrowed pointers into the result owner; returns 0 for null arguments.|
|`arch_final_scene_destroy(result)`|Destroys the native result and invalidates its views.|

The raw native API operates on **trusted native buffers** with valid pointer
ranges. It does not accept project-controlled addresses or verify project gate
flags; callers outside the supplied Rust adapter must perform the same trusted
admission first. It uses the root `ArchSceneView`/`ArchPart` layout, not a private
C++ Scene. Vertex/triangle part ranges must cover the flat arrays consecutively;
triangle indices are global and must lie within their part's vertex interval.
Source XY contours, shared-edge ledger and reported part volumes are not used
as evidence of 3D geometry or contact. Actual triangles are ingested and measured.

Root snapshot caller leases remain unchanged. An additional internal snapshot
pin lives until native work and encoding finish. Child output IDs are allocated
from the root ID sequence, but have their own type-specific registry; never
release them with `arch_output_release` or `arch_snapshot_release`. Final owners
charge the root byte budget and cannot evict old root readers/outputs. At most
four final owners may coexist; additional reader leases do not consume slots.
The Worker serializes mutations; another thread may only update tagged atomic
cancellation. Recreate JS heap views after memory growth. A terminated Module
follows the parent's existing whole-Worker retirement policy.

## Flat native descriptors

All scalars are fixed-width, naturally aligned POD. Headers are authoritative;
AFEX/1 wire values are little-endian. Native pointers are 64-bit on the checked
Windows host and 32-bit offsets in the checked wasm32 Module.

| `layout(kind)` | Descriptor | Native bytes | wasm32 bytes |
|---:|---|---:|---:|
|0|`ArchFinalOptions`, alignment 8|208|208|
|1|`ArchFinalMaterial`|24|24|
|2|`ArchFinalGroup`|40|40|
|3|`ArchFinalSection`|32|32|
|4|`ArchFinalContour`|16|16|
|5|`ArchFinalView`, alignment 8|272|248|
|6|Offset of first pointer in `ArchFinalView`|216|216|

Each material record contains six u32 values: `part_index`, `slot`,
`color_rgba` (numeric `0xRRGGBBAA`), `source_index`, `material_source_id`, zero.
Require exactly one record per input part, slot 1..65535 and opaque alpha FF.
`source_index` must match the source part. `material_source_id` is a stable
caller ID, kept even when several parts share the same slot/color. Group member
indices address these mapping records. No ID is derived from a pointer or a
color alone. Neutral exports do not impose a machine filament-count limit.

Group order is ascending unsigned `(slot, color_rgba)`. Union STL/monochrome SVG
use one synthetic black group with slot 0, retaining all original mapping
records and members. Material output retains explicit pairs. A slot used with
several colors is reported as `SLOT_HAS_MULTIPLE_COLORS`, not silently remapped.

## AFEX/1 wire table

No optional trailing data or embedded pointers; all reserved values must be 0.

| Byte offset | Type | Field |
|---:|---|---|
|0,4|u32|Native options version 1, size 208|
|8|u32|Format: 1 union STL, 2 material STL ZIP, 3 final section SVG|
|12|u32|Pose: 0 manufacturing, 1 pattern-down X, 2 explicit isometry|
|16|u32|Rest whole exported scene on bed: 0/1; pose 1 requires 1|
|20|u32|Section mode: 0 single Z, 1 explicit Z sequence|
|24|u32|SVG side: 0 front (+Z), 1 back (-Z)|
|28|u32|SVG color: 0 black union, 1 mapped material colors|
|32|u32|SVG units: 0 mm, 1 inch (25.4 mm); STL requires 0|
|36|u32|Inspection mode: explicit 0/1|
|40,44|u32|Reserved 0|
|48,56,64|f64|Section Z start/end/step in manufacturing mm|
|72|f64|Output serialization error limit, 1e-9..0.004 mm|
|80..175|12 f64|Row-major rigid 3x4 isometry, only pose 2; otherwise twelve zeros|
|176..203|7 u32|Vertex, triangle, group, section-plane, section-point, output-byte, working-byte limits|
|204|u32|Reserved 0|
|208,212|u32|AFEX magic `0x58454641`, wire version 1|
|216|u32|Expected **source** snapshot generation, not export job generation|
|220|u32|Gate bits: invalid input 1, kernel failure 2, assembly view 4, unapplied mesh edit 8|
|224|u32|Independent mesh verdict: unverified 0, pass 1, fail 2|
|228|u32|Explicit inspection 0/1, must equal offset 36|
|232,236|u32|Mapping count; UTF-8 filename byte count (1..240)|
|240,248|u64|Source project revision and expected revision: equal and nonzero|
|256..|24-byte records|Material mapping above|
|after mapping|UTF-8|Filename stem, no NUL, no trailing bytes|

The helper accepts u64 revisions as BigInt/string or safe integral numbers;
fractional u32s, non-finite doubles, unsafe integers and ill-formed UTF-16 names
are rejected. Pass enums as numbers; no silent string-to-number field casts.

## Geometry and file policies

STL performs actual union of the full final scene; ZIP performs union within
each pair, with one common manufacturing pose for all files. Positive interior
overlap between different pairs blocks normal export. Inspection can preserve
it with a warning. Exact coordinate-weld edge/vertex-link failures block normal
STL; structurally writable inspection STL may retain that failure. Open meshes
unrepresentable by the required Manifold union still fail in inspection.

Pattern-down is `(x,-y,-z)` and one global translation to put the bottom at zero.
General rigid matrices allow explicit reflection; determinant -1 reverses
winding. Written STL normals are computed from the actual f32 vertices. No
camera or preview transform is used, and no source coordinate is mutated.

SVG calls Manifold Slice on the final mesh groups. Single mode requires
start=end, step=0. Sequence mode requires end>start, positive step and an integral
number of 1 nm grid steps, including both endpoints. It is a sequence of sample
planes, **not** projected coverage over a slab. First group is visible; labelled
alternatives are hidden in the same coordinate frame. Bottom is included and
top excluded at exact mesh boundary Z; there is no Z epsilon. Front XY maps to
`(x,-y)` in SVG, back to `(-x,-y)`; units scale XY and physical dimensions only.
SVG rejects 3D export poses/rest as conflicting with its manufacturing-Z policy.
No layer schedule is inferred or changed. Parent resolves any layer/datum
selection to explicit manufacturing Z values before calling this service.

Manifold section endpoints enter one ties-to-even integer ledger (10^6/mm)
shared across groups. Clipper2 normalizes the oriented contours. Exact adjacent
duplicate intersection samples may be removed; short **nonzero** edges below
2 grid units reject the operation, never disappear silently. Holes and
disconnected filled regions remain separate contours. No independent material
offset epsilon is applied. See DECISIONS for numerical limits and unverified
whole-pipeline error; no arbitrary CNC/toolpath compatibility is implied.

STL is binary and uses mm by instruction (the format stores no unit/color).
ZIP32 entries use method 0, UTF-8 names, CRC32, deterministic timestamps and
`manifest.json`. Unicode names are preserved; invalid path/control characters
are replaced, reserved Windows names prefixed, and output stems capped at 160
UTF-8 bytes without splitting a character. Requested and actual names are
reported. The companion metadata contains source snapshot hash/generation,
revision as decimal string, original material/source IDs, group membership,
common transform, measured volumes, error ledger, warnings, filenames, actual
byte counts and SHA-256. ZIP's embedded manifest omits its own recursive hash;
SVG's embedded metadata omits its own file hash. Companion metadata completes
those file/download records.

For SVG, `qualification.nativeStructuralChecks` describes ingested part meshes;
the output is a set of section paths. It is not a general proof of the 3D
union's exact-weld topology. The trusted independent scene verdict remains a
separate field and cannot be inferred from this structural flag.

## Errors, limits and cancellation

Zero return means no output publication. Read the existing root error accessors
immediately before starting another job. Prefixes are machine-readable reason
strings; native details can follow `INVALID_SERIALIZATION:`. The parent maps
these into its capability-scoped gate registry and user-facing remediation.

| Reason family | Meaning / caller action |
|---|---|
|`NO_SNAPSHOT`, `STALE_REVISION`, `STALE_GENERATION`|Acquire the completed final snapshot for the committed revision; use a fresh export generation.|
|`INVALID_INPUT`, `KERNEL_FAILURE`, `ASSEMBLY_VIEW`, `UNAPPLIED_MESH_EDIT`|Resolve the corresponding trusted upstream state; inspection cannot override it.|
|`UNSUPPORTED_EXPORTER`|Use one of the three provided formats; other parent-owned exporters use their own services.|
|`MESH_VERIFICATION_REQUIRED`|Obtain an independent pass or make an explicit inspection request; retain the verdict.|
|`EXPORT_WIRE_*`, `EXPORT_OPTIONS_*`, `FINAL_SNAPSHOT_*`, `MATERIAL_MAPPING_*`|Malformed command/layout or stale part mapping; rebuild the typed command from committed state.|
|`INVALID_SERIALIZATION:*`, `MATERIAL_INTERIOR_OVERLAP`, `SECTION_*`|Unrepresentable/invalid geometry, chosen section or error budget; report the detail and retain the old output.|
|`*_LIMIT`, `*_RANGE`, `EXPORT_RESOURCE_OPTIONS`, `EXPORT_ALLOCATION`|Exceeded bounded capability; reduce the explicit workload or recover through the parent's watchdog. No partial file is published.|
|`CANCELLED`|Tagged cancellation was observed; prior outputs and caller source leases remain valid.|

Native hard caps are 2M vertices, 4M triangles, 4096 input parts, 256 material
groups, 256 section planes, 2M section points, 256 MiB output and 320 MiB working
admission. Caller may lower caps. Shared root admission additionally charges
`working + 3*output + 4 MiB` using checked arithmetic inside the root's 384 MiB
budget. Root inputs/snapshots/final owners stay charged. These are conservative
admission checks, not interception of every native allocation or an RSS bound.

Cancellation/progress use the existing generation-tagged root control. Checks
occur around mesh ingest, union/intersection, groups, slices, transforms, file
encoding and publication. The actual supplied Manifold context API is used at
its documented deferred evaluation entry point, but this adapter does not run
an asynchronous observer during a single library call. Slice/GetMesh/Volume
are not claimed interruptible. Parent retains the Worker watchdog and whole
Module retirement policy. Browser evidence demonstrates real in-flight tagged
cancellation at an observed checkpoint, not every possible instruction.
