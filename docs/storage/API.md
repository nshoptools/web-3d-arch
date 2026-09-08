# Storage candidate API — STO-01 / ACC-04

Browser ESM entry: src/storage/index.mjs. No runtime dependencies. Use a secure
context with WebCrypto and IndexedDB. This module runs in the browser host; it
does not call an auth provider, backend, geometry core, Worker or UI.

## Open, access and scope

~~~js
const store = await openProjectStore({
  userId: 'stable-user-id', deviceId: 'stable-device-id',
  now: () => trustedUtcMilliseconds,
  policy: { backend: 'prefer-opfs', fallbackWhen: ['unsupported'] }
});
await store.unlock({
  userId, deviceId, authVersion: 1,
  verifiedAt, expiresAt, verified: true
});
~~~

IDs are bounded ASCII stable IDs (letters, digits, dot, underscore, colon, dash),
not emails or credentials. now MUST combine a server UTC anchor and monotonic
time during a session, and check wall time on reopen. The caller verifies the
signed lease before setting verified:true. The adapter is not an auth verifier.
Lease interval must be positive and <=24 hours. Wrong user/device, unverified
lease and authVersion downgrade are rejected.

DB and lock namespaces depend on the SHA-256 of the user ID, not engine/domain
versions. Assets deduplicate only inside this namespace. User/device/authVersion
and maximum observed clock fence writes. Only hashed device key + numeric
clock/auth watermark persist; lease/token/provider credentials/cookies do not.

status() is synchronous, updates the in-memory maximum clock and reports
active/rescue/locked plus writeBlocked/capabilities. Public loads, list, rescue,
unlock and commits persist observed clock before returning data. A crash before
that small transaction completes can lose the newest observation; the externally
verified lease expiry is never extended. Rollback >5 minutes or expiry switches
the session to sticky rescue mode until external verification/unlock.

lock() immediately aborts operations, advances the session epoch and clears
the in-memory lease. close() also closes the IDB connection. Neither deletes
local bytes. After explicit lock, a matching externally verified identity must
unlock before rescue. An expired matched lease grants rescue only. Private and
shared logout use the same retain-and-lock primitive: shared-device backup,
two-step permanent delete and UI/Worker/cache cleanup are caller responsibilities.
There is deliberately no purge or provider-token persistence API.

Policy:
- backend: prefer-opfs (default), opfs (require), idb (explicit fallback).
- allowIDBFallback:true; fallbackWhen:['unsupported'] by default. Optional quota
  or verification-failed categories require an explicit caller policy.
- Explicit IDB policy does not write-probe OPFS; it opens an existing OPFS namespace only for reading legacy references.
- No automatic backend change in the middle of a commit. Existing object rows
  retain their original backend and are always hash-verified when read.
- requestPersistence:false by default. An opt-in persist() request reports the
  actual result; it is not a storage guarantee.
- coordination uses Web Locks if available. cas-only is also supported/tested.
  CAS remains mandatory in either mode.
- A quota/permission failure blocks subsequent writes on that instance. Reopen
  explicitly after addressing capability/quota policy. Rescue remains available.

## Commit and recovery

~~~js
const result = await store.commit({
  projectId: 'project-1',
  transactionId: 'idempotent-operation-id',
  expectedRevision: 0,          // no project exists
  engine: { id: 'geometry-core', version: 'pinned-version' },
  domainSchemaVersion: 1,
  document: { state, history }, // pure JSON rebuild data; caller validates domain
  assets: [
    { kind: 'source', bytes: originalSourceBytes },
    { kind: 'dependency', hash: existingHash, byteLength: existingLength }
  ],
  // optional explicit source/dependency inventories:
  // sources: [hash], dependencies: [hash],
  retainManifests: []           // <=41 unique committed manifests of this project
}, { signal });
~~~

Aggregate asset bytes are bounded before copying. Each supplied view is copied before the first asynchronous boundary. Manifest
canonical JSON sorts object keys, asset hashes and source/dependency inventories.
SHA-256 is WebCrypto. Numeric JSON that cannot retain its decimal value is refused;
a raw VN decimal string such as "001,700" remains a string. Duplicate JSON keys,
prototype keys, accessors, cycles, sparse arrays, nonfinite values and credential
field names are rejected. Exact envelope keys and resource budgets apply.

