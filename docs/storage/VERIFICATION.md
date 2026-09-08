# Verification plan and evidence semantics

Runner: tests/storage/run-browser.mjs. Installed Playwright is loaded read-only
from .toolchain/app-runtime; browser binaries from .toolchain/playwright.
No install, download, backend or remote network dependency is involved.

An exact in-memory URL whitelist serves candidate src/storage/*.mjs, harness.html,
harness.mjs and cases.mjs only. Host is 127.0.0.1 with ephemeral port. GET/HEAD only;
query/traversal/repo-root/.git requests are denied. Browser routes block other
origins. The runner does not serve the repo/tmp tree. Each launch uses a fresh
own-run persistent profile, private temp/home/AppData/LocalAppData/download path.
Evidence files remain under own-run/evidence; the server origin is not published.

Evidence JSON includes source SHA-256 of the exact served buffers, actual browser
version/user-agent, actual OPFS write-close-read probe outcome, IDB estimate and
capability flags, each test result, duration, failures and exit code. JSONL is
incremental/resumable. Runtime edits after launch cannot alter that run's buffers.
A capability-unavailable path is recorded separately, never skip-as-pass.
Runner exits 0 for assertions/capabilities completed, 1 for failures and 2 for an
otherwise passing run with unavailable requested capability.

## Cases and coverage boundaries

| Requirement | Evidence | Boundary |
| --- | --- | --- |
| Save/open/rebuild identity | Canonical manifest re-encode/hash; original source+JSON reopen | Fixture document rebuild, no geometry engine |
| Asset loss/corruption | Real OPFS remove/write or IDB Blob delete/put; verified previous fallback | Deliberate corruption, no filesystem crash |
| Manifest corruption/schema | Real IDB manifest bytes/version/sidecar/head edits | Unknown data raw-preserved, no in-place migration |
| Ordered publication | Hooks across asset write/close/verify, manifest stage, head transaction | Fault checkpoints only |
| Durable previous | Four+ generations, source assets, prior history roots survive cleanup | Browser complete semantics, no power-loss durability |
| Abort/quota | Real IDB transaction.abort before/after head put; AbortSignal/lock; quota DOMException after real write | Quota is injected, no full-disk proof |
| Journal recovery | 20 checkpoint-fault/resume iterations per available browser/backend | Not AT-015.1 physical-crash acceptance |
| Page close | Close actual page at asset.written and after head committed; another tab opens | Controlled document destruction, not browser/OS kill |
| Writer coordination | Two independent tabs, CAS race winner+retained loser, Web Lock busy/handover | Local scope only |
| Identity | Two user namespaces, wrong device/lease, expiry rescue, persisted rollback/auth fences, late result after logout | External signature/server auth not implemented |
| Rescue/COW import | Known raw metadata, all verified bytes, corruption issues, copy namespace, original package pinned | ZIP STORE format only |
| Input budget | Deep JSON, decimal loss, duplicate/prototype/secret keys; ZIP CRC/path/declared size | Boundary rejection before allocation, not large-resource benchmark |
| Undo/redo | 3 edits +3 undo +3 redo and stale branch; document+ledger in one real commit | Parent owns actual snapshot source and UI promotion |
| Actual domain integration | Node test imports main src/domain read-only, reproduces strict failure then validates candidate restores | Main domain file hashes pinned as evidence; no modifications |
| History budget | 20 transactions, 24MiB incremental/dedup, pruning acceptance, protect current | Large byte sizes are synthetic metadata in pure-helper test |
| Cloud conflict | ETag proposal or both copies, no silent LWW | Provider remains unsupported, no network/auth test |

## Acceptance mapping

- STO-01 / AT-015.1: pipeline/recovery/fault checkpoints implemented and exercised;
  physical crash quota across three engines/backends remains unverified.
- AT-015.2: wrong generation ack, missing source, cleanup interruption, retry tested.
- AT-015.3: user namespaces, CAS and same schema-independent writer lock exercised.
- DAT-01/02 / AT-016.1: manifest+original-source rescue and separate ZIP reader;
  STORE format, actual geometry rebuild and mirror remain gates.
- AT-016.2: CRC/hash/schema/path/bounds/COW/no partial head tested.
- AT-016.3: injected quota and local recovery only; mirror/provider unavailable.
- ACC-04 / AT-031.1: lock retains private bytes; correct user can reopen.
- AT-031.2: safe retain-and-lock primitive only; shared-device backup/deletion UI
  and two-step purge are intentionally not implemented by storage worker.
- AT-031.3: pending commit aborted/fenced by logout/auth version; other namespace
  never receives the late result. Worker/UI cache lifecycle is parent integration.
- AT-031.4: expired matched lease rescue, rollback >5min and persisted max clock;
  external signature, online login and API rejection are backend boundaries.

Prepare a session with `tools/development/env.ps1 -Seat codex -RunId <session-id>`.
Run `node --test tests/storage/domain-adapter.node.test.mjs`, then
`node tests/storage/run-browser.mjs` and `tests/storage/verify-zip.ps1`.
Detailed reports are generated into that session's `evidence` directory; they
are outputs, not inputs needed to use this module. Integration status and known
gates are tracked in [the development plan](../development/PLAN.md).
