# Implementation evidence — 2026-09-08

This is implementation and self-test evidence, not an independent review. The task
inherited Astra/max as authorized; the tool cannot verify fast mode. No other
agent/seat/CLI was launched. All writes, copies, profiles and test outputs were
restricted to the assigned run. Main and shared toolchain were read-only inputs.

| Check | Actual result |
| --- | --- |
| Offline build against both current original locks | Exit 0; 19,819 original file hashes/lengths verified before and after |
| Permanent Node tests against staged current main contracts | 17/17 pass, exit 0 |
| Strict TypeScript public API tests | Exit 0 |
| Full deployment, verified digest/byte copying | Exit 0; 21,391 unique assets and four config files |
| Chromium 153.0.8010.12 module Worker + native image decoder | 21/21 pass, exit 0 |
| Firefox 155.0 module Worker + native image decoder | 21/21 pass, exit 0 |
| WebKit 26.6 module Worker + native image decoder | 21/21 pass, exit 0 |
| Native PNG decode/ink/dimensions | Exit 0; 16,913 unique PNGs, covering all 15,312 original color files and 3,798 logical mono previews |
| Independent FontTools outline parser sample | 37/37 RGBA hashes exactly match HarfBuzz-derived previews |
| Offline reproduction with fresh output | Exit 0; all 1,737 generated files / 55,115,291 bytes identical |
| Explicit pinned CLDR network refetch | Exit 0; three original files, exact byte counts and hashes |
| Existing fonts / opentype / color verification | Exit 0 for each |
| Existing artwork renderer audit | Exit 0; 4,336 SVG rendered, 15,312 PNG decoded, zero blank images |
| Existing input audit / readiness | Exit 1; durable report contains an older main source module hash |

Node coverage includes all variants/axes/licenses, canonical items, aliases and
components, full pagination, every locked source mapping, original color sizes,
per-font support, mono provenance, exact CLDR rows, Vietnamese search, separate
artwork, digest deduplication, owned metadata, retained-byte integrity, cancellation,
unsafe paths/URLs/media/sizes/counts, and deployment refusal without a ready marker
when a source is corrupted. Test staging records exact current main bytes and
declaration dependencies. No test fixture replaces the production catalog.

Browser Workers load that complete catalog and same-origin deployment, read/hash
original Inter, mono and COLRv1 font bytes, read/hash both color and mono previews
including component and flag tokens, verify search/full paging/cancellation/path
rejection, then transfer PNG bytes for actual browser image decoding. No WASM was
requested by this harness. These results do not claim root shaping/build/product
geometry coverage; those remain the existing parent's runtime suites.

Native tests fully decode all PNGs and compare dimensions, nonempty alpha and mono
RGBA proofs. Source `third_party/region-flags/png/US-KS.png` is valid 5400×3240
(17,496,000 pixels), so the offline audit uses an explicit 20,000,000-pixel cap. It
is retained as original artwork, not silently made a small picker preview. Runtime
raster limits are unchanged. The independent outline oracle permits a one-pixel
antialias boundary band and ≤1% alpha-mass difference by design; the measured 37
samples had zero difference. Contact-sheet inspection also found real source ink,
holes and components. This is not an exhaustive independent shape oracle or a
manufacturing-precision assertion.

The existing input check completed its font/native/Vietnamese/color numerical
checks, then compared main `font-source.mjs` hash
`455c6c227fb7ab5ae3610e1c89b7dce06190963a5091ac122574f37a2b1d5609` with durable
`3ee7992d9049e22b028df8b473e820db86f822bde8c8e66b4a5f97b0ea2f4e59`.
Readiness rejects the same stale report. This sidecar does not overwrite parent
audit reports or label the aggregate command passing. The parent should refresh
those durable reports after its runtime integration freezes.

Further limits: source query rows retain the existing `unverified` manufacturing
verdict; color original PNG is not assumed pixel-identical to every color font
format; three partial color fonts explicitly report unavailable tokens; 155 Unicode
17 canonical items absent from the verified mono picker are not invented. Nine
mono components are additional natively verified component entries, not a claim
that the original mono picker contained them. Artwork retains 2,066 gradient, 484
clip, two raster-image and three foreignObject flags and requires a separate adapter.
Reproduction is proved on the exact installed Windows binaries, not across OSes.
The deployment is large and should be served as immutable assets; publication,
compression/cache headers, source selection and product confirmation remain host work.

Commands use only permanent paths; see COMMANDS.md. The sidecar handoff manifest
contains exact candidate hashes and target preimage states. Its run evidence
contains logs, current-main staging preimages, native proof/contact sheet, deployment
ready receipt and reproduction digest. Nothing here certifies physical prints or
replaces an independent review.
