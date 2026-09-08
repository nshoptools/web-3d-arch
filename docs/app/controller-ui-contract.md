# Controller/UI followup — AppBridge 0.3
Implementation delta in 20260908-app-ui-contract-followup. Public API is
[API-EARLY.md](API-EARLY.md); typed mock/usage data is tests/app/ui-contract.examples.ts.
This is implementation, not independent or configured review.

## Proposal dismissal and concurrency
Dispatch {type:'proposal.discard',id:confirmation.retry.id}. Success consumes exactly
that pending proposal without changing domain revision, history, head or the visible
model. Geometry preview leases and source/conversion/export jobs are released/aborted
once. Unknown, consumed or superseded IDs fail STALE_CONFIRMATION without touching the
new proposal. Product switches and history pruning use the same public command.

The acceptance boundary is explicit: once proposal.accept starts processing the ID,
discard returns APPROVAL_IN_PROGRESS. It cannot claim to undo an accepted storage
commit or a download. The UI should keep the pending state and wait for acceptance.
Existing job.cancel and project/auth invalidation remain available for in-flight work;
late cleanup releases the same resource once. No adapter acceptance or conversion
runs when a proposal is merely closed.

## Visible revision
ProjectView.visibleModelRevision identifies the retained model’s domain revision.
visibleModelStale is true only when a retained model differs from the current project
or revision. A pending preview is not visible. No retained model => null/false.
Opening a project clears the retained model and resets step 1. Successful promotion
sets step 2. Step navigation, save and viewport reattachment do not revise the domain.
Undo may restore equal design content at a newer revision; the older lease stays
explicitly stale until rebuilt. Failed/stale/cancelled builds retain the prior lease.
attachViewport replays that lease, updates capabilities, and its detach is idempotent.

## Scoped export gates and adapter responsibility
Formats declare prerequisite committed-source, renderer or matching-model. Legacy
omission requires matching-model. The public rescue option uses project-bytes.
Unknown declarations are disabled and their invalid prerequisite is not exposed.
The snapshot and command use the same gate implementation and reasonCode:
PROJECT_REQUIRED, PROJECT_LOCKED, NO_SNAPSHOT, STALE_REVISION,
UNAPPLIED_MESH_EDIT, UNSUPPORTED_EXPORTER. Registry corruption fails closed.
A runtime prerequisite change is EXPORT_REQUIREMENT_CHANGED.

A source serializer receives frozen committed state, copied retained asset bytes and
model:null. The controller checks source/raw/current raster byte references. The
serializer still owns committed-region validation, source-kind support, migration,
serialization and approximation consent. The test source pass-through exporter is
explicitly a test double, not a production SVG serializer or proof of region topology.

Renderer formats require a live viewport.webgl capability and an enabled exporter.
They may capture an older displayed revision; model.ticket.revision identifies it and
must not be relabelled as the current design. Export ticket still identifies the
current controller operation. The adapter must capture a complete renderer frame
and bind its output to that ticket. This delta supplies no production PNG encoder.

Mesh formats require the visible lease of the exact current project/revision and
applied mesh edits. Format-specific serialization/assembly/profile/material gates
remain the adapter’s responsibility; this change does not certify EXP-02 as a whole.
Existing Rust STL/native leases are borrowed; no mesh JSON or replacement mesh occurs.

Every async export rechecks job/epoch/access and the same format prerequisite/readiness
before delivery. A project change or detached renderer during work rejects publication.
Online assertion mode still performs fresh authenticated same-origin preflights;
discard and presentation updates grant no access. Rescue uses existing authorized local
bytes even after edit-lease expiry, while a missing/locked rescue path has a readable
reason. Unknown-version raw-rescue handling remains unchanged.

## Parent integration
Integrate the alignment manifest first. This delta’s adapters.d.mts preimage is the
flat-receipt/SourceContext version; sources.mjs and source-approval.mjs are not changed.
Apply the focused kernel-export-composition.patch to the existing wrapper: enumerate
extension formats with the full context even when model is null. Its full preimage
and exact method before/after are in kernel-export-composition.json. If the parent
has added source hooks to that file, preserve them and apply only the checked method.
Application composition/UI entry is not replaced. Wire supported codecs as extensions;
the controller never advertises support on their behalf.

Opus owns the UI/mock edits. Merge its visibleModelRevision/visibleModelStale fields and
discard dispatch with this contract, using the typed examples. EditorGesture already
fences editor settings/material edits by projectRevision. UI must capture both
projectRevision/sourceRevision at pointer start and keep those values until submit.
A stale gesture is rejected before calling the editing Worker, not rebound to new
brush/material settings. No UI components or pixel algorithms were changed here.

## Verification limits
Browser evidence uses actual IndexedDB/OPFS selection, backend HTTP, Three and editing
Workers. Analytical geometry, source passthrough and DOM PNG export are named test
adapters. These tests do not prove native kernel accuracy, print fit, hardware/slicer
qualification, physical crashes, all export formats, or the final UI5 application.
The parent’s intermittent Chromium editing Worker ERR_BLOCKED_BY_RESPONSE investigation
is independent; these checks cannot assign its cause.

Parent also reported Chromium project.create IndexedDB UnknownError in a separate alignment harness with long Windows profile paths. This run's final Chromium checks passed without that error; no controlled short-profile comparison was needed here. Neither path length nor a product/policy fault is adjudicated by this evidence.
