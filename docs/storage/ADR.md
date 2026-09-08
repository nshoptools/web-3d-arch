# Storage decisions and integration boundaries

Adopted for the integrated storage module on 2026-09-08. Component test evidence
does not replace independent review or full application acceptance.

1. **IDB publication point, OPFS immutable data.** IDB owns the head/index/journal
   transaction; OPFS files are closed and read/hash-verified first. A logical
   content hash maps to a fresh hash.UUID physical file. UUID prevents any retry
   from truncating the committed file bearing that hash. This also avoids relying
   on a cross-API rename. IDB Blob fallback follows the same immutable-object
   contract. IDB strict durability is a requested hint, not physical-crash proof.
   API semantics: [IndexedDB standard](https://w3c.github.io/IndexedDB/),
   [File System standard](https://fs.spec.whatwg.org/).

2. **Local coordination remains optimistic.** A user/project Web Lock, independent
   of schema/engine version, reduces overlapping writers. The publish transaction
   always checks expectedRevision and base-head identity. Journal fences prevent
   resumed/discarded owners from publishing late results. Remote ETag/revision
   checks remain a separate provider requirement.
   [Web Locks standard](https://w3c.github.io/web-locks/).

3. **Probe-driven fallback.** The application prefers OPFS with the explicit
   policy `fallbackWhen:['unsupported','verification-failed']`. The installed
   WebKit Windows engine returned zero bytes after an OPFS write/close; its IDB
   backend passed the same assertions. A fresh write/read/hash probe determines
   capability; browser-name detection is not used. Quota, security, permission
   and general IO errors do not automatically switch backends. Choose a backend
   before publication, never halfway through it; reopening preserves each
   object's original backend. Real Safari/private-mode behavior is unverified.

4. **Preserve current, previous, history and conflict candidates.** Verified
   previous stays protected after recovery. Current and previous history roots
   keep their source bytes. Conflict pins remain until caller exports/resolves/
   discards that candidate. Unknown/corrupt schema or reference metadata stops GC.
   This can consume quota; it is safer than guessing that a source is disposable.
   An explicit future repair/rescue/COW workflow can release that conservative hold.

5. **Version refusal is lossless.** Manifest/head/domain envelope v1 is supported.
   Other versions preserve raw bytes and remain read-only. Original ZIP is retained
   as a dependency on successful COW import. Compatible future IDB store layouts
   allow read/rescue without probing/writing; incompatible future DB layouts need
   a separate rescue adapter. No automatic source DB migration is attempted.

6. **Offline policy belongs to the external identity/clock boundary.** The caller
   verifies server signature, anchors trusted time, chooses device mode, clears
   UI/Worker/private caches and provides member suspension/auth-version changes.
   The store only gates current identity, lease interval/expiry, rollback and local
   epoch/CAS. Numeric clock/auth watermarks persist, credentials and leases do not.
   Namespace separation is an application boundary, not encryption or protection
   against someone controlling same-origin code/device storage. Nothing here
   authenticates API calls or immediately revokes an offline device.

7. **History restores snapshots with fresh revisions.** The parent reproducer is
   a strict transaction API limitation: undo B returns revision3; txA expects its
   historical after revision1. Rewriting txA would blur branch identity. Candidate
   history instead hashes all domain content except top-level revision, keeps
   revision as a separate guard, validates a retained snapshot with validateProject
   and publishes restored domain+ledger together. No call to old strict undo is
   faked. Parent must adopt or adapt this contract; no old/main domain files changed.

8. **History budget is incremental.** Deduplicate asset hashes; count serialized
   ledger metadata and additional historical asset bytes; protect current valid
   data. Evict oldest undo entries (or farthest redo tail when at start) only via
   a disclosed proposal. Current/previous committed generations and unresolved
   conflicts are outside the history budget; separate storage/quota policy is
   still needed. Ledger source size catalog is compacted to live references.

9. **Dependency-free rescue ZIP STORE.** Produces a standard ZIP readable by an
   independent reader. Deliberately supports a bounded rescue format using method0.
   Compression/ZIP64/encrypted/descriptors/multidisk/general ZIP/3MF remain outside
   the importer. Parent may choose a pinned ZIP parser/decompressor later and retain
   the same manifest/hash/COW/budget gates. No global or runtime dependency added.

10. **Journal retention versus delayed writers.** Aborted staging-file descriptors
    remain so repeated cleanup can collect late files created by a fenced writer.
    Committed journal records preserve idempotent acks. No TTL/compaction policy is
    implemented. Parent must set long-term journal retention without breaking
    idempotency or reference safety; storage usage measurement remains required.

11. **Data readiness is not geometry.** document is strict JSON rebuild data,
    engine is pinned metadata, source/dependencies are verified bytes. Domain
    validation is injected for history restore, and should precede ordinary saves
    in the parent. Engine availability, geometry, mesh, physical fit, hardware,
    backend authorization, cloud mirror and provider behavior remain unverified.

12. **Fault evidence has a defined scope.** Runtime accepts asynchronous named
    checkpoints outside IDB publication and synchronous checkpoints inside the
    publish transaction. The latter may abort the real IDB transaction; production
    passes no callbacks. Tests use real IDB/OPFS bytes, injected quota exceptions,
    checkpoint exceptions, controlled page close and reopen/resume. They do not
    simulate a power cut, killed browser process, OS eviction, physical full-disk
    condition or 20 physical crashes per browser/backend.

13. **Repair a proven corrupt dedup mapping using verified backup bytes.**
    A backup imported into a new project in the same user namespace may encounter
    the same hash already indexed to missing/corrupt bytes. Refusing every such
    existing object would make COW recovery unusable. When supplied bytes match
    exactly the expected hash/length, stage/close/verify a fresh location, atomically
    preserve references/pins while replacing only its mapping, and retain the old
    bad location until it is unindexed and eligible for cleanup. Original project
    heads and manifest bytes stay unchanged; their expected content identity is
    restored. No committed file is truncated. Repair can improve old-project
    readability before the new copy publishes; this is disclosed in the API.
    Unknown IO/permission failures and incompatible metadata do not auto-repair.

14. **Historical ack survives later byte corruption.** An identical committed
    transaction retry returns the original ack even if subsequent external loss
    makes the current project unrecoverable. It sets currentReadRequired:true.
    This resolves uncertainty about publication without pretending current asset
    health. A fresh verified load remains mandatory before using project bytes.
