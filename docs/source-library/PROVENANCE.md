# Original sources, derivatives and notices

All 19,819 original files in the two current asset locks were hashed and checked
against their byte lengths before and after the builder ran. The lock files,
catalogs, source contracts and every original input hash are listed in
`src/assets/source-library/build-receipt.json`. No original font/image/catalog is
rewritten by this package.

Text and mono font provenance remains the current original Google Fonts commit
`5e35378e6bda803962ee6fd257e444a7d459660d`; color Noto originals remain the current
color lock commit `8998f5dd683424a73e2314a8c1f1e359c19e8742`. These are consumed
from the repository locks, not fetched from unpinned URLs during a build.
Font records preserve full source metadata, all axes/defaults and each source
license. Color artwork retains its existing per-source license paths; other
retained upstream notices and regional artwork source-link files remain deployed.

Mono derivatives use the original `src/assets/emoji/ttf/NotoEmoji.ttf`, its original
OFL notice at `src/assets/emoji/licenses/notoemoji/OFL.txt`, and wght 400. The output
is separate transparent PNG imagery, not a renamed/subset/instantiated font file.
Each record retains the original font hash, glyph ID, shaping positions/codepoint
clusters, outline hash, SVG hash, PNG hash and decoded RGBA hash.

The versioned recipe is `native-hb-resvg-mono/1`: native HarfBuzz shaping with
LTR / Zyyy / und; original font units; native draw-glyph curves; nonzero fill;
conservative control-hull bounds; isotropic fit into 120×120 pixels centered in a
128×128 image; Y inversion from font coordinates; black ink on transparent RGBA.
resvg receives only these generated numeric paths, no user SVG, text, external
resources or system fonts. Bounds enforce ≤16 shaped glyphs per token, ≤100,000
path commands, finite coordinates ≤10,000,000 font units and nonempty ink inside
the padding. This is a source-font preview recipe, not a mm/printing error budget.

Vietnamese annotations use the official Unicode CLDR JSON release **48.2.0**,
exact commit `bb334e8d6250c9363e957e131bf7e6d08ec72f91`. The official
[CLDR 48 release table](https://cldr.unicode.org/downloads/cldr-48) identifies this
version and its JSON tag. This is an intentional fixed version, not a claim that
it is the newest CLDR release. The tag was resolved through the official repository
API, and the three raw files were downloaded/refetched at that exact commit.
Normal regeneration is offline.

| Retained source | Bytes | SHA-256 |
| --- | ---: | --- |
| `search/upstream/vi.json` | 434393 | `a0a8d4c3d6fc52d843e0d69051fb025a27bce6aee2b3eade5a1488b6dd9adffd` |
| `search/upstream/derived-vi.json` | 757001 | `2af5588927fb68bb01aedd28aa2947aa77d31374a53bd008844d426b6ba2f062` |
| `search/upstream/LICENSE` | 2033 | `220ba0e1c43b99530d2d5bdb892a99dca0989414f51ab695ecd90163eaa1ec3b` |

Exact raw URLs and source paths are in `search/cldr-lock.json`; the
[pinned repository tree](https://github.com/unicode-org/cldr-json/tree/bb334e8d6250c9363e957e131bf7e6d08ec72f91)
contains the originals. The retained notice is Unicode License V3
(SPDX `Unicode-3.0`), including the original copyright attribution.
The library retains the entire two input annotation JSON files, not handwritten
fixture labels. Coverage is measured only for this catalog's 7,751 entries.
Every derived label records the exact CLDR key/source file; keywords remain
original strings. Missing future labels will be reported instead of fabricated.

The native tools were already present in the repository and used read-only:

| Package | Version | Retained license / source |
| --- | --- | --- |
| uharfbuzz / bundled HarfBuzz | 0.56.1 / 14.4.0 | Original wheel LICENSE in `tools/assets/source-library/licenses/uharfbuzz/`; [official binding](https://github.com/harfbuzz/uharfbuzz) |
| resvg-py | 0.5.0 | Original wheel LICENSE in `licenses/resvg-py/`; [official wrapper](https://github.com/baseplate-admin/resvg-py), [renderer](https://github.com/linebender/resvg) |
| Pillow | 12.3.0 | Original complete wheel LICENSE in `licenses/pillow/`; [official project](https://github.com/python-pillow/Pillow) |
| FontTools, test oracle only | 4.64.0 | Existing `fonttools-4.64.0.dist-info/licenses/{LICENSE,LICENSE.external}`; [official project](https://github.com/fonttools/fonttools) |

All installed files of the three build dependencies, including native binaries,
wheel metadata, licenses and available SBOMs, are hashed in
`tools/assets/source-library/toolchain-lock.json`. Bytecode caches are excluded.
The builder checks that complete fingerprint before rendering. The lock is an
observed installed Windows toolchain fingerprint; it does not assert that a
different OS wheel produces the same PNG bytes. FontTools version and raster
comparison results are recorded by the native test. Repository requirements
already pin all four packages. No additional package, global install, system font,
second WASM or external service is required by the delivered production library.
