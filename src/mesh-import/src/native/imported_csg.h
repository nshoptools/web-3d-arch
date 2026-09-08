#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Additive component ABI1; root ABI2 and ARCH/1 unchanged.
 * Same serial Module/allocator as archmi and Manifold. Neither input primary
 * lease is consumed or acquired by compute. Caller keeps both live through
 * the synchronous call. Result owns ONE primary lease, release exactly once.
 * A geometry proposal is never an export/commit certificate. Parent must
 * validate the FINAL scene (including mechanics roof/floor/datum gates),
 * confirm the exact descriptor under the current project head, then publish
 * its own independent root snapshot lease. There is no "mark valid" bypass.
 */
enum ArchcsgOperation { ARCHCSG_UNION=0, ARCHCSG_DIFFERENCE=1, ARCHCSG_INTERSECTION=2, ARCHCSG_IMPORT_AS_PART=3 };
enum ArchcsgPolicy {
 ARCHCSG_REQUIRE_DISJOINT_MATERIALS=0,
 ARCHCSG_KEEP_SELECTED_TARGET_MATERIAL=1
};
enum ArchcsgVerdict {
 ARCHCSG_GEOMETRY_PROPOSAL=0, ARCHCSG_INVALID=1, ARCHCSG_RESOURCE=2,
 ARCHCSG_CANCELLED=3, ARCHCSG_STALE=4, ARCHCSG_MATERIAL_PROPOSAL=5,
 ARCHCSG_UNVERIFIED=6
};
typedef struct {
 uint64_t semantic_id,source_id,provenance_id;
 uint32_t source_index,material_index;
} ArchcsgPartBinding;
typedef struct {
 uint64_t material_id;
 uint32_t rgba,slot;
} ArchcsgMaterial;
typedef struct {
 uint32_t abi_version,operation,material_policy,generation;
 uint64_t project_revision,feature_id;
 uint32_t generated_snapshot,generated_generation,importer_handle,reserved;
 const uint8_t* generated_arch;
 uint32_t generated_arch_bytes,generated_part_count;
 const ArchcsgPartBinding* generated_bindings;
 const ArchcsgMaterial* generated_materials;
 uint32_t generated_material_count,target_count;
 const uint64_t* target_semantic_ids;
 /* 4 rows of xyz coefficients: x,y,z basis then translation, in mm.
  * All12 supplied doubles are retained exactly. No implicit unit/repair/scale.
  */
 const double* imported_transform;
 double query_tolerance_ceiling_mm;
 uint32_t max_vertices,max_triangles,max_parts,max_operations;
 /* Exact root-computed source/recipe provenance, bounded UTF-8 JSON metadata;
  * root owns hashing/ACL/head validation. Mesh bytes never travel in JSON.
  */
 const char* provenance_json;
 uint32_t provenance_bytes;
} ArchcsgRequest;
typedef struct {
 void* user;
 /* Return1 only while generation AND project revision are current. */
 uint32_t (*current)(void*,uint32_t,uint64_t);
 uint32_t (*cancelled)(void*);
 void (*progress)(void*,uint32_t);
} ArchcsgControl;
typedef struct {
 uint32_t vertex_start,vertex_count,triangle_start,triangle_count;
 uint32_t color_rgba,source_index,contour_start,contour_count;
 double volume_mm3;
} ArchcsgPart;
typedef struct {
 uint32_t operand,part,face,reversed;
 /* operand0 references original generated ARCH triangle; operand1 references
  * normalized importer triangle (OBJ raw f mapping stays in the import record).
  * STL raw facet identity is not fabricated from a new mesh triangle.
  * These are library-tracked ancestry, not interpolated numeric properties.
  */
} ArchcsgFaceOrigin;
typedef struct {
 uint32_t abi_version,verdict,requires_final_gates,reserved;
 const double* vertices;
 const uint32_t* triangles;
 const ArchcsgPart* parts;
 const ArchcsgFaceOrigin* face_origins;
 uint32_t vertex_count,triangle_count,part_count,face_origin_count;
 const char* report_json;
 uint32_t report_bytes;
 const uint8_t* confirmation_descriptor;
 uint32_t confirmation_bytes;
} ArchcsgView;
/* Bit 0/1/2/3: union/difference/intersection/import-as-part. Append requires
 * no targets, disjoint-material policy, and retains exact input part topology. */
uint32_t archcsg_abi_version(void);
uint32_t archcsg_operation_mask(void);
/* Read actual retained result command; UINT32_MAX for invalid handles. */
uint32_t archcsg_operation(uint32_t result);
uint32_t archcsg_compute(const ArchcsgRequest*,const ArchcsgControl*);
uint32_t archcsg_view(uint32_t result,ArchcsgView*);
uint32_t archcsg_acquire(uint32_t result);
uint32_t archcsg_release(uint32_t result);
/* Equality/current-head check only; NEVER publishes, clears final gates or
 * mutates a project. Wrong descriptor/revision fails without partial change. */
uint32_t archcsg_confirmation_matches(uint32_t result,const uint8_t*,uint32_t,uint32_t generation,uint64_t revision);
uint32_t archcsg_source_count(uint32_t result);
const uint8_t* archcsg_source_ptr(uint32_t result,uint32_t source);
uint32_t archcsg_source_len(uint32_t result,uint32_t source);
const uint32_t* archcsg_import_source_faces(uint32_t result);
uint32_t archcsg_import_source_face_count(uint32_t result);
/* layout(0=request,1=view,2=control, field0=sizeof; subsequent fields
 * follow declaration order). UINT32_MAX for unknown; JS uses actual wasm32
 * offsets, never guesses native pointer width. Part/binding/material fixed
 * strides are40/32/16 bytes on both prepared targets. */
uint32_t archcsg_layout(uint32_t type,uint32_t field);
const char* archcsg_error(void);
#ifdef __cplusplus
}
#endif
