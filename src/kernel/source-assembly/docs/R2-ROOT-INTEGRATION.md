# Parent-only root integration delta — after freeze

Mechanics semantics3, source semantics2, datum extension1. Implementation worker changed no root runtime, ABI, exports, controller or root CMake/build files. This note is a checklist of concrete integration deltas for the parent, not proof that root integration has already passed.

## C headers and exported functions

| Declaration / owner | Required result | Change |
|---|---:|---|
| uint32_t arch_mech_abi_version(void), mechanics.h | 2 | unchanged |
| uint32_t arch_mech_semantics_version(void), mechanics.h | 3 | existing getter, value increased |
| uint32_t arch_mech_source_datum_extension_version(void), mechanics.h | 1 | unchanged |
| uint32_t arch_source_abi_version(void), source_assembly.h | 1 | unchanged |
| uint32_t arch_source_semantics_version(void), source_assembly.h | 2 | additive C symbol |
| ArchSourceView.semantics_version | 2 | existing field, value increased |

The final Emscripten module must export _arch_source_semantics_version in addition to the existing four getters. Retain existing mechanics/source build/view/destroy exports, same module, same allocator and same lease transfer. No runtime ABI2 or ARCH/1 layout/version change is proposed.

Measured layouts stay: mechanics request224/200, view152/112, source128/112 (native64/wasm32); source request184/160, view320/272, indexed48/32; parameter40, source region104/text120/lineage32, part40. Field offsets and source slab kinds are unchanged. Headers are the authoritative type declarations.

## Metadata interpretation and ownership

Source interval z0/z1 are now MANUFACTURING Z, including clicky/integral charm and model text. Do not add body_datum_z a second time. Source slabs/attachment extents are still body-local for kinds0..3 and bed-local for kinds4/5. Source contacts remain manufacturing Z. Copy required source metadata while the source owner is alive; root retains its existing snapshot/primary-lease rules.

The package domain adapter additionally returns mechanicsSemanticsVersion=3 and sourceHeightSemanticsVersion=2; all encoded caller records and provenance are retained. Tag constants128..134 and datumext1 do not change.

Legacy MM datum0/reference0 remains unspecified and nominal. If its actual face is off-grid, the DERIVED source interval reference is UINT32_MAX and diagnostic109 says OFF_GRID_DATUM_CONVERSION_UNAVAILABLE. This is unqualified for conversion, NOT a receipt, a proposed reference, a zero-delta success, or an input sentinel. Source intervals do not have floor/ceil/nearest fields. Keep original MM value/mode/origin/reference/provenance; do not invent a conversion receipt or automatically edit a project. Explicit nonzero MM bindings and all layers bindings must match the actual named face and boundary; stale ones reject.

## Root checks to add/update

1. Link and assert all five getter values above on native and each existing browser engine; compare SourceView.semantics_version to the getter. Existing runtime/ARCH version and layout checks remain.
2. Same accepted strap input: product2 rectangle40x30, baseH6, strapZ3, strapD4, cham0, topBevel1/shape1/R2 => invalid, no mesh/export, old lease/input intact. Also test cham.6. Control R.6 and un-beveled/chamfered controls remain valid with unchanged manufactured mesh bytes.
3. Source h0=.16/h=.20, base12/ref0/BED, art4/ref0/tag128 => SOURCE_REFERENCE_LAYER_DOES_NOT_MEET_FACE and no source getter/mesh. Art ref12 => slab[2.36,3.16]. h0=.25 with same counts/ref =>[2.45,3.25].
4. Legacy MM base2.4/art1.7 at h0=.16 => unchanged slab[2.4,4.1], original MM records intact, derived art ref UINT32_MAX, diagnostic109, no conversion receipt/proposal. Declared art tag128/ref12 at2.4 => reject.
5. Test downward recess/core top bindings, repeated band top mismatch, flat/rim faces, nonzero body datum, model text vs detached bed text, unchanged u64 provenance, stale/cancelled request and failed getter/previous snapshot invariants using tests/r2.mjs requests.
6. Re-run the parent's actual runtime/export checks after integration. Current component evidence is native + standalone pthread/fexceptions Emscripten execution and independent readback, not a claim of root/browser/slicer/physical compatibility.

Portable builds/tests and exact preimages are supplied with the frozen handoff. Parent owns root integration, adjudication, review and release decisions.
