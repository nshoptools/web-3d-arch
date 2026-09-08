# Runtime integrity evidence, 2026-09-08

Status: replacement pair passed the full actual Worker run and the separate
portable snapshot run. This is Codex
implementation/self-testing, with inherited Astra/max and unverified fast mode.
It is not a configured independent review. Production fixes were made by the
parent; this delivery changes tests and documentation only.

## Exact completed production artifacts

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| Earlier wrapper, failing exact-byte integrity | 139164 | `527a28809227d7cd20788af1b599447b70241a2ec1f95cff591d92b8e36a90aa` |
| Replacement wrapper, owned-r2 | 139291 | `64c5f89e2ee8fecda371436f907faf83e9120c41e11089979bd011bc8a197ed2` |
| Both pairs' identical production WASM | 5788253 | `b67d421769ba188e5dc6328bf520ab683213239459da3c308d92411df458e949` |

The parent's owned-r2 build receipt uses `arch-kernel-build-receipt/1` and hashes
to `171daf4a7bcb16836970ace1634217ed8aeb6d986da4ad2ef0963abb1a991f42`.
It records the executed build exit 0 and its source/log/output pins, with actual
Worker tests explicitly pending at build time. The tests independently captured
the completed files and checked the two explicit artifact pins before hosting.

Relevant production snapshots:

| Revision | File | SHA-256 |
| --- | --- | --- |
| R1, rejected-envelope gap | `src/core/engine-client.mjs` | `3e0c00ca0802e30a08b4718d4f498acf98356b8f8d817ef452273328c3a04319` |
| R2, parent ABI/shared-heap/control bounds fix | `src/core/engine-client.mjs` | `2b0d4965f912cc5302f8a1ade5ebfa27e36ec7a34504287ed18a03ce7fc1973b` |
| R3, parent getter guard | `src/core/runtime-integrity.mjs` | `bfd366fd0b68e0936bcbd37753fe67d87382d881ccc711a33fe6aa0d4ebfd5ea` |

## Failures retained before fixes

The original 12 Node protocol tests reported 6 pass / 6 fail against the R1
client: valid integrity proof could accompany an absent/invalid root ABI,
missing/non-shared heap, unaligned control offset, or a range beyond the heap.
The same 12 tests passed unchanged after the parent R2 envelope guard. A further
boundary test now checks nonfinite/noninteger/negative offsets and valid exact
16-byte bounds with absent optional capabilities: all 13 pass.

The first actual three-engine run reached geometry but failed in the test's
digest helper because SubtleCrypto refuses a SharedArrayBuffer-backed view.
The helper was fixed to copy its input. Those three harness failures remain
recorded separately and are not presented as production failures.

The next full three-engine run, and a focused Chromium diagnostic, then showed
the production wrapper ignoring the owned `wasmBinary` option. The observer saw
`instantiateCount=0`, `streamingCount=1`; real build and source-frame calls had
succeeded before the strict byte-path check failed. This geometry success did
not qualify runtime integrity. Null getter/heap observations in that failed
trace mean that the streaming path was deliberately not accepted by the byte
observer, not that root ABI or geometry itself failed.

The pinned local Emscripten 6.0.9 `src/settings.js` defaults for
`INCOMING_MODULE_JS_API` omitted `wasmBinary`; `src/preamble.js` only receives it
when included. The parent changed the canonical build to read
`tools/kernel/module-incoming-api.json`, retaining its 26 default entries and
adding `wasmBinary`. The replacement generated wrapper reads the property.
The parent also added `RUNTIME_WASM_INPUT_IGNORED` before proof publication if the
factory never reads the property. No test transport workaround or weakened
expectation was applied.

## Current executed results

| Command scope | Result | Exit | Evidence in the run |
| --- | --- | ---: | --- |
| R1 controlled READY Node protocol | 6 pass / 6 fail | 1 | `evidence/ready-r1-node.log` |
| R2 same controlled READY Node protocol | 12 pass | 0 | `evidence/ready-r2-node.log` |
| R3 expanded READY Node protocol | 13 pass | 0 | `evidence/ready-r3-node.log` |
| Old pair, initial three Worker engines | 3 harness failures | 1 | `evidence/integrity-r1-workers.log`, `integrity-workers-r1/` |
| Old pair, strict three Worker engines | 3 exact-byte integrity failures | 1 | `evidence/integrity-r2-workers.log`, `integrity-workers-r2/` |
| Old pair, Chromium byte-path diagnostic | 1 exact-byte integrity failure | 1 | `evidence/integrity-r3-chromium-diagnostic.log` |
| Owned-r2, strict actual Worker engines | Chromium / Firefox / WebKit pass, 13 scenarios each | 0 | `evidence/integrity-owned-r2-workers.log`, `integrity-workers/owned-r2/` |
| Portable staged capture | 629 source/test files, 3379 existing dependency files, exact pair pins retained | 0 | `evidence/stage-portable-r3.log` |
| Portable staged Node protocol | 13 pass | 0 | `evidence/ready-portable-r3-node.log` |
| Portable staged actual Worker engines | Chromium / Firefox / WebKit pass, 13 scenarios each | 0 | `evidence/integrity-portable-r3-workers.log`, `integrity-workers/portable-r3/` |

The owned-r2 full run took 31.52 seconds in total; the portable run took 32.21
seconds. Browsers reported Chromium 153.0.8010.12, Firefox 155.0 and WebKit 26.6.
Each successful JSON record
includes browser version, input pins, exact observed instantiation bytes and
hash, actual ABI tuple, root heap identity, bounded geometry hashes/counts,
request log and lifecycle results. There are 3 engine tests with 13 scenarios
each, run twice against separate checked snapshots, not 78 independent product
acceptance campaigns. [verification.json](verification.json) retains the exact
pins, distilled observations and hashes of pass/failure evidence. The frozen
handoff manifest lists only new permanent tests/docs; copied production files,
private dependencies and built modules are inputs and never promotion entries.

These tests do not repeat or qualify the separate native 17/334 checks, general
geometry Worker suites, float conditioning, mesh topology/print fit, or product
source coverage. Their passes cannot substitute for the exact runtime integrity
checks. Permanent reproduction commands and trust boundaries are in
[README.md](README.md); no historical room is required to rerun the tests.
