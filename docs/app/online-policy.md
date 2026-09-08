# Authenticated online assertion policy — implementation wave1

This candidate targets AppBridge 0.3 and `arch-app-adapters/1`. It contains no UI, codec, geometry, backend, PNG-client or stylesheet replacement. Parent's transient `workspaceStep` behavior is retained.

## Deployment selection

`createAppController({leasePolicy:'signed-offline', ...})` remains the default. It verifies the Ed25519 signature with WebCrypto before opening/unlocking storage. The verified proof is branded in memory. `resumeOffline({user,verifiedLease})` accepts that actual proof object; a copied/imported `verified:true` record fails `OFFLINE_PROOF_REQUIRED`. A reload must reverify original signed lease data against the trusted server key and context before resuming. This delta does not implement new persistence of offline credentials.

An initial online release can explicitly choose `leasePolicy:'allow-authenticated-online'`. This first attempts the same cryptographic verification. Only an actual `NotSupportedError` from the Ed25519 import/verify branch permits the online policy. An invalid signature, malformed key, wrong identity or invalid interval cannot select it. The removed unsafe behavior is not aliased: `allowAuthenticatedLeaseResponse:true` fails `EXPLICIT_LEASE_POLICY_REQUIRED`.

For online mode, initialization must obtain /api/v1/me and POST /api/v1/offline/lease through this ApiClient, over the same HTTPS origin, within 30 seconds. Requests use credentials same-origin, no-store and redirect:error. Responses must have the exact requested URL, Cache-Control no-store and absent/zero Age. Private WeakMap receipts bind the two actual response objects to the ApiClient epoch and exact bound /me object. Plain JSON, copied response objects, synthetic response URLs and consumed receipts cannot mint a grant.

Online access uses a separate in-memory, nonserializable grant and a live authorizer. It is never passed to offline unlock and has no verified:true field. Storage records only its existing monotonic time/authVersion watermark, never the grant, session ID, signing material or credentials. The lower-level storage signed-lease interface remains a trusted-caller interface: standalone users of storage still must verify their supplied signed lease externally.

## Preflight and publication

Online preflight performs a fresh authenticated GET /api/v1/me; navigator.onLine and online events are hints only. User ID, device ID, authVersion, session ID, local controller epoch and server expiry bounds must still match. Requests time out after 15 seconds. The grant expires at the earliest signed-claim, idle-session or absolute-session expiry observed at initialization; it cannot silently extend itself.

Preflight occurs before queued local mutations, source/editing/build/export work, project open publication, and accepted long-job output. Storage also checks before writer work and after staged bytes/manifest verification, immediately before the atomic IDB head transaction. The existing synchronous access-epoch checks, expected-revision CAS and write-abort behavior remain inside that transaction. Network awaits do not occur inside IDB transactions. A rejected publication retains the prior committed head; unreferenced staged bytes can remain for journal/recovery cleanup.

An observed network error, HTTP 401, response-user mismatch, live authVersion/session/device mismatch or an offline signal revokes editing. The controller cancels jobs, releases model leases, clears private URLs/state and awaits adapter reset completion. New initialization waits on this reset barrier before issuing requests for a new identity. A reset failure fails closed; adapters must actually terminate private Workers/transports. They must not wait on the controller command that is invoking reset. `controller.dispose()` returns the barrier Promise.

This is a bounded online assertion, not proof of continuous connectivity. A physical disconnect or server revocation not yet observable after a successful preflight can race the next synchronous transaction. An already completed atomic commit is not rolled back when later loss is observed. The tests cover explicit fault checkpoints and actual request failures, not physical-crash or instantaneous-revocation proof. Trusted app/ServiceWorker/HTTPS deployment is part of the boundary; this does not defend against XSS or a user who controls browser code/storage. Worker termination and reference dropping are not secure RAM erasure.

## Rescue and activation

On loss/expiry/401 in an already authorized online session, the controller retains only the known current user's store, project ID and committed head for read-only rescue. Editing state, worker memory, previews and API credentials are cleared. Rescue exports verified persisted project bytes even after grant expiry; no network or offline bool is used to extend editing. Explicit logout, dispose, or a fresh initialize closes this retained rescue context before changing identity. No cross-user rescue unlock is added.

The mirror directory picker is called synchronously inside the user activation. Online preflight follows selection and precedes committing the result. No fetch is inserted before the picker. A mirror adapter must epoch-fence/reset its own pending picker so a late native resolution cannot restore a handle from an old session.

## Source approvals

See source-approval-api.md. Ingest receives a frozen current domain snapshot. Font metadata and original bytes are committed together. Explicit acceptance binds the original job control, candidate hash, head/revision and source hashes; an adapter may return only bounded receipt metadata. A second concurrent accept fails APPROVAL_IN_PROGRESS without cancelling the winner. Preflight and storage CAS remain mandatory after the hook.

The controller validates the common envelope. Raster/text adapters own their canonical receipt payload and geometry validation. A valid controller receipt is not a validated-mesh claim. A hook that runs before losing a cross-tab CAS may consume its native proposal token; reprepare rather than silently reusing that token.

## Known followup, deliberately outside this frozen delta

Parent's UI4 findings are preserved for the next bounded assignment: proposal.discard; per-format export prerequisites (committed 2D SVG and renderer PNG); ProjectView visible revision/stale; omit empty reasons and add disabled rescue reason. No corresponding contract/UI changes are included here.
