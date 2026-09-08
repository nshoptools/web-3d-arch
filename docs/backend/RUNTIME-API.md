# B-11 runtime operations contract

Implementation API, schema5, Node24.19.0 ESM/stdlib; no new dependency. Supersedes the early B-11 API where more specific. B-03 reference/image semantics and B-05 accounting remain authoritative. No new HTTP mutation route, worker, frontend controller, provider adapter selector, scheduler service or machine installation.

## Configuration and lifecycle

`validateRuntime(object)` in src/server/runtime-config.mjs returns a frozen normalized object. Unknown keys, unsupported version, nonfinite/fractional/out-of-range numbers and nonboolean enabled fail. [runtime.example.json](runtime.example.json) is the concrete public settings template; it has no account, endpoint, secret or guessed release path.

| Property | Default | Accepted range |
| --- | --- | --- |
| version | arch-backend-runtime/1 | exact string |
| maintenance.enabled | true | boolean |
| intervalMs | 300000 | 1000..86400000 |
| batchRows | 100 | 1..500 |
| batchBytes | 33554432 | 16777216..67108864 |
| maxBatchesPerTurn | 4 | 1..16 |
| catchUpDelayMs | 25 | 1..10000 |
| failureDelayMs | 30000 | 1000..3600000 |
| maxClockStepMs | 300000 | 1000..3600000 |
| maxLagMs | 3600000 | intervalMs..604800000 |
| shutdownGraceMs | 10000 | 100..60000 |

`createBackend({...existingConfig,runtime})` validates before opening SQLite. Omitting runtime in the library disables recurring maintenance for embedding compatibility. CLI serve explicitly applies the enabled defaults. BACKEND_RUNTIME_FILE optionally supplies the strict JSON. No timer is installed at module import or backend construction.

`await backend.listen(port)` performs a finite, yielding orphan-job recovery scan before opening loopback HTTP. It never calls an AI provider. After listen the recurring scheduler starts. A restore hold preserves all maintenance state. A listen/close race stops initialization at its next batch boundary; a duplicate listen is rejected.

`backend.operations.runOnce()` returns a Promise of arch-backend-runtime-status/1. It performs at most maxBatchesPerTurn and coalesces concurrent calls into the same Promise. A partial scan schedules the next bounded turn only while the foreground lifecycle is running and enabled. A manually invoked runOnce can run while recurring scheduling is disabled. `status()` is an in-memory operator snapshot; `stop()` prevents new turns and awaits the current transaction/yield. Parent uses these operations, not raw cleanup primitives.

Private status includes state, code, enabled/running, lastCompletedAt, lastSummary, coarse scan phase/cutoff/scanned, and externalBackupPurge='operator-evidence-required'. It contains no job/user/session IDs, image or prompt. Summary counts are operational observations at different batch times, not a transactional account ledger/invoice.

GET /api/v1/health preserves apiVersion/identityConfigured/capabilities and adds only `operations:{state,reason}`. Maintenance error, clock hold, overdue maintenance, overdue unverified backup purge, accounting write failure or restore hold produces status degraded/HTTP503. It does not include private counts or timestamps. It is a health signal, not new authentication or global account authorization. Auth/settings remain governed by existing policies; AI retains its original restore hold. Accounting write failure blocks new AI preparation/send in the current process.

## Shutdown and captured results

`backend.close()` is idempotent and returns the same Promise. It immediately stops admission/scheduling, rejects further AI creation/submission, clears delivery timers and aborts uncaptured transport. Captured provider results already in settlement keep their original job/user/session/project/hash/currency/UTC-period context and their own B-03 codec deadline. Logout, a switched session, or the shutdown abort signal does not cancel that decoder or replace the owner.

Shutdown awaits those bounded settlements before closing SQLite. It then marks only still-active deliveries unknown in batches of32, yielding between batches and never waiting on a competing SQLite writer. A known terminal actual is never overwritten with unknown. A captured actual above the quote remains the complete actual amount. A codec failure records the existing explicit PROVIDER_RESPONSE_INVALID result: a known actual still counts, otherwise the original pending bound remains.

shutdownGraceMs is an observation/drain deadline. On expiry all HTTP connections are closed and close rejects SHUTDOWN_DRAIN_TIMEOUT. SQLite and the writer lock remain alive while existing handlers/settlements can still write. `backend.whenClosed` settles after final resource close. CLI prints not-clean/nonzero on the deadline, waits for whenClosed, and releases the lock only after actual successful closure, reporting closed-after-deadline. Persistence/settlement failure rejects and retains writer.lock for operator inspection. No paid request is retried. Abrupt process death may lose a received in-memory response; the submitted/pending database row survives for B-05 reconciliation.

SQLite synchronous calls/fsync cannot be preempted by a JavaScript timer. The deadline is not a physical OS kill guarantee. Arbitrary injected handlers/renderers/providers that violate their own deadlines can prevent full drain; the service must not announce clean shutdown or release the live writer lock.

