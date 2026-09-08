# Pending imported CSG — durable implementation handoff

Status: production capability remains OFF/gated. These four files preserve a checked implementation for later integration; merely committing this directory does not change the website or install a runtime. Implementation-only, configuredReview=false, fast unverified.

## Contents and integrity
- production.patch: additive canonical src/mesh-import package, native/Rust/core/provider integration hunks and original Three ESM loader dependency closure.
- tests-tools.patch: checked analytic native/Node/browser tests and isolated build recipe, plus the root build-export hunk.
- manifest.json: SHA-256 of both patches/this README, exact raw-byte preimage and postimage hashes for every patched file, source/dependency pins and bounded evidence summary.

Both patches derive from the checked preimages. No implementation was rewritten for this handoff. A null preimage means the path must be absent. Existing src/core/engine-worker.mjs was already newer than its tested preimage: rebase its narrow routing hunk, never replace the current Worker wholesale. Mechanics guard fixes also require a fresh rebase/adjudication. No old room, evidence archive, private corpus, ideas document or external profile is needed to understand/apply the package. Existing public repository prerequisites are pinned in manifest.json.

Three0.185.1 is included as six original MIT-licensed files: package metadata, license, ESM core/module and STL/OBJ loaders. This is the actual ESM dependency closure used here; unused CJS/WebGPU/addon entrypoints in the original package metadata are not supplied. Do not run package installation hooks or treat this subset as a general Three distribution. Manifold/Clipper2/HarfBuzz and compiler tools are supplied by the repository's prepared read-only toolchain; no configure-time download. Optional lib3MF/Expat import is disabled and not shipped as an enabled feature.

## Safe integration sequence
1. Keep geometry.import-csg unavailable. Work in an isolated repository candidate under the required seat environment. Commit only these four pending artifacts to the website source freeze.
2. Verify patch/README SHA-256 against manifest.json. For every modified target verify the exact preimage SHA; refuse mismatches and rebase hunks against current ownership. Check/apply production.patch and tests-tools.patch there using git apply --check, then git apply; verify resulting bytes against every postimage hash. These patches are NOT blanket approval to overwrite concurrent work.
3. Add the src/mesh-import child CMake target after the existing pinned Manifold and mechanics targets. Set ARCHMI_MECHANICS_INCLUDE to mechanics/src. Link arch_mesh_root_static, arch_imported_csg_static, arch_mesh_import_static with the existing native archives. Preserve main ABI2/ARCH1, HarfBuzz, raster/source ASFR, integrity init, float and material routes.
4. Compile native Rust1.98.1 and the same Rust nightly2026-09-07/Emscripten6.0.9 module. C++ archives use -pthread -fexceptions and strict floating arithmetic; no second module/allocator. Keep parent's INCOMING_MODULE_JS_API including wasmBinary. serde_json1.0.149 float_roundtrip is required: the default parser changed one actual rotated binary64 coefficient by one ULP. Prepared Manifold3.5.3 revision0edd9d54876f3135e431575214dd6d8a72866fee is checked by the child CMake.
5. Supply the trusted generated-base service described below, then implement the controller's synchronous adopt entry and existing pending-proposal wiring. Source/current controller/profile code is not supplied as an overwrite. Only enable the app capability after current production integration and the mechanical blockers pass.

Build recipe after patching: src/mesh-import/tools/build-root.ps1 -RunId <owned-run> -CandidateRoot <isolated-candidate> -Target native|wasm -EvidenceTag <fresh-tag>, from repository root. Dot-source tools/development/env.ps1 first and override CARGO_HOME to the owned run cache; Cargo is locked/offline. The prepared shared toolchain stays read-only and all build/cache/profile/output paths are owned. Tests consume fresh outputs; no binary/evidence archive is required. The build recipe defaults CandidateRoot to its owned work/imported-csg-root. Browser harness serves only compiled allowlisted artifacts on loopback, never the raw repository. Tools/node/build dependencies already used by main must be available locally.

## Native and owned app API
Runtime exports: arch_mesh_runtime_version=1; arch_mesh_stage(importer,approvalInput,generation); arch_mesh_prepare(generatedSnapshot,preparedImport,commandInput,generation); arch_mesh_confirm(proposal,confirmationInput,generation); arch_mesh_buffer_ptr/len(owner,kind); arch_mesh_prepared_release; arch_mesh_proposal_release.
Registered inputs are consumed on success AND failure. Confirm success grants ONE primary root snapshot lease. Prepared/proposal ids are not snapshots. Borrowed typed-buffer views expire with ownership; reacquire views after heap growth. Original STL/OBJ bytes stay immutable. Binary64 flat geometry, source/material ledger and face origins remain owned together.

createRootMeshAdapter({operation,kernelLeases,context,commitCandidate,publishReplay}) exposes source.ingest, prepareInput, approveInput, prepareApply, confirmApply, inspectModel and createCandidateInspection. Exact units, affine matrix bits, material slots/IDs, operation/targets and no-repair/no-conditioning interpretation must be approved. There is no boolean-only apply path.

