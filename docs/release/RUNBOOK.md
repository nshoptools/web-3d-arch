# Foreground release operations

These commands use an existing Node24.19.0 and repository; they install no service.
The operator supplies the real paths, approved code/compiled entry, TLS and IdP
registration. Example JSON contains placeholders and deliberately fails validation.

1. In each writing shell locate this repo, then dot-source
   tools/project-env.ps1 -Seat codex -RunId <explicit-operation-run>.
   All private config/data/keys/TLS/evidence are inside that run. Do not repurpose
   a frozen implementation room or use the machine TEMP/profile. After integration
   build artifacts may use report/release/<id>; retain old artifacts unchanged.

2. Parent builds and qualifies its production browser entry. Supply only its exact
   public file allowlist, unified module pair and unchanged checked library.
   Run pin-runtime against approved integrated code, record the returned lock pin,
   then build against the explicit input JSON. Run verify from an independently
   trusted copy of these tools with the returned release-manifest hash.
   A checker executed from tampered code cannot authenticate itself. Hashes are
   integrity evidence; no signing or independent review is claimed.

3. Complete operator.example.json in a PRIVATE file in the run. Register redirect
   URI exactly <origin>/api/v1/auth/callback with the actual IdP/client/owner.
   Use a real matching trusted TLS certificate/key; keep the original CSRF/lease/
   vault key versions and IdP secret mechanism separately secured. Do not put
   customer user.keys, provider keys, project files or a DB anywhere in a release.
   Do not use generated synthetic test credentials/certificates in production.
   Validate DNS, chain trust, renewal, ACL/service account/firewall independently.

4. Run configure <operator.json> <new-config-dir>. Record its config-seal SHA.
   For a genuinely new service only, run operator backend generate-keys (exclusive
   create), then bootstrap with the actual approved owner issuer/subject and policy.
   No default owner, account, password or shared AI credential exists. Existing/
   restored data must retain matching original key material, never freshly replace
   missing keys merely to pass startup. Then run backend validate-config.
   It is offline: schema5/integrity, active owner/policy, fixed HTTPS origin/ports,
   strict IdP, runtime settings and retained credential key/decryption checks.
   It needs the exclusive writer lock and fails if a legitimate service is running.

5. Start backend serve in its foreground project-env shell. It validates first,
   binds only literal127.0.0.1, recovers finite unknown jobs and starts maintenance.
   Start host serve in a second foreground shell using the same sealed config.
   Host binds configured HTTPS and one loopback backend; exact public asset hash
   whitelist plus COI/CSP/cache/MIME applies. Never expose backend directly.
   No per-machine scheduler/cron/autorun is required. Runtime default interval
   is300000ms (5min), bounded batches and deferred catch-up; no charged AI retry.

6. Check HTTPS / and /api/v1/health (coarse state/reason only), unauthenticated me
   rejection, actual IdP login/callback/logout and suspension; verify original PNG
   previews, inert source bytes, Worker/module and cache policy in the parent's
   final app. No test identity/provider selector exists in production config.
   serviceWorker defaultsfalse; enable only with the parent's validated SW/update/
   offline policy. Public bytes are intentionally available before login, not
   private project/account data. Old tabs/SW generations may need closing.

7. Stop host first with foreground Ctrl+C/SIGTERM, then backend. Backend stops
   admission/maintenance, preserves fully received output already decoding with
   captured owner/session accounting, and drains under its own bounded deadlines.
   A drain timeout is NOT a clean shutdown: SQLite/writer.lock stay until actual
   handlers settle and whenClosed completes. Do not force kill, close SQLite early,
   delete a live lock or replay an uncertain charged job. Confirm original process
   instances ended and locks released. A stale lock requires verified operator
   investigation; PID existence alone is insufficient after PID reuse.

8. Manual maintenance: while backend is stopped, use backend maintenance-status or
   maintenance. Held/non-complete exit2 requires investigation; public health is
   coarse, CLI diagnostics are private. Restore/clock holds prevent writes.
   Unresolved accounting obligations and unverified bounds never auto-expire.
   Maintenance checkpoint increments existing recovery generation; plan/check/apply
   while stopped, or regenerate stale recovery plans instead of weakening checks.
   External backup-copy/log purge still requires operator evidence.

9. Backup after clean stop under existing writer.lock: set BACKEND_BACKUP_FILE to
   a NEW private path then backend backup. Record the DB backup SHA/integrity;
   separately secure original encryption/session keys and TLS/IdP configuration.
   Never copy a live SQLite main file alone or publish backup files. No secret is
   packed in the release or restored from its catalog.

10. Restore: preserve old data untouched, choose NEW backend dataDirectory and
    configure a new sealed descriptor pointing to original matching key versions.
    Set BACKEND_RESTORE_FILE to approved private backup and run backend restore.
    Sessions/invites are revoked; restore-ai-hold persists. Use existing
    recovery-status, recovery-plan, recovery-check and recovery-apply with the exact
    BACKEND_RECOVERY_BUNDLE/PLAN_HASH/APPROVE_HASH evidence. Import accounting identity
    for lost credential versions without a usable credential or owner fallback.
    Actual above-quote charges count fully; conservative bound reduction needs
    verified terminal settlement. Do not release a hold by retrying provider calls.
    Recovery cannot establish offsite erasure or restore missing keys/artifacts.

11. Artifact/catalog rollback: verify the PREVIOUS entire immutable artifact with
    its external pin, stop admission and writer cleanly, and configure a NEW private
    descriptor selecting that whole package. Validate schema5 and keys before serve.
    Keep the same compatible DB; NEVER down-migrate/overwrite it by swapping a package.
    The catalog/transport/bindings/manifest/WASM all travel with the selected artifact.
    Do not mix public files or reuse immutable URLs for changed bytes. Close old tabs/
    SW generations and run the same smoke before admitting users. Return to the newer
    pinned artifact with another new config if the rollback is unsuitable.

Store only bounded safe statuses/hashes/times in private operation evidence. Do not
log raw URLs/queries, cookies, prompts, provider messages, source images, keys or
environment dumps. Existing host logs route category/method/status; backend retains
its own redaction. Protect/rotate operator log storage outside public root.

Local tests use synthetic TLS/identity and real HTTPS/SQLite/Worker files. They
prove scoped byte/accounting/lifecycle invariants. They are not a production deploy,
full app qualification, independent review, RPO24h/RTO8h measurement, real account/
certificate/ACL test or bypass of the previously blocked backend review.
