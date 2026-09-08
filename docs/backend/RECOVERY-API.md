# B-05 persisted recovery contract

Implementation API v1; schema4. This extends offline operations, not the HTTP administration API. There is no network route to clear a hold and no provider call in recovery.

## Money and identity

Amounts are nonnegative integer micro-currency values, at most1,000,000,000,000 per operation. No currency conversion occurs. Effective obligations are actual ?? recovery_bound ?? original quoted cap. The original quoted cap, user, credential/version, provider/endpoint, operation/idempotency/payload hash, request ID and original UTC day/month remain identifiable.

An actual amount above the quoted cap is accepted in full and reported as RECOVERY_ACTUAL_ABOVE_QUOTE plus quoteDiscrepancyMicros in the user's cost view. An unresolved conservative bound cannot decrease; an evidenced terminal actual settlement can replace it, including an explicitly confirmed actual zero. A missing actual never becomes zero. Unknown labels and cancellation do not settle money.

Missing records go into recovery_obligations and matching tombstones. They have no executable payload, usable credential, image or job API. A surviving prepared/unsubmitted job can instead acquire its evidenced lost submission and terminal/unknown accounting, with originUnsubmitted/originSnapshot in the recovery action; this sends nothing and manufactures no artifact. Missing credential IDs/versions are accounting identities only. A retained credential ID must match its user/provider/endpoint; unknown users are refused. There is no owner-key substitution.

Money/day/month, requests/day and bytes/day admission include recovered obligations. Old periods stay old. Unknown recovered obligations require the existing additional-charge acknowledgement and consume no live concurrency slot. Terminal estimated jobs with a recovery bound are not pruned before actual settlement; ordinary terminal retention remains unchanged.

## Package and private evidence

readRecoveryBundle(dataDir, bundlePath) returns {bundle,evidence:Map<sha256,Buffer>}. The package is under dataDir/recovery/inbox; evidence is in inbox/evidence/<sha256>, with no JSON-provided filesystem paths. The CLI refuses symlinks/junctions and multiply linked input files. No key file is needed by recovery commands.

```ts
interface Bundle {
 version:'arch-ai-recovery-bundle/1';
 bundleId:string; restoreId:string|null; // UUIDs; null only without a restore context
 operator:{
  id:string; verifiedAt:number; // opaque operator identifier and epoch milliseconds
  assertion:'provider-records-app-correlation-cutover';
 };
 inventory:{from:number; through:number; scopes:Scope[]}; // inclusive time interval
 inventoryEvidenceHash:string;
 entries:{
  entryId:string; target:'job'|'missing'|'obligation';
  record:Identity;
  decision:{kind:'retain'}|{kind:'actual'|'bounded';micros:number;state:'unknown'|'succeeded'|'failed'|'cancelled'};
  evidenceHash:string;
 }[];
 coverage:{scope:Scope; days:{day:string;operationIds:string[];totalMicros:number}[];evidenceHash:string}[];
 evidence:{sha256:string;byteLength:number;mediaType:'application/json'|'text/plain'|'application/pdf'}[];
}
interface Scope {
 userId:string; providerId:string; endpointId:string;
 credentialId:string; credentialVersion:number; currency:string;
}
interface Identity extends Scope {
 version:'arch-ai-accounting-identity/1';
 jobId:string; operationId:string; idempotencyKey:string; payloadHash:string;
 adapterVersion:string; modelId:string; modelVersion:string; projectId:string; projectRevision:string;
 requestId:string|null; submittedAt:number; periodAt:number; day:string; month:string;
 capMicros:number; byteCap:number;
}
```

Job/operation/idempotency/project/credential/user IDs are UUIDs. periodAt is the original reservation time; day/month must equal its UTC period and it cannot follow submittedAt. Retained fields are checked against the journal. requestId may fill a previously absent value but cannot replace an existing different ID. Two operations cannot claim the same observed provider request ID in one database. Retired tombstones cannot be silently reimported.

retain is for an existing known amount; it does not provide a fresh bound for unresolved accounting. actual requires a terminal state and cannot rewrite an already finalized different actual. bounded preserves unknown/estimated status and its uncertainty, with a nondecreasing amount. Entry contents, including decision, are covered by the evidence fact hash.

Every operation/coverage/inventory statement is canonical JSON:

```js
{version:'arch-ai-recovery-evidence/1',kind:'operation', // or coverage/inventory
 factHash,operatorId,verifiedAt,attachments:[attachmentSHA256]}
```

Hashes use SHA-256 and src/server/core.mjs canonical() (sorted object keys; array order significant). The fact for operation is {target,record,decision}; coverage is {inventory,scope,days}; inventory is {inventory,operator}. Statements must match the exact package operator and verification time. Each references1..16 original attachment digests; every referenced file must exist with exact length/hash, and no package evidence may be unreferenced. Private attachment bytes and correlation statements persist atomically in SQLite upon apply.

