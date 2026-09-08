# Implemented command and backend mapping

Base is same-origin /api/v1. ApiClient bounds decoded bytes, rejects API redirects/cross-origin URLs, sends same-origin cookies/CSRF and ETags, checks scoped X-User-Id, and cancels on identity epoch changes. Node tests call the actual pinned backend with controlled test-only IdP/provider fixtures.

| AppBridge path | Concrete action |
| --- | --- |
| initialize | GET /me, POST /offline/lease, verify lease, open/unlock per-user main storage, GET settings/policy/providers/credentials/budget/jobs |
| signIn | POST /auth/start, then validated same-tab HTTPS authorizationUrl navigation |
| signOut | POST /logout, clear private state/Workers/leases; optional confirmed injected purge |
| listUsers / inviteUser / updateUser | GET /owner/users, POST /owner/invites, GET deletion-impact when deleting, POST /owner/users/:id with one confirmed action |
| settings.update/import/reset | PUT /settings, POST /settings/import, POST /settings/reset with If-Match and explicit backend confirmations |
| policy.update | PUT /owner/policy with requested version as If-Match and document without server-owned version |
| connectAI / disconnectAI | POST or PUT /ai/credentials, POST /:id/check, DELETE /:id; exactly one user's credential, never provider/shared fallback |
| prepareImage | POST /ai/jobs using operationId as Idempotency-Key, explicit modelVersion/size/quality and current project revision; no billable submit |
| submitImage | POST /ai/jobs/:id/submit with exact quoteHash + consent, current project and unexpired quote |
| ai.cancel / ai.close-unknown | POST /ai/jobs/:id/cancel or /close-unknown with required reason; unknown reservations remain liabilities after tracking closes |
| queryAIJobs | GET /ai/jobs (+filters/cursor); fetch unresolved details and all active/unknown reservation pages. No invented aggregate spent value |
| ai.budget | PUT /ai/budget with If-Match, exact integer micros for per-operation/day/month |
| ai.apply-result | GET /ai/artifacts/:id, GET originating job, bounded download/hash check, then ordinary source job with current project/revision and confirmation |
| project.create/rename/step/product/parameter/material/text/editor/printer | Actual domain validation/content transaction; staged immutable assets + app history document, storage head CAS |
| history.undo/redo | planHistoryMove → restoreDomainSnapshot → acceptHistoryMove; increasing revision, real branch check, atomic persisted commit |
| proposal.accept / source.convert | Bound source/options/output/head/revision confirmation; conversion calls actual source adapter and retains original bytes |
| project.save/open/delete | Atomic save; verified load/recovery; recoverable tombstone retaining previous generation, no unsolicited permanent purge |
| preset save/delete/apply; emoji.favorite | Presets/favorites in per-user settings with ETag; apply validated project transaction |
| importFile source/mesh/font | Bounded original bytes → actual source adapter → typed immutable assets; mesh applies only when injected engine declares support |
| importFile project/settings/preset | Strict bounded parse/deep budget/version/schema checks; rescue package import is copy-on-write to a new project ID |
| geometry.build / editSource | Actual injected native engine / default existing editing Dedicated Worker; no pixel algorithms or JSON meshes in controller |
| selection.set / viewport.action / attachViewport | Actual viewport adapter, validated block IDs, placement proposal without manufacturing-coordinate mutation, remount replay |
| exportFile | Existing main rescue package implementation, settings export endpoint, or actual native exporter; file delivery injected, stale visible-model gate |
| pickMirrorDirectory | Immediate injected picker call during user activation, then guarded identity-bound handle acceptance |

No normal contract command is an empty successful stub. Source codecs, core geometry, fonts/emoji catalogs, printer qualification, format codecs, mirror/purge/file-delivery and replica transport remain externally bound capabilities. Reference images in AI requests are rejected until the backend actually supports them. Ambiguous multiple credentials are gated because 0.3 identifies only provider, not credential selection. The models extension exposes legalOptions and modelVersion; no opaque default is selected.

Project document envelope is web-3d-arch.app-document/version 1. Domain remains main schemaVersion 1. Unknown app/domain/storage versions retain raw bytes and reject mutation; no guessed migration. Rescue import retains manifest dependencies even when outside history, and original source/font/preview/raster references are included in the content-addressed store.

A storage acknowledgement failure is recovered as success only if a fresh verified load has the exact transaction ID and canonical document. Otherwise the old controller state/history/visible model remain, and conflicts are explicit. Cross-tab CAS prevents silent overwrite; cloud replica is separately gated and requires remote CAS plus both conflict copies.

Settings import/reset/update preserve the last committed visible settings on errors. Backend SETTINGS_CONFLICT durably stores current and incoming copies; settings.update additionally exposes returned conflict metadata in controller.settingsConflicts. Do not automatically retry uncertain settings mutations.
