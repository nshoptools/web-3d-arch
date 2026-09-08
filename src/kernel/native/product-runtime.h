#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Product runtime ABI1; root ABI2 / ARCH1, source assembly1, mechanics ABI2
 * semantics2 / source datum extension1. Only registered handles enter CABI.
 * All valid inputs are consumed, including failures. prepare -> request;
 * build consumes request -> one root snapshot lease OR bounded proposal.
 * Buffers: 1 APMS1, 2 exact APRQ1 input, 3 source metadata JSON, 4 PRHD1/192.
 * Copy pointers under a live lease; obtain fresh WASM view after memory.grow.
 * request_head_ptr is synchronous-only; registry mutations may move it.
 * confirm consumes 232-byte exact descriptor/current head/revision input;
 * returns root output handle containing acknowledgement, never a new mesh.
 * Serial Worker ownership and root control reset rules are mandatory.
 */
uint32_t arch_product_abi_version(void);
uint32_t arch_product_request_create(uint32_t source, uint32_t source_generation, uint32_t input);
uint32_t arch_product_request_release(uint32_t request);
const uint8_t* arch_product_request_head_ptr(uint32_t request);
uint32_t arch_product_prepare_svg(uint32_t input, uint32_t request, double thickness_mm, double long_edge_mm, double tolerance_mm, uint32_t generation);
uint32_t arch_product_prepare_raster(uint32_t accepted, uint32_t request, double thickness_mm, uint32_t generation);
uint32_t arch_product_prepare_contexts(uint32_t contexts, uint32_t request, uint32_t generation);
uint32_t arch_product_build(uint32_t request, uint32_t generation);
uint32_t arch_product_datum_probe(uint32_t request,uint32_t generation);
uint32_t arch_product_datum_probe_version(void);
uint32_t arch_product_last_proposal(void);
const uint8_t* arch_product_buffer_ptr(uint32_t id, uint32_t kind);
uint32_t arch_product_buffer_len(uint32_t id, uint32_t kind);
uint32_t arch_product_proposal_release(uint32_t id);
uint32_t arch_product_confirm(uint32_t proposal, uint32_t input, uint32_t accepted, uint32_t generation);
#ifdef __cplusplus
}
#endif
