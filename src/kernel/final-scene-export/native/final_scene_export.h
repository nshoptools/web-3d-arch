#pragma once
#include "geometry.h"
#ifdef __cplusplus
extern "C" {
#endif
/* Additive geometry child ABI 1; root runtime remains ABI 2, ARCH remains 1.
 * All pointers are trusted borrowed native buffers, NEVER document values.
 * Source is the completed FINAL post-CSG manufacturing scene. Its planar
 * contours/edges are deliberately unused; they do not prove 3D contact. */
typedef struct ArchFinalExport ArchFinalExport;
enum ArchFinalFormat { AFE_STL_UNION=1, AFE_STL_MATERIAL_ZIP=2, AFE_SVG_SECTION=3 };
enum ArchFinalOrientation { AFE_MANUFACTURING=0, AFE_PATTERN_DOWN_X=1, AFE_ISOMETRY=2 };
enum ArchFinalSectionMode { AFE_SINGLE_Z=0, AFE_Z_SEQUENCE=1 };
enum ArchFinalSide { AFE_FRONT=0, AFE_BACK=1 };
enum ArchFinalColor { AFE_MONOCHROME=0, AFE_MATERIAL_COLOR=1 };
enum ArchFinalUnits { AFE_MM=0, AFE_INCH=1 };
enum ArchFinalWarning { AFE_W_TOPOLOGY=1, AFE_W_MATERIAL_OVERLAP=2, AFE_W_REFLECTION=4 };
typedef struct {
  uint32_t abi_version, struct_size, format, orientation;
  uint32_t rest_on_bed, section_mode, view_side, color_policy;
  uint32_t units, inspection_mode, reserved0, reserved1;
  double z_start_mm, z_end_mm, z_step_mm, output_error_mm;
  /* Row-major 3x4 rigid isometry, only used when orientation=2. A negative
   * determinant is explicit reflection and reverses emitted triangle winding.
   * Other orientations require all twelve entries zero. No scale/shear. */
  double transform[12];
  uint32_t max_vertices, max_triangles, max_groups, max_sections;
  uint32_t max_section_points, max_output_bytes, max_working_bytes, reserved2;
} ArchFinalOptions; /* 208 bytes native and wasm32, alignment 8 */
typedef struct {
  uint32_t part_index, slot, color_rgba, source_index;
  uint32_t material_source_id, reserved;
} ArchFinalMaterial; /* 24 bytes. Exactly one entry per input part. */
typedef struct {
  uint32_t slot, color_rgba, vertex_start, vertex_count;
  uint32_t triangle_start, triangle_count, member_start, member_count;
  double volume_mm3;
} ArchFinalGroup; /* 40 bytes; member indices address the mapping input. */
typedef struct {
  uint32_t sample_index, group_index, contour_start, contour_count;
  double z_mm, area_mm2;
} ArchFinalSection; /* 32 bytes; source-manufacturing Z, before export transform */
typedef struct { uint32_t point_start, point_count, section_index, reserved; } ArchFinalContour;
typedef struct {
  uint32_t abi_version, struct_size, format, warning_flags;
  uint32_t vertex_count, triangle_count, group_count, member_count;
  uint32_t section_count, contour_count, point_count, reserved;
  double applied_transform[12];
  double manufacturing_bounds[6];
  double input_volume_sum_mm3, union_volume_mm3, library_tolerance_mm;
  const double* vertices_xyz;
  const uint32_t* triangles;
  const ArchFinalGroup* groups;
  const uint32_t* members;
  const ArchFinalSection* sections;
  const ArchFinalContour* contours;
  const double* points_xy;
} ArchFinalView;
uint32_t arch_final_native_abi_version(void);
/* kind 0 Options,1 Material,2 Group,3 Section,4 Contour,5 View,6 pointer offset. */
uint32_t arch_final_native_layout(uint32_t kind);
ArchFinalExport* arch_final_scene_prepare(const ArchSceneView*,
    const ArchFinalMaterial*,uint32_t material_count,const ArchFinalOptions*,
    const ArchBuildControl*,char* error,uint32_t error_capacity);
uint32_t arch_final_scene_view(const ArchFinalExport*,ArchFinalView*);
void arch_final_scene_destroy(ArchFinalExport*);
#ifdef __cplusplus
}
#endif
