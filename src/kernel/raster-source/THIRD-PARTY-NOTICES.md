# Dependency and fixture notices

The project code uses the repository's unchanged internal-use LICENSE (NshopTools, 2026). This does not replace dependency licenses.

docs/dependencies.json is the complete inventory of 49 registry packages locked for this candidate, including build and target-specific dependencies. Each downloaded .crate archive SHA-256 was compared against Cargo.lock. The inventory includes source URL, repository, VCS revision when present, license expression, and paths/SHA-256 of 105 original license/notice files copied byte-for-byte into docs/licenses.

Primary codec pins:

| Package | Version | Original archive SHA-256 |
| --- | --- | --- |
| image | 0.25.10 | 85ab80394333c02fe689eaf900ab500fbd0c2213da414687ebf995a65d5a6104 |
| png | 0.18.1 | 60769b8b31b2a9f263dae2776c37b1b28ae246943cf719eb6946a1db05128a61 |
| image-webp | 0.2.4 | 525e9ff3e1a4be2fbea1fdf0e98686a6d98b4d8f937e1bf7402245af1909e8c3 |
| zune-jpeg | 0.5.15 | 27bc9d5b815bc103f142aa054f561d9187d191692ec7c2d1e2b4737f8dbd7296 |
| zune-core | 0.5.3 | d56377fd46368984a170bc5aac5567e52ca5da874caa60bea39fcbca78fb658b |

Codec notices are MIT/Apache-2.0 alternatives (zune additionally offers Zlib); use the complete unmodified texts and license expressions in the inventory. Other dependencies have their own terms, including unicode-ident's Unicode-3.0 notice. No library was patched in the cache.

Synthetic PNG, VP8L WebP, JPEG and JPEG EXIF fixtures contain only numeric colors created for this implementation. They use the project LICENSE; no third-party artwork was imported. tests/support/fixtures.rs supplies encoder inputs and EXIF data; examples/generate_fixtures.rs supplies the reproducible writer; tests/fixtures/synthetic-manifest.json pins bytes and recipes. The grid-2x1 golden is hand-specified from two analytic unit squares, not generated from the boundary implementation.

Dependency archives, sources and formatter binaries are held in the new raster run's cache/inputs/work tooling folders, outside the copy candidate. Parent should retain Cargo.lock and all notices when copying checked candidate files. No global package installation or shared toolchain mutation was used.



Wave2 adds rstar 0.13.0 (MIT OR Apache-2.0), archive SHA-256 5912b862fa5ffb462607bfd1e35036c458c537921f508c8235a83d5f3987edfe. Its .crate omits workspace-root notices; the original LICENSE-MIT and LICENSE-APACHE were retrieved byte-exact from georust/rstar commit 82c969d4677a6f624900056e044d7e7ec8439c18, matching the package's .cargo_vcs_info.json. Their URLs/hashes are explicitly recorded in docs/dependencies.json.

The lossy VP8 fixture uses original numerical pixels and the official libwebp 1.6.0 Windows x64 cwebp encoder (-q 70 -m 6 -noasm -metadata none). The fixture and encoder/archive hashes are in tests/fixtures/vp8-manifest.json. Original COPYING, PATENTS and AUTHORS from the official libwebp-1.6.0 source release are in docs/licenses/libwebp-1.6.0-fixture-tool. These three files are additional to the 105 registry dependency notices. The encoder binary is tooling in the own run, not shipped in this crate. CGAL is referenced for topology criteria only; no CGAL code is copied or linked.

