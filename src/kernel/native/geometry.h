#pragma once
#include <stddef.h>
#include <stdint.h>

// All counts and array offsets are element counts, never byte offsets.
// Input is borrowed for the duration of build. Output belongs to the handle.
// Call destroy exactly once, after every reader has released the snapshot.
// Native pointers use the native ABI; wasm pointers are uint32 linear offsets.
// Errors never throw across the C boundary. Build returns NULL on any failure.
#ifdef __cplusplus
extern "C" {
#endif
typedef struct ArchScene ArchScene;
// Optional synchronous callbacks. data and callbacks stay valid throughout
// the call; they must not throw, reenter geometry, or invoke async work.
typedef struct {
  void* data;
  uint32_t (*cancelled)(void* data);
  void (*progress)(void* data, uint32_t completed_units);
} ArchBuildControl;
typedef struct {
  uint32_t vertex_start, vertex_count, triangle_start, triangle_count;
  uint32_t color_rgba, source_index, contour_start, contour_count;
  double volume_mm3;
} ArchPart;
typedef struct { uint32_t index_start, index_count, part, reserved; } ArchContour;
typedef struct { uint32_t point_a, point_b, part_a, part_b; } ArchEdge;
typedef struct {
  uint32_t abi_version;
  uint32_t vertex_count, triangle_count, part_count;
  uint32_t point_count, contour_count, contour_index_count, edge_count;
  const double* vertices_xyz;
  const uint32_t* triangles;
  const ArchPart* parts;
  const int64_t* points_xy;
  const ArchContour* contours;
  const uint32_t* contour_indices;
  const ArchEdge* edges;
} ArchSceneView;

// Coordinates use 1,000,000 grid units/mm, |coordinate| <= 10,000 mm.
// contour_ends and shape_ends are strictly increasing cumulative end offsets.
// fill_rules: 0 = nonzero (SVG default), 1 = evenodd. Color 0xRRGGBBAA.
// Regions are painted in array order. Shapes must be opaque at this boundary.
// Each region extends between its positive bounded z0/z1 in millimetres.
ArchScene* arch_scene_build(const int64_t* xy, uint32_t point_count,
    const uint32_t* contour_ends, uint32_t contour_count,
    const uint32_t* shape_ends, uint32_t shape_count,
    const uint32_t* fill_rules, const uint32_t* colors,
    const double* z0, const double* z1,
    char* error, uint32_t error_capacity);
ArchScene* arch_scene_build_controlled(const int64_t* xy, uint32_t point_count,
    const uint32_t* contour_ends, uint32_t contour_count,
    const uint32_t* shape_ends, uint32_t shape_count,
    const uint32_t* fill_rules, const uint32_t* colors,
    const double* z0, const double* z1, const ArchBuildControl* control,
    char* error, uint32_t error_capacity);
int arch_scene_view(const ArchScene*, ArchSceneView*);
void arch_scene_destroy(ArchScene*);
uint32_t arch_geometry_abi_version(void);

// Immutable 2D operand handles for SVG clip graph evaluation. Empty results
// are valid. Normalized contours use nonzero fill after a boolean operation.
typedef struct ArchRegion ArchRegion;
ArchRegion* arch_region_create(const int64_t* xy, uint32_t point_count,
    const uint32_t* contour_ends, uint32_t contour_count, uint32_t fill_rule,
    char* error, uint32_t error_capacity);
// operation: 0 union, 1 intersection, 2 difference.
ArchRegion* arch_region_boolean(const ArchRegion*, const ArchRegion*, uint32_t operation,
    char* error, uint32_t error_capacity);
int arch_region_view(const ArchRegion*, const int64_t** xy, uint32_t* point_count,
    const uint32_t** contour_ends, uint32_t* contour_count);
void arch_region_destroy(ArchRegion*);
// Internal extension1: borrow owned normalized region objects for the entire
// synchronous call. Their source guards/clip resolution have already run.
// Paint order/shared topology/mesh validation are still performed. No point
// deletion, snapping, re-normalization or implicit conditioning is requested.
uint32_t arch_region_scene_abi_version(void);
ArchScene* arch_scene_build_regions_controlled(const ArchRegion* const* regions,
    uint32_t region_count,const uint32_t* colors,const double* z0,const double* z1,
    const ArchBuildControl*,char* error,uint32_t error_capacity);
#ifdef __cplusplus
}
#endif