These checks establish byte identity and consistency with supplied facts. They do not authenticate a provider invoice, prove an operator actually inspected it, discover omitted external accounts, or prove the old service stopped. The trusted operator must establish app-only attribution, complete credential/currency inventory (including lost versions), original IDs/UTC periods, actual or conservative amounts and old-writer cutoff from original provider/application records. A bare reconciled:true is not accepted.

## Coverage and restore identity

Schema4 records a database UUID, monotonic ledger generation, restore UUID, source backup digest/ID/time, coverage_from, and applied plan. Triggers advance generation for all existing data tables and recovery obligations/changes/restores. The SQLite schema version also participates in the ledger hash. Plan/evidence/application bookkeeping does not invalidate its own plan.

A new backup is made by the SQLite backup API and stamped on the backup copy only. It is checkpointed/sealed before hashing. Restore accepts schema1..4, preserves original backup bytes, upgrades the new destination to schema4, revokes old auth and conservatively marks old sent/running work unknown. Source WAL must be sealed.

A backup of a held restore inherits its earlier coverage floor. A later backup time cannot hide the previous gap. Legacy snapshots/holds without a trustworthy cutoff require from=0. Unpriced retired tombstones in such a full-history recovery block hold release explicitly; reconstructing their historical accounting is outside this bounded import.

Coverage must include all known retained credential/currency scopes, each current credential's currency inventory, every declared scope and every known/recovered operation. Per-day operation sets and exact effective totals are compared. Missing days with no operations are covered by the interval attestation. Unknown/estimated entries need explicit operation-level bound evidence. Invalid identity/amount/hash is a hard failure. Structurally valid partial coverage can apply its obligations while retaining the hold and recording missing scopes/days/totals/intervals or unresolved bounds.

## Persisted functions

Exports from src/server/recovery.mjs, called only under the operator writer lock:

- recoveryStatus(store,{details:false}): version, held, ledgerHash, restoreId and counts. details:true additionally gives private ledger/scopes/records plus incomplete identities for surviving unsubmitted jobs; it never returns prompt, key or artifact bytes.
- createRecoveryPlan(store,{bundle,evidence},{now?}): stores canonical plan/action bytes and returns planned/planHash/counts. Bundle ID reuse with different canonical contents is rejected. A stale bundle needs a new plan/bundle ID.
- checkRecoveryPlan(store,planHash,input,{now?}): rechecks files/facts/actions/current ledger and persists a detailed private report.
- applyRecoveryPlan(store,planHash,input,{approveHash,now?}): requires approveHash===planHash and a recorded check; revalidates inside BEGIN IMMEDIATE, then writes evidence, money, tombstones, changes, receipt and conditional hold removal together.
- recoveryCosts and recoveryUsage expose user-scoped read/admission data. No method restores secrets or invokes an adapter.

An exact replay verifies the persisted plan hash and package/evidence again, returns the same stored receipt and performs no new mutation. It cannot authorize a different restore. The exact actionHash is retained through check/apply/replay. Database changes invalidate unapplied plans, including auth/settings/policy changes; direct tampering with schema/clock/SQL by a privileged operator is outside the CLI's trust boundary.

Receipt: arch-ai-recovery-receipt/1 with bundleId, planHash, bundleHash, actionHash, restoreId, appliedAt, entries, holdReleased, holdRemaining, missingScopes, uncertain, discrepancies, evidenceCheck and invoiceTruth. missingScopes is the count of remaining coverage validation issues (including day/interval/bound issues); the detailed private report has exact codes/targets. The invoiceTruth value is always operator-attested-not-machine-verified.

GET /api/v1/ai/recovery-costs is authenticated to the current user, with providerId, from inclusive/to exclusive epoch milliseconds, after cursor and limit1..100. It returns obligations and nextCursor. Existing /ai/costs provides the separate recovery list link/count; existing jobs retain their own accounting view. Owner infrastructure adds only recovered request counts, never personal costs/evidence.

## Bounds and persistence

Package2MB; up to5,000 entries/2,000 scopes/512 evidence files; each evidence file8MB and package evidence32MB; persisted evidence128MB. Plan8MB each/64MB aggregate,256 plans; inventory/ledger20,000 rows; totals must remain safe integers. Unknown/deep/oversized structures fail before apply. Matching is bounded but can be quadratic; this offline CLI is not a large-ledger performance benchmark.

Private reports are derived files written after the authoritative transaction. A report-write failure can occur after successful application; replay checks the durable receipt rather than charging twice. Filesystem ACLs, encrypted volume/backup protection, evidence retention/purge, external invoice access and operator authentication remain deployment responsibilities. No active evidence/receipt pruning is implemented; reaching a cap fails closed. Restore/rollback details are in RECOVERY-RUNBOOK.md.
