# Image pipeline runbook and acceptance
Candidate root work/ai-image-pipeline. Backend public API is IMAGE-API.md; codec/quality limitations are IMAGE-CODEC.md and IMAGE-PROVIDER-EVIDENCE.md. Source/geometry/controller integration remains with parent.

## Run portable tests
From repository root in a fresh writing shell:
~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId YOUR_AUTHORIZED_RUN
$ImageCandidate = Join-Path $env:PROJECT_ROOT 'tmp/reviews/codex/runs/20260908-ai-image-pipeline-wave1/work/ai-image-pipeline'
& (Join-Path $ImageCandidate 'tests/server/run.ps1') -Seat codex -RunId YOUR_AUTHORIZED_RUN
~~~
After promotion, set ImageCandidate to PROJECT_ROOT; same command/RunId works. The runner uses Node24.19, syntax checks, --test-concurrency=1, --test-timeout=120000, TAP and before/after code hashes. Output always follows the supplied room. Disjoint remote tests resolve frozen common/storage helpers from this run inputs; promoted tests resolve main's actual helpers. Focused node tests are image-codec, image-http, image-adapter and image-remote under tests/server.
No browser engine/profile is launched in B-03. File binding is tested with real Node File/Blob; actual browser integration remains parent evidence.

Only unmodified pinned jpeg-js decoder is needed; source/license shipped in src/server/codecs, no npm install or native build. Built-in Node zlib/worker_threads/sqlite are used. jpeg-js decoder carries Apache2.0 header (notmasteryet2011); release LICENSE is BSD3-Clause (Eugene Ware2014), both included. Third-party content and SHA are listed in image-source-pins.json.

## Maintenance / restore
Existing offline commands remain, under the existing exclusive writer.lock. With previously configured own-run BACKEND_DATA_DIR, BACKEND_KEYS_FILE, BACKEND_ORIGIN (no real values supplied by this candidate):
~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId YOUR_AUTHORIZED_RUN
node (Join-Path $ImageCandidate 'src/server/cli.mjs') maintenance
~~~
Maintenance calls ai.prune, expires unbound30minute/reference retained90day original+thumbnail bytes, keeps quota-charged replay metadata and unsettled accounting. It does not contact AI. Do not delete a legitimate service lock to run maintenance/recovery. No takeover mechanism added.
Use existing backup/restore and recovery-status/plan/check/apply CLI from RECOVERY-RUNBOOK.md. Schema5 backup includes image originals/derived thumbnails, no vault key material; restore invalidates all reference send expiry and all sessions, preserves monetary/user/key-version identity and B-05 hold. Preserve key management outside DB; never restore absent keys from a recovery bundle.
Schema4 binary cannot open schema5. Do not drop image/recovery tables to roll back; use a compatible retained backup/binary with unresolved hold. Real ACL/key-backup/backup purge/volume monitoring/RPO/RTO remain unverified deployment work.

## Acceptance mapping
| Requirement | Concrete evidence |
| --- | --- |
| SRC-03 original reference and real returned image | immutable staged File bytes/SHA; JSON image edits exact source URI; genuine PNG/JPEG pixels+private downloads |
| LIM-01 and decoded-resource limits | width/height/pixels/scanline bounds before large allocations, malformed/truncated/CRC/deflate/entropy tests, positive4.194304Mpx decode, worker deadline/cancel/concurrency |
| AI-01 own connection | two members and owner, separate synthetic encrypted keys; GET preflight then single POST per approved job; no owner fallback |
| AI-02 scope and transport | Host/Origin/CSRF, owner/job join, private thumbnails/tickets, source/hash/context tamper refusal, original allowlist/DNS/redirect regression tests |
| AI-03 quote/reservation/dedup | full reference descriptor in canonical payload/quote, reference base64 overhead in byte admission, exact idempotent reuse, quote expiry during metadata GET, final source/key/session checks |
| AI-03 actual/recovery | known95micros charged against old60 cap retained, invalid image retains charge, byteCap/period survives delete+restore, inherited B-05 no-release/partial-plan/evidence/replay/lock regressions |
| AI-04 late result isolation | File read/upload/prepare/download epoch and project guards; partial HTTP upload after logout publishes no source; late paid result decoded for original owner/tray |
| Honest unsupported subset | PNG16/interlace/animation/custom color metadata; JPEG progressive/CMYK/EXIF/ICC/non-JFIF color; remote provider URL outputs explicitly unavailable |
| Source provenance | bytes unchanged before/after decode; full original stored, thumbnail separate; source hashes/model/alias/adapter/request/job identity retained |

These are implementation self-tests, not independent review, deployment readiness, invoice truth, image quality or geometry/print qualification. Inherited current Codex setting only; model/effort and fast/service tier are not independently attested. No children, outside-room writes, live credentials/inference or messaging beyond the authorized parent handoff.
