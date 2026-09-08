> Closure: the sections below preserve the initial API/design history. Actual runs are complete. Only the first STL case was selected in the final run. Exact target ID replaced the ambiguous @main-body selector. Final actual-r4 used the parent routing delta 9545f9ad... and module-r3 WASM 4ecdda9b..., reached input approval, and failed MESH_POST_CSG_OR_TOPOLOGY_BLOCKED before the second CSG proposal. No CSG commit/export/replay/history or cancellation/OBJ pass is claimed. See README.md and run reports/handoff.md for final scope and immutable evidence.
# CSG controller acceptance — early binding

Version: `arch-csg-controller-acceptance/1`. Implementation test engineering only.
Astra/max inherited; fast/service-tier not exposed or independently verified. No Opus or child tasks.

## Run gate

Prepared now, **not executed**. Run only after parent confirms the real production
composition (including generatedBase, mesh import/apply/replay and final-scene/export
routing) is wired and gives matching source + module/WASM + build-receipt pins.
Old internal preview and old release are untouched. An old library asset pack may
be reused by its exact pins; its old entry, core and WASM are never substituted.

The harness entry calls the actual `bootProductApplication` from the copied
production tree. It publishes a test-only controller observer. It does not supply
selectRecipe, generatedBase, kernel, mesh, qualification, storage or export doubles.
Authentication is the existing local signed OIDC/PKCE fixture against real
HTTP/SQLite, explicitly not operator OIDC qualification.

## Public commands used

- `project.create {product:'keychain'}`; original approved example
  `docs/examples/hai-mau-co-lo.svg` through `importFile(file,'source')`.
- Explicit source proposal confirmation when actually proposed; then
  `geometry.build` using the real five-product composition, not extrusion recipe.
- Original authored closed 12-triangle cuboid through `importFile(file,'mesh')`.
- Normal `parameter.set` for `impOn:true`, `impOp:'han'|'tru'`, identity transform
  (`impScale:100`, translations/rotations zero).
- `selection.set {blockId}`, followed by
  `mesh.apply {unit:'millimeter', targetId:blockId, materialId:fullCurrentMaterialId}`.
  The staged AppBridge now accepts these three fields (read 2026-09-08).
  Target must be an actual current generated block ID accepted by the generated
  base export descriptor, joined to app.materials by full ID. No guessed index,
  color join, narrowed semantic ID, or substitute material.
- Each returned `confirmation.retry` must be exactly a
  `proposal.accept {id,confirmed:true}` for the live pending operation. Input/unit
  approval and post-CSG approval are separate IDs and output hashes. No early head.
- `proposal.discard {id}` cancels either stage. Reusing its retry must fail.
- `project.save`, `project.open {id}`, `geometry.build`,
  `history.undo`, `history.redo`, `exportFile('stl-union')`,
  `export.receipt {id}` and rescue ZIP for independent byte/history readback.

## Three bounded cases (Chromium only)

1. **STL subtraction and durable replay.** Build ordinary source/product, select a
   generated target, import a small through-cut cuboid in explicit mm. Approve
   twice. Verify original visible lease bytes/head/history at each pending phase;
   second approval publishes one state/head/history change with the real
   mesh-scene model. Read back STL and receipt. Save/open/build must reproduce
   CSG geometry and original file bytes without another CSG commit. Undo/redo
   uses increasing domain revisions, with applied state and geometry restored.
2. **OBJ union and mapping.** Same authored cuboid encoded as original OBJ with a
   named source material; explicit current target/material selection. Two real
   approvals, actual CSG/export, original OBJ and mm/material/target/transform
   recipe retained. Geometry must change with the expected volume sign and
   watertight readback; native success alone is insufficient.
3. **Cancel first and second proposal.** Same ordinary generated setup, explicit
   import. Cancel input approval; retry rejected and no head/model/state change.
   Prepare afresh, approve input only, cancel post-CSG approval; retry rejected,
   no commit, original generated model still usable. Follow-up save/open checks
   no hidden applied recipe or leaked temporary candidate became durable.

Source import and parameter transactions preceding mesh.apply are counted
separately; exactly-one-history assertion is relative to captured pre-apply head.

## Observer and oracles

Test-only observation reads actual controller `doc`, `assets`, `store.load`,
`visible.lease`, and public snapshot. It never assigns these fields or calls
mesh lower-layer prepare/commit functions. ARCH bytes are copied only for evidence.
Durable read uses the real ProjectStore; STL/ZIP independent readers are reused.

The fixture placement is selected from actual current geometry by an independent
inside/outside check, not merely a target bounding box. The controller receives
ordinary file bytes plus explicit unit/target/material. A fixture placement that
cannot prove overlap/interior is a preparation failure, not CSG acceptance.

## Parent integration expectations / current open boundary

1. `bootProductApplication` must wire actual mesh source, transactions and replay
   without a test-only product callback. The staged mountApplication read so far
   does not yet expose this composition; this is expected pending parent work.
2. Current project.blocks IDs/materialIds must match the target IDs used by
   generatedBase inspection. A missing/orphan join blocks the test; it will not
   pick by color or invent a valid target.
3. Reopen clears the visible model; build uses the persisted meshCsg recipe and
   real generated base. Undo/redo may leave the old visible lease stale until an
   explicit build; the harness will check both states.
4. Supply matching new source tree + build receipt/pair when composition is ready.
   No old module with a new ready client. The runner records all source/route/hash
   pins and rejects missing ready authorization before starting servers/browsers.

No broad browser campaign, no lower-layer CSG re-run, no timeout raising, no
production CSP/COI changes, no edits/restarts to the human preview.

## READY relay accepted (2026-09-08)

Parent supplied composition READY after the 15-file generated-base integration.
Delivery SHA: a62b0366d2b3acb58d80c0364a4e1518118f4e73be0e7114e1f6256dd37a1b25.
The bounded run now uses parent stage's full production composition with its
actual **test-only** root pair (TestFixtures ON, Printing OFF):
MJS ac581980c67c307df5d2b863a2a1652c9d91c4e86827f5ad93ee0db01591fce7;
WASM d4ad35f399732b62aa0b5029deffd0f731799711a9efebb1eb15575c8e89c08d.
This pair is not a production release and does not qualify printing/3MF.

`@main-body` is an explicit target selector requiring exactly one real role-0,
assembly-group-0 body. The STL case exercises it; the OBJ case uses an exact
generated block ID. Both pass an explicit full current material ID.
The two proposals have distinct IDs/hashes but MUST retain the **same** original
controller job/native ticket using `handoff:true`; no new native operation identity.
Replay target lineage is read from `meshCsg.parameters.resolved.targetId`, with its
numeric target present in the persisted command binding table.

The runner makes a separate allowlisted webroot and compiled test entry, reads
all product code from an owned snapshot, and authenticates against actual local
HTTP/SQLite with the explicitly labeled signed OIDC fixture. No mutation of old
artifact or human preview. Only code syntax checks have completed at this update;
actual case results are recorded separately and never inferred from readiness.
