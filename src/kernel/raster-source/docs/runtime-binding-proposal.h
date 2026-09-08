#ifndef ARCH_RASTER_RUNTIME_PROPOSAL_V2_H
#define ARCH_RASTER_RUNTIME_PROPOSAL_V2_H
#include <stdint.h>
/*
 * PROPOSAL ONLY: these arch_raster_* entry points are NOT linked by this crate.
 * Parent adds them alongside runtimeABI2; existing arch_build_svg and ARCH/1
 * are unchanged. Use registered input handles, never document-supplied pointers.
 * All request blocks are explicit little endian; parse fields, do not cast an
 * arbitrary u8 input address to a C struct. Reserved fields must be zero.
 *
 * One Worker serially calls prepare/confirm/build. Its existing atomic control
 * generation/cancellation/watchdog policy remains authoritative. No raster
 * callback capability is claimed. Prepare is synchronous.
 */
#ifdef __cplusplus
extern "C" {
#endif

/* Logical fixed prefix+arrays: wire 200 bytes, f64 at offset 64.
 * semantics_version=2 maps ONLY to raster-parameters-proposal-v2.
 * res is actual pixels. eps/tension are integral slider values, never mm.
 * alpha_policy: 0 reject-partial, 1 threshold, 2 encoded-sRGB partial matte.
 * origin_kind: 0 explicit straight sRGB8, 1 confirmed renderer.
 * Colors use r | g<<8 | b<<16, high byte zero; count<=k<=16.
 * background labels count 0 means Keep; otherwise opaque label IDs 1..16.
 * Long-edge extent is the prepare-time physical design extent (0 is invalid).
 */
typedef struct ArchRasterOptionsV2 {
    uint32_t version, bytes, semantics_version, k;
    uint32_t res, smooth, min_area_pixels, denoise;
    uint32_t eps, tension, alpha_policy, alpha_cutoff;
    uint32_t matte_rgb, fixed_palette_count, background_count, origin_kind;
    double design_long_edge_mm;
    uint32_t fixed_palette_rgb[16];
    uint32_t background_labels[16];
} ArchRasterOptionsV2;

/* Separate optional registered limits block: version=1, bytes=104.
 * All fields serialized as LE u64 after the two u32 prefix words.
 * The adapter checks values before narrowing to crate Limits' u32 fields.
 * Zero handle selects min(crate default, host remaining aggregate budget).
 */
typedef struct ArchRasterLimitsV1 {
    uint32_t version, bytes;
    uint64_t max_source_bytes, max_dimension, max_decoded_pixels;
    uint64_t max_decoded_bytes, max_metadata_bytes, max_working_bytes;
    uint64_t max_processing_pixels, max_unique_colors, max_vertices;
    uint64_t max_edges, max_regions, max_work_units;
} ArchRasterLimitsV1;

/* All valid listed input handles are consumed once even on failure. Duplicated
 * handles are rejected atomically; generation is checked before decoding.
 * format is detected from bytes. RGBA must have exactly width*height*4 bytes.
 * origin input: sourceSHA[32], settingsSHA[32], rendererUtf8Len:u32,
 * confirmationUtf8Len:u32, renderer UTF8<=256, confirmation UTF8<=256.
 * origin=0 only for ExplicitSrgb / encoded input. No file paths/render callbacks.
 */
/* Stable numeric adapter tags: explicitly map Rust ErrorCode variants; do not
 * cast a Rust enum's unspecified discriminants. Copy arch_error_ptr/len's
 * bounded UTF8 message synchronously as in runtimeABI2. Error code is reset on
 * the next operation; it is Worker-local metadata, never a retained lease.
 */
enum ArchRasterErrorCode {
    ARCH_RASTER_OK=0,
    ARCH_RASTER_INVALID_OPTIONS=1, ARCH_RASTER_UNSUPPORTED_FORMAT=2,
    ARCH_RASTER_UNSUPPORTED_METADATA=3, ARCH_RASTER_SVG_IS_NOT_RASTER=4,
    ARCH_RASTER_SOURCE_LIMIT=5, ARCH_RASTER_DIMENSION_LIMIT=6,
    ARCH_RASTER_PIXEL_LIMIT=7, ARCH_RASTER_MEMORY_LIMIT=8,
    ARCH_RASTER_METADATA_LIMIT=9, ARCH_RASTER_DECODE_FAILED=10,
    ARCH_RASTER_ANIMATION_UNSUPPORTED=11, ARCH_RASTER_UNSUPPORTED_BIT_DEPTH=12,
    ARCH_RASTER_COLOR_MANAGEMENT_REQUIRED=13, ARCH_RASTER_ORIENTATION_UNKNOWN=14,
    ARCH_RASTER_ALPHA_POLICY_REQUIRED=15, ARCH_RASTER_RENDER_CONFIRMATION_REQUIRED=16,
    ARCH_RASTER_CAPABILITY_UNAVAILABLE=17, ARCH_RASTER_WORK_LIMIT=18,
    ARCH_RASTER_GRAPH_LIMIT=19, ARCH_RASTER_REGION_LIMIT=20,
    ARCH_RASTER_CONFIRMATION_MISMATCH=21, ARCH_RASTER_CONFIRMATION_REQUIRED=22,
    ARCH_RASTER_INVALID_BUFFER=23, ARCH_RASTER_INVARIANT_VIOLATION=24,
    ARCH_RASTER_INPUT_HANDLE_INVALID=100, ARCH_RASTER_STALE_GENERATION=101,
    ARCH_RASTER_CANCELLED=102, ARCH_RASTER_LEASE_LIMIT=103
};
uint32_t arch_raster_error_code(void);
uint32_t arch_raster_abi_version(void); /* proposed value 1 */
uint32_t arch_raster_prepare_encoded(uint32_t input, uint32_t options,
                                    uint32_t limits, uint32_t generation);
uint32_t arch_raster_prepare_rgba(uint32_t input, uint32_t width, uint32_t height,
                                 uint32_t options, uint32_t limits,
                                 uint32_t origin, uint32_t generation);

/* Prepare returns one owned immutable RASTER result lease (0 on failure).
 * Confirm borrows the old lease, consumes a registered 32-byte proposal SHA,
 * reprocesses authoritative original/options and returns a NEW accepted lease.
 * Mismatch/failure never changes old leases. Raw bytes cannot serve as approval.
 */
uint32_t arch_raster_confirm(uint32_t proposal, uint32_t accepted_hash_input,
                            uint32_t generation);

/* Build borrows an ACCEPTED raster lease; never consumes it. No extent override:
 * changing size requires prepare+confirm for a new proposal hash. Parent validates
 * domain state and SHA asset map, transforms/quantizes shared IDs ONCE, preserves
 * nonzero winding/holes and invokes its existing C++ geometry path. Returns the
 * existing ARCH/1 primary snapshot lease governed by arch_snapshot_*.
 */
uint32_t arch_build_raster(uint32_t accepted_proposal, double thickness_mm,
                          uint32_t generation);

/* Raster lease namespace shares the parent's ID allocator and aggregate cap,
 * but is type-checked separately from an ARCH mesh snapshot.
 * acquire creates one additional reader; prepare/confirm already transfer one.
 * Last release invalidates ALL views. Refresh JS heap views after memory.grow.
 */
uint32_t arch_raster_acquire(uint32_t proposal);
uint32_t arch_raster_release(uint32_t proposal);
const uint8_t* arch_raster_buffer_ptr(uint32_t proposal, uint32_t kind);
uint32_t arch_raster_buffer_bytes(uint32_t proposal, uint32_t kind);

/* Buffers contain no pointers. All multi-byte values LE and naturally aligned
 * in published storage: u16=2, u32=4, i64/f64=8. Empty bytes=>do not dereference.
 * Document/flat Rust Vec storage is kept immovable for the lease lifetime.
 */
enum ArchRasterBufferKind {
    ARCH_RASTER_SUMMARY=1,       /* header described in host-integration.md */
    ARCH_RASTER_ENCODED_U8=2,    /* empty for explicit/rendered RGBA */
    ARCH_RASTER_ORIGINAL_RGBA8=3,
    ARCH_RASTER_RESAMPLED_RGBA8=4,
    ARCH_RASTER_LABEL_PREVIEW_RGBA8=5,
    ARCH_RASTER_LABELS_U16=6,    /* transparent=0, row-major */
    ARCH_RASTER_PALETTE_U32=7,   /* [label,rgba,initialLow,initialHigh,finalLow,finalHigh] */
    ARCH_RASTER_SOURCE_XY_U32=8, /* raw graph corner pairs, source IDs */
    ARCH_RASTER_SOURCE_EDGES_U32=9, /* from,to,leftLabel,rightLabel,leftRegion,rightRegion */
    ARCH_RASTER_DERIVED_XY_I64=10,   /* FlatGeometry.xy, /1048576 pixels */
    ARCH_RASTER_VERTEX_SOURCE_U32=11,/* UINT32_MAX means derived interior */
    ARCH_RASTER_DERIVED_EDGES_U32=12,/* FlatEdge stride32 bytes */
    ARCH_RASTER_LOOPS_U32=13,        /* FlatLoop stride16 bytes */
    ARCH_RASTER_LOOP_INDICES_U32=14, /* closed shared derived ID rings */
    ARCH_RASTER_CHAINS_U32=15,       /* FlatChain stride32 bytes */
    ARCH_RASTER_CHAIN_SOURCE_U32=16,/* source edge id*2+reversed */
    ARCH_RASTER_QUADRATIC_I64=17,   /* 6 integers per curve */
    ARCH_RASTER_METADATA_TLV=18,    /* UTF8 reasons/algorithms, typed limits/ledger; no mesh JSON */
    ARCH_RASTER_MERGES=19           /* four u32 + two u64, 32-byte decision records */
};
/* UINT32_MAX denotes absent region/source; labels are zero-extended u16.
 * FlatEdge: from,to,left_label,right_label,left_region,right_region,chain,0.
 * FlatLoop: first_index,index_count,source_region,label.
 * FlatChain: first_edge,edge_count,first_source_edge,source_edge_count,
 *            first_curve,curve_count,component,0.
 * Geometry IDs are global, dense and shared. Do NOT retrace per material.
 */
#ifdef __cplusplus
}
static_assert(sizeof(ArchRasterOptionsV2)==200,"options ABI size");
static_assert(sizeof(ArchRasterLimitsV1)==104,"limits ABI size");
#endif
#endif

