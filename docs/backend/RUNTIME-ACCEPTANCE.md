# Runtime acceptance mapping and evidence boundary

This is implementation self-testing, not independent review or deployment qualification. No new review seat/child was created and the previously blocked review was not retried. User requested inherited current Codex/Astra max; this interface does not independently attest runtime model/effort and exposes no fast/service-tier confirmation. Those limitations are recorded in the checked manifest/test summary.

The final full suite includes the original112 B03/B05/backend tests plus24 B11 tests. Only the completed reports/test-summary.json and evidence/backend-final.tap determine the final outcome; this document maps the cases, not an advance assertion of pass.

| Requirement | Evidence |
| --- | --- |
| Foreground-only scheduler, exact bounded configuration, no cron/AI retry | runtime-maintenance.test.mjs: strict finite config; constructor installs no timer; duplicate start; monotonic cadence and stop |
| Finite per-turn/pass work; concurrent incoming jobs | Fixed rowid ceilings with one-row batches while a new job is inserted after every batch; pass finishes and new job data remains; large stored-blob deletion stays below byte budget |
| Existing90-day retention and B03 original/reference lifecycle | Real PNG original/hash/thumbnail metadata, expired blobs removed once with incremented revision, retained second-user bytes/hash identical, old artifact children pruned over batches, terminal identity preserved in replay tombstone |
| B05 original periods/unknowns/bounds/receipts | Old pending job plus bounded terminal and missing accounting obligation; hashes of complete job/obligation/evidence/application/tombstone/deletion tables unchanged; no usable key/source invented |
| Restart accounting | Only orphan active deliveries transition; submitted -> unknown/pending, never sent -> failed/none, live delivery remains running; original UTC day/cap unchanged |
| Holds/stale work | Durable restore hold changes no recovery generation; malformed checkpoint refuses replacement; backward clock no writes; forward step remains latched until restart |
| Atomic failure and legitimate database writer | Real second SQLite BEGIN IMMEDIATE returns DATABASE_WRITER_BUSY without five-second busy wait and restores prior timeout; triggered delete failure rolls back rows/checkpoint and logs no private error |
| runOnce/close race | Concurrent runOnce returns the same Promise; stop at a yield prevents further batches; backend close waits and post-close calls cannot write |
| Fully received output decoding during shutdown | Real B03 worker codec launched before a test-controlled continuation gate. Logout and close occur during the settlement stage. Above-quote actual125 vs60 succeeds to captured owner/session/project/source hash/original UTC periods. Known settlement is not overwritten with unknown |
| Deadline/failure transparency | Grace100ms rejects SHUTDOWN_DRAIN_TIMEOUT while DB/pending bound remain; release permits captured actual40 to settle before actual DB closure. Real codec1ms timeout gives explicit unknown/pending with no artifact/retry. Forced settlement SQL failure rolls back actual/artifact and returns shutdown failure with the original unresolved bound |
| Uncaptured transport | Stop before result receipt produces unknown/pending; late result cannot access closed SQLite; provider call count remains1 |
| Public health | Only operations state/reason, no user/session IDs, counters or operator timestamps; degraded503 while ordinary authenticated policy remains enforced |
| CLI/startup/operators | Actual foreground CLI and local HTTP; writer.lock excludes maintenance/status/recovery-plan/check/apply/backup/config with identical main DB/WAL bytes while cadence is disabled; graceful signal drains/releases lock. validate-config checks actual ciphertext/key version without DB mutation/network; missing vault version fails; maintenance creates no key file and restore hold is nonzero/read-only |
| Backup/restore/rollback boundary | Actual sealed SQLite backup hash equals recorded hash and remains identical after restore. Retained image bytes hash unchanged; sessions revoked/reference submit expiry0; scheduler cannot mutate held restored database. Existing schema5 B03 backup/restore/recovery regression cases remain included |
| Host/release boundary | Existing host tools/config/manifest docs were inspected and frozen as context, reused without changes. No frontend build/deployment/browser acceptance is claimed in this run |

Run from either candidate or integrated main with the same portable runner:

~~~powershell
# From repository root; PackageRoot is the candidate or integrated repository.
. ./tools/project-env.ps1 -Seat codex -RunId $RunId
& (Join-Path $PackageRoot 'tests/server/run.ps1') -Seat codex -RunId $RunId
~~~

The unchanged app/common + storage/common support bytes are pinned from B03 in this run inputs. Candidate tests resolve those inputs relative to the candidate, not the output RunId; integrated tests resolve the actual main modules. The runner hashes those transitive helpers too. The runner and each writing CLI child use the caller's explicit RunId, keeps SQLite/fixtures/logs there, hashes executed server CJS/ESM + remote baseline/tests before/after and checks syntax. Child Windows PowerShell processes use windowsHide; network fixtures bind127.0.0.1 with explicit/OS-assigned ports. No browser was launched for B11. Node24.19.0 on this Windows host is the tested platform; Linux signal/filesystem behavior remains untested.

Synthetic ownership, invoice facts, keys/ciphertexts and TLS/IdP names in fixtures are test data. The shutdown gate delays a genuine worker decoder result; it is not production timing/load measurement. Large zero-filled database blobs exercise maintenance byte budgets only and are not claimed as codec-accepted images. Existing B03 fixtures separately test genuine malformed/oversize/decoded limits.

Physical I/O/fsync/SQL foreign-key work is not preemptible by these timers; batch budgets do not prove wall-clock RPO/RTO. External backup/log retention, protected key recovery, real Windows ACL, clock correctness across restart, host TLS/IdP/provider permission/invoice truth, actual build/browser composition and full-product acceptance remain operator/parent work.

Retained iteration evidence: runtime-maintenance-attempt1.tap had11/13 (fixture omitted B05 check step and asserted removal of a recent bootstrap audit). Both fixture expectations were corrected. runtime-focused-attempt2.tap19/19, runtime-cli-attempt1.tap4/4, runtime-shutdown-attempt3.tap7/7 preceded the final full run; later code/summary in the final manifest determines the delivered generation.

The first full attempt is retained as evidence/backend-attempt1.tap and reports/backend-attempt1.json:128/130, syntax/code stability true. Its two failures were the omitted frozen common/helper dependency (one module failure replaced seven tests) and the old B05 live-lock fixture observing the newly enabled scheduler checkpoint writes. The latter now explicitly disables cadence while preserving all exact ledger-hash assertions. Production implementation did not change for these harness fixes. The final runner includes both helper hashes; the full136-case generation is rerun after the targeted fixes.

Final clean generation:136/136 passed,0 failed/cancelled/skipped/todo, syntaxPassed=true and codeStableDuringRun=true, Node v24.19.0. The unmodified production code was rerun with the corrected portable harness and both transitive helper hashes. The original failing evidence remains intact. Runtime template JSON matches the production defaults and its PowerShell binder parses without being executed (evidence/runtime-template-check.json).
