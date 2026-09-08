# Parent gate/lifecycle binding — API1

Use `gateState: finalSceneGateState` from src/integration/final-scene-gates.mjs for the current APMS3/source2 product build. This is a pure synchronous helper, with no model wrapper, state commit, Worker or additional generation.

The helper consumes ONLY the private product.inspectModel result. It verifies the complete domain state fingerprint (revision separate), exact inspected head/model identity, product/semantics/revision, explicit accepted native source/mechanics gates, and current source id/revision/raw hash. Imported/public model metadata is never an inspector substitute.

It derives assembly from the active native scalar input and matching immutable domain assemble (clicky) or charmRap (charm). Latent preferences of inactive products do not block another product. app.mesh=null explicitly means no pending mesh. A non-null mesh requires a boolean applied field; unapplied is blocked. Current APMS3 does not qualify imported CSG. applied=true with impOn=true therefore requires a future explicit actual CSG binding and is blocked as SCENE_GATE_APPLIED_MESH_BINDING_REQUIRED. No imported applied flag grants execution.

projectScheduleHash is the domain schedule's EXACT `sha256:<64hex>` identifier; do not strip its prefix. The helper validates the schedule, ties its complete content/origins/profile to the same native head, and compares the APMS actual first-layer boundary and regular-height parameter. This is a binding of the built request, not a later unrelated schedule. Native mesh/fit success is not inferred.

The provider's gate parser accepts this namespaced schedule ID (the earlier bare-hex-only draft was incompatible with main printing and is corrected). All four gate booleans are mandatory; unknown/unaccepted native metadata throws. invalidInput/kernelFailure=false are conclusions from explicit accepted native gates, not from missing errors.

## Qualification timing
Parent applicationContext already supplies verified history.current.stateHash, user/project, epoch+navigationcounter sessionKey and exact visible ModelLease. This satisfies the context contract. No stats changes or ModelLease wrapping are needed.

1. Capture/freeze the actual input state when building; retain its committed head through the existing job.
2. After an authorized successful build, promote the exact model and retain controller ownership. Keep the SAME job alive.
3. Await scene.refresh({model,control}) with that job's original ticket/signal/progress callback. The provider requires context().model===model; it will reject a draft or previous visible lease.
4. Recheck controller job/identity authorization before reporting job completion. Read geometry verdict from scene.describe, never rewrite lease.stats.
5. Unknown/pending/failing qualification keeps export eligibility closed; the committed visible geometry remains intact. Cancellation/head/source/session changes prevent cache publication.
6. On project/auth/navigation retirement, abort jobs and await scene.reset with the parent's private reset barrier; parent then owns shared engine/model/source disposal. No new identity may reuse a private cached proof.

`refresh===qualify`; both return {version:'arch-app-adapters/1',ticket,evidence}. `describe(record,context)` stays synchronous for export/printing. Full material-ID joins are unchanged.

## Material helper delta
planMaterialSourceIds remains SYNCHRONOUS and pure. Its full retained ledger now requires digest: SHA-256 of canonical JSON of all fields except digest, with entries sorted by ordinal NFC full ID. The digest uses the existing domain/hash implementation, cross-checked against Node crypto. Every resolve recomputes/verifies it. This is integrity identity, never authentication.

The ledger schema is still arch-material-source-ledger/1 because the candidate was not frozen or promoted; the earlier mutable draft without digest must not be imported as trusted mapping. Parent persists a new complete plan during adoption before build. No export-time allocation/upgrade is performed.
