# ADR 001: text and selected emoji preparation

Accepted for this implementation candidate, 2026-09-08. Scope is source preparation; the host owns source selection, confirmation, persistence, history, materials and final geometry.

## Text layout

The adapter uses the parent's injected HarfBuzz font source. It does not initialize WASM. Hashes are checked against the actual owned bytes before the reader is called. The reference implementation is used only by tests. Both shaping and outline extraction receive the same explicit variation coordinates. A cache retains at most four verified font readers without eviction.

The original string stays unchanged. Extended grapheme segmentation uses the runtime's Intl.Segmenter; normalization is NFC per grapheme. CRLF, CR, U+2028 and U+2029 become LF in the derivative. A map connects canonical UTF-16 ranges to original UTF-16 ranges. HarfBuzz cluster ranges belong to canonical text. Variation selectors, ZWJ, modifiers and regional indicators are never stripped. A selector may produce an empty zero-advance glyph: it stays in the layout records.

The default is one horizontal Latin/common/inherited run per line, language vi, LTR. Explicit script/direction runs plus a visual-order permutation support host itemization, including multiple explicitly selected fonts. No automatic font fallback, bidi engine, line wrapping or tab policy is invented. Mixed scripts require host itemization; tabs and bidi controls fail explicitly.

Size denotes em size, not ink height. One point is 25.4/72 mm. The shared path coordinates and glyph matrices use mm, Y up. HarfBuzz x/y already include xOffset/yOffset. The translation uses x/y once; offsets remain separate provenance. Every closed M/L/Q/C/Z contour survives, with nonzero winding. The adapter neither joins accents nor removes holes, overlaps or tiny contours.

The first baseline is y=0. Baseline spacing is emMm × lineSpacing, default 1.2. Tracking is an added distance between adjacent shaped clusters in visual order, never inside a cluster or after the last cluster. Ligatures remain shaped ligatures. Alignment uses each line's advance including tracking. Negative tracking is permitted within the declared limit; this can overlap or reverse adjacent placement.

Bend is rigid rotation/translation of each shaped cluster, preserving base/mark relationships and curve shape. Let L be the largest positive line advance, k=bendRadians/L and a the cluster center on the aligned, tracked baseline. Its baseline point is (sin(k a)/k, (1-cos(k a))/k) and tangent angle k a. Zero bend uses direct straight-line arithmetic. Other lines add their baseline Y offset. Bend range is [-180,180] degrees; nonzero bend with no positive advance is rejected. Finally apply the user's placement rotation about (0,0), followed by translation.

This is an explicit circular layout rule, not nonlinear glyph deformation or a promise of uniform spacing on every contour. Bounds are conservative transformed control hulls, not exact ink bounds or a certified manufacturing error bound.

## SVG bridge

Numeric-only generated SVG preserves Bézier commands and nonzero fills; it never interpolates the user's text as markup. Empty spacing/selector glyphs remain in layout but are not emitted as empty paint nodes. The optional SVG bridge obeys the existing parser's 1 MiB/16,384 source-segment limits. If it exceeds those lower limits, the real shared curves remain available and svgExport reports resource-limit. Blank text has no ink and svg=null.

SVG's Y-down viewport is a derivative view of the canonical Y-up geometry. svgExport.parserViewportToSourceMm restores canonical coordinates after the parent parser has normalized the viewport into mm. The host must apply that mapping exactly once, or consume the already placed shared curves directly. A published mesh has its own orientation/winding contract, owned by the kernel/controller.

Selected original SVG bytes remain unchanged. sourceToMm maps the original viewBox user coordinates into mm, bottom left at the baseline before placement; selected size is the viewBox height in mm. Existing width/height, gradient, clip, group, mask, image and other source features remain in the original encoding and catalog feature record. This adapter does not sanitize, execute or reinterpret SVG. Send it to the existing validated SVG parser. A parser may require confirmed appearance conversion; original SVG and COLRv1 are distinct artworks and cannot silently substitute for one another.

## Color emoji

The host explicitly selects a collection and one source: monochrome outline, original SVG, COLRv1, or CBDT/CBLC. Membership and font/art hashes must match that selected catalog. Exact aliases resolve to catalog items; components are available only if provided in that collection. Missing tokens, glyph mismatches and unavailable variants fail. No system font, monochrome, PNG or placeholder replaces a selected color source.

