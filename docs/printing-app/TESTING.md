# Printing binding tests

This is implementation evidence, not a configured independent review. The
inherited requested Codex setting is Astra/max; actual model, effort and fast
setting were not independently attested by an exposed control. No child or other
review seat was started, and no earlier review block was retried.

## Portable command

Run from the repository after promotion, or use the candidate runner path before
promotion. All generated dependencies, modules, browser bundles, profiles, logs
and artifacts stay in the chosen run. Existing tools under .toolchain are
read-only; preparation performs no downloads or installs.

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId <fresh-printing-run>
& ./tests/printing-app/run.ps1 -RunId <fresh-printing-run> -Label printing -ModulePath <explicit-repo-path>/arch-kernel.mjs -ModuleSha256 <exact-mjs-sha256> -WasmSha256 <exact-wasm-sha256>
~~~

Before promotion substitute the candidate tests/printing-app/run.ps1 path. The
runner locates the repository without a drive constant. The sibling .wasm is
required; missing or different bytes fail preparation. A run cannot silently
replace its pinned module/dependencies. A new label is required for new evidence.

The checked pair used in this candidate is:
- mjs: 65c5bfc89adcd0a8d34c4d47743c6cc05167688f6ecfe4179772a2d1f4029c62
- wasm: f13bdd2b5b778ac0f2ec70fb2d43052de68e7d415d03218bea6f0a09718e40a9

The portable runner pins Node 24.19.0, Playwright 1.63.0, Rolldown 1.2.7 and
TypeScript 7.0.2. It reads installed fflate 0.8.3 (MIT) and @xmldom/xmldom 0.9.12
(MIT), copies their 32 files including licenses into the own run, and records
per-file SHA-256. It reads exact version package manifests for test tools.
Python 3.13.15 stdlib zipfile/ElementTree/struct supplied the separate reader;
no new Python dependency. No production dependency was added.

Playwright uses pinned Chromium 153.0.8010.12 (1243), Firefox 155.0 (1543), WebKit
26.6 (2359), sequentially with one browser active. The harness only serves a
checked in-memory file allowlist on an OS-assigned 127.0.0.1 port, with COI/CSP
and no-store. It also blocks external/unknown browser requests. This is loopback
HTTP, not production HTTPS/auth/deployment testing.

## Meaningful coverage

| Tests | Scope |
| --- | --- |
| adapters.test.mjs, 22 | Real sealed profile validators/settings schema; current domain schedule/hash; explicit full-ID/slot/head/material join; aliases and collisions; bad versions/bytes/nozzles/rights; runtime proof; source immutability; resource/data boundaries; cancel/reset/concurrency/user ABA/current-input changes. |
| remote.test.mjs, 3 | Actual RemoteServices mapping and actual server settings validator; update/import/reset; latest document and user A/B/A; imported qualification claims ignored. API transport is a controlled in-memory fixture, not a live backend/account. |
| runtime.test.mjs, 5 | Actual exact unified Module, actual native ARCH source and printing/final-export services through frozen Ohm binding; Bambu and U1 project bytes; neutral STL; unchanged primary bytes; stale/logout/cancel late output with no resend. Node transport is a named direct test implementation. |
| browser.test.mjs, 3 | Actual existing EngineClient and engine-worker RPC with one root runtime per browser; two real target exports, independent STL fallback, stale-before-send, cancellation/reset and retained primary lease. All three pinned engines. |
| types.mts | Type compatibility with actual AppAdapters.printing and Ohm PrintingProvider interfaces. |
| readback.py | Separately implemented Python ZIP/XML/binary-STL reader of 12 real output files; one in-memory wrong-unit negative control. |

The authored analytic source is two adjoining 10x10x2 mm boxes with explicit red
and blue material identities. The actual native builder produces ARCH geometry.
Final-scene authority metadata is explicitly a synthetic upstream fixture, with
meshVerdict unverified. It is not a substitute for Huygens' product oracle and
does not qualify a final product.

The separate reader checks bounded archive entries/inflated sizes, CRCs,
Core XML/unit/references/identity transforms, explicit material aliases and slots,
0.25/0.20 mm schedule, indexed finite nondegenerate surfaces with consistent
edge winding, analytic volume 400 mm3 and bounds [0,0,0]-[20,10,2]. Material-part
surface area is 560 mm2; neutral union STL is 520 mm2. This is an independent
reader for this authored fixture, not a general mesh oracle, XSD qualification,
slicer round-trip, physical fit or an independent review seat.

## Evidence and original failures

The final runner writes reports/<label>-summary.json and
reports/<label>-test-inputs.json, evidence/<label>.tap,
evidence/<label>-types.log and evidence/<label>-readback.json. It requires all
33 tests, no skips/cancellations/todos, type/syntax success, 12 reader outputs plus
the negative control, and unchanged code/input hashes during the run.

Earlier evidence remains:
- unit-attempt1.tap: 22/22.
- runtime-attempt1.tap: 4/5. The fixture deliberately had an unverified mesh, so
  Ohm correctly returned MESH_INSPECTION_REQUIRED before PRINTING_INSPECTION_REQUIRED.
  The test expected the later gate. Only its expected result was corrected.
  The original failed TAP and received output files remain.
- runtime-attempt2.tap: 5/5 after that expectation correction.
- browser-attempt1.tap: 3/3 actual parent RPC.
- remote-attempt1.tap: 3/3.
- readback-attempt1.json: 12 files plus one negative control passed.

Initial type checking also exposed TypeScript 7's required --ignoreConfig and
the existing AppAdapters mutable Capability[] declaration. The command and
declaration were corrected; those diagnostics were tool output, not saved TAP
files. No product behavior was changed to hide the runtime failure.

See the final run summary and checked manifest for measured counts, byte hashes
and candidate stability. Do not infer a pass merely from this test plan.
