#pragma once
#include "geometry.h"
#include "../mechanics/src/derived_guard.h"
#include "../source-assembly/src/source_assembly.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct ArchProductNative ArchProductNative;
// Internal trusted bridge only. Rust owns both byte spans; never exported to JS.
ArchProductNative* arch_product_native_build(const uint8_t* arch, uint32_t arch_bytes,
  const uint8_t* request, uint32_t request_bytes, const ArchBuildControl* control,
  uint32_t generation);
ArchProductNative* arch_product_native_probe(const uint8_t*,uint32_t,const uint8_t*,uint32_t,const ArchBuildControl*,uint32_t);
int arch_product_native_mesh(const ArchProductNative*, ArchSceneView*);
const uint8_t* arch_product_native_metadata(const ArchProductNative*, uint32_t* bytes);
const char* arch_product_native_error(const ArchProductNative*);
void arch_product_native_destroy(ArchProductNative*);
ArchMechGuard* arch_product_native_take_guard(ArchProductNative*);
#ifdef __cplusplus
}
#endif
