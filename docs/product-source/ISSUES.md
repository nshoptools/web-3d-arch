# Open integration and native model limits

This is an implementation handoff. All blockers below remain visible; release acceptance belongs to the parent and independent reviewer. None is converted into success by the bridge.

## PSB-01 — accepted raster plus text context

Measured with the actual root Module and root Worker: raster-only succeeds; an accepted raster plus text SourceContext bundle fails PRODUCT_SOURCE_HASH_MISSING.

The current arch_build_raster implementation in src/kernel/src/abi/raster_runtime/mod.rs uses pack::shapes and its old color-grouped metadata. It omits the product sourceHash/sourceRegions/upstreamValues. Existing raster_runtime::product_source already uses pack::product_shapes and preserves those fields and the source ledger.

Required parent action: expose that actual accepted graph as a registered snapshot context through buildSourceContext or a dedicated accepted-token context RPC, preserving sourceHash, sourceRegions, upstreamValues, approval/lease lifetime and indexed regional graph. No numeric app pointer, synthetic source metadata or duplicate segmentation is an acceptable substitute. This delivery only documents the root gap; no Rust/Worker/controller file is patched.

## PSB-02 — negative absolute text coordinates

The current root SVG parser clips to a positive viewport and has no affine SourceContext transform field. Beside text whose actual manufacturing bounds have negative X/Y blocks PRODUCT_TEXT_SOURCE_FRAME_UNSUPPORTED. A positive placement with real HarfBuzz is tested and preserves its declared coordinates.

Required parent action: an explicitly registered native context transform with exact ownership and provenance, or an explicit user/domain placement proposal. This helper never silently translates an overlay.

## PSB-03 — native refusal matrix on real curved outlines

Frozen R3 WASM f13bdd2b5b778ac0f2ec70fb2d43052de68e7d415d03218bea6f0a09718e40a9, mechanics3/source2. Real Inter text O and explicitly selected Noto Emoji monochrome grinning face each test five products by four art styles using the pure initializer and unchanged effective defaults.

For EACH of the two sources:

| Product | noi | chim | phang | phang2 |
| --- | --- | --- | --- | --- |
| keychain | model | bottom support refusal | model | model |
| clicky | model | bottom support refusal | model | model |
| strap | chamfer budget refusal | bottom support refusal | chamfer budget refusal | chamfer budget refusal |
| lego | groove edge limit | bottom support refusal | groove edge limit | groove edge limit |
| charm | model | bottom support refusal | model | model |

Thus 18/40 models succeed and 22/40 refuse; these are not 40 successful models. Exact diagnostics are SOURCE_BOTTOM_SUPPORT_MUST_MATCH_FOOTPRINT, CHAMFER_MOUTH_EDGE_BUDGET (field78) and GROOVE_EDGE_RESOURCE_LIMIT. tests/product-source/native-refusals.json pins every case, diagnostic and verdict. The test verifies refusal transport and current ownership without weakening any native check or mesh oracle.

No flattening tolerance, bevel, hole, region, height or active product setting is changed to make these fixtures pass. Parent/native owners must determine which refusals need a geometry fix, resource policy/proposal or unsupported-feature explanation. Whole-pipeline error bounds and physical fit remain unverified.

## PSB-04 — explicit text and material face decisions

On-model text layer controls without a certified actual face/reference produce PRODUCT_ADOPTION_BLOCKED and the pure initializer's datum proposal. Per-region height overrides follow the same rule. The optional resolveTextBindings callback is the integration point; source adoption may not autoaccept its proposed change.

A later text edit requires atomic artifact recapture before source descriptor/adoption. Existing geometry-proposals.mjs remains the parent's native exact-head consent bridge.

## Parent-only adoption validator integration

MaterialView currently needs the bounded optional product extension. The focused controller-material-extension.patch was delivered early and remains byte-for-byte stable. Until parent applies equivalent validation and type changes, the exact controller material allowlist rejects product metadata. The helper and tests validate the exact extension themselves but do not pretend the main controller delta has been integrated.

## Qualification boundary

These are local component and root-WASM/Worker implementation tests with frozen sources, synthetic project/users and pinned original library assets. Browser source consent is explicit test-driver action, not application autoacceptance. No production account, external service, AI, printer, fit, final export qualification, offsite backup or independent review is tested here.
