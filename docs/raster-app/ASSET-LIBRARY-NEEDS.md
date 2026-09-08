# Remaining production asset-library inputs

This is a bounded read-only follow-up from
[source-catalog.mjs](../../src/integration/source-catalog.mjs) and
[source-contract.mjs](../../src/input/source-contract.mjs). No assets are generated,
downloaded or deployed by the raster test promotion. Counts below are catalog
metadata observations on 2026-09-08, not a fresh binary/coverage audit.

## Runtime catalog and deployment mapping

Provide one versioned arch-source-catalog/1 object with fonts, collections,
defaultFontId, defaultCollectionId, previews and optional labels. The original
[catalogs](../../src/assets/emoji/collections.json) reference separate font/emoji files;
they are provenance inputs, not that normalized runtime object by themselves.

Existing metadata has53 text fonts,1 monochrome font and8 color variants (62 unique
font IDs). Keep all selected original variants/axes, source SHA256 and individual
licenses. The largest recorded font is10,866,756bytes, below the current16,000,000byte
reader cap; that does not permit preloading everything into the4-font/64MB cache.

Each runtime collection needs explicit selection
{kind:'outline'|'COLRv1'|'CBDT/CBLC'|'svg',fontId?,svgIndex?}. Preserve original paint
graphs/fonts/SVG; do not turn a preferred preview path into a fallback geometry rule.
The defaults must resolve to available original entries.

Supply a deduplicated SHA-to-deployed-URL map:
{sha256,bytes,url,mediaType}. URLs must be absolute same-origin without credentials,
query, fragment or redirects. One unique record per digest/URL; bytes and hashes
must match real files. Catalog-relative file paths do not become deployment URLs
automatically. The host supplies its approved asset fetch, or retained project bytes.
Do not use unpinned CDN/font subsets to satisfy missing references.

## Complete, proven preview mappings

The color catalog has3944 items and9 components; every one records a preferred
original PNG. Those records still need actual file-length/hash verification and
origin-specific URL mapping before deployment. The matching original vectors/fonts
remain independent source assets.

The3789 monochrome item records contain no raster thumbnail entries. Supply complete
PNG thumbnails derived from the original monochrome font with source hash, variations,
renderer/version, parameters and output digest recorded. Existing five-item test
thumbnail examples are not a full production library. queryEmoji rejects missing
previews; color artwork, system glyphs or placeholders cannot stand in for monochrome.

Every displayed item/component needs its own preview mapping key
collectionId/itemId, even where several keys share one deduplicated image digest.
The catalog must retain disconnected accents, holes and shaping in derivation tests;
thumbnail availability is not manufacturing qualification.

## Search, aliases and non-Unicode artwork

Runtime collections should preserve the9 components and1272 recorded input aliases,
not just the default fully-qualified picker pages. The adapter indexes components
and aliases only when those arrays are supplied.

Vietnamese labels/keywords are optional in the contract, but need a versioned,
licensed source corpus if the production library promises Vietnamese semantic search.
Both inspected emoji catalogs currently declare English names. No translation dataset
is invented here; accent folding by itself is not Vietnamese translation.

[artwork-cat.json](../../src/assets/emoji/color/artwork-cat.json) retains4336 original
artwork records, including records outside standard Unicode emoji selection. Runtime
emoji items require an emoji token; do not insert artwork rows as fabricated emoji.
An explicit artwork-library route/contract or declared unavailable capability is
needed for those entries. That is a separate bounded follow-up.

Contract limits to preserve:256 fonts,16 collections,32768 item/component entries,
32768 preview mappings,65536 asset URL records and16384 label entries. These observations
identify required inputs; they do not claim that no private deployment mapping exists
elsewhere. Parent owns final selection, publication and whole-library acceptance.