## Bounded maintenance

The scheduler uses a finite rowid high-water for each table per pass, with keyset scans, narrow projections and no image-byte fetch into JavaScript. Per-batch limits count scanned parent rows and encoded blob bytes being removed. Child rows such as thumbnail cascades and generation triggers add bounded statements per scanned row. SQLite foreign-key/index/page I/O and integrity checks have no hard wall-clock bound; database volume/performance remain operator dependencies.

Passes process orphan accounting, reference expiry, expired artifacts/events/settlements, terminal jobs, audit, sessions, counters, accounting observations and deletion-task observations. Child retention deletes are committed in bounded batches; the final job deletion and replay tombstone insert are one transaction after all children are absent. These are already expired outputs. A partially cleaned old job remains non-executable and its identity survives. Foreground additions do not extend the pass ceiling; concurrent updates are rechecked at each row. A pass is not snapshot isolation across all tables, and new/updated/reused-rowid records are revisited on later passes.

The existing 90-day predicates and session/counter boundaries are unchanged. Unknown/pending jobs, terminal jobs with an unverified recovery bound, all recovery obligations/evidence/receipts and replay tombstones are retained. Real actual values are not clipped. Original UTC periods, credential identity/version, payload/quote hash and immutable surviving images are unchanged.

Reference original/thumbnail blobs are cleared only at retain_until, revision increases once and original hash/context metadata stays. An approved/submitted original retains the B-03 90-day deadline. The existing staged-count/storage quota and metadata/tombstone charges are unchanged. This is active-database lifecycle cleanup, not proof of overwriting filesystem blocks/backups/client downloads.

A single operational_state key runtime-maintenance holds version arch-backend-maintenance/1, lastWall, lastCompletedAt and bounded lastSummary (under4096 characters). It participates in existing recovery generation. No schema bump or exclusion from recovery checks. Running serve/maintenance between an offline recovery plan/check and apply can invalidate that exact plan generation even when only its checkpoint changes; regenerate/check the plan instead of weakening the stale-head check. Restart starts a fresh idempotent finite scan, avoiding a queue of missed timer invocations; no persisted rowid cursor is trusted across restart/VACUUM.

Under restore-ai-hold there are no maintenance/checkpoint writes. SQLite BEGIN contention uses zero busy timeout for each batch, restores the caller's prior timeout, reports DATABASE_WRITER_BUSY and defers. Other failures roll back the complete batch and report only allowlisted diagnostic codes. A local maintenance retry has no provider capability.

Cadence and overdue detection use monotonic elapsed time. Backward wall time pauses until the last durable/observed time catches up. A running forward step exceeding maxClockStepMs relative to monotonic elapsed time latches CLOCK_FORWARD until restart after operator clock verification. Legitimate downtime is one catch-up scan using current UTC, not interval replay. Across a process restart there is no independent attestation of correct wall time; an incorrect future clock can age data. Operators must verify it before starting.

## CLI and integration

Existing commands/host boundaries remain. Every command uses project-env and exclusive writer.lock; no stale-lock takeover. Configuration/status/recovery/backup cannot run alongside serve.

| Command | Result / dependency |
| --- | --- |
| serve | BACKEND_RUNTIME_FILE optional; starts scheduler only after explicit listen |
| maintenance | Awaitable finite scan; no key file/provider required; complete=0, held=2, failed=1 |
| maintenance-status | Bounded persisted checkpoint + current restore hold; no keys; held=2 |
| validate-config | Offline existing schema5 integrity/FK/active-owner/policy/OIDC/HTTPS/fixed-port checks; supplied CSRF/lease/vault keys and every retained ciphertext verified; no writes to DB records/network/bootstrap/migration |
| backup/restore/recovery-* | Existing B-05/B-03 API and approval/hold semantics unchanged |

Startup performs ordinary constructor/config/policy/key validation. validate-config is the stricter production preflight and must be run before serve; serve still allows an intentionally unconfigured OIDC for the existing explicit offline/test operational workflow, exposing identityConfigured=false. There is no silent identity or credential fallback. validate-config does not prove real OIDC registration, DNS, TLS trust, provider permission or production asset validity.

The existing `await ai.prune()` and `await ai.recover()` compatibility methods now yield between batches. Two baseline tests are updated to await prune. Standalone AI users may pass rows/bytes/clock/yield options; embedding hosts should use the foreground operations API for coalescing/close coordination and must not call raw Policy/ImageAssets cleanup concurrently. The existing synchronous primitives remain internal legacy helpers.

No change to src/host, tools/hosting, src/app/remote, UI or source/history/geometry files. Parent integration is the B11 manifest delta over the exact sealed B03 preimages. Host public manifest validation/allowlisting is reused as documented; no optional second package validator was added.
