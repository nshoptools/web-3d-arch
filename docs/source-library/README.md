# Production source library

This package assembles the existing verified originals into the current
`arch-source-catalog/1` contract and a deduplicated deployment map. It replaces
test fixture data supplied to the application. It adds no codec, font fallback,
mesh conversion, UI, Worker transport, runtime allocator or WASM module.

The generated library contains 62 font entries: all 53 text variants across 30
families, the original variable mono emoji font, and all eight color font variants.
The two existing collections contain 7,733 picker items and 18 component entries.
All 1,272 input aliases are retained in each collection. An alias becomes a
selectable form only when its canonical item exists in that collection.

There are 7,751 explicit previews and Vietnamese labels. Color previews retain the
preferred original PNG bytes; all other original PNG sizes, SVGs and fonts remain
addressable. Mono previews cover 3,789 picker items plus nine natively verified
components, using 1,726 distinct PNGs. Repeated glyph designs legitimately share
bytes; every logical ID and shaping record remains separate.

The separate artwork catalog retains all 4,336 source SVG records, including 137
with no canonical emoji mapping. Their source names, feature flags, license and
hash remain available. They require a separate artwork source adapter; the library
does not invent emoji tokens or assert that their SVG features are manufacturing-ready.

| Permanent path | Purpose |
| --- | --- |
| `src/integration/source-library.mjs` / `.d.mts` | Pure validation and same-origin URL materialization; public types |
| `src/assets/source-library/catalog.json` | Full input for the existing source catalog and root text runtime |
| `src/assets/source-library/deployment.json` | One deployed resource per digest, including all original path aliases |
| `src/assets/source-library/artwork.json` | Retained artwork and source features, outside Unicode selection |
| `src/assets/source-library/mono-thumbnails.json` | Native shaping, outline and raster provenance |
| `src/assets/source-library/font-coverage.json` | Actual per-variant color glyph coverage, including unsupported tokens |
| `src/assets/source-library/derived/mono/` | Original-font-derived transparent PNGs |
| `src/assets/source-library/search/` | Exact pinned CLDR bytes, license, lock and derived labels |
| `src/assets/source-library/build-receipt.json` | Generator fingerprints, current input preimages and output hashes |
| `tools/assets/source-library/` | Offline builder, deployment copier, explicit CLDR sync, native tool lock |
| `tests/source-library/` | Current-main contract, native decode, reproduction and three-engine Worker tests |

Read [API](API.md), [commands](COMMANDS.md), [provenance and notices](PROVENANCE.md)
and [implementation evidence](EVIDENCE.md). Existing originals and their locks remain
in place; this package never substitutes a subset or converted font for them.
