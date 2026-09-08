# Deployment, backup and rollback

This is a runnable local deployment procedure for the candidate, **not evidence of a real deployment**. It uses one loopback backend process and one HTTPS host process. No service install, SSH, machine PATH, DNS, certificate-store change or AI spend is performed by the tools.

1. After parent integration/review, pin the approved Node 24.19.0 executable, host/backend source, frontend release, manifest and config hashes. Copy only new production host files from the handoff manifest to src/host and tools/hosting. Keep built public files in a dedicated release directory, with no links, credentials or private data. Check every public allowlist entry. Keep each release for rollback.

2. In every writing shell, find the repo using AGENTS.md and dot-source tools/project-env.ps1 with Seat codex and the explicit deployment RunId. Runtime/config/keys/TLS/backups/logs must remain under that chosen run. Create a private directory and sibling backend-data / host-runtime directories. Give only the service/operator account filesystem access; Windows mode 0600 alone is not an ACL policy. Real Windows ACL/service-account hardening is unverified and must be configured by the deployment operator.

3. Supply the actual TLS private key and PEM certificate chain for the public origin, outside webroot. Supply a concrete HTTPS OIDC config for the backend with registered redirect URI exactly <origin>/api/v1/auth/callback, client ID, issuer and approved auth method. The host checks key match, certificate time/name and TLS >=1.2. The operator must validate real chain trust, renewal, firewall and IdP policy. Synthetic certificates and HTTP local test IdP are test inputs only.

4. Generate the exact public manifest using the allowlist tool; review it and pin its SHA. Replace paths/origin in host-config.example.json. Match backendPort to BACKEND_PORT, origin to BACKEND_ORIGIN. serviceWorker defaults false: enable only when the separate UI uses this host SW and its offline lease/storage behavior has passed review. Put host config, TLS, backend keys and OIDC private config outside webroot. The sample .invalid origin is not deployable as supplied.

5. Use the **existing backend CLI**. Set BACKEND_DATA_DIR, BACKEND_KEYS_FILE, BACKEND_POLICY_FILE, BACKEND_OWNER_ISSUER and BACKEND_OWNER_SUBJECT explicitly. Run generate-keys once (refuses overwrite), then bootstrap once. Do not invent default credentials, testOnly flags or a shared AI key. Run serve with BACKEND_ORIGIN and a fixed BACKEND_PORT; configure BACKEND_OIDC_FILE and optional approved OIDC client-secret mechanism. Leave BACKEND_AI_ADAPTERS empty until the separately reviewed provider integration is authorized. This host has no AI adapter selector.

6. Start HTTPS host in its own project-env shell. Candidate-relative paths below become root-relative after integration:

~~~powershell
# $RunId, $ConfigFile and $RuntimeDirectory are explicit operator inputs.
./tools/hosting/serve.ps1 -RunId $RunId -ConfigFile $ConfigFile -RuntimeDirectory $RuntimeDirectory
~~~

Equivalent: set HOST_CONFIG_FILE and HOST_RUNTIME_DIR, then node src/host/cli.mjs serve. The runtime parent must already exist. host.lock and backend writer.lock use exclusive creation; a second process fails. Foreground SIGINT/SIGTERM drains host up to 5 seconds and releases its lock. Do not kill/restart writers blindly after timeout: accepted backend writes may complete.

7. Validate the real origin before admitting users: certificate trust/name/expiry, HTTPS / and /api/v1/health, identityConfigured=true, authentication required for /api/v1/me, login/callback/logout and suspension from another session; no forwarded identity trust. Confirm COI plus the actual UI worker/engine/fonts in Chromium, Firefox and WebKit. Test CSP against the actual build and remove unsafe build assumptions. Confirm no unlisted file, private response or callback enters CacheStorage. Host-level synthetic tests do not replace this validation.

**Backup (fits the existing CLI lock).**

- Stop the host to admit no new requests; stop the single backend gracefully. Check both original process instances ended and locks were released. A crashed process can leave a stale lock. Never delete one while any writer might be alive; PID existence alone is insufficient after PID reuse. Verify the service instance before removing only its own stale lock.
- In a project-env-scoped shell, set BACKEND_DATA_DIR to that stopped database and BACKEND_BACKUP_FILE to a new private path, then run node src/server/cli.mjs backup. Current CLI takes writer.lock: concurrent backup while serve holds it is deliberately rejected. Do not copy only the main SQLite file during writes.
- Store the resulting database backup hash and integrity result. Back up vault/CSRF/lease key material and OIDC/TLS private configuration separately using approved encrypted storage/access controls. Database backups contain private settings and encrypted BYOK credentials; they are never public assets. A database alone cannot recover encrypted credentials without its corresponding vault keys.
- Restart the same approved backend, then host; verify protected behavior. Scheduling, offsite storage, access recovery, key rotation, retention enforcement and RPO/RTO must be measured separately. No offsite destination or key upload is configured by this sidecar.

**Restore and rollback.**

- Stop admission and writer as above. Preserve the old data directory; select a new empty BACKEND_DATA_DIR inside the scoped run.
- Set BACKEND_RESTORE_FILE to the approved backup; run node src/server/cli.mjs restore. Existing destinations are refused. Restore performs integrity/schema checks, revokes sessions/invites and sets restore-ai-hold. Use matching vault keys/config before serve. Reconcile pending/unknown AI ledger state with approved evidence; never clear a hold merely to retry charges.
- Start exactly one backend at the restored directory. Verify health, required reauthentication, settings integrity and hold. Then start host. The local drill verified a seeded database restore, lock exclusion and reauthentication requirement; it is not a production-data or offsite recovery qualification.
- For static rollback, stop host, select the previously pinned release + matching manifest/config, restart host and verify hashes/headers. Keep the same single backend if its schema is compatible. Do not roll a database schema backward by swapping binaries. Existing tabs/SW generations must be closed/reopened or follow the separately verified frontend update flow.
- Record code/build/manifest/config hashes, time, safe status and rollback decision. Logs must not include raw URL/query, cookies, prompts, images, provider errors or key content. Host request logger records only route category, method and status. Configure bounded protected log storage at deployment; log rotation/forwarding was not qualified here.

RPO 24h / RTO 8h are specification targets, not measured service guarantees. A real host/IdP, trusted certificate lifecycle, concurrency load, offsite restore and SLA remain open.
