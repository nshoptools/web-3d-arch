#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Same root ABI2, serial calls, AFCP/1 and AFCC/1 registered inputs consumed on
 * every path. Prepare owns one proposal plus an internal snapshot reader.
 * At most 2 proposals; shared root byte cap. Confirm requires exact source /
 * revision / settings / proposal hashes; returns existing final_output lease.
 * No file bytes before confirm. Repeated confirmation creates identical bytes
 * with a new output lease. Original snapshots are never edited or consumed.
 * Pointer/length getters borrow immutable buffers until proposal release;
 * recreate all views after memory.grow. No acquire for this primary token.
 * Kinds: 1 old f64 XYZ,2 old u32 triangles,3 candidate f64 XYZ,4 candidate u32
 * triangles,5 vertex map,6 retained face IDs,7 removed IDs,8 collapsed u32 pairs,
 * 9 UTF8 metadata <=65536. See ROOT-API-EARLY.md for exact wire/limitations. */
uint32_t arch_final_float_version(void);
uint32_t arch_final_float_prepare(uint32_t snapshot,uint32_t input,uint32_t generation);
uint32_t arch_final_float_confirm(uint32_t proposal,uint32_t input,uint32_t generation);
const uint8_t* arch_final_float_buffer_ptr(uint32_t proposal,uint32_t kind);
uint32_t arch_final_float_buffer_len(uint32_t proposal,uint32_t kind);
uint32_t arch_final_float_release(uint32_t proposal);
#ifdef __cplusplus
}
#endif
