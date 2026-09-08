#pragma once
#include "geometry.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct ArchConditionProposal ArchConditionProposal;
// Native ABI struct; WASM uses the SAME fixed-width fields, 8-byte alignment.
// Head is 72 opaque bytes: LE generation:u64, sourceSHA256[32], settingsSHA256[32].
// The trusted controller supplies current head; these bytes are not authorization.
typedef struct {
  uint32_t version, bytes, chord_linf_nm, max_output_points;
  uint64_t max_work_units;
  uint32_t prior_bound_nm, total_budget_nm, prior_verified, budget_class;
  uint32_t max_part_points, reserved;
} ArchConditionOptions;
typedef struct {
  uint32_t version, bytes, algorithm, requires_confirmation;
  uint32_t source_vertices, output_vertices, source_edges, output_edges;
  uint32_t chains, pins, components, loops;
  uint32_t changed, conditioning_linf_nm, conditioning_euclidean_nm, mesh_conversion_nm;
  uint32_t float32_nm, prior_nm, total_nm, budget_nm;
  uint32_t source_occurrences, output_occurrences, part_count, reserved;
  uint64_t work_units, intersection_pairs, nesting_tests;
  uint32_t reserved2[2];
} ArchConditionLedger;
// Opt-in API. Existing arch_scene_build* behavior remains unchanged.
// Prepare fully validates a private candidate; nothing is published or exported.
// At most four live proposal handles per module; consumed handles still need destroy.
ArchConditionProposal* arch_condition_prepare(
    const int64_t* xy,uint32_t np,const uint32_t* ends,uint32_t nc,
    const uint32_t* shape_ends,uint32_t ns,const uint32_t* rules,
    const uint32_t* colors,const double* z0,const double* z1,
    const ArchConditionOptions*,const uint8_t head[72],
    const ArchBuildControl*,char* error,uint32_t cap);
// Preview pointers are immutable/borrowed; invalid after destroy or confirm.
int arch_condition_preview(const ArchConditionProposal*,ArchSceneView*,ArchConditionLedger*);
// Exact consent descriptor: 272 bytes, LE: magic/version/bytes/reserved (16),
// process-local proposal serial:u64 (8), head[72], options[48], ledger[128].
// Serial distinguishes proposals with identical heads/options; not a secret.
const uint8_t* arch_condition_descriptor(const ArchConditionProposal*,uint32_t* bytes);
// CGPH/1 flat proof buffer: original canonical graph, pins, source/kept chains.
const uint8_t* arch_condition_proof(const ArchConditionProposal*,uint32_t* bytes);
// accepted must be an EXACT copy of the descriptor shown with the preview.
// current_head is read from authoritative state at commit, never echoed by UI.
// confirm=1 required. Successful confirm transfers scene once; caller destroys it.
ArchScene* arch_condition_confirm(ArchConditionProposal*,const uint8_t current_head[72],
    const uint8_t* accepted,uint32_t bytes,uint32_t confirm,
    const ArchBuildControl*,char* error,uint32_t cap);
void arch_condition_destroy(ArchConditionProposal*);
#ifdef __cplusplus
}
static_assert(sizeof(ArchConditionOptions)==48,"condition options layout");
static_assert(sizeof(ArchConditionLedger)==128,"condition ledger layout");
#endif