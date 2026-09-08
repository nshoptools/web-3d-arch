# Text application binding — integration contract

This candidate supplies three production ESM files and the type-only API in API.d.mts. It reuses the promoted text-source API and the parent's ABI2 Module. No UI, domain command, native product builder, filesystem reader, fetch implementation, or WASM factory is created here.

## Install beside the existing engine

```js
// Existing engine-worker initialization; Module and hb already belong to this Worker.
const textOps = createTextOperations({
  Module, hb, catalog: deployedSourceCatalog,
  assetURLs: deployedAssetURLs, origin: deployedOrigin,
  fetchImpl: hostApprovedAssetFetch,
  runtime: {engine: qualifiedEngine, version: qualifiedVersion},
  previewPaths: parentValidatedPlanarPreview
});
// Inside the parent's ONE busy guard / request lifecycle:
const result = await textOps.run(request, {
  signal: activeJob.signal,
  isCurrent: ticket => parentExactTicketGuard(ticket),
  onProgress: progress => parentProgress(requestId, progress)
});
```

Pass hb only when that namespace was initialized against precisely this Module. The current HarfBuzz wrapper has no binding-identity getter; this assertion belongs to the trusted initializer. Otherwise omit hb and let the factory bind the bundled namespace once to Module. Replacing Module requires a Worker reset. No second instance is constructed. The service never resets the native generation: the parent does that for any native preview/product operation.

Route request {version:'arch-app-adapters/1', ticket, op, ...payload} through the existing client. ticket has exactly id, userId, projectId, revision, generation and is echoed without reinterpretation. Native generation/requestId remain separate transport fields. Operations: font.import, text.import, prepare.text, prepare.source, emoji.select, source.convert, source.confirm. run requires the current-ticket predicate. reset/dispose cancel this service's work and close its private renderer port.

On the app side:

```js
const source = createTextAdapters({
  catalog: createSourceCatalog({catalog:deployedSourceCatalog,assetURLs:deployedAssetURLs,origin}),
  context: () => ({state: controllerState, assetsMap: retainedSourceBytes}),
  invoke: (request, control) => parentTextOperation(request, control)
});
```

Install this as the text/emoji/font part of SourceAdapter, dispatching other formats to their existing adapters. Preserve the root job/head/epoch/online guards. clearPrivateState/reset/dispose must also reset/dispose the corresponding Worker text service through the parent lifecycle hook; the main wrapper deliberately has no separate Worker ownership.

## Assets and catalogs

assetURLs is an explicit array of {sha256,bytes,url,mediaType}. Every URL must already be an absolute deployed same-origin URL without credentials, query or fragment. The reader rechecks actual length/SHA, rejects redirects/extra bytes, and has no default network implementation. Supply fetchImpl explicitly, or supply every needed original in assetsMap. Font/artwork paths in catalog metadata are provenance, never inferred deployment routes.

catalog contains version:'arch-source-catalog/1', original fonts, collections, defaultFontId/defaultCollectionId, previews, and optional labels. Each collection adds explicit selection {kind:'outline'|'COLRv1'|'CBDT/CBLC'|'svg',fontId?,svgIndex?}. This selects an original source, never a fallback. COLRv1 retains the full graph and encoded font; CBDT retains the original font and embedded PNG source; SVG remains original encoded SVG plus sourceToMm for the parent's validated parser.

queryFonts returns the original stable IDs/family/styles. queryEmoji returns stable pages of 64 with collection IDs, exact Unicode sequence, label, deployed preview URL and verdict:'unverified'. Search covers names/groups/hex/sequence and supplied versioned Vietnamese labels; folding removes accents and maps đ to d. This code does not invent a Vietnamese translation corpus, printability ratings, favorites or recents.

Every displayed thumbnail needs a mapped real PNG and provenance. The selected Noto color collection has original PNGs in the repo. Monochrome originals are fonts: its deployed thumbnails must be derived from that font and independently mapped. The harness generates five real mono thumbnails with the parent parser; it does not claim a complete production mono thumbnail deployment. Missing mappings fail explicitly. No color artwork substitutes for mono.

