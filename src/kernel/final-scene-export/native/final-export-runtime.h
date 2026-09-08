#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Additive runtime child version 1 in the SAME root ABI-2 Module/allocator.
 * Worker calls serially. options is an arch_input_* registered handle holding
 * AFEX/1 bytes; consumed on ALL paths. snapshot is borrowed with an internal
 * additional lease through completion; caller's lease is never consumed.
 * Reset a fresh root generation first. No publication on failure/cancellation.
 * Success transfers one owned final-output lease. Extra acquire/release pairs
 * are optional. Use ONLY final_output_release for this output handle type.
 * Result bytes and metadata are immutable until final release; recreate JS
 * views after memory.grow. Error text/control use existing root accessors. */
uint32_t arch_final_export_version(void);
uint32_t arch_export_final(uint32_t snapshot,uint32_t options,uint32_t generation);
const uint8_t* arch_final_output_ptr(uint32_t);
uint32_t arch_final_output_len(uint32_t);
const uint8_t* arch_final_output_metadata_ptr(uint32_t);
uint32_t arch_final_output_metadata_len(uint32_t);
const uint8_t* arch_final_output_acquire(uint32_t);
uint32_t arch_final_output_release(uint32_t);
#ifdef __cplusplus
}
#endif
