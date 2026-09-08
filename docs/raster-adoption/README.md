# Fresh raster adoption callback closure

Implementation only, 2026-09-08. Apply only the delivery manifest allowlist over
the checked docs/pending/csg-integration-20260908 candidate and matching MAIN
dependencies. Do not promote this candidate's whole dependency tree.

## Production change and contract

RasterSourceAdapter.acceptProposal(control, consume?) preserves its existing
single-argument ApprovalAnswer. With a consumer it validates the same exact
confirmation, source context, receipt, stored byte hashes, revision and native
proposal; then calls and awaits the consumer once:

    type RasterApprovalConsumerInput = ApprovalAnswer & RasterConsumerInput;
    acceptProposal<T>(control: RasterApprovalControl,
      consume: (ready: RasterApprovalConsumerInput) => T | Promise<T>): Promise<T>;

The ready value includes the accepted 31-buffer packet, frozen preparation and
approval receipt, coordinateKind:28, and the private {kind:'raster-token', token,
epoch} reference. No application pointer or model is manufactured. The prepared
and accepted native readers stay live until the consumer settles, and both are
released even if the first release fails. The consumer must retain its own native
planar authority for use after this borrow. An independently finished model may
outlive it. Consumer exceptions, including the controller's next
PROPOSAL_REQUIRED, propagate unchanged. Cancellation/reset after a consumer
returns releases any returned owner and rejects it.

The existing product source context callback now runs: it borrows the accepted
token, builds the same-Module planar context, retains a private source authority,
and passes it to the native prospective datum proposal. Raster consent does not
commit state. Only the second explicit native product consent atomically commits
source, assets and materials; then the controller builds the current product.
No new consent bypass, re-quantization, controller hook, ABI or CSG hook is needed.

## Reproduction and focused acceptance

Owned run: tmp/reviews/codex/runs/20260908-raster-adoption-closure.
Baseline unchanged dependencies failed SINGLE_ATOMIC_ADOPTION: first raster
consent returned successfully but never called the stage that adopts the source.

After applying the two production files:

- 5/5 Node 24.19.0 groups pass with the real root WASM, real raster dispatcher,
  compositor, source contexts, native datum probe, product adapter, controller,
  domain validation, history and CAS checks.
- New 16x12 two-color PNG with transparency/hole: two displayed consents, exactly
  one commit, real current root product, strict mechanics3/source2.
- Real erase from (10,8) to (13,8), width3, followed by explicit raster conversion:
  exact original PNG, pre-edit full RGBA and current edited full RGBA preserved;
  current receipt/region identity ledger, stored buffer hashes and separate
  native adoption confirmed. No saved-raster seed is used for these success cases.
- All product mesh parts pass the existing independent indexed mesh reader and
  incidence/orientation/vertex-link/volume oracle. This is fixture topology
  evidence, not a printer, fit, export or comprehensive raster-shape qualification.
- Discard at either consent, stale confirmation, consumer throw, cancellation,
  reset, mutated confirmation and corrupted asset hash cause no partial commit.
  Callback sees a live native source after an actual async suspension. Legacy
  single-argument return fields are unchanged.
- After each controller disposal, zero tracked root models, zero raster-owned
  bytes and zero published raster/planar source registry tokens remain.
- Strict declaration typecheck passes, including invalid consumer/opaque-handle
  negative cases.

The storage recorder is labelled in-memory TEST storage. It exercises real
controller/history/document validation but does not qualify auth, IDB, browser
Workers, CSG gates, printing or a production module. The single owned module-r3
was supplied by the durable manifest: TestFixtures=true, Printing=false.
No native rebuild, browser matrix, paid API, other agent or real deployment ran.

## Run in an owned room

Keep the durable candidate dependencies and this delta in one candidate. In a
fresh writable run, initialize the environment before every writing process:

    . ./tools/project-env.ps1 -Seat codex -RunId <owned-run>
    $env:PRODUCT_APP_MODULE = '<owned-run-absolute>/work/module-r3/arch-kernel.mjs'
    # Copy and hash-check MJS and adjacent WASM against manifest.json first.
    # Run once; preparation verifies original Inter bytes from current fixture catalog.
    node <candidate>/tests/mesh-generated-base/prepare.mjs
    node --test <candidate>/tests/raster-adoption/node.test.mjs
    node .toolchain/app-runtime/node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 --lib es2022,dom <candidate>/tests/raster-adoption/types.mts

The existing fixture library helper retains only original Inter (876576 bytes)
for the compositor catalog. Geometry here is generated from the authored PNG;
no font or saved model is substituted. Tests bind one loopback ephemeral HTTP
asset server and keep fixture bytes, logs and model captures under the owned run.
Each test group is limited to 30 or 60 seconds; no global matrix/deadline increase.

Inherited Astra/max implementation request; service-tier/fast state unavailable
for verification. This delivery makes no configured-review or independent-review
claim. Parent retains CSG and release integration ownership.
