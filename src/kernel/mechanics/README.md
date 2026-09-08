# Executable mechanics 0.3.0

Mechanics ABI2 now reports **semantics3**; the source datum extension stays1.
This R2 implementation adds a guard for the actual final horizontal strap
tunnel after bevels, every feature cut and material partition. A closed mesh
alone cannot certify its roof and floor.

Read [the full-domain guard and its bounds](docs/ADR-004-final-strap-guard.md),
[API and ownership](docs/API.md), and the source package's
[parent-only integration delta](../source-assembly/docs/R2-ROOT-INTEGRATION.md).
The guard measures existing final material using bounded volume/interval
queries. It excludes intentional vertical side mouths, accepts only a
positive resolved roof/floor, and rejects unavailable proofs without mesh.
It never changes a user's dimensions or invents a positive material skin.

The static C++17 library generates five products from typed footprints,
material slabs, parameters and an explicit first/regular layer schedule.
Returned closed parts retain materials, semantic IDs and provenance.
Source assembly0.2.0 supplies the four artwork styles, rim/bands/core and
body-/bed-relative text; the two packages share exact downward-height semantics.
No root runtime ABI, allocator, CMake or build script is changed.

Use [the portable R2 build/test recipe](../source-assembly/docs/R2-BUILD-AND-TEST.md)
for this candidate and its exact frozen preimage. All new outputs go to a
fresh authorized run. CMake reuses the parent's existing manifold and
Clipper2::Clipper2 static targets when present. Standalone builds require the
explicit read-only pinned Manifold source and derived Clipper2 tree; downloads
are OFF. Source, carry-patch and license hashes remain in pins.json/licenses.
Native IEEE options and Emscripten6.0.9 pthread/fexceptions are tested.
There is no extra WASM instance or root integration change in this candidate.

The parameter adapter injects the persistent parent src/domain module. It
adds mechanicsSemanticsVersion3/sourceHeightSemanticsVersion2 metadata without
rewriting encoded parameters or source provenance. Root getters and exports
must be gated by parent after integrating the frozen files.

[ADR-003](docs/ADR-003-final-geometry-and-datums.md), [ADR-002](docs/ADR-002-v2.md)
and [ADR-001](docs/ADR-001-v1.md) retain earlier feature decisions except where
ADR-004 explicitly supersedes them. Their acceptance reports are historical,
not qualification of this remediation. [The semantic catalog](docs/semantic-contract.json)
maps the catalog fields; field coverage does not imply every feature combination
has been independently accepted.

The R2 evidence preserves same-input old/new outputs and uses independent
ARCH/1 readers for topology, volumes, sections, mouths and material boundaries.
The guard applies to the evaluated faceted solid. Unknown whole-pipeline
source/curve/Boolean error bounds remain unqualified; complex valid inputs may
fail closed when a full-domain proof cannot resolve within its budget.
Runtime leases, browser execution, export, slicers and physical fit stay with
their owners. These are implementation tests, not configured independent
review or a release approval.