## Import, text editing and source preparation

ingest({...control,state,file,purpose:'font'}) accepts original TTF/OTF bytes <=16,000,000. SFNT directory/table bounds are checked before HarfBuzz; outlines/names/UPEM/axes are read through that same Module. It returns SourceResult kind:text with metadata.font and a real inspected glyph sample. The controller stores the raw bytes and bounded SourceResult.metadata object at provenance.inputFonts[sha256] (the font record is its .font property), app.fontAssets holds hashes, and the selected fontId is imported:<sha256>. No subset/instantiated derivative replaces the original. Embedded license strings are retained; unprovided permissions are not inferred. WOFF2/TTC/color-as-monochrome imports are explicit unsupported formats.

queryFonts restores retained imported metadata after reopen. prepare verifies original bytes again; missing references/bytes/axes never trigger a substitute. The eight reusable personal-font limit, cross-project library, online policy and aggregate project font budget remain parent-owned.

Text comes from state.content.app.text. ingest uses its supplied frozen state; context supplies live publication guards and retained assets. Text files use fatal UTF-8 decoding and retain the exact original bytes/string. prepareSource reads the selected source's retained raw bytes; asSource selects current controller text. selectEmoji returns a serializable original-selection descriptor file plus SourceResult and original dependencies; it never installs unconfirmed editable pixels.

sizeMm is canonical em-size. sizeUnit/sizeDisplay are presentation provenance and never apply a second pt conversion. normalizeTextEdit handles display input (72pt = 25.4mm), using the parent's six-decimal ties-even policy; changing only units keeps sizeMm unchanged. User/controller should normalize the patch before its existing text.update command. Em-size is not visible ink height.

Optional source options live at provenance.textSourceOptions: variationsByFont, layout, align, script, language, direction and raster. Layout preserves original/NFC clusters, Vietnamese offsets once, lines/tracking, cluster-rigid circular bend, holes and disconnected accents in mm/y-up. XY is applied once. Mixed script/bidi needs the explicit sourceAPI run plan. Height/base/bevel/placement-mode values are passed as assembly parameters; the source binding does not extrude them.

prepareText/prepareSource return owned prepared sourceAPI geometry/shared curves/numeric SVG, preview RGBA/PNG where available, exact pixelToSourceMm, diagnostics, assembly parameters and preparedGroups. Known parent preview limitations retain the complete source paths plus a named diagnostic. Other failures propagate. A source raster conversion requires a real preview; there is no blank replacement image.

## Exact confirmation hook

convert returns {status:'proposal',result,changes,confirmation}. The exact descriptor has four fields:

```js
{kind:'text', // or 'emoji'
 version:'arch-text-confirmation/1', approvalHash, proposalHash}
```

SourceResult.metadata.sourceConversion contains bounded reproducibility hashes/details, not consent. After explicit user approval and the parent controller's exact head/candidate-hash check:

```js
const accepted = await source.acceptProposal({
  ...originalProposalControl, // original ticket, not a new job generation
  sourceContext: candidateSource.metadata.sourceContext,
  confirmation: proposal.confirmation,
  source: candidateSource, assets: candidateAssetsBySHA,
  acceptedAtRevision: candidateState.revision // ticket.revision + 1
});
// ONLY:
{version:'arch-app-adapters/1', ticket, confirmation, receipt}
```

candidateSource/assetsMap aliases are also accepted when unambiguous. The wrapper verifies original source bytes, retained dependencies, numeric SVG, RGBA, PNG, dimensions, source metadata and the exact descriptor/ticket. It then consumes the pending internal source.confirm operation. Failed validation changes neither input nor candidate. A successful response contains no source/result/geometry/settings fields. Persist ONLY receipt at source.metadata.confirmationReceipt, recheck parent online/head/epoch/CAS guards, then commit the already reviewed candidate. The receipt uses version:'arch-source-confirmation-receipt/1'. Replaying, resetting or superseding a proposal requires new preparation; no automatic re-approval occurs.

Color reduction/segmentation and product assembly are separate parent proposals. Preview raster consent does not approve a manufacturing/color-reduction decision.

