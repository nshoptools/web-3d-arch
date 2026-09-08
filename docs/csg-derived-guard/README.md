# Bounded guard for actual CSG-derived geometry

This page retains the original guard-remediation evidence. The source-datum
certificate and test ancestry adapter are updated by [CSG closure](CLOSURE.md).
That addendum supersedes immutable source-cap triangulation and synthetic
lineage statements below; the raw cavity/tunnel restrictions remain in force.

Production changes are confined to `src/kernel/mechanics/src/derived_guard.cpp.inc`,
`derived_check.cpp.inc` and `derived_guard.h`. Trusted derived-guard ABI remains1;
there is no root, scheduler, controller, mechanics constructor or tunnel-guard
layout change. Guard results contain metadata only, never replacement geometry.

The original captured guard owns scalar settings and immutable feature domains.
It does not retain raw source rings. Passing its empty source through the source
resolution fallback cannot admit arbitrary fine features created by later CSG.
The derived checker consequently never calls `verify_cavities`/`verify_tunnels`
or source-resolution admission, and never uses query `Simplify`, `SetTolerance`,
volume epsilon or `Volume()==0` to establish missing/empty material.

## Supported checks

- Every supplied part is checked by the pinned backend; ranges, finite positions,
  ownership/groups, manufacturing bed, collisions and original protected datum
  facets remain checked. No failed result publishes mesh or unblocks export.
- An unchanged group requires exact equality of complete oriented triangle
  multisets, including material and duplicate multiplicity. It preserves that
  original group's qualification. Triangle order and cyclic index rotation do
  not matter; changed triangulation, reflection and approximate plane/area
  equality are not the same certificate.
- For changed groups, cavity roof and tunnel roof/floor use full unsimplified
  residual bounds. Unresolved contacts return `AM_UNSUPPORTED` and a
  `DERIVED_*_UNVERIFIED` diagnostic. There is no source-derived fallback.
- Original opening/wall qualification can also be retained over a query-local
  conservative world AABB, only when the original selected face multiset is
  nonempty and exactly equals the derived selected multiset. EVERY triangle
  whose AABB intersects that box is included, not a sampled ray or face subset.
  The selection margin is query budget plus `64*DBL_EPSILON*10000` mm. This
  margin does not displace manufacturing geometry or compare faces approximately.
- Changed tunnel groups must retain the complete opening boundary certificate
  before raw roof/floor checks. This rejects later parallel-wall breakouts and
  plugs, including changes hidden by an unchanged XY projection. A side cut away
  from the opening and an internal slit above a positive roof remain supported.

The retained face arrays are included in `arch_mech_guard_charge` and its existing
128MiB admission cap. New query scans are bounded to20million face visits, each
with cancellation checks; raw residuals have a400,000 triangle limit. Existing
input limits remain1million vertices,400,000 triangles and128 parts. This is
bounded admission/accounting, not interception of every backend allocation or
a whole-pipeline numeric error proof. The parent retains its Worker watchdog.

## Focused evidence and limits

Tests use actual pinned Manifold difference/union on an original mechanics result,
then call the public trusted derived-guard ABI. The source result is destroyed
before checking, proving the guard retains its dependencies. They exercise
unchanged and separate parts, a safe side cut, positive roof controls for strap
and LEGO, oblique fine cavities, parallel-wall removal, a plug, cancellation,
wrong generation, count cap and ABI mismatch. Original data is checked unchanged;
all guard results have zero geometry. Serialized triangles get exact oriented
edge-incidence and Fraction-based ray checks independently of Manifold queries.

The native parent-stage baseline accepts the after-CSG parallel-wall case. At
x=.123,z=3 its exact Y intersections change from[-15,-2,2,15] to[-15,-2]; the
adjacent x=10.123 control retains both walls. The corrected native and Node-WASM
checkers refuse it at `DERIVED_TUNNEL_BOUNDARY_UNVERIFIED`.

The two baseline sub-resolution slit cases already fail the LATER protected
datum-facet check, despite reporting an earlier positive clearance after source
fallback. They are not baseline end-to-end accepted products. After CSG their
raw triangles also have additional exact crossings compared with an ideal
analytic slit: the initial ideal-cut oracle failed in both baseline and fixed,
and is retained as negative evidence. The final regression requires typed
refusal and records the actual crossings; it does not qualify those meshes as
clean slits or infer solid intervals by toggling every unoriented intersection.
The positive roof controls retain their original strict analytic expectations.

Full CSG root/controller/browser tests remain in `src/mesh-import/tests` and are
the parent's integration responsibility. This suite does not claim trusted
ancestry validation, browser RPC coverage, general formal correctness, self-
intersection proof for arbitrary forged native input, or manufacturing/fit
qualification. The test's synthetic lineage words are not root ancestry proof.
No broad product corpus was rerun for this bounded delta.

## Reproduction

After reading project instructions, dot-source `tools/development/env.ps1` with
your own run ID and redirect caches/output to that run. Configure the test CMake
entry with `ARCH_MANIFOLD_SOURCE` and `ARCH_CLIPPER2_SOURCE` pinned by the project,
then build `derived_guard_probe`. For an already checked binary dependency set,
the optional `ARCH_GUARD_MANIFOLD_LIBRARY`, `ARCH_GUARD_CLIPPER_LIBRARY`,
`ARCH_GUARD_MANIFOLD_GENERATED` and `ARCH_GUARD_CLIPPER_INCLUDE` select owned
archives/headers. All dependency locations are explicit; no old run is embedded.

```powershell
cmake -S tests/csg-derived-guard -B <own-build> -DARCH_MANIFOLD_SOURCE=<checked> -DARCH_CLIPPER2_SOURCE=<checked>
cmake --build <own-build> --config Release --parallel 4
python tests/csg-derived-guard/run.py native fixed <own-build>/Release/derived_guard_probe.exe fixed-native
python tests/csg-derived-guard/run.py wasm fixed <own-wasm-build>/derived_guard_probe.js fixed-wasm
```

For WASM configure the same CMake entry with the pinned Emscripten toolchain,
Ninja and an owned `EM_CACHE`; use Node from the pinned toolchain. It uses
NODERAWFS for test file I/O only. No product Module, codec or allocator is added.
`ARCH_GUARD_MECHANICS_SOURCE` optionally selects a captured baseline tree; use
`baseline` instead of `fixed` in the test command to reproduce the native old
guard behavior. Every tag must be fresh. Build commands/exits, input/preimage
pins and all failed experiments are part of the handoff evidence.
