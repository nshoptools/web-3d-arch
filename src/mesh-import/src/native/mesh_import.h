#pragma once
#include <stdint.h>
#if defined(_WIN32) && defined(ARCHMI_SHARED)
#define ARCHMI_API __declspec(dllexport)
#else
#define ARCHMI_API
#endif
#ifdef __cplusplus
extern "C" {
#endif
/* ABI 1. One serial host; pointers are borrowed. Handle domains are separate
   from parent runtime snapshot/input/output IDs. begin grants one primary lease.
   Do not acquire it again. Last release invalidates all data. */
typedef struct {
 uint32_t vertex_start,vertex_count,triangle_start,triangle_count;
 uint32_t color_rgba,source_index,contour_start,contour_count;
 double volume_mm3;
} ArchmiPart;
ARCHMI_API uint32_t archmi_abi_version(void);
ARCHMI_API uint32_t archmi_begin(uint32_t original_bytes);
ARCHMI_API int32_t archmi_set_provenance(uint32_t,const char* source_id,const char* source_name);
ARCHMI_API uint8_t* archmi_source_ptr(uint32_t);
ARCHMI_API uint32_t archmi_source_len(uint32_t);
ARCHMI_API uint32_t archmi_source_count(uint32_t);
ARCHMI_API const uint8_t* archmi_source_at_ptr(uint32_t,uint32_t source_index);
ARCHMI_API uint32_t archmi_source_at_len(uint32_t,uint32_t source_index);
/* 3MF: native libzip/XML preflight + lib3MF decoder. No callbacks or paths. */
ARCHMI_API int32_t archmi_decode_3mf(uint32_t,double max_error_mm);
/* Trusted STLLoader host stages one source solid at a time as triangle soup.
   unit: 0 unspecified; 1 mm, 2 cm, 3 inch, 4 foot, 5 meter, 6 micron.
   Parser conversion deviation is measured by the host against original tokens. */
ARCHMI_API int32_t archmi_stage_stl(uint32_t,const double* xyz,uint32_t faces,
 uint32_t unit,uint32_t rgba,uint32_t material_chosen,const char* name,const char* material_id,const char* material_name,double conversion_error_mm);
/* Trusted pinned OBJLoader host stages indexed parts, preserving original v/f
   record IDs (zero based). Material/reference tables precede any staged part.
   NO_MATERIAL = UINT32_MAX. Source material name "" denotes no usemtl. */
ARCHMI_API int32_t archmi_add_material(uint32_t,uint32_t index,const char* id,const char* name,uint32_t rgba);
ARCHMI_API int32_t archmi_obj_source_material(uint32_t,uint32_t index,const char* name);
ARCHMI_API int32_t archmi_obj_library(uint32_t,const char* literal_directive);
ARCHMI_API int32_t archmi_stage_obj(uint32_t,const double* xyz,uint32_t vertices,
 const uint32_t* triangles,uint32_t faces,const uint32_t* face_materials,
 const uint32_t* source_vertices,const uint32_t* source_faces,const uint32_t* source_materials,
 uint32_t unit,const char* name,double conversion_error_mm);
ARCHMI_API const uint32_t* archmi_source_vertex_indices(uint32_t);
ARCHMI_API uint32_t archmi_source_vertex_index_count(uint32_t);
ARCHMI_API const uint32_t* archmi_source_face_indices(uint32_t);
ARCHMI_API const uint32_t* archmi_source_material_refs(uint32_t);
ARCHMI_API uint32_t archmi_source_face_index_count(uint32_t);
ARCHMI_API int32_t archmi_validate(uint32_t,double max_error_mm);
ARCHMI_API uint32_t archmi_acquire(uint32_t);
ARCHMI_API uint32_t archmi_release(uint32_t);
ARCHMI_API const double* archmi_vertices(uint32_t);
ARCHMI_API uint32_t archmi_vertex_count(uint32_t);
ARCHMI_API const uint32_t* archmi_triangles(uint32_t);
ARCHMI_API uint32_t archmi_face_count(uint32_t);
ARCHMI_API const uint32_t* archmi_face_materials(uint32_t);
ARCHMI_API const ArchmiPart* archmi_parts(uint32_t);
ARCHMI_API uint32_t archmi_part_count(uint32_t);
ARCHMI_API const char* archmi_report(uint32_t);
ARCHMI_API uint32_t archmi_report_len(uint32_t);
ARCHMI_API uint32_t archmi_publishable(uint32_t);
ARCHMI_API const char* archmi_error(void);
ARCHMI_API uint32_t archmi_transform(uint32_t,const double* row_major_4x3,double max_error_mm);
/* Bounded analytic-axial-box-csg/v1 proposal only: two sealed axis-aligned
   8-vertex/12-face boxes with identical Y/Z bounds, partial overlap along +X.
   Contact/containment/general meshes are explicitly unsupported.
   Explicit single-part target/tool proposal. 0 union, 1 subtract. Output
   retains target material; requires acknowledged material and valid inputs.
   No automatic target selection. General intersection qualification is separate. */
ARCHMI_API uint32_t archmi_boolean(uint32_t target,uint32_t tool,uint32_t operation,
 uint32_t acknowledge_target_material,double max_error_mm);
#ifdef __cplusplus
}
#endif
