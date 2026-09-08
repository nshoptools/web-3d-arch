# Frozen printer library hardening handoff

Run: 20260908-printer-library-hardening. This is implementation/self-testing, not a configured independent review. Caller Astra/max inherited; fast/service tier cannot be verified. No children, external providers, paid calls, main/toolchain/older-room writes.

## Delivery
18 manifest entries:
- Updated manager: src/app/printer-profiles.mjs.
- New bounded Vietnamese messages: src/app/profile-messages.mjs.
- Four focused existing-file deltas only: src/app/common.mjs, src/app/controller.mjs, src/app/projects.mjs, src/server/settings.mjs.
- Nine reusable test/fixture/runner files under tests/app and tests/server.
- Three docs under docs/printer-library.

reports/focused-hunks.json contains exact old/new fragments and pre/post SHA256 for the four existing hooks. Apply these fragments only after checking the preimage; do not replace unrelated main content. checked-file-manifest.json records every delivery byte hash and baseline hash (null for new files). FROZEN.json seals the manifest, hunk file, handoff, baseline inputs and retained test evidence. The run-local seal/verify tool reconstructs each focused postimage and checks unchanged copied dependencies.

src/app/sources.mjs is deliberately NOT a delta; its original printer-profile import hook already dispatches without requiring a project. Preimage and unchanged hash:
c60f9184f11d5865127a05c5d04651729c15f442d7980615378d69c71648a363.

## Results
Final current-source suite: 29 tests, 29 pass, 0 fail/cancel/skip/todo, exit 0.
Evidence: evidence/printer-library-a6c5b602bbf349ce961f3f38e3985677/node.tap and result.json.
Command from the repo, after project env for this run:
& <candidate>/tests/app/run-printer-profiles.ps1 -RunId 20260908-printer-library-hardening
The actual invoked script used PowerShell in the active shell; it resolves repository tooling and the candidate/main source root from its own path, requires RunId and uses repository Node v24.19.0 read-only.

Existing ACC-03 compatibility cases: 3 tests, 3 pass, exit 0.
Command: .toolchain/emsdk/node/24.19.0_64bit/node.exe --test --test-concurrency=1 --test-name-pattern=ACC-03 <candidate>/tests/server/accounts-settings.test.mjs
Evidence: evidence/settings-compatibility.log and settings-compatibility-result.json.
This existing suite invokes a local explicitly synthetic credential-check provider; no external AI provider or paid operation runs.

Preserved reproducer: 5/5 tests failed on the initial pinned sources (exit 1), evidence/printer-library-5497fa9ccb76498a8cd5cab5334de2e7. The five corresponding focused tests passed after fixes (exit 0), evidence/printer-library-f6526430f05240ddaaff196c53e229ef. These runs are not added to the final test count.
The 1 MiB exact-byte HTTP boundary and retained-original budget check also ran separately: 2 pass/exit 0, evidence/boundary-before.log. No timeout or quota was raised to make an existing failure disappear; this boundary case explicitly configures a separate 2,000,000-byte settings quota.

## What the tests establish
Real loopback backend HTTP, OIDC/PKCE and SQLite exercise settings CAS (one winner; conflict keeps both profile/source copies), account isolation, revocation, malformed/orphan/hash-incoherent original rejection, delete/replace retention, whole-settings import/export/restart, quota atomicity and the exact 1 MiB file boundary. Current AppBridge/controller hooks work without a project; any attempted project-store commit fails the test. Download and local project storage are named doubles; the signed lease verification during initialization is real. No project ExportReceipt is created.

Lifecycle tests cover exact settings object/ETag/revision, reused mutable context, A→B→A, late/superseded reads, confirmation replay, deletion without a prepared retry, preflight/state races, post-write identity changes, ignored download abort and awaited private reset. Invalid/future records stay inspectable, unambiguous valid imports remain gated, originals retain byte identity and unrelated settings survive. U1 slot/head mappings are explicitly 1-based; invalid arrays are not repaired. Vietnamese errors keep diagnostic codes and suppress arbitrary imported error bodies.

## Parent binding and remaining limits
UI-C11 command/type shapes remain unchanged. Update the Key row in docs/app/printer-profile-ui-decisions.md: keys now change per settings/account/reset capture, even with identical row bytes/index. UI must send the current opaque key and settingsRevision together. API-EARLY.md provides exact replacement wording and the optional preflight callback contract.

Backend validates original-byte integrity and linkage, not the full printer-adapter support schema. Unknown safe JSON records without originals remain durable and deletable; linked corrupt originals now block a write until explicitly repaired/deleted. No silent repair occurs. A hash never grants vendor-source provenance, slicer qualification or physical fit; qualified remains false.

No browser UI/OS-download/slicer/physical-print acceptance is claimed. Parent owns Opus UI and production browser composition. The ordinary cryptographically verified lease path is unchanged. Only routing of the existing authenticated-online preflight is unit tested here with an explicit policy double; prior online-policy/browser evidence is not re-claimed.

A write or download already accepted before an account change cannot be rolled back by a later guard. Late completion cannot publish into the next identity; uncertain outcomes require refreshing current settings. No API/contract blocker remains for integration.
