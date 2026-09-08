#pragma once
#include "mechanics.h"
#ifdef __cplusplus
extern "C" {
#endif
/* Additive trusted native ABI1. Owned guard is taken once from a successful
 * mechanics result. It retains immutable final feature domains, not a verdict
 * token. No JavaScript pointer entry and no request/default re-evaluation. */
typedef struct ArchMechGuard ArchMechGuard;
typedef struct {
 uint32_t abi_version,vertex_count,triangle_count,part_count;
 const double* vertices;
 const uint32_t* triangles;
 const ArchMechPart* parts;
 /* Original generated part index, or UINT32_MAX for an explicitly separate
  * imported part. Groups for imported parts must be explicitly approved. */
 const uint32_t* owners;
 const uint32_t* groups;
 /* Four u32 per triangle: operand, original part, original face, reversed.
  * Pinned Manifold ancestry; not exclusive authorship of coincident faces.
  * Operand0 is generated,1 imported. Original face is GLOBAL in the original
  * mechanics triangle array. Source datum witnesses require operand0,
  * matching original owner/face, reversed0, exact material/oriented plane and
  * provably positive represented facet area. Caller labels alone never prove
  * geometry. Root must bind this trusted native view to its current guard. */
 const uint32_t* face_origins;
} ArchMechDerivedView;
uint32_t arch_mech_derived_guard_version(void);
ArchMechGuard* arch_mech_guard_take(ArchMechResult*);
uint64_t arch_mech_guard_charge(const ArchMechGuard*);
void arch_mech_guard_destroy(ArchMechGuard*);
/* Synchronous borrowed arrays; result has diagnostics and NO replacement mesh.
 * The input and original guard are never modified. Cancellation checkpoints
 * surround bounded library calls; the parent Worker retains its watchdog.
 * Actual changed geometry never uses raw-source resolution admission or
 * Simplify/SetTolerance/zero-volume query cleanup. Unresolved raw contacts
 * return AM_UNSUPPORTED + DERIVED_*_UNVERIFIED, export blocked, no mesh.
 * Exact complete oriented-facet multiset equality can retain an unchanged
 * group's original qualification. Query-local original qualification requires
 * exact equality of every boundary facet intersecting the query's expanded
 * world AABB, including multiplicities and material. Changed tunnels require
 * this certificate over the complete original opening before raw roof/floor;
 * this conservative domain restriction is not an all-input numeric proof.
 * Exact AABB plane/edge/point contact certifies zero 3D interior intersection;
 * positive overlap or uncertain raw contacts still take the original raw gate.
 * Source datum identity is an original owner/feature/material/oriented Z-plane,
 * not immutable cap triangulation. Each needs a positive-area facet witness
 * with matching pinned generated ancestry. Full removal/top cut-off refuses.
 * Area sign uses outward-rounded binary64 interval arithmetic (strict IEEE;
 * no fast-math). Uncertain signs refuse. Mechanical facets remain exact;
 * source datum evidence never bypasses full cavity/tunnel checks above.
 * Expected extra storage is included in guard_charge; the128MiB cap remains. */
ArchMechResult* arch_mech_guard_check(const ArchMechGuard*,
 const ArchMechDerivedView*,ArchMechControl*,uint32_t generation);
/* Import-as-part only: full per-original-part facet/multiplicity/material
 * identity is verified against this owned guard before reusing original pair
 * qualifications. New-part topology, manufacturing/assembly collisions, bed
 * and all final roof/floor/datum checks remain mandatory. No Boolean cleanup. */
ArchMechResult* arch_mech_guard_check_append(const ArchMechGuard*,
 const ArchMechDerivedView*,ArchMechControl*,uint32_t generation);
#ifdef __cplusplus
}
#endif