prepareMeshHostTransaction({current,nextState,assets,engine,preflight,qualifyCandidate,adopt}) returns expected/publication/outputHash/verify/commitCandidate/release.
current() => {document,assets,store,userId,projectId,sessionKey,model,headRevision}; assets is Map<SHA256,{hash,bytes,byteLength,kind}>. Domain revision/head fingerprint and storage headRevision are DIFFERENT authorities.
It freezes validated state/assets, appends real history, verifies document/assets, calls real ProjectStore CAS and recovers uncertain acknowledgements only by exact transactionId+document. Manifest provenance is {} (intentHash and native receipt are already in the history command).

adopt({expected,candidate,model,head,transactionId,qualification}) is synchronous after durable acknowledgement. It installs document/assets/head and the single model before emitting, then returns true. Do not perform a second store commit or publish the candidate before acknowledgement. On failure leave that candidate unowned.
Success: {committed:true,visible:true,model,...}.
After durable ack, access/session change or viewport/adoption exception: {committed:true,visible:false,model:null,diagnostic:{code:'COMMITTED_MODEL_UNAVAILABLE',reason,storeCommitted:true},...}. Adapter releases the unadopted primary exactly once; never claim store rollback or throw a pre-commit failure for this result.

## Explicit private candidate qualification and materials
createMeshCandidateQualification({mesh,kernelLeases,operation,workerURL}) returns qualifyCandidate({control,model,state,headHash}).
The adapter mints a private target inspector after checking the actual registered native candidate, exact target domain fingerprint, recipe/command/input/material/source identity and unchanged live base authority. Controller context remains live and unchanged; normal inspectModel remains current-model-only. Every scoped read checks the original live authority. Provider uses a private target-revision ticket; native dispatch uses the original live job control.

The actual independent Worker checks derived ARCH, binary64 material union and neutral whole union. Full-volume native cavity/strap roof/floor/assembly/reference gates are authoritative; old APMS slabs or stats cannot certify post-CSG geometry.
meshSceneMaterialBindings sorts all logical app.materials IDs and assigns local serialization ordinals, retaining full IDs. These are not filament slots or truncated native semantic IDs. Every derived material must exist in the table, and commit checks native slot/RGBA. sourceHashes is exactly the stored recipe's generated contributors plus immutable imported raw hash; native per-face ancestry is separate, not guessed from material color.

At composition, route purpose mesh ingest to mesh.source.ingest, derived models to mesh.inspectModel/meshFinalSceneGateState, and generated products to the unchanged product inspector/gates. Expose the owned proposal workflow to the existing app pending-operation host. Keep the feature gated while that wiring is incomplete.

## Persistence/replay boundary still owned by parent
createMeshReplayRecord retains app.mesh.metadata.meshCsg version arch-mesh-replay/1, original hash, generated-base state asset/fingerprint, parser/input approval, exact transformBinary64LE, native command without runtime authority fields, materialNames/sourceHashes and parameter bindings. app.mesh.applied=true records an approved recipe, not a qualified current lease.
Raw source and base-state assets are referenced by mesh.assetHashes. Computed proposal/snapshot receipts stay in history command OUTSIDE target state to avoid a hash cycle. No native handle is saved.

replayMeshRequest({state,assets,engine}) verifies assets, generated source/text/schedule/parameters/materials, and exact import interpretation. createMeshReplayPublication performs current-head validation and new geometry qualification without appending history.
Reopen/undo/redo restore the recipe, then build a fresh generated operand under a trusted CURRENT binding. Parent/Halley must provide a scoped generated-base service through real withPreparedSource/source assembly/ASFR, taking savedBaseState/current user-project-revision-head/sourceAssets. Do not remove impOn refusal and expose an unmodified generated product as applied CSG; do not substitute prior derived geometry as a new unguarded base.
Current impZ is literal decimal mm. No layer tag, conversion receipt, silent resnap or automatic repair is invented.

## Evidence scope and remaining blockers
Preserved tested implementation: native root static cases +17 Rust tests; one-module Node core4/extended18; original importer corpus99 checks (56 STL/OBJ,43 default3MF deferred); independent reader49 results/11 native-WASM comparisons with zero measured volume delta; source regressions native140/WASM140; WASM mechanics19 groups/199 scenarios.
Final explicit candidate + real IndexedDB CAS/history/reopen/undo/redo and post-ack fault tests passed10 groups each on Chromium and WebKit. Firefox final host suite was unverified because browser page creation hung before proof execution; earlier exact-pair root RPC7 passed on Firefox. No tests were rerun for this packaging step. Counts are bounded implementation evidence, not a product acceptance claim. Original corpus/evidence archives are intentionally not embedded; the analytic root tests are included.

Release blockers: actual controller adoption/recipe composition; trusted current-bound generated-base replay; Worker hunk rebase; Boole mechanical guard findings/rebase/adjudication; current production unified build and capability acceptance. Preserve current storage fixes; this handoff changes no store schema/store implementation.
Default 3MF import is deferred. OBJ polygons/freeform/holes beyond already triangulated faces receive typed rejection, not fan triangulation or lost holes. Native general triangle union/difference/intersection exists; current app supports union/difference enum mapping only. Separate-part impOp=them, app intersection enum and multi-feature stacks remain gated/unsupported. No fit, printer/slicer, global numeric bound, deployment or physical-qualification claim.
