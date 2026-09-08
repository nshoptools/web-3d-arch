# Foreground runtime operations runbook

Implementation runbook for B-11, B-03 and B-05 boundaries. These commands run one foreground backend and the existing separate HTTPS host. No service install, cron, autorun, account creation, paid call or deployment was performed.

## Prepare and validate

Use the repository approved Node24.19.0 or a separately validated compatible Node24.19+ runtime. Start every writing shell with the repo-local tools/project-env.ps1, explicit Seat and RunId. Keep data, configuration, keys, logs, backups and all generated files in that run. Do not use .toolchain as an output directory. Resolve absolute destinations/ancestors; reject links to other rooms or outside the repository.

Copy runtime.example.json to a private runtime configuration path. Its bounded values are concrete conservative defaults, not a production load benchmark. runtime-env.example.ps1 can bind operator-supplied absolute paths/origin/port without starting anything. Production BACKEND_PORT must be explicit/nonzero and equal existing host-config backendPort. BACKEND_ORIGIN must exactly equal host HTTPS origin. Existing docs/hosting/DEPLOYMENT.md remains the TLS/proxy/static authority.

Supply the actual OIDC issuer/endpoints/client registration and redirect <origin>/api/v1/auth/callback. Supply OIDC client authentication separately only if that registration needs it. Supply the original versioned vault keys, CSRF key and Ed25519 lease private key outside public assets/database backups. For first bootstrap only, use existing generate-keys then bootstrap with the actual issuer + subject and approved policy; do not substitute email, invent an owner identity, recreate missing old keys, or repeat bootstrap on an existing database.

AI stays opt-in: BACKEND_AI_ADAPTERS empty until the existing provider integration and spend policy are explicitly approved. Enabling xai-imagine does not supply a key. Every member uses their own authenticated BYOK credential; the owner key is never a member fallback. Database ciphertext cannot be made usable by recovery bundles. Missing retained vault key versions fail validate-config and require the original protected material or an explicit user credential replacement flow, never regeneration of a matching name.

After env setup, with PackageRoot pointing to the approved package/candidate:

~~~powershell
node (Join-Path $PackageRoot 'src/server/cli.mjs') validate-config
node (Join-Path $PackageRoot 'src/server/cli.mjs') maintenance-status
node (Join-Path $PackageRoot 'src/server/cli.mjs') serve
~~~

validate-config opens existing schema5 read-only under writer.lock, checks supplied keys against ciphertext in bounded batches and prints only safe status/counts. It requires configured OIDC/HTTPS/fixed port. It does not call provider/IdP, verify certificate trust/registration, or validate the frontend build. Refusal of a second command while serve holds writer.lock is expected, including planning, config validation and backup.

For an operator-supplied built webroot/public manifest, reuse the existing host loadManifest/config validation and explicit tools/hosting/manifest.mjs allowlist generator. Keep private files outside webroot. Do not compile an unfinished frontend, guess asset paths, alter host CSP or assume successful backend preflight proves the UI. Parent owns release entry/runtime and actual packaging.

## Start and observe

Start backend first, then the existing HTTPS host in a separately scoped shell. Verify /api/v1/health through that host, protected authentication, identityConfigured=true and original BYOK policy. Public operations status contains only coarse state/reason. No route lists operator counters/identity. When stable, protect/bound process stdout/stderr using the operator's approved log collector/rotation; no logfile or secret-output path is installed by this candidate.

Scheduler runs only inside the foreground service. It processes a bounded catch-up pass, yields between batches and then uses monotonic cadence. New rows cannot create an infinite single pass. Unknown liabilities remain charged to their original UTC budget periods. A successful maintenance pass does not resolve them or prove backup purging.

CLOCK_BACKWARD: verify wall time; maintenance waits for its durable high-water. CLOCK_FORWARD: stop admission, verify the clock against the operator-approved time source, then restart deliberately. Do not edit the checkpoint/ledger to force cleanup. Across restart the machine clock is trusted. DATABASE_WRITER_BUSY: investigate the legitimate writer, do not remove its lock or retry a paid operation. MAINTENANCE_FAILED/CHECKPOINT_INVALID/OBJECT_TOO_LARGE/OVERDUE: preserve safe diagnostics and inspect offline; failed batches roll back. AI_ACCOUNTING_WRITE_FAILED: stop new charged work and use the B-05 ledger/evidence process. BACKUP_PURGE_EVIDENCE_REQUIRED: an active deletion task has passed its recorded deadline; provide/verify the real backup purge externally, never label it complete from a scheduler tick.

