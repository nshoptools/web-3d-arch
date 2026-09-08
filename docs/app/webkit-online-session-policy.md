# WebKit session behavior and an explicit online-only release policy

Status: measured capability plus policy proposal for parent integration, dated 2026-09-08. No production auth/controller changes are included in this portability delta.

## Observed behavior

The installed Playwright WebKit 26.6 reports NotSupportedError for the actual WebCrypto Ed25519 import/verification path used by src/app/http.mjs. Chromium 153.0.8010.12 and Firefox 155.0 verify the fixture's backend-signed lease with WebCrypto. This is a runtime result for these binaries, not a permanent claim about all Safari/WebKit releases.

The bounded controller browser run explicitly enables allowAuthenticatedLeaseResponse in its test fixture. Its WebKit evidence records signature unsupported and trust authenticated-same-origin-response. This is an authenticated HTTPS test response policy; it is not successful Ed25519 verification.

The default production constructor leaves allowAuthenticatedLeaseResponse false. Source inspection of initialize and verifyOnlineLease establishes that it fetches authenticated /api/v1/me, binds the CSRF/user context, requests POST /api/v1/offline/lease, and verifies the lease before opening/unlocking storage and changing the session to signed-in. On an unsupported signature algorithm it returns LEASE_SIGNATURE_UNSUPPORTED, leaves a newly constructed session checking with user null, and never opens the store. Therefore the default capability failure blocks normal online initialization as well as offline editing.

The explicit opt-in is considered only for NotSupportedError and only by initialize on an HTTPS origin. A signature that verifies false is LEASE_SIGNATURE, not an eligible fallback. Payload type, user/device/authVersion and the bounded server-time interval are still checked. API fetch remains same-origin with same-origin credentials, no-store, redirect:error and response identity checks.

## Why the existing opt-in is insufficient for online-only release

The returned storage lease has the ordinary verified:true shape and a duration up to 24 hours; its trust provenance is retained as a controller capability, not enforced as a different storage grant. setOnline(false) can produce session offline-lease. editingAllowed/guard use storage lease state rather than network reachability. resumeOffline also accepts an externally verified lease.

Consequently, merely enabling allowAuthenticatedLeaseResponse or hiding offline UI would still allow local mutation while offline. The current browser fixture exercises this storage/controller behavior intentionally; its passing tests do not certify an online-only production policy. Never label an unsupported signature as cryptographically verified.

## Minimal proposed policy

1. Make authenticated-online an explicit deployment policy, distinct from signed-offline capability. Keep the existing default fail-closed. Use a runtime capability result, never a user-agent allowlist. With verified crypto, the initial release may still deliberately disable offline editing; crypto support alone does not enable a product feature.
2. Accept the unsupported-algorithm assertion only inside a fresh, successful same-origin HTTPS session exchange: authenticated GET /api/v1/me and CSRF-protected POST /api/v1/offline/lease. Pin userId, deviceId and authVersion to that live session and controller epoch. Do not accept this trust mode from local files, settings, query parameters, cached responses, error bodies, imported JWKs or a caller's verified boolean. Invalid signatures, malformed payloads and identity mismatches remain rejected.
3. Enforce online-only at the controller/storage mutation boundary, not only in UI buttons. A successful no-store authenticated session preflight must precede project creation/import/open-for-edit, parameter/history/source operations, geometry/edit jobs and the final local publication of a long-running result. Check the same identity/authVersion and live epoch again before publishing. Protected backend calls already require server authentication. Any unreachable/401/identity-changed result must fail closed, cancel work and preserve the previous committed head. A network-online event or navigator.onLine alone does not prove reachability; a successful preflight authorizes that operation at its response time, not an indefinite online session.
4. On offline/uncertain authentication or user/authVersion change, invalidate/dispose the active controller, abort pending jobs and API work, and invoke the actual adapters' reset hooks to terminate private Workers, release leases and drop private SAB/URLs. Gate new operations until a fresh successful online initialization; do not just call setOnline(false). Await the private reset barrier before another identity is enabled.
5. Do not persist or restore an authenticated-online grant as an offline lease, and do not route it through resumeOffline. Keep provider credentials/tokens/cookies out of the project store. Existing rescue export for the authorized owner's verified local bytes can remain a separate read-only recovery path, including after expiry; it must not unlock edits or infer another user from imported metadata.

These are parent integration requirements, not implemented safeguards in the current flag. If the online mutation/publication guard and private-session teardown are not present, keep WebKit's unsupported-signature state blocked rather than ship the flag as an online-only solution. A reviewed compatible signature-verification implementation would be a separate future option; this delta installs none and provides no offline trust bypass.

Suggested acceptance cases for the parent release gate: unsupported Ed25519 + fresh authenticated response enables only online operation; loss before a write and during a pending build cannot advance the head; reconnect with a different user/authVersion discards prior private state; cached/modified lease cannot unlock or resume; a false signature still fails; read-only rescue does not enable history/edit/AI. Test the actual bootstrap guard, not only the underlying boolean option.

## Other measured capability

WebKit's fresh OPFS write-close-read probe returned zero bytes for expected bytes [7,3,1], with OPFS_PROBE category verification-failed. The explicit prefer-opfs fallback policy selected real IndexedDB, and the controller flow passed there. This is unrelated to auth trust. Chromium and Firefox selected OPFS. There is no user-agent-based or mid-commit fallback and no claim of physical power-loss proof.

The SHA-pinned browser-results.json and stage.json referenced by the portability handoff contain exact outcomes and source versions. The parent workspaceStep navigation repair is separate; this policy document does not alter its controller/jobs/projects implementation.