Asset inventory: source/dependency/derived/history, hash, byteLength. A source or
dependency role must appear in the respective manifest reference list. Identical
content has one inventory entry; it may appear in both reference lists if needed.
Dependency bytes include pinned fonts/profiles/etc supplied by the parent. The
adapter does not invent engine capabilities, validate geometry, or produce mesh.

Commit order:
1. Begin/resume a fenced journal, log a fresh location before writing.
2. Put bytes, close handles, read back length+SHA, pin the immutable object.
3. Put immutable manifest bytes in IDB and verify them.
4. Recheck assets; publish head, index, journal ack, pins/references and auth
   watermark in ONE IDB transaction with expectedRevision CAS.
5. Only after IDB complete, acknowledge and run reference-safe cleanup.

Head schema v1 holds currentHash, previousHash, current/previous history roots,
revision and transactionId. Storage head revision and the domain state's revision are separate clocks (the initial saved domain revision0 has storage head revision1); expectedRevision always comes from head. Previous is the generation that was actually verified:
after recovery from a corrupt current generation, the verified previous remains
the next fallback. No OPFS+IDB cross-API atomic transaction or rename is claimed.

Result includes ok, manifestHash, head, ack, cleanup. Ack binds transactionId,
generation, stepId:'head.committed', hash and status. validateAck rejects stale
steps/generations. Same transaction ID and same payload retries return its original
ack with currentReadRequired:true (it is historical, not a fresh byte-health claim); changed payload is TRANSACTION_ID_REUSED. Retry after an uncertain result
with the SAME transaction ID and payload. Otherwise read head first.

A post-commit checkpoint/cancellation can prevent an acknowledgement even though
the head is durable to the browser's completion semantics. Do not infer rollback
from a rejected promise. Inspect head/journal or retry idempotently. Cleanup
failures after commit return cleanup.status:'pending' and can be retried.

CONFLICT retains both the committed head and the candidate manifest/pins.
pendingTransactions({projectId,rescue}) lists preparing/staged/conflict journals.
exportRescuePackage(store,id,{transactionId}) rescues a selected conflict candidate.
discardPending(transactionId) explicitly fences that candidate, releases pins and
cleans eligible bytes. It refuses committed transactions. No silent last writer wins.

load(id) returns empty, editable, read-only or unrecoverable. Each editable result
contains verified original bytes and manifest, current headRevision and
recoveredPrevious. Failed current length/hash/missing reads fall back to previous.
A concurrently changing head is retried; repeated change yields READ_RETRY rather
than reporting a stable corruption result. storage verification is distinct from
domain:'validator-required', engine/geometry/fit:'unverified'.

loadRetainedManifest(id,hash) requires a current/previous/history root. listProjects()
uses the atomic index. cleanup() may be invoked again; it retains current, previous,
both history sets, live/conflict journals and pins. Unknown/corrupt manifests or
unknown heads make cleanup conservative. Cleanup never opens an indexed file for
writing. Aborted journal file descriptors remain so late fenced writers can be
collected by a later cleanup; they do not authorize head publication.

## Rescue ZIP and import

exportRescuePackage(store,id,{transactionId?,signal?}) returns bytes, sha256,
metadata and format:'zip-store-v1'. It works in rescue mode with an expired matched
lease. Includes known raw manifest metadata, all discoverable verified bytes of
current/previous/history and optionally a conflict candidate. It marks missing,
corrupt or unknown reference coverage explicitly. Corrupt raw manifests are placed
under unverified/; corrupt assets are not labelled verified or imported.

inspectRescuePackage(bytes) checks ZIP bounds/paths/CRC and known metadata/schema,
declared file hashes, source/dependency completeness and deep JSON budgets.
Unknown package/manifest/head/domain versions return read-only with exact raw
package bytes; they are not normalized or migrated in place.

importRescueCopy(store,bytes,{projectId,transactionId?,signal?}) requires a new
destination ID and uses expectedRevision:0 CAS. It verifies the entire known
package before durable writes, imports the selected manifest, changes scope only
as an explicit copy, and pins the ORIGINAL ZIP bytes as a dependency backup.
Source project head/manifest is untouched. Failed import never advances an existing
head. If an existing dedup object is provably missing or has wrong size/SHA and the
caller supplies bytes of exactly the expected hash, import can repair its logical
mapping to a NEW closed/verified location. The original bad file is never opened
writable. Existing references/pins retain the same expected content hash; the old
bad location is collected only once unindexed. This may restore that original
project's readability before the destination head publishes, without changing its
logical source content, state or revision. Permission/unknown IO failures are not
treated as evidence of corruption. Incompatible object metadata remains gated.