External logs, backup copies, offsite/key storage and deleted bytes on client devices are not enumerated or deleted by this runtime. Monitor physical DB/WAL/index/backup/log volume in addition to logical quotas. Replay tombstones, recovery evidence and unresolved obligations intentionally do not expire. The candidate does not supply automatic log rotation or external backup retention.

## Stop, maintenance and failure

Stop the HTTPS host admission first, then signal the foreground backend with its normal SIGINT/SIGTERM lifecycle. No extra shutdown HTTP endpoint or control file exists. Already-received provider output still decoding settles under its original context and bounded codec deadline. Output transport not yet captured is aborted conservatively; cancellation does not guarantee no provider charge. Never resubmit the operation to fix an uncertain response.

Clean close prints closed and releases writer.lock after handlers, captured settlements and SQLite close. SHUTDOWN_DRAIN_TIMEOUT is nonzero/not-clean. The process keeps the writer/DB while settlement can still finish, then may print closed-after-deadline. Persistence failure retains the lock for investigation. Do not launch a replacement writer while a timed-out instance is still alive. An OS kill may leave a stale lock and submitted accounting; after confirming the exact instance is gone, follow existing stale-lock verification, preserving ledger and evidence. PID existence alone is insufficient due to PID reuse.

Offline maintenance requires the same exclusive lock and no provider or vault key:

~~~powershell
node (Join-Path $PackageRoot 'src/server/cli.mjs') maintenance
node (Join-Path $PackageRoot 'src/server/cli.mjs') maintenance-status
~~~

Held exits2, failed exits1, complete exits0. A restore hold pauses all maintenance mutation; it is not an instruction to clear the hold. One scan is finite but its overall duration depends on retained row count, disk and SQLite foreign-key work. JavaScript deadlines do not preempt synchronous disk operations. The row/blob budgets are not an RTO guarantee.

## Backup, restore and rollback

Use unchanged OPERATIONS.md and RECOVERY-RUNBOOK.md commands after stopping host and backend. BACKEND_BACKUP_FILE is a new private destination under the scoped run. CLI backup is offline under writer.lock and uses SQLite backup API; never copy a running main SQLite file without WAL. Record backup hash, backupId, creation/coverage time, source/binary/config hashes and integrity result. Store key material/OIDC/TLS configuration separately using approved access controls. Windows file mode0600 alone does not enforce a production ACL.

For restore, preserve the old directory and choose a new empty BACKEND_DATA_DIR. BACKEND_RESTORE_FILE points to the exact checked backup. Verify its byte hash before/after the restore. Restore invalidates authentication and reference submit expiry, preserves retained originals/identities, and establishes restore-ai-hold. Scheduler will not purge or change checkpoint/ledger under the hold. Original vault key versions are required to open retained ciphertext; the restore/recovery bundle never contains or reconstitutes missing keys.

Use B-05 recovery-status/plan/check/apply with actual verified provider/accounting evidence, original UTC periods and exact approval hash. Partial evidence retains the hold. Above-quote actual costs count in full. No UI approval is invented by an operator timer. After a complete explicitly approved reconciliation, verify exact receipt/hold status, run maintenance/config checks offline, then start the single backend and host. A timer cannot verify invoice truth, cutover completeness or physical purge.

Rollback the static release with the existing host's pinned matching manifest/config, respecting active browser/service-worker generations. B11 adds only a bounded operational_state record and leaves schema5. A sealed compatible B03 backend can read it but loses automatic scheduling and captured-result shutdown handling; use manual offline maintenance and record that limitation. Do not replace schema5 with schema4/B05 or erase B03 tables to downgrade. Database rollback requires the matching approved backup, restored hold and B-05 reconciliation of work after that backup; preserve the displaced directory and accounting evidence.

No production/OIDC/provider account, TLS renewal/chain, deployment load, ACL, offsite backup/key recovery, external log retention or complete backup purge has been qualified here. Tests prove synthetic local accounting/hash/lifecycle invariants, not physical RPO24h/RTO8h or deployed/full-product readiness.
