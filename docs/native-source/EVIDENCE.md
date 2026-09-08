# Implementation evidence — 2026-09-08

Role: Codex implementation/self-test; inherited Astra/max per assignment.
Fast mode was not verifiable. No independent-review or whole-product approval
claim is made. All writes/builds/caches/profiles stayed in the assigned own run.

## Actual results

| Command group | Actual result |
| --- | --- |
| Unified native C++/Rust build |exit0|
| Unified WASM C++/Rust/link |exit0|
| Root native library tests |17 passed, exit0|
| Dedicated native source/frame program |334 checks, exit0|
| Node same-Module source/frame/raster suites |3 passed, exit0|
| Chromium actual EngineClient + root Worker |passed, exit0|
| Firefox actual EngineClient + root Worker |passed, exit0|
| WebKit actual EngineClient + root Worker |passed, exit0|
| Existing SVG/G1 source regression suite |7 passed, exit0|
| Existing ready/printing-version proof regression |1 passed, exit0|
| Strict TypeScript binding check |exit0|
| Same-Module original-font text regeneration |exit0; exact combined source hash|
| Pinned Clipper record regeneration |exit0; exact recorded output hash|
| Portable private staging + staged Node suites |exit0;3 passed|

These numbers are test/check counts, not distinct supported product features.
The native334 include parameter and ownership checks, not334 independent meshes.

The final combined browser invocation used the initial persistent tab with
fallback and Firefox proxy0, with the existing30s navigation/120s test limits.
Observed durations were approximately14.0s Chromium,7.8s Firefox,9.1s WebKit.
Each engine used one actual root Module for source/frame/product operations.

## Failed attempts preserved

Earlier logs remain in the run's evidence and are hashed in its evidence index:
an incorrect installed-browser path; a harness mixing original/adopted Clipper
goldens; an incorrect exact SVG-area assumption; use of an unexported memory
resize helper; and Firefox startup/page-load failures. They were not counted
as passes. The memory-growth test now allocates/frees with the same Module's
actual allocator and verifies heap growth.

Firefox returned startup/load failures on earlier harness variants. Proxy
preferences, short profile paths and initial-tab selection are harness changes.
The final successful initial-tab/proxy0 run does not prove which host behavior
caused the previous failures. No root fix or timeout increase was attributed to
those startup observations.

The authored integer-grid fixture keeps an exact185mm² oracle. For its SVG form,
the retained0.00001mm² usvg interpretation difference is checked against the
pre-existing affine-fixture envelope, separate from exact cap/boundary equality.
No source asset or expected canonical geometry was changed to make a test pass.

## Artifact identity and coverage

Machine-readable evidence/results.json records module hashes, baseline failures,
native/Node/browser results and actual command records. Fixture provenance pins
the original font/license/recipes. Full raw logs and binary ARCH files remain
in the checked implementation run; its handoff manifest hashes them separately.

Covered: exact combined NFD/bent text failure, three known passing text variants,
holes/disconnected accents/shared seams/T-junction,8 discrete isometries,
negative absolute source placement, sealed complete raster dimensions, explicit
raster confirmation, source immutability, bad wire/hash/ID/generation/range,
raw tiny-region refusal, cancellation, bounded snapshot accounting, actual
memory growth, release/retirement/replacement and subsequent source assembly.

Not claimed: general source/manufacturing precision, repair of every curved
source, arbitrary affine mapping, full product assembly matrix, print/slicer
acceptance, or qualification of another worker's independent review. The raw
resolution guard and existing R3/float-conditioning authority remain in force.
