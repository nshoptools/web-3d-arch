# Fixture and dependency provenance

Six encoded synthetic fixtures are in
[tests/raster-app/fixtures](../../tests/raster-app/fixtures/README.md).
Their byte lengths/SHA256 and original recipes are pinned in synthetic-manifest.json
and vp8-manifest.json. They contain authored numerical pixels and no third-party artwork.
The source corpus license is [arch-raster-source LICENSE](../../src/kernel/raster-source/LICENSE).

Decoder/encoder code is not implemented or vendored by this JS test promotion.
The existing Rust crate pins image0.25.10, png0.18.1 and image-webp0.2.4 in its checked
Cargo files. Read its [third-party notices](../../src/kernel/raster-source/THIRD-PARTY-NOTICES.md)
and [original license directory](../../src/kernel/raster-source/docs/licenses).
The tested root binary contains the decoder implementation; staging records its hash.

The lossy VP8 fixture was created with official libwebp1.6.0/libsharpyuv0.4.2 cwebp:
-q70 -m6 -noasm -metadata none. The manifest retains exact binary/archive/source SHA256.
Primary source: [official WebP downloads](https://developers.google.com/speed/webp/download).
Original [COPYING](../../src/kernel/raster-source/docs/licenses/libwebp-1.6.0-fixture-tool/COPYING),
[PATENTS](../../src/kernel/raster-source/docs/licenses/libwebp-1.6.0-fixture-tool/PATENTS)
and [AUTHORS](../../src/kernel/raster-source/docs/licenses/libwebp-1.6.0-fixture-tool/AUTHORS)
remain in the permanent Rust crate. No encoder is downloaded by these tests.

Reproduction requires the existing pinned Rust fixture example or official encoder
and a new explicitly authorized output directory. Do not overwrite the checked
corpus or replace expected bytes after a failure. This suite verifies hashes and
actual decode; codec regeneration/native Rust qualification is a separate command.

Playwright/Node and the selected Module are pre-existing in-repository tooling.
They are not distributed through tests/raster-app or docs/raster-app, and no dependency
is installed globally. Preserve repository notices when distributing the application.
