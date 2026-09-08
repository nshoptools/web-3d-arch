# GEO-04 import-as-part — implementation handoff

Baseline: docs/pending/csg-integration-20260908/candidate.zip SHA-256 46d5dd80c324d1908c60cec18f4e4eb35ae98eac41aa76c30b68cded0977bea6; all190 entries and main preimages checked before this isolated candidate. The parent module-r3 pair was verified read-only; these tests compiled a fresh native and Emscripten module. Implementation-only, configuredReview=false, fast unverified. No Opus/subagents, main/parent/frozen-room mutation, browser deployment, printer, slicer or paid API.

## Exact parent API

For impOp=them send operation:'import-as-part', targets:[], materialPolicy:'requireDisjointMaterials', separateImportedAssemblyGroup:2. Explicit source unit, exact approved12 binary64 transform/bits, source material mapping, source/provenance numeric IDs, all generated bindings/materials, current head/revision and publication descriptor are still required. No generated target is selected. Parent has wired targetId:null, explicit material and two approvals. The reusable operation.mjs maps them/han/tru; no application/controller/UI file was edited here.

Root arch_mesh_operation_mask and component archcsg_operation_mask return15; bit3 is import-as-part. ABI2/ARCH1, existing discriminants0/1/2 and module/allocator remain unchanged. Root export-list addition supplies the new getter. Raw imported source remains immutable. Generated vertex and triangle arrays are preserved exactly; imported normalized indexed triangles are transformed once in binary64 and appended, with orientation correction only for explicitly approved reflected affine transforms. Each output has stable arch-mesh-part-identity/1 identity, source/material provenance and retained source-row/face ancestry. Identical material/color does not imply welding. Explicit overlap, unknown ownership, budget, invalid topology, below-bed, stale/cancelled, and wrong confirmation cannot publish a partial result.

## Mechanical hunk integration — coordinate with Boole

Required changes are narrow hunks in src/kernel/mechanics/src/derived_guard.h, derived_guard.cpp.inc and derived_check.cpp.inc. They add an owned per-original-part full oriented-facet/color multiset, charge its storage, and arch_mech_guard_check_append. It verifies every original owner/group/part and complete facet multiplicity before reusing original pair qualifications. Newly appended parts still undergo topology and full manufacturing/preview-assembly collision checks; roof/floor/cavity/datum checks remain active. The original arch_mech_guard_check entry remains the union/difference/intersection path. Keep Boole's newer AABB interior-separation and partial-cap datum fixes while rebasing these additive hunks. Never overwrite his three files from this candidate wholesale. No epsilon cleanup, Simplify, tolerance inflation or slab proxy was introduced.

The old redundant generated-query path rejected independently qualified unchanged clicky/charm scenes and exhausted lego's triangle-pair budget. Frozen failed fixtures/logs are retained in the implementation evidence; no failed verdict was relabeled passed. Every new generated snapshot was independently checked. Fault injection changes the actual generated positions while retaining the old native guard; both native and WASM block confirmation with APPEND_GUARD_ORIGINAL_PART_CHANGED.

## Focused files / replay ownership

Only importer/native/root/guard support, package adapter mapping/gates and tests changed. The app-csg-transaction.mjs delta is EXACTLY one enum inclusion for 'import-as-part'; parent must narrow-rebase it over its operation.targetOptions addition. CAS/history schema and durable committed:true/visible:false ownership contract remain unchanged. Runtime preserves raw bytes/hashes, approved units/transform/materials and the existing replay recipe. No controller adoption is implemented or claimed by this sidecar. Parent owns mesh-services/UI/controller, replay targetOptions and production qualification.

## Executed evidence

- Native ten positive analytic imports (mm triangular prism6 mm3 and cm holed extrusion12000 mm3) across keychain/clicky/strap/lego/charm; five changed-generated guard rejections; exact generated arrays, immutable raw bytes, wrong confirmation/no partial publish and primary lease release checked.
- Same-module WASM on Node24.19.0:21 cases,14 publications; both STL/OBJ across all five products, translated/rotated/reflected affine input, hole section, OBJ two parts/two materials, typed overlap/target/material-policy/resource refusals, below-bed gate, open-input repair proposal and missing-unit proposal. Stale/cancel/exact-confirm/zero-held-root-byte invariants checked. No browser or controller acceptance claim in this wave.
- Independent reader:10 native analytic volumes,5 exact native/WASM imported indexed-buffer comparisons,5 STL/OBJ oriented triangle comparisons. Arithmetic determinant-sum comparison bounds apply only to those tests; total geometry/fit bounds remain unqualified.
- Existing parent CSG five cases pass: rotated STL/OBJ difference, valid side union, disconnected-weld rejection and datum-blocked intersection.
- NFD source_assembly.cpp/support_regularization.h bytes from the durable baseline remain unchanged; the parent weld-connectivity loop remains in the native union branch. Their prior evidence is inherited, not falsely counted as new NFD/browser tests.

## Reproduce / limits

Apply this delta only over verified baseline bytes in a fresh owned candidate; null preimage requires absence. Existing parent changes require hunk rebase, especially mechanics and replay enum. Run from repository root with the normal seat environment:

    . ./tools/development/env.ps1 -Seat codex -RunId <fresh-run>
    ./<candidate>/src/mesh-import/tools/check-import-as-part.ps1 -RunId <fresh-run> -CandidateRoot <absolute-owned-candidate> -Tag r1

The convenience recipe packages the individually executed commands; its combined wrapper is not separately rerun. It uses read-only prepared Manifold3.5.3 revision0edd9d54876f3135e431575214dd6d8a72866fee, Rust1.98.1/native and nightly2026-09-07, Emscripten6.0.9, CMake4.4.3, Ninja1.13.2, Node24.19.0 and the baseline-pinned Three0.185.1 original loader closure. No dependency/configure download. CARGO_HOME/EM_CACHE/build/output are owned; .toolchain is read-only. Original licenses and hashes are already included in the durable baseline package and csg-manifold-pins.json.

The proof module includes TestFixtures and omits Printing. It is not a production runtime artifact. Parent must combine Boole/targetOptions and this delta, rebuild its full production pair with printing and no fixtures, verify bit3, and run actual controller/commit/replay/export acceptance. Automatic greatest-contact target, voxel/repair, arbitrary OBJ polygons, 3MF input, source-derived SVG section, stacked feature replay, physical fit and a global error bound are not added here. Invalid imported parts retain typed preview/source verdicts and cannot be silently repaired/applied.
