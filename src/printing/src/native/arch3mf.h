#pragma once
#include <stdint.h>
#if defined(_WIN32) && !defined(ARCH3MF_STATIC)
#define ARCH3MF_API __declspec(dllexport)
#elif defined(_WIN32)
#define ARCH3MF_API
#else
#define ARCH3MF_API __attribute__((visibility("default")))
#endif
#ifdef __cplusplus
extern "C" {
#endif
/* ABI 1: all pointers are borrowed for the duration of a call. UTF-8 strings.
   Context owns output. Copy before destroy. Never free output in another allocator.
   One context per job/thread; an error poisons that transaction. */
ARCH3MF_API uint32_t arch3mf_abi_version(void);
ARCH3MF_API void* arch3mf_create(void);
ARCH3MF_API void arch3mf_destroy(void*);
ARCH3MF_API const char* arch3mf_error(void*);
ARCH3MF_API int32_t arch3mf_add_material(void*, const char* name, uint32_t rgba);
ARCH3MF_API int32_t arch3mf_add_part(void*, const char* name, const double* xyz,
  uint32_t vertices, const uint32_t* triangles, uint32_t faces, uint32_t material);
/* The indices reference [vertex_base, vertex_base+vertices). Rebase while
   building lib3MF's own arrays; do not allocate a JS staging copy. */
ARCH3MF_API int32_t arch3mf_add_part_range(void*, const char* name, const double* xyz,
  uint32_t vertices, const uint32_t* triangles, uint32_t faces,
  uint32_t vertex_base, uint32_t material);
ARCH3MF_API uint32_t arch3mf_assembly_id(void*);
ARCH3MF_API int32_t arch3mf_metadata(void*, const char* ns, const char* name, const char* value);
ARCH3MF_API int32_t arch3mf_attachment(void*, const char* path, const uint8_t* bytes, uint32_t size);
ARCH3MF_API int32_t arch3mf_validate_output(void*, const uint8_t*, uint32_t);
ARCH3MF_API int32_t arch3mf_finish(void*);
ARCH3MF_API const uint8_t* arch3mf_bytes(void*);
ARCH3MF_API uint32_t arch3mf_size(void*);
#ifdef __cplusplus
}
#endif
