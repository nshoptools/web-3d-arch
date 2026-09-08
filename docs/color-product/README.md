# One COLRv1 emoji to a real Worker product

Implementation-only closure, 2026-09-08. Source: original Noto COLRv1 grinning
face U+1F600, collection noto-color-emoji; product keychain, style noi. This
delivery contains one bounded source-context fix and a repeatable single-case
Chromium test. No CSG/controller/native/build/Worker implementation is changed.

## Defect and correction

After the explicit render and palette/source approvals, baseline entered native
product preparation and failed PRODUCT_SOURCE_HASH_MISMATCH. The original
artwork descriptor SHA and rendered RGBA SHA were different, as they should be.

Native raster_runtime/pack.rs retains the encoded source hash, or the
ConfirmedRender source hash, in sealed RASP bytes 192..224. canonical_source in
raster_runtime/mod.rs uses that nonzero value as sourceHash; only plain RGBA
without an origin falls back to the current originalRGBAHash (bytes 160..192).
product_runtime.rs rejects a packed request that does not name that exact hash.

The JS rasterContextHash helper had mapped every RGBA input to its RGBA hash,
including a confirmed original artwork render. It now uses the checked origin's
sourceHash for confirmed renders, requires origin.sourceHash === originalHash
and mode === 'rgba', and retains the existing choices for encoded/plain RGBA.
Both original and RGBA hashes, consent, source revision, stored assets and native
ownership remain checked. It does not rewrite a receipt, waive the native guard,
switch a font, resample pixels again or implicitly approve geometry.

No public API/type/ABI change. Apply the CAS hunk against the durable candidate's
product-source-contexts.mjs (SHA ecfe308df5b628299cb5b5627e5f098b59047f1c5e7697379395f6eca51cae0d),
not by replacing the current MAIN file from this whole candidate tree.

## Bounded acceptance

- Baseline Chromium on the checked durable190 + sealed raster2 production files:
  reachable PRODUCT_SOURCE_HASH_MISMATCH before publication.
- Same case after the source-context change: real original color source -> retain
  original artwork consent -> explicit 256x256 render consent -> separate native
  palette/source consent -> prospective product datum consent -> actual current
  product. There are five displayed confirmations and three source commits; the
  controller never publishes a model in the deferred artwork/render stages.
- Chromium 153.0.8010.12 / Playwright 1.63.0 / Node24.19.0, actual production
  EngineClient and Worker with COI. One root WebAssembly instance and one owned
  WASM fetch were observed. 42 bounded Emscripten addFunction trampolines were
  separately checked; they are not extra geometry modules.
- Final product: 13 mesh parts. The existing independent indexed mesh reader
  checks finite/nondegenerate triangles, two opposite incident faces per edge,
  vertex-link cycles and positive signed volume on every part. Native snapshot
  colors contain multiple distinct colors; mechanics3/source2 are checked.
- Original selected full font bytes (4,991,984 bytes), Unicode/selection
  descriptor, approved render dependencies, full RGBA and PNG remain referenced
  and SHA exact after product publication.
- Actual same-Worker paint extraction at emoji.select, source.convert and a fresh
  prepare.source after the model commit returns the identical complete graph:
  60 paint operations including one gradient. Graph SHA:
  29c2c9057a1063e56b29f4285d73c1d2d73aba6c2b50f280e704511e92ceca41.
  The original font preserves all artwork layers/gradient data. Sampling/color
  reduction applies only to explicitly approved derivatives; retained original
  artwork is not replaced with the derived palette.
- The unchanged sealed raster suite also passes 5/5 groups on this delta:
  new PNG, actual erase/reconversion, both discard stages, cancellation/reset/
  throw, tampered receipt/assets, old callback compatibility and ownership.

Case elapsed 33.45s (existing 120s bound); full browser test with graph
reconstruction/audit/oracle about 50.15s (existing 240s group bound). No timeout,
palette, resolution, source, mechanics or oracle was relaxed.

## Inputs and reproduction

Use the durable docs/pending/csg-integration-20260908 candidate, unchanged MAIN
dependencies and the sealed raster adoption's two production files, then only
this manifest's allowlist. The dependency manifest separates all copies from the
new/modified delta. The source font is original, OFL-1.1, from pinned noto-emoji
commit 8998f5dd683424a73e2314a8c1f1e359c19e8742; SHA
0ae57fe58645638523ba35f388d93739d292539a9acb84df5700c81b1e1a28d2.
The catalog preview PNG is retained as a catalog asset, not used as substitute
geometry. Original Inter is a required default catalog fixture only.

In a NEW isolated run, before every writing process:

    . ./tools/project-env.ps1 -Seat codex -RunId <owned-run>
    $env:PRODUCT_APP_MODULE = '<owned-run>/work/module-r3/arch-kernel.mjs'
    $env:ARCH_ROOT_TAG = 'color-check'
    # Check the MJS and adjacent WASM hashes against the manifest before running.
    node <candidate>/tests/color-product/prepare.mjs
    node --test <candidate>/tests/color-product/browser.test.mjs

The runner fixes one Chromium/keychain/noi/color group. It uses repository-private
pinned Playwright, own profiles/download/cache paths, loopback OS-assigned port,
same-origin-only network routes, SHA-allowlisted input bytes and existing private
color-renderer/service paths. It neither creates a second moduleFactory nor calls
an AI/provider or another agent. No global dependency is installed.

module-r3 pins: MJS ac581980c67c307df5d2b863a2a1652c9d91c4e86827f5ad93ee0db01591fce7;
WASM 4ecdda9b1bea91a1e1af01e2a54245c0c4b922280288f4a2bb7c937410eff474.
TestFixtures=true, Printing=false. Parent must repeat this exact case on its
production Printing=true/TestFixtures=false pair. This is not whole-release,
printing/fit, arbitrary-emoji, cross-browser, IDB/auth or CSG qualification.
Storage is the existing labelled memory recorder with real controller/domain/
history/CAS checks. Inherited Astra/max implementation request; fast/service-tier
unverified, no independent/configured review claim.
