#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* AFGM/1 registered input, consumed on all paths; serial root ABI2 calls.
 * Result is an existing final-output lease with ARCH/1 binary64 material unions.
 * No STL/float32 conversion, product authority override, or mesh-pass claim.
 * Group key = original slot/rgba/material_source_id, distinct IDs never merged.
 * Output part source_index is group ordinal; metadata retains original input
 * part/source memberships and material identity. Positive material overlap is
 * deliberately retained for an independent checker. At most 16MiB output and
 * 256KiB metadata, 200k vertices/400k triangles/256 groups/4096 input parts.
 * Get bytes/metadata and release with arch_final_output_*. Snapshot primary
 * is borrowed, never consumed. Same R3 Payload authority at both boundaries. */
uint32_t arch_final_scene_geometry_version(void);
uint32_t arch_final_scene_geometry(uint32_t snapshot,uint32_t input,uint32_t generation);
#ifdef __cplusplus
}
#endif
