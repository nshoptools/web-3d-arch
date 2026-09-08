# Final scene export decisions, version 1

## Geometry and identity

Input is the completed final manufacturing `ArchSceneView` (root geometry ABI1)
or its leased ARCH/1 packed equivalent. `volume_mm3` and planar source contours
are not treated as geometry: solids and volumes are reconstructed from actual
vertices/faces. The source PLANAR shared-edge ledger is not used as evidence of
3D contact. Disjoint Z solids can share identical XY projections.

Union STL evaluates Manifold union of all parts. Material ZIP evaluates union
within each explicit `(slot, color_rgba)` pair; positive overlap between distinct
pairs blocks normal export. Inspection preserves that overlap and its warning,
without replacing color or inventing a partition. Face contact is allowed.
Default output rejects exact-coordinate-weld edge/vertex-link failures (including
point/edge contacts); inspection may serialize those structurally valid STL
records with the topology verdict retained. Open meshes that cannot participate
in the required solid union are rejected even in inspection. No concatenation
fallback, repair, voxelization or silent epsilon is used.

Group order is ascending unsigned slot then RGBA. A group retains the complete
list of input mapping indices/source IDs; source IDs are not recomputed from
color. Mapping must cover every part exactly once and match its source_index.
The material_source_id is a caller-supplied stable uint32 identifier, retained
separately from source_index. It is not derived from a transient address.

## Z and poses

STL coordinates are mm. Manufacturing orientation keeps every coordinate;
pattern-down rotates 180 degrees about global X then translates the entire
scene once so its bottom is Z=0. Groups are not independently recentered.
Explicit row-major isometries may translate/rotate/reflect but not scale/shear;
determinant -1 reverses winding before normals are computed from written f32
triangles. Bounds are checked again after pose. The original scene is immutable.

SVG selects **manufacturing Z** before export poses. It has its own explicit
front/back policy and rejects conflicting 3D pose settings. Front maps `(x,-y)`
to SVG; back maps `(-x,-y)`. SVG coordinates and physical width/height use the
selected mm/in unit (25.4 mm per inch); Z metadata always remains mm.

Single mode uses start=end and step=0. Range means a closed sequence of explicit
nanometre-grid sample planes, not extrusion or projected slab coverage. Every
plane has a labelled group; first is visible, later alternatives are hidden
groups in the same frame. Native Slice includes a mesh's bottom and excludes
its top. An empty section is a valid empty area. Exact adjacent duplicate
intersection samples at a mesh vertex Z are removed; exact point/line contours
with fewer than three distinct samples have no filled area. No short nonzero
edge is discarded, and no Z is nudged away from a selected boundary.

## Numerical and resource boundaries

Coordinates before/after transformations are finite and within +/-10,000 mm.
SVG endpoints enter a shared integer ledger at 10^6 units/mm with ties-to-even
rounding. Adjacent raw/quantized nonzero edges shorter than 2 grid units are
rejected before pinned Clipper2 can discard them. A 1.5 nm hole-width reproducer
is rejected; a nearby 8 nm hole remains present in the section oracle. These
are numerical tests, not printable dimensions. No material-specific offset
or tessellator is added. Clipper union normalizes Slice polygons; holes remain
oriented, with SVG nonzero fill and explicit material color policy.

The initial XY quantization distance bound is sqrt(0.5)*10^-6 mm. STL checks the
actual Euclidean f64-to-f32 vertex displacement against the requested output
limit (maximum .004 mm), rejects newly coincident distinct vertices, and rejects
degenerate written triangles. Native topology checks exact coordinate weld and
vertex-link cycles; file oracles separately measure volume, bounds, openings,
normals and section areas. Manifold tolerance and measured serialization error
are recorded. There is no proved total arbitrary-CSG/self-intersection bound;
`wholePipelineErrorBoundMm` remains null. Library rounding and finite corpora
must not be represented as exact arithmetic or physical accuracy.

Hard native caps: 2M vertices, 4M triangles, 4096 input parts, 256 groups,
256 slice planes, 2M output section points, 256 MiB encoded output and 320 MiB
working admission. Caller may reduce caps. The root additionally reserves
working + 3*output + 4 MiB within its existing 384 MiB budget, and charges input,
snapshot and output owners. At most four final-output owners are retained.
Bounds are checked before copies, at library result checkpoints and before
publication. Native-library transient allocation is not intercepted; estimates
are admission controls, not a strict RSS/OS allocation guarantee.

Root cancellation is generation-tagged and checked between ingest/boolean/
slice/group/encoding steps and before publication. The actual pinned header's
WithContext contract was inspected: Status on deferred trees observes context;
Slice/GetMeshGL64/Volume do not generally observe it. This synchronous adapter
checks the root flag around individual calls; it does not run an asynchronous
observer thread to forward flags during a library call. A single underlying
operation therefore still needs the parent's Worker watchdog. The old leases
remain immutable on every normal failure/cancel path. A trapped/terminated
Module follows the parent's existing whole-Worker retirement protocol.

## Files and gates

ZIP uses bounded ZIP32 stored entries, UTF-8 flag, CRC32 and deterministic
1980-01-01 timestamps. This Rust encoder is the equivalent bounded container
layout already used by root storage, not a replacement 3MF core. Independent
ZIP/XML readers reopen every tested archive and verify CRC/paths/file hashes.
STL has no unit/material fields: the instruction is always mm, and a companion
metadata buffer supplies manifest/warnings. ZIP includes manifest.json; SVG
includes metadata and exposes a companion manifest. Unicode names are retained,
invalid path/control characters replaced, Windows reserved names prefixed,
and the original plus actual filename are recorded.

Mandatory gates precede every format: NO_SNAPSHOT, INVALID_INPUT,
KERNEL_FAILURE, ASSEMBLY_VIEW, UNAPPLIED_MESH_EDIT, UNSUPPORTED_EXPORTER,
STALE_REVISION and INVALID_SERIALIZATION. Inspection requires explicit intent
and retains fail/unverified verdicts; it does not bypass upstream gates or
claim print readiness. Neutral STL mapping is independent of a printer's
filament capacity; same slot with different colors is reported. No machine
profile or compensation is invented. Mechanics/source-assembly R2 remediation
is outside this module, and its invalid verdict must be provided by the parent.
