#pragma once
#include <stdint.h>
#include "raster-runtime.h"
#include "product-runtime.h"
#include "source-frame.h"

/* Runtime ABI 2; packed snapshot format remains ARCH/1.
 * Exactly one Worker invokes these functions serially. Other threads may
 * read leased snapshot bytes and access control fields atomically only.
 * No native pointer is accepted from an untrusted document.
 *
 * Build lifecycle: control_reset(generation) -> input_create/ptr -> build_svg.
 * Generation is strictly increasing, 1..UINT32_MAX-1, for this module instance.
 * build_svg consumes the input handle, including on failure. Do not use the
 * input pointer after consumption/release. Failure returns 0, keeps all prior
 * leased snapshots, and does not publish partial bytes.
 *
 * SUCCESS TRANSFERS ONE OWNED LEASE to the caller. Read snapshot_ptr/len, then
 * release ONCE when that reader is finished. Do not acquire the primary lease
 * again. acquire creates an ADDITIONAL reader with its own matching release.
 * The Worker transfers the primary lease to EngineClient in its message; it
 * must release it itself if the message cannot be delivered. A retained old
 * generation is immutable. Last release invalidates all pointers for that ID.
 * Every memory.grow requires a fresh JS typed-array view, keeping the offset.
 *
 * Error bytes are a fixed-address, NUL-terminated, valid UTF-8 buffer <=512
 * bytes. Copy them synchronously in the Worker before another ABI invocation.
 * Their contents can change at the next invocation; never retain an error
 * pointer as a message or read it concurrently from the main thread.
 * Metadata has the same lease lifetime as its snapshot. It is bounded small
 * JSON metadata, not a transport for bulk mesh arrays. Empty metadata length
 * is zero; do not dereference its pointer then.
 *
 * control[0]=generation, [1]=phase (0 idle/1 running/2 complete/3 failed/4
 * cancelled), [2]=progress 0..1000, [3]=cancelled generation (zero means none).
 * Main-thread cancellation atomically stores the active generation into [3].
 * Progress counts completed pipeline work with fixed stage weights; it is
 * monotonic within a generation, not an estimate of elapsed/remaining time.
 * SVG/Rust and C++ check cancellation between parsing, clipping, topology and
 * individual solid operations. Single underlying library calls can still
 * run until the next checkpoint, so the Worker watchdog remains required.
 * A cancellation for generation N never cancels N+1. C++ library operations
 * can be synchronous/uninterruptible; EngineClient's bounded watchdog and
 * cancel grace terminate that Worker, explicitly retiring all of its leases.
 */
#ifdef __cplusplus
extern "C" {
#endif
uint32_t arch_abi_version(void);
const uint32_t* arch_control_ptr(void);
uint32_t arch_control_reset(uint32_t generation);
uint32_t arch_input_create(uint32_t bytes);
uint8_t* arch_input_ptr(uint32_t handle);
uint32_t arch_input_release(uint32_t handle);
uint32_t arch_build_svg(uint32_t input,double thickness_mm,double long_edge_mm,double tolerance_mm,uint32_t generation);
/* Export borrows a still-leased snapshot. Reset a fresh generation first.
 * Output is a separate binary-file handle; copy bytes, then release exactly
 * once. Never use input_release/snapshot_release for an output handle.
 * Keep the source snapshot lease until export completes. No partial output
 * on cancel/error; STL is explicitly one selected material part, in mm. */
uint32_t arch_export_stl(uint32_t snapshot,uint32_t part,uint32_t generation);
const uint8_t* arch_output_ptr(uint32_t handle);
uint32_t arch_output_len(uint32_t handle);
uint32_t arch_output_release(uint32_t handle);
const uint8_t* arch_snapshot_ptr(uint32_t handle);
const uint8_t* arch_snapshot_acquire(uint32_t handle);
uint32_t arch_snapshot_len(uint32_t handle);
uint32_t arch_snapshot_release(uint32_t handle);
const uint8_t* arch_metadata_ptr(uint32_t handle);
uint32_t arch_metadata_len(uint32_t handle);
const uint8_t* arch_error_ptr(void);
uint32_t arch_error_len(void);
#ifdef __cplusplus
}
#endif
