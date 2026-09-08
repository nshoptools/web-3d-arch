# Post-CSG contact and source-datum closure

This is a bounded implementation correction to the pending CSG integration.
Only three production files change: mechanics/src/derived_guard.cpp.inc,
derived_check.cpp.inc and derived_guard.h. Trusted native ABI1, layouts,
version getter and root exports are unchanged. No mechanics constructor,
tunnel guard, root, controller, source bytes, geometry coordinates, tolerances,
or runtime publication/approval behavior changes.

## Exact interior separation

For represented closed AABBs A and B, if A.max[k] <= B.min[k] (or conversely)
on any coordinate axis, their open three-dimensional interiors cannot
intersect. Equality confines any intersection to a plane, line or point.
The collision fast path therefore uses exact <=. There is no epsilon, volume
threshold, query simplification, rounding of coordinates, or scalar-zero
cleanup. Strictly positive AABB overlap still takes the existing unsimplified
Boolean collision gate and refuses an unresolved result.

This establishes only absence of positive 3D interior overlap for this pair.
It is not a weld/attachment/contact-area or print-fit certificate. The
query-local boundary selection retains its original inclusive contact coverage
and numeric margin; that separate selection was not changed.

## Source datum identity

The old gate required every original horizontal source triangle to survive
exactly, so a valid through-hole failed after cap retriangulation. Source
datum identity now consists of the original generated part owner, feature,
material, oriented horizontal Z-plane and immutable source/provenance records.
Every original oriented plane needs at least one surviving represented facet
with strictly positive XY area and all of:

- Current supplied part owner/group and RGBA match the guard's original record.
- Pinned native CSG lineage says generated operand0, same original part,
  original GLOBAL triangle index in this guard, reversed0.
- All three represented Z values equal the original plane exactly.
- An outward-rounded binary64 determinant interval proves the same nonzero
  orientation. Each subtract/product and determinant operation expands by
  nextafter on both sides. An interval containing zero cannot witness a datum.

Original horizontal faces map to owned datum records. This table and the
records are included in guard_charge and the existing128MiB admission cap.
An unresolved original facet area blocks derived qualification explicitly as
DERIVED_SOURCE_DATUM_AREA_UNVERIFIED. Missing/removed/changed witnesses return
AM_UNSUPPORTED / DERIVED_SOURCE_DATUM_FACE_UNPROVED with export blocked.

Owner binds the original feature and material provenance; no caller-readable
label is used to invent a datum. ABI1 already carries four u32 words per face:
operand, original part, original GLOBAL face, reversed. The root's pinned
imported_csg.cpp already supplies this contract. The function is a trusted
native entry, not an ancestry authenticator for arbitrary forged callers.
Root must bind the guard and native view to the current original snapshot.

Every constructed mechanical facet still requires exact oriented coordinates,
original owner, group and color. Mechanical edits return
DERIVED_MECHANICAL_FEATURE_CHANGED. Full cavity/tunnel volume and boundary
guards execute before source datum qualification, unchanged from the prior
14-case remediation. No raw-source resolution or Simplify fallback is added.

A positive datum facet proves survival of the represented plane/identity,
not unchanged cap area, minimum bearing area, remaining strength, or general
topology/fit qualification. Preserved curves/layers/off-grid source metadata
retain their original scope. Parent represented mesh and assembly gates
remain necessary. This is conditional numeric qualification on the pinned
backend, not an all-input full-volume theorem.

## Evidence

The checked pending bundle contains the prior14/14 native/WASM guard fix.
The closure tests retain those14 controls, including both adverse fine slits,
parallel-wall breakout, plug, nearby valid roof/side cuts, cancellation,
stale generation, counts and bad ABI. All14 pass natively and in Node-WASM.

The12 closure cases exercise the actual controller's four-part keychain
ARCH/1 and authored0.4mm ASCII STL, plus exact plane/edge/point AABB contacts
and a positive1e-5mm overlap. Through-cut and original accept. Top removed,
whole source removed, mechanical keyring changed, wrong owner, wrong material,
foreign datum lineage and positive overlap refuse with typed diagnostics.

