#pragma once
#include <stdint.h>
#include <stddef.h>
#include "parameter_ids.h"

// Mechanics ABI 2. See docs/API.md. Counts/indices are elements, not bytes.
// Input is borrowed synchronously. Result owns immutable buffers until destroy.
// No exception crosses C. A failed result has diagnostics/proposals and NO mesh.
// Pointers follow the target ABI (wasm32 offsets / native pointers).
#ifdef __cplusplus
extern "C" {
#endif
enum ArchMechProduct { AM_KEYCHAIN, AM_CLICKY, AM_STRAP, AM_LEGO, AM_CHARM };
enum ArchMechValueMode { AM_SCALAR, AM_MM, AM_LAYERS, AM_AUTO_BODY_HEIGHT, AM_AUTO_BODY_MIDPOINT };
enum ArchMechOrigin { AM_AUTO, AM_USER, AM_PRESET };
enum ArchMechRole { AM_BODY, AM_ARTWORK, AM_RIM, AM_SKIRT, AM_STEM, AM_TRAY, AM_FASTENER, AM_TEXT, AM_TEXT_BASE, AM_ROLE_COUNT };
enum ArchMechDatum { AM_BED, AM_BODY_BOTTOM, AM_CAP_UNDERSIDE, AM_POST_TIP,
  AM_COLLAR_BOTTOM, AM_TRAY_FLOOR_TOP, AM_TRAY_PIN_TOP, AM_TRAY_BODY_TOP,
  AM_CHARM_FLANGE_TOP, AM_CHARM_NECK_TOP, AM_ATTACHMENT_BOTTOM, AM_SKIRT_BOTTOM, AM_DATUM_COUNT };
enum ArchMechVerdict { AM_OK, AM_INVALID, AM_UNSUPPORTED, AM_NEEDS_ACCEPTANCE, AM_KERNEL_ERROR, AM_CANCELLED };
enum ArchMechSourceMode { AM_RAISED_BODY, AM_PREPARED_SLABS };
enum ArchMechSlabKind { AM_SOURCE_ART, AM_SOURCE_BODY, AM_SOURCE_TEXT, AM_SOURCE_TEXT_BASE, AM_SOURCE_BED_TEXT, AM_SOURCE_BED_TEXT_BASE };
enum ArchMechCurveFrame { AM_CURVE_MANUFACTURING, AM_CURVE_BEFORE_MOUTH_SHEAR };
// Numeric IDs are frozen in parameter_ids.h, enum values use catalog order.
typedef struct {
  uint32_t field_id, mode, origin, datum, reference_layer, layer_count;
  double value;
  uint64_t provenance_id;
} ArchMechParam;
typedef struct {
  uint32_t version, first_source, regular_source, reserved; // sources: 0 user, 1 profile
  int64_t first_nm, regular_nm; // 1e6 units/mm (named nm for domain compatibility)
  uint64_t provenance_id; // caller's immutable schedule/hash table index
} ArchMechSchedule;
typedef struct { uint32_t role, rgba, slot, origin; uint64_t provenance_id; } ArchMechMaterial;
typedef struct { uint32_t point_start, point_count; uint64_t semantic_id; } ArchMechRing;
typedef struct {
  uint32_t ring_start, ring_count, fill_rule, kind; // rule: 0 nonzero, 1 evenodd
  uint32_t rgba, slot, origin, role; // role must match kind; text and text-base are explicit
  double z0, z1; // kinds0..3 from source body bottom; kinds4/5 from bed Z0
  uint64_t semantic_id, provenance_id;
  uint64_t attachment_id; // text/text-base require a declared attachment
} ArchMechSlab;
typedef struct {
  uint32_t ring_start, ring_count, fill_rule, role; // text or text-base palette role
  double z0, z1; // selected host extent in its slab group's body/bed datum
  uint64_t semantic_id, provenance_id;
} ArchMechAttachment;
typedef struct {
  uint64_t target_id, provenance_id; // source body ID or exact slab semantic ID
  uint32_t enabled, shape, steps, origin; // user override; shape 0 round / 1 chamfer / 2 steps
  double radius;
} ArchMechBevelOverride;
typedef struct {
  uint32_t version, mode, point_count, ring_count; // source version 2
  const int64_t* xy; // pairs, 1e6 units/mm; abs <= 1e10
  const ArchMechRing* rings;
  uint32_t footprint_ring_start, footprint_ring_count, fill_rule, slab_count;
  const ArchMechSlab* slabs;
  uint64_t source_id, provenance_id;
  // Exact recipe bindings for delegated source fields; stale/missing = error.
  const ArchMechParam* recipe_bindings;
  uint32_t recipe_binding_count, reserved;
  const ArchMechAttachment* attachments;
  uint32_t attachment_count, reserved2;
  uint64_t eyelet_attachment_id; // ringTren=chu selects this exact semantic host
  const ArchMechBevelOverride* bevel_overrides;
  uint32_t bevel_override_count, reserved3;
} ArchMechSource;
typedef struct {
  uint32_t abi_version, product, parameter_count, material_count;
  const ArchMechParam* parameters;
  const ArchMechMaterial* materials;
  ArchMechSchedule schedule;
  ArchMechSource source;
  double mating_tolerance_mm, export_tolerance_mm;
  uint64_t revision;
} ArchMechRequest;
// The first 40 bytes exactly match main ArchPart (geometry.h at input hash).
typedef struct {
  uint32_t vertex_start, vertex_count, triangle_start, triangle_count;
  uint32_t color_rgba, source_index, contour_start, contour_count;
  double volume_mm3;
} ArchMechPart;
typedef struct {
  uint32_t feature_index, role, slot, origin, assembly_group, reserved;
  uint64_t provenance_id;
  double preview_transform[16]; // column-major; applies to manufactured vertices
} ArchMechPartInfo;
typedef struct {
  char id[96];
  uint32_t kind, parameter_id, role, group; // kind: 0 add, 1 cut, 2 dependency
  uint64_t source_id, provenance_id;
  double dimensions[6]; // per-feature dimensions, documented in API
} ArchMechFeature;
typedef struct {
  // side: 0 pin radial, 1 hole radial, 2 surface profile/sector,
  // 3 enclosing sphere cutter, 4 sheared mouth. See signed-bound conventions.
  uint32_t feature_index, segments, side, frame;
  double radius, signed_min, signed_max, requested_tolerance;
} ArchMechCurve;
typedef struct {
  uint32_t field_id, datum, mode, reference_layer;
  double z0, z1, floor_delta, ceil_delta, nearest_delta;
} ArchMechInterval;
typedef struct { uint32_t code, field_id; char message[192]; } ArchMechDiagnostic;
typedef struct {
  uint32_t field_id, mode, datum, reference_layer;
  double before, after;
  uint32_t applicable, reserved;
  char reason[128];
} ArchMechProposal;
typedef struct {
  uint32_t abi_version, verdict, vertex_count, triangle_count, part_count;
  uint32_t feature_count, curve_count, interval_count, diagnostic_count, proposal_count;
  uint32_t layer_boundary_count, export_blocked, fit_qualification, parameter_count;
  uint64_t revision;
  const double* vertices_xyz;
  const uint32_t* triangles;
  const ArchMechPart* parts;
  const ArchMechPartInfo* part_info;
  const ArchMechFeature* features;
  const ArchMechCurve* curves;
  const ArchMechInterval* intervals;
  const ArchMechDiagnostic* diagnostics;
  const ArchMechProposal* proposals;
  const double* layer_boundaries;
  const ArchMechParam* parameters; // all effective parameters, originals preserved
} ArchMechView;
typedef struct ArchMechResult ArchMechResult;
typedef struct ArchMechControl ArchMechControl;
// Single-use control, independent of project revision. Cancellation requires
// the exact generation. Keep alive until build and observers have stopped.
ArchMechControl* arch_mech_control_create(uint32_t generation);
int arch_mech_control_cancel(ArchMechControl*,uint32_t generation);
double arch_mech_control_progress(const ArchMechControl*); // current library evaluation, not whole job
uint32_t arch_mech_control_stage(const ArchMechControl*);
void arch_mech_control_destroy(ArchMechControl*);
ArchMechResult* arch_mech_build_controlled(const ArchMechRequest*,ArchMechControl*,uint32_t generation);
uint32_t arch_mech_abi_version(void);
// Source semantics1: height tags128..134 and detached bed text slab kinds4/5.
uint32_t arch_mech_source_datum_extension_version(void);
// Semantics3 adds final horizontal strap roof/floor guards and correct delegated
// source downward spans. Semantics2 introduced datum11 and the cavity guards.
// Layout/ownership stay ABI2. Interval reference UINT32_MAX = off-grid datum;
// its conversion deltas are unavailable (zero placeholders), never a proposal.
uint32_t arch_mech_semantics_version(void);
uint32_t arch_mech_field_id(const char* name);
const char* arch_mech_field_name(uint32_t id);
ArchMechParam arch_mech_default_parameter(uint32_t product, uint32_t id);
// Helpers let a Rust adapter assemble typed buffers without mirroring defaults.
uint32_t arch_mech_source_field(uint32_t id);
ArchMechResult* arch_mech_build(const ArchMechRequest*);
int arch_mech_view(const ArchMechResult*, ArchMechView*);
void arch_mech_destroy(ArchMechResult*);
#ifdef __cplusplus
}
#endif