## Persistent groups and the product boundary

Pass groupBinding:{textId,sourceId,provenanceId} to prepareText/prepareSource or persist decimal-string IDs at provenance.textSourceOptions.groupBinding. Direct RPC may use BigInt; persisted domain JSON must use decimal strings. IDs are positive u64 and may exceed Number.MAX_SAFE_INTEGER. The state binding applies to actual text, so it cannot accidentally turn an emoji selection into the text overlay.

One group retains every glyph path/instance and the source hash/variation/cluster lineage; local path/glyph references are not semantic IDs. Missing bindings report binding-required while keeping the real prepared source. Parent must canonicalize these curves or numeric SVG with its existing source parser and bind its actual source_index to explicit canonical-region IDs. No region identity is guessed from paint, glyph order or part index. This is not final packProductRequest data: the parent supplies domainRecord, materials, native generation, profile metadata and source selectors. preview.nativeProfileMetadata, when injected, is copied unchanged; all total-bound/fit/mesh claims stay false or unknown.

## Limits and portability

One active operation, no queue; 20..10,000ms cooperative deadline; 256 attempts per service lifetime. Parent Worker watchdog covers synchronous native calls and owns its heap/restart policy. The inherited source cache admits four fonts/64MB. Parent can call textOps.reset() on font-library/project changes to clear it while keeping the same Module; long sessions recycle the Worker under the parent policy. A reset is cache/lifecycle management, never a source conversion.

Source limits: 16MB/font or source, 500 graphemes, 16,000 UTF-16 units, 64 lines, 128 runs, 4,096 glyphs, 100,000 outline commands, 65,536 paint operations, depth32, 2,048 gradient stops; sourceAPI tracks <=5,000,000 work units. The app copies only selected source dependencies (<=256 references/128MiB) across RPC. Output pixels <=1280² RGBA8; generated numeric SVG <=1MiB and 16,384 expanded segments, with shared curves retained beyond the SVG ceiling.

Worker canvas capability is measured by getContext, not constructor presence. Chromium/Firefox use the Worker renderer. Only qualified WebKit with a failed actual Worker 2D probe may receive rendererPort. Host attaches the inherited private bridge with original source allowlist, current-source check and fresh port after resets. It uses <=512² pixels, <=4,096 paint operations, <=8MB font cache/two fonts, <=1MiB encoded PNG, <=100ms synchronous render calls, <=500ms aggregate font setup, 10s soft deadline. Native calls cannot be forcibly preempted; an overrun returns a renderer gap after the call and no bitmap. No raw SVG DOM, innerHTML, object URL or hidden file I/O is involved.

A cold WebKit measureText exceeded the limit once (147.72ms); its evidence is retained. A later full run passed without increasing limits. The gap must stay visible; an explicit user retry may succeed. Do not claim universal real-time scheduling or total geometric/physical accuracy.

## Final controller source context (supersedes all identity drafts)

sourceContext is a required top-level argument for source imports, emoji selection and conversion; it is also passed to acceptProposal and stored at metadata.sourceContext. Exact fields: {version:'arch-source-context/1',operation:'import'|'convert',id,revision,predecessor:null|{id,revision,rawHash}}. Initial/replacement import gets a controller-created new id/revision0. Conversion keeps the current id and increments current source revision by one; the predecessor records the exact old source. acceptedAtRevision remains the separate domain ticket.revision+1. Source owners never allocate these IDs.

The text wrapper binds the entire context into sourceConversion.approvalHash and checks candidate id/revision, top-level input context, metadata context and raw/pixel hashes at acceptance. SourceAPI expected tokens guard the current pre-commit source; target identity is the controller's context. No replacement-on-conversion rule remains. Tests call the actual aligned controller createSourceContext/sourceReceipt functions, including source3 -> source4 -> source5 on one ID, and initial import0.

Font restoration accepts the integrated controller's complete SourceResult.metadata at provenance.inputFonts[hash], whose .font property is the actual font record. Legacy direct FontCatalogEntry records are read compatibly. The original byte digest is verified again either way. No controller metadata rewriting is done here.
