# Raster app synthetic fixtures v1

These are unchanged encoded fixtures copied from the raster-source corpus.
The image bytes contain authored numerical pixels, no third-party artwork.
Their license is [the raster-source MIT license](../../../src/kernel/raster-source/LICENSE).
Encoder licenses and pinned versions are documented in
[the permanent notices](../../../docs/raster-app/NOTICES.md).

| File | Input and oracle |
| --- | --- |
| synthetic-rgba.png | 3x2 straight RGBA8, explicit sRGB, transparent and partial-alpha pixels |
| synthetic-rgba.webp | Same 3x2 RGBA, pinned VP8L encoder |
| synthetic-rgb.jpg | 16x8 numeric RGB blocks, JPEG quality100 |
| synthetic-exif6.jpg | Same JPEG plus synthetic TIFF orientation6 |
| synthetic-vp8-input.png | 32x24 numerical RGB, input to the official lossy VP8 encoder |
| synthetic-lossy-vp8.webp | Static VP8, q70/m6/noasm/no metadata |
| grid-2x1-golden.json | Hand-derived grid reference retained from the Rust corpus |

synthetic-manifest.json and vp8-manifest.json retain the original corpus manifests.
Paths inside their recipes are relative to src/kernel/raster-source (the Rust crate).
The staging runner verifies byte length and SHA256 of all six encoded files before
executing the Module. It never regenerates an expected image or downloads an encoder.

The JS suite tests real decoding/source retention, EXIF6, geometry and transport.
It does not claim to rerun every Rust corpus test: all-eight-orientation, fuzz,
codec-regeneration and native Rust bounds coverage remain separate in
src/kernel/raster-source. The hand-derived 2x1 JSON is retained as source provenance;
current JS analytic areas use directly constructed hole/island/T-junction grids.

For deliberate regeneration, use the checked Rust examples generate_fixtures and
generate_vp8_input with an explicit output directory inside a newly authorized run.
For VP8 use the official pinned libwebp1.6.0 cwebp from vp8-manifest.json:

```text
cwebp -q 70 -m 6 -noasm -metadata none synthetic-vp8-input.png -o synthetic-lossy-vp8.webp
```

Keep generated output separate and compare hashes. Never overwrite expected bytes to
hide a decoder or geometry failure. Native/codec reproduction evidence from prior
implementation is historical; the current JS run reports only what it executes.