Limits: 128 MiB input ZIP, 512 MiB expanded sum, 10,000 entries, 128 MiB per entry,
32 MiB JSON, depth64, 200,000 JSON nodes. STORE/method0 ZIP only in this candidate:
deflate, ZIP64, encryption, descriptors, symlinks and multidisk are explicit
unsupported/rejected. This is a rescue project format, not 3MF/general ZIP support.

Future IDB versions with the known project stores can open for verified read/raw
rescue only, with write probes and clock writes disabled. Unknown DB layouts are
UNSUPPORTED_DATABASE_LAYOUT, retain the DB and need a separate version-specific
rescue adapter. They are never upgraded/downgraded automatically.

A STORE rescue ZIP must fit the 128MiB package cap, including all retained
generations and metadata. Larger inventories fail explicitly with ZIP_BUDGET.
store.rescueInventory(id,options) exposes the scoped verified bytes/raw metadata
under the same expired-lease rescue gate; a multipart/streaming writer is a parent
integration capability. The inventory is eager in memory in this candidate.
Use status().canEdit for lease eligibility, together with database readOnly,
writeBlocked and the loaded project's status when deciding whether to enable edits.

## History and parent integration

snapshotReference(state,{assetHashes,manifestHash}) uses SHA-256 of the whole
domain state EXCEPT its top-level revision. It keeps projectRevision separately.
All other fields, including per-product overrides/source/settings, are hashed.

createHistory(reference,{assets:[{hash,byteLength}],budget}) creates a v1 ledger.
planHistoryAppend returns a hashed-branch proposal, redo branch removal, budget
evictions and requiresPruningAcceptance. acceptHistoryAppend recomputes the
proposal and refuses stale/tampered plans or unaccepted pruning.

planHistoryMove(history,'undo'|'redo') is a restore proposal, not a domain mutation.
restoreDomainSnapshot(current,targetSnapshot,plan,{validateDomain}) requires the
parent's real domain validator. It verifies the current content AND revision,
validates the retained target, assigns revision=current+1 and refuses a validator
that changes the target content. acceptHistoryMove verifies the original ledger
branch/plan and matching applied snapshot before returning a proposed next ledger.

Integration order:
1. Load current document/head. Prepare the history proposal.
2. Read and verify the retained target snapshot; use validateDomain:validateProject.
3. Compute candidate domain + next history in memory with the two helpers.
4. Commit document:{state:candidate,history:nextHistory} and ALL referenced snapshot/
   source bytes together, using the original storage expectedRevision.
5. Only after committed ack promote both domain and ledger in the parent.
   Rejected/CAS-conflicting operations retain the original in-memory pair.

Do not wrap strict undoTransaction with stale revision rewriting. The adapter
restores validated content and explicitly separates content identity from commit
revision. Three undo+redo steps with the actual main domain validator are tested.
A new edit after undo discards its redo branch in the proposal; another branch or
pending plan is rejected by history hash/revision plus final storage CAS.

Snapshots are references, not embedded fake history mutations. The parent must
provide immutable snapshot bytes/source references. Add their actual lengths to
the budget catalog. retainedHistoryManifests returns optional prior committed
manifest roots to pass to commit. Do not embed a manifest's own hash inside its
own document; use immutable snapshot assets or prior committed roots.

Budget target:20 transactions, 24 MiB serialized history metadata + deduplicated
incremental asset bytes. Current valid snapshot/assets form the protected baseline
and are not evicted. Recovery previous-generation and pending-conflict storage
are additional durability obligations; the history budget is not a global quota.
Pruning needs explicit acceptance. The helper returns proposals only, never
executes an undo command or claims geometry/fit validation.

## Cloud seam

CLOUD_REPLICA_CAPABILITY remains unsupported. planReplicaPublication validates
a conditional ETag proposal or returns both copies on mismatch. There are no
network calls, credentials, backend authorization, mirror or provider operations.
The backend worker can implement immutable object put/get/hash + conditional head
publication and owner scope behind this seam. Web Locks cannot replace remote CAS.
