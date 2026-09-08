# B-05 operator runbook

Use this workflow after an independently established backup restore or for offline reconciliation of an unknown/estimated app job. It requires a trusted operator and the existing exclusive writer lock. Do not run it against another worker's data. The following names are examples within an assigned run; no command here obtains provider credentials or calls a provider.

## Prepare private data and review evidence

Stop the service and verify the old deployment/writer has stopped using the affected app credentials. A lock held by a running service blocks every recovery command. The CLI never steals or removes that lock. After an abrupt exit, follow the existing OPERATIONS.md procedure to verify the exact process/data directory before removing that stale lock.

Keep the original backup and an original compatible binary. Work in a new restore destination. Record provider/application evidence for each user, credential version, currency and original UTC period, including operations missing after the backup. Recover accounting identity, never missing key material. If user identity/correlation or a defensible bound is missing, leave the hold and report that gap.

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260908-backend-recovery-wave1
$BackendPackage = Join-Path $env:PROJECT_REVIEW_RUN 'work/backend-recovery'
$env:BACKEND_DATA_DIR = Join-Path $env:PROJECT_REVIEW_RUN 'work/runtime/data'
# Existing database must already be bootstrapped/restored by the authorized operator.
node (Join-Path $BackendPackage 'src/server/cli.mjs') recovery-status
```

After promotion, set BackendPackage=PROJECT_ROOT; any assigned RunId is supported. Status writes the detailed private inventory under BACKEND_DATA_DIR/recovery/reports/<ledgerHash>.json and prints only operational metadata/counts. Review that file privately, including its surviving unsubmitted identities; absence of a job does not establish zero cost.

Construct the exact Bundle in RECOVERY-API.md from original provider records and the app correlation archive. Statements bind canonical facts and attachment digests. Keep package and attachments under recovery/inbox, with attachments named by their SHA-256 inside inbox/evidence. Original invoice truth and complete scope/cutover verification are the operator's responsibility; successful JSON validation does not do that work.

Actual charges above a quote are recorded in full, with a discrepancy. Do not replace such a fact with the old quote. An estimated/unknown bound can be reduced only by an evidenced terminal actual settlement. Original user, currency and UTC periods must remain intact.

## Plan, check and approve the exact plan

Repeat project-env setup in each new writing process:

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260908-backend-recovery-wave1
$BackendPackage = Join-Path $env:PROJECT_REVIEW_RUN 'work/backend-recovery'
$env:BACKEND_DATA_DIR = Join-Path $env:PROJECT_REVIEW_RUN 'work/runtime/data'
$env:BACKEND_RECOVERY_BUNDLE = Join-Path $env:BACKEND_DATA_DIR 'recovery/inbox/correlated-package.json'
node (Join-Path $BackendPackage 'src/server/cli.mjs') recovery-plan
# Set this to the exact planHash returned above, after reviewing the private plan.
$env:BACKEND_RECOVERY_PLAN_HASH = 'EXACT_64_HEX_PLAN_HASH'
node (Join-Path $BackendPackage 'src/server/cli.mjs') recovery-check
```

The check report is private at recovery/reports/<planHash>.json. It names missing scope/day/operation/interval/bound issues and above-quote discrepancies. Inspect the canonical persisted plan in the private database through authorized operator tooling if needed; neither plan nor attachments belong in public bundles/logs. Apply only the package whose original facts and scope have actually been reviewed.

```powershell
# Same initialized process/environment, reviewed package, and plan hash:
$env:BACKEND_RECOVERY_APPROVE_HASH = $env:BACKEND_RECOVERY_PLAN_HASH
node (Join-Path $BackendPackage 'src/server/cli.mjs') recovery-apply
node (Join-Path $BackendPackage 'src/server/cli.mjs') recovery-status
```

Partial coverage may apply valid charges with holdRemaining=true. Resolve the private report's remaining issues in a new bundle/plan; existing obligations must be targeted as obligation and retained or settled, not imported again. Complete coverage releases the hold in the same transaction as the accounting updates. Genuine remaining bounds remain pending/estimated and enter actual budget checks.

RECOVERY_PLAN_STALE means the database or schema changed: prepare a new bundle/plan against the current inventory. RECOVERY_BUNDLE_CHANGED/EVIDENCE_* means stop and reconcile the input difference. Failed apply changes no accounting or hold state. After a lost CLI response or post-commit report failure, repeat the exact package/check/apply; the original receipt is returned without another charge. No automatic provider retry occurs.

Only after the ledger/hold outcome is understood should the service be restarted. Existing per-user key checks, membership, budgets, quotes and consent still apply. User /ai/costs links to /ai/recovery-costs; owner infrastructure contains request counts only.

## Backup, migration and rollback

New backups are schema4 sealed SQLite copies with snapshot ID/time and an inherited coverage floor if the source was still held. Retain both DB and separately managed vault-key backups through the existing protected workflow. This feature never imports keys from a reconciliation package.

Restore schema1/2/3/4 into a new destination; schema4 migration is additive and old auth is revoked. Legacy cutoffs are unknown and require full-history coverage. An unpriced retired tombstone in that history is an explicit blocking gap; the current tool does not invent its amount or strip its dedup identity.

A schema3 binary cannot read schema4. Rollback uses the separately retained compatible backup and binary under the same shutdown/lock procedure. It must retain the restore AI hold and the original recovery evidence/application receipts; returning to an older binary is not a way to remove obligations. Do not downgrade user_version, drop recovery tables, delete restore-ai-hold, or set reconciled:true in production data.

Operational evidence remains private and may contain invoice/account correlation information. Access controls, encryption, backup/evidence retention and deletion are still operator/deployment work. The implementation has no automatic evidence purge, cross-host lock, replica support, real provider verification, RPO/RTO measurement or release/G4 certification.

## Reproduce implementation tests

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId 20260908-backend-recovery-wave1
$BackendPackage = Join-Path $env:PROJECT_REVIEW_RUN 'work/backend-recovery'
& (Join-Path $BackendPackage 'tests/server/run.ps1') -Seat codex -RunId 20260908-backend-recovery-wave1
```

The suite uses Node24.19+, node:sqlite and controlled loopback HTTP/OIDC/provider transports, with a120s test timeout. New CLI subprocesses repeat project-env via the portable existing helper. Outputs are in the assigned run. There are no live inference calls, credentials, deployment or machine configuration changes. The exact tested counts/hashes are in reports/test-summary.json and the handoff manifest; synthetic statements are not invoice evidence.
