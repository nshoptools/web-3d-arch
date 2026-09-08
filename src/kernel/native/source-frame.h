#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Discrete source-frame extension1, root ABI2. See docs/native-source/SOURCE-FRAME-API.md.
 * Registered ASFR/1 input (112 bytes), consumed on success/error. Signed axis
 * permutation/reflection plus one exact binary64 ties-even translation to nm.
 * Borrows source owner during synchronous work. Returns ONE primary planar
 * ARCH snapshot lease. No triangle arrays; source assembly required.
 * Same root control/limits/lease registry; no caller geometry pointers. */
uint32_t arch_source_frame_version(void);
uint32_t arch_source_frame(uint32_t input,uint32_t generation);
#ifdef __cplusplus
}
#endif

