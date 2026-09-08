#pragma once
#include "mechanics.h"
// Prepared source assembly ABI 1 / semantics 2. No decoder, layout or mesh JSON.
#ifdef __cplusplus
extern "C" {
#endif
enum ArchSourceDatum { AS_ART_BOTTOM=128, AS_RIM_BOTTOM, AS_FLAT_BOTTOM, AS_RECESS_TOP,
 AS_CAP_TOP, AS_TEXT_BOTTOM, AS_TEXT_BASE_BOTTOM, AS_DATUM_END };
// Probe-only unresolved layers. Accepted ONLY by arch_source_probe_indexed;
// reference_layer must be UINT32_MAX. Ordinary build remains strict semantics2.
enum ArchSourceProbeMode { AS_PROBE_LAYERS=5 };
enum ArchSourceVerdict { AS_OK, AS_INVALID, AS_RESOURCE, AS_CANCELLED, AS_KERNEL };
enum ArchSourceSlabKindExtension { AS_SOURCE_BED_TEXT=4, AS_SOURCE_BED_TEXT_BASE=5 };
typedef struct {
  uint32_t ring_start, ring_count, fill_rule, override_height;
  uint64_t semantic_id, provenance_id, text_group; // 0 = main artwork
  ArchMechMaterial material;
  ArchMechParam height; // artH override; text groups own their heights
} ArchSourceRegion;
typedef struct {
  uint64_t semantic_id, provenance_id;
  uint32_t placement, base_on; // 0 on model, 1 beside model on bed
  double base_pad, base_round;
  ArchMechParam height, base_height; // AM_MM / AM_LAYERS, datum AS_TEXT[_BASE]_BOTTOM
} ArchSourceText;
typedef struct {
  uint32_t abi_version, product, parameter_count, material_count;
  const ArchMechParam* parameters;
  const ArchMechMaterial* materials;
  ArchMechSchedule schedule;
  uint32_t point_count, ring_count, region_count, text_count;
  const int64_t* xy; // mm * 1e6, rings are canonical validated material regions
  const ArchMechRing* rings;
  const ArchSourceRegion* regions;
  const ArchSourceText* texts;
  const ArchMechParam* upstream_bindings; // exact effective IDs 1..7, already applied upstream
  uint32_t upstream_binding_count, max_slabs;
  uint64_t source_id, provenance_id, revision, eyelet_text_id;
  double tolerance_mm; // [0.00001,0.002], downstream export total <= .004
  uint32_t max_points, max_operations;
} ArchSourceRequest;
typedef struct {
  uint32_t slab_a, slab_b, kind, reserved; // 0 XY boundary with positive Z overlap, 1 horizontal face
  double area_mm2, z0, z1;
} ArchSourceContact;
typedef struct { uint64_t source_id, slab_id, material_provenance_id; uint32_t stage, band; } ArchSourceLineage;
typedef struct {
  uint32_t field_id, datum, mode, reference_layer;
  uint64_t semantic_id;
  double z0, z1; // semantics2: manufacturing Z; slabs retain their local coordinate contract, heights never snapped
} ArchSourceInterval;
typedef struct {
  uint32_t stage, segments; double radius, signed_min_mm, signed_max_mm;
} ArchSourceError;
typedef struct { uint32_t code, field_id; uint64_t semantic_id; char message[160]; } ArchSourceDiagnostic;
typedef struct { uint32_t field_id, reserved; uint64_t semantic_id; double before, proposed; } ArchSourceProposal;
typedef struct {
  uint32_t abi_version, semantics_version, verdict, export_blocked;
  ArchMechSource source; // borrowed from immutable result; hand directly to mechanics ABI 2
  const ArchMechParam* parameters; uint32_t parameter_count, contact_count;
  const ArchSourceContact* contacts;
  const ArchSourceLineage* lineage; uint32_t lineage_count, interval_count;
  const ArchSourceInterval* intervals;
  const ArchSourceDiagnostic* diagnostics; uint32_t diagnostic_count, proposal_count;
  const ArchSourceProposal* proposals;
  const ArchSourceError* errors; uint32_t error_count, operations;
  double source_transform[6]; // XY affine [a,b,c,d,tx,ty], input main -> manufacturing XY
  uint64_t revision;
  // Immutable audit records; their input ring indices are not output indices.
  const ArchSourceRegion* input_regions; uint32_t input_region_count, input_text_count;
  const ArchSourceText* input_texts;
  double body_datum_z; // actual manufacturing origin for non-bed source slabs
} ArchSourceView;
typedef struct {
  void* data;
  uint32_t (*cancelled)(void*); // synchronous boundary checkpoint; no reentry/throw
  void (*progress)(void*,uint32_t completed,uint32_t budget);
} ArchSourceControl;
typedef struct ArchSourceResult ArchSourceResult;
typedef ArchSourceResult ArchAssemblyResult;
// Layout matches the public root ArchContour (ABI1), without depending on Scene.
typedef struct { uint32_t index_start,index_count,part,reserved; } ArchSourceContour;
typedef struct {
  uint32_t point_count,contour_count,index_count,region_count;
  const int64_t* xy;
  const ArchSourceContour* contours;
  const uint32_t* indices;
  const ArchSourceRegion* regions; // ring_start/count select contours; stable IDs supplied by parent
} ArchSourceIndexed;
uint32_t arch_source_abi_version(void);
// Semantics2 validates manufacturing faces/references for MM and layers;
// downward spans count back from their top. No ABI layout change.
uint32_t arch_source_semantics_version(void);
ArchSourceResult* arch_source_build(const ArchSourceRequest*,const ArchSourceControl*);
// Copy only indexed XY/contour metadata during this synchronous call. Template
// supplies all non-geometry settings. Prepared text may be included as groups.
ArchAssemblyResult* arch_source_build_indexed(const ArchSourceRequest*,const ArchSourceIndexed*,const ArchSourceControl*);
ArchAssemblyResult* arch_source_probe_indexed(const ArchSourceRequest*,const ArchSourceIndexed*,const ArchSourceControl*);
uint32_t arch_source_datum_probe_version(void); // 1, no view/layout changes
const ArchMechSource* arch_assembly_source(const ArchAssemblyResult*); // NULL unless AS_OK
int arch_source_view(const ArchSourceResult*,ArchSourceView*);
void arch_source_destroy(ArchSourceResult*);
#ifdef __cplusplus
}
#endif