COLRv1 retains the complete balanced HarfBuzz paint operation stream, including clip outlines/rectangles, transforms, color stops (including ties), PAD/REPEAT/REFLECT, linear/radial/sweep gradients, foreground color and compositing groups. The original font bytes also remain available; this preserves the encoded graph, including structure normalized by the HarfBuzz traversal. The adapter validates all 28 HarfBuzz blend enums but does not implement a paint compositor.

Real COLRv1 preview uses the established browser color-font renderer with FontFace constructed from the exact verified bytes. The native renderer shapes one selected canonical token; it applies its own offsets once. It renders at integer units-per-em font size and uses a canvas transform to reach the selected pixel scale, avoiding Firefox's fractional font-size advance quantization. Measured advance must agree with the verified HarfBuzz run within max(0.05 px, 0.01%). This is a mismatch guard, not an equivalence proof for every paint graph.

CanvasGradient replay was rejected: Canvas gradient alpha/color interpolation is not the COLR contract. Original font rendering leaves clip, gradient and group evaluation with the qualified font renderer. The default Noto COLRv1 source works in the tested Chromium and Firefox Workers. WebKit 26.6 on this Windows toolchain has no Worker OffscreenCanvas and returns renderer-gap with the full source still present. The host may explicitly install the separately bounded main-thread bridge in MAIN-CANVAS-BRIDGE.md; it renders real Noto COLRv1/CBDT in all three qualified engines without changing the Worker capability result. Nonzero palette selection and variable color fonts require another qualified injected renderer. An unsupported reader callback fails atomically, never as a partial paint graph.

CBDT keeps the original embedded PNG, its separate pngSha256, original font hash, decoded dimensions and HarfBuzz bearings/extents. Native createImageBitmap decodes that PNG, and canvas draws it into the corresponding Y-up source box. No invented outline or upscaled source provenance is supplied.

Preview resolution is explicit (default 256×256, maximum 1280 per edge in the Worker renderer, 512 in the explicit main-thread bridge). It uses isotropic scaling and two pixels of padding. Pixel coordinates are edge coordinates with Y down; pixelToSourceMm maps them into canonical mm, including placement. Native antialiasing and bitmap resampling produce straight sRGB RGBA8 through premultiplied canvas readback. This rounds alpha/color and samples curves/gradients. Transparent pixels remain transparent; no background color is inserted. A source can intentionally be gray, such as Noto's family symbol.

Deterministic means repeatable for the same qualified browser engine/version, host rendering stack, source, foreground, placement and resolution. Cross-browser raster hashes are not claimed equal. The artifact records the renderer identity and actual RGBA SHA-256. Synthetic linear/radial/sweep, clip, translated group, reflect, alpha and tied-stop fonts test native rendering. Native behavior beyond this qualified set is not certified.

## Confirmation and geometry boundary

A preview is a proposed derivative. It is not a material segmentation or manufacturing approval. The returned conversion describes source hashes, resolution, transform, renderer, losses and unchanged colors. The host reviews that exact proposal and passes its proposalHash with the current source/revision to confirm. Only then does the adapter return rasterInput for the parent's Boole segmentation route. Color reduction is not applied here; palette count, alpha treatment, background, island thresholds and any simplification require the separate host proposal and confirmation.

Cancellation, stale revision, work failure or superseded proposals publish no accepted conversion. One instance admits one preparation, then at most one pending proposal. Confirmation returns an isolated copy and consumes that pending proposal; it writes no project state. Original source bytes are independently retained by the host. Both preview and confirmed output keep sourceBoundVerified, fitVerified and meshVerified false.

No parser, curve flattener, boolean, triangulator, tessellator, extrusion, mesh JSON, network client, filesystem API or UI is implemented here.

## Primary references

- Project input contract: docs/assets/INPUT-CONTRACT.md; official specs SRC-02, SRC-04, VEC-01 and acceptance 04.
- [OpenType COLR](https://learn.microsoft.com/en-us/typography/opentype/spec/colr) and [CPAL interpolation](https://learn.microsoft.com/en-us/typography/opentype/spec/cpal#interpolation-of-colors) define paint/color semantics.
- [HTML Canvas](https://html.spec.whatwg.org/multipage/canvas.html) defines native canvas gradients, rendering and pixel readback.
- Local harfbuzz-engine.mjs and font-source-core.mjs define the injected ABI2 reader; their checked hashes are in the handoff manifest.
