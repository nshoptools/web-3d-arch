# Synthetic corpus, version 1

Source data is authored numeric pixels in ../support/fixtures.rs. These fixtures contain no external image artwork and use the project's unchanged ../../LICENSE. The codec authors' notices remain in ../../docs/licenses.

- synthetic-rgba.png: 3x2 straight RGBA8, explicit sRGB chunk, one transparent and one partial-alpha pixel.
- synthetic-rgba.webp: same 3x2 numeric RGBA, pinned image-webp VP8L lossless encoder.
- synthetic-rgb.jpg: 16x8 numeric RGB blocks, pinned image JPEG encoder, quality 100.
- synthetic-exif6.jpg: same RGB input/quality plus a synthetic TIFF IFD0 orientation=6 tag.
- synthetic-manifest.json: byte length, SHA-256 and recipe for those four binary fixtures.
- grid-2x1-golden.json: hand-derived labels, six corner vertices, seven unique edges and two region loops for two side-by-side unit squares. With a 20 mm long edge the seam is 10 mm.

Tests regenerate encoder output in memory and compare hashes. All eight EXIF orientation expectations and polygon areas/incidences are independent analytic expectations. Additional malformed/huge-header/metadata fixtures are mutated or encoded in memory by tests; no files are written during cargo test.

Fixture regeneration writes only to the explicitly supplied new-run fixture directory:

~~~powershell
# After dot-sourcing tools/development/env.ps1 for codex/20260908-raster-wave2
# and overriding CARGO_HOME/RUSTC/RUSTDOC as scripts/run-tests.ps1 does:
& $rasterCargo run --locked --manifest-path "$rasterCrate/Cargo.toml" --example generate_fixtures -- "$rasterCrate/tests/fixtures"
~~~

The generator is a test utility with explicit file output; the library itself performs no external I/O. Do not regenerate a fixture merely to hide a decoder/algorithm failure.



## Wave2 lossy VP8 supplement

The four v1 encoded fixtures and their golden/hash manifest remain unchanged. Wave2 adds synthetic-vp8-input.png (32x24 numerical RGB) and synthetic-lossy-vp8.webp (236-byte static VP8), with the independent source recipe in examples/generate_vp8_input.rs.

Use vp8-manifest.json for the official libwebp 1.6.0 cwebp archive, source archive, binary and fixture SHA-256, license/PATENTS provenance, and exact -q 70 -m 6 -noasm -metadata none command. Reproduce into a separate directory under the current run, then compare hashes; never overwrite a failing expected fixture. evidence/vp8-reproduction-result.json records an actual byte-identical regeneration.

The lossy fixture test checks its VP8 chunk, dimensions/opacity, preserved encoded/RGBA provenance and error relative to the original numerical input. The parity harness includes the same actual VP8 decode on native, Node, Chromium, Firefox and WebKit Workers.