The final test cutter has explicit generated/imported run and per-face
ancestry as used by the pinned root CSG. The cut emits1058 vertices,
2112 triangles and4 parts, matching the controller report's counts.
It changes46 original cap triangles. Exact rational rays see original
Z=[0, binary64(2.4)], no cap inside the new hole, and the unchanged adjacent
cap. Exact signed volume difference equals the analytic cutter width times
height times represented2.4mm in this fixture. Oriented edge incidence and
positive facet area are also checked independently of the native queries.

Causal native builds use identical input and output geometry bytes:
the checked baseline refuses original and cut at collision; the isolated
<=-only build accepts original but refuses the cut at source datum; the full
correction accepts both. Native/WASM verdicts, diagnostics and before/after
geometry archives match byte-for-byte across all26 final cases.

Two test-helper corrections are retained as evidence: initial preparation
incorrectly assumed binary STL instead of the authored ASCII fixture; an
exact-volume assertion for a translated overlap-control cube incorrectly
assumed binary64 endpoint translation preserved rational height1. The final
assertion uses the exact represented endpoints, with no tolerance. Earlier
cutter-only automatic ancestry produced2096 triangles; explicit per-face
imported ancestry gives the actual2112. No production changes were made for
these harness corrections.

The controller fixture captures its already-generated ARCH and exact original
descriptor into the real Builder::capture_guard in a test-only translation
unit; checks then call the public child CABI after destroying the original
result. This is not a full Rust/root/controller replay. Parent owns the
combined module and actual two-approval/history/export retest. No broad
corpus or independent review conclusion is claimed.

## Portable reproduction

Use current project rules and a new own run. Dot-source
tools/development/env.ps1 with Seat codex and that RunId before every build
or test process. Override CARGO_HOME to the run cache. Read pinned toolchain
sources/archives only; keep EM_CACHE, temp, builds, Python cache and evidence
inside the run. Native tests use MSVC strict IEEE; WASM uses Emscripten
-fno-fast-math -ffp-contract=off with Node, not a second product module.

Configure tests/csg-derived-guard against the checked mechanics candidate.
CMake accepts ARCH_GUARD_MECHANICS_SOURCE; ARCH_MANIFOLD_SOURCE and
ARCH_CLIPPER2_SOURCE select pinned sources. For verified prebuilt archives use
ARCH_GUARD_MANIFOLD_LIBRARY, ARCH_GUARD_CLIPPER_LIBRARY,
ARCH_GUARD_MANIFOLD_GENERATED and ARCH_GUARD_CLIPPER_INCLUDE instead.
Native build uses its own Visual Studio build directory; WASM uses its own
Ninja directory and the read-only Emscripten CMake toolchain. For Node-WASM
set that build directory's package.json to type commonjs, as the emitted
fixture executables are .js. No browser/standalone allocator is introduced.

    cmake -S tests/csg-derived-guard -B <own-native-build> <explicit pinned dependency args>
    cmake --build <own-native-build> --config Release --parallel 4
    python tests/csg-derived-guard/run.py native fixed <own-native-build>/Release/derived_guard_probe.exe prior-native
    python tests/csg-derived-guard/closure.py native fixed <own-native-build>/Release/closure_probe.exe closure-native
    python tests/csg-derived-guard/run.py wasm fixed <own-wasm-build>/derived_guard_probe.js prior-wasm
    python tests/csg-derived-guard/closure.py wasm fixed <own-wasm-build>/closure_probe.js closure-wasm

The runner resolves PROJECT_ROOT/PROJECT_REVIEW_RUN and fixture paths at run
time. Each evidence tag must be fresh. Phase fixed in run.py selects the
prior14 checks (even against the already-fixed pending baseline); its older
baseline flag belongs to the historical pre-remediation guard. closure.py
has separate baseline/contact/fixed causal phases. No old run path is needed.

generate-fixture.py reproducibly derives the two small C++ includes from
fixtures/controller-metadata.json and the unchanged authored ASCII STL.
The original ARCH and STL are first-party retained controller evidence;
fixture-pins.json records their exact origins and hashes. No hand-written
production codec, triangulator or mesh repair is added.

