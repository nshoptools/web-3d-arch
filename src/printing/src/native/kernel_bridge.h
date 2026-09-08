#pragma once
#include "arch3mf.h"
#ifdef __cplusplus
extern "C" {
#endif
/* Borrows an ALREADY OWNED runtime ABI 2 lease synchronously.
   Never acquires/releases it. No pointer comes from an untrusted document. */
ARCH3MF_API uint32_t arch3mf_kernel_abi_version(void);
ARCH3MF_API int32_t arch3mf_add_snapshot_part(void* context,uint32_t snapshot,
  uint32_t generation,uint32_t part_index,const char* name,uint32_t material);
#ifdef __cplusplus
}
#endif
