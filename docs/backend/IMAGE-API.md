# B-03 image pipeline API / integration
Implementation candidate, schema5, Node24.19+, ESM. No UI/controller/kernel changes. Preserve sealed B-05 schema4/accounting implementation when applying this additive delta.

## Routes and authorization
All routes use existing same-origin Host/Origin/CSRF, active membership, per-user HTTP admission, Cookie authorization and no-store/private headers. Owner role grants no access to another user's prompt/reference/artifact. Caller ownerId/URLs are not accepted. GET /api/v1/ai/reference-limits exposes arch-ai-reference/1 plus effective fixed image ingress limits.

POST /api/v1/ai/references takes exactly:
{uploadId:UUID,projectId:UUID,projectRevision:string<=128,mediaType:"image/png"|"image/jpeg",byteLength:integer1..8000000,sha256:lowercase64hex,base64:canonical padded RFC4648}.
Response201 {reference,reused:false}; exact duplicate200 {reference,reused:true}. Current session identity is server-derived; bytes, MIME, hash and project head cannot change under an upload ID. This stages a fully decoded original; no provider call, quote, credential check or spend occurs. One global upload request reader, 10,680,000-byte JSON request ceiling, existing30s HTTP deadline. Rejected decodes consume daily ingress allowance. Successful records reserve own storage for bytes+thumbnail+512 metadata bytes, one object. Deleted reference tombstones still consume metadata/object quota.

reference = {version:"arch-ai-reference/1",id:UUID,revision:1,sha256,byteLength,mediaType,width,height,projectId,projectRevision,expiresAt:UTCmilliseconds}.
GET /api/v1/ai/references/:id returns {reference}. /download returns ORIGINAL checked bytes; /thumbnail returns actual derived PNG. Reference reads need owning user; preparing/sending also requires originating session. Expiry stops new sends. Access after explicit deletion/purge returns410 REFERENCE_DELETED.
DELETE /api/v1/ai/references/:id accepts {revision:1,confirm:"delete:"+id}; idempotently purges original+thumbnail and invalidates future use. It never retracts a request already sent or releases a pending charge.

POST /api/v1/ai/jobs adds optional reference with the exact descriptor above. Absence preserves text generation behavior. Existing body/operationId/Idempotency-Key fields remain required. A reference must match source project ID/revision, current user/session, actual bytes/hash, codec stamp and expiry. Adapter model must explicitly advertise referenceImages.
Canonical job payload includes full descriptor; quote.reference echoes it or null. quote.dataToSend remains string[] and names reference ID/hash/bytes. Quote recipient switches to the exact adapter reference endpoint. quoteHash includes descriptor+expiry+model/adapter/pricing/limits. Quote expiry is the lower of10minutes and reference expiry. Changing an approved descriptor needs a new prepared operation and explicit approval.
POST jobs/:id/submit remains {quoteHash,consent:true[,acknowledgeAdditionalCharge:true]}. Submit, dispatch and final authorizeSend recheck reference identity and quote expiry. The final synchronous check runs after transport DNS immediately before creating the HTTP request. Reference deletion/expiry/session/key/policy changes during preflight prevent an edit POST. After ambiguous send, no replay; accounting stays pending per B-05.

GET /api/v1/ai/artifacts/:id joins artifact to its owning job AND user; verifies original and thumbnail SHA. Returns version arch-ai-artifact/1,revision1,dimensions,mediaType,sha256,byteLength,jobId,projectId,projectRevision,thumbnail descriptor and provenance {codec,payloadHash,providerId,modelId,modelVersion,adapterVersion,requestId}. It describes decoded pixels only; no geometry/fit claim.
GET .../download sends checked original MIME/bytes. POST .../download-ticket keeps existing five-minute signature bound to artifact/user/session/authVersion; GET signed URL still requires current authenticated owner cookie. GET .../thumbnail sends the real PNG, max256px.
DELETE /api/v1/ai/artifacts/:id {confirm:"delete:"+id} removes source/thumbnail only. Job, quote, payloadHash, original periods and monetary accounting remain.
Legacy valid artifacts without codec stamp are decoded lazily under the same worker limits on first retrieval. Invalid legacy blobs fail explicitly; they are never reported as verified. Successful lazy derivation adds thumbnail storage under own quota, with auth and original hash rechecked after await.

## Minimal existing app binding
src/app/remote.mjs only. AIImageRequest.reference remains File; no contract rewrite. prepareImage reads and hashes the real file only during prepare; uploadId uses operationId. A concurrent exact request shares the promise. Concurrent attempts with another File/options under that operation fail IDEMPOTENCY_CONFLICT. A retry after upload uses exact stable ID/hash; changed bytes/context conflicts server-side.
The file is never attached to job JSON; only its returned descriptor is attached. There is no base64 in settings/history/project metadata.
Registry supportsReference reads model.referenceImages; supplementary referenceOptions/referenceLimits are exposed. Only medium+1k/2k are offered for xAI references. Existing generation low/medium options remain. UI must use referenceOptions to gate reference controls; RemoteServices also enforces them before any upload.
Every asynchronous file-read, SHA, upload, job-prepare and final artifact-download boundary checks captured user/epoch/project revision. A late staged upload may remain until its ordinary expiry, but cannot prepare a job or publish a source after the head changes. Late paid results remain in the original job tray. No automatic source replacement.

## Persistent accounting and lifecycle
Schema5 adds image_references and artifact_images; artifact thumbnail cascades with artifact deletion. New table mutations advance B-05 recovery generation so previously planned accounting cannot apply over unobserved image/storage changes. Schema5 backup/restore is accepted; schemas1..4 migrate additively.
Restore revokes sessions and sets reference send expiry0, retaining original bytes until its retention deadline. It keeps B-05 restore hold/unknown submitted jobs/accounting identities and never imports missing key material. Reference-byte admission is stored in jobs.byte_cap and therefore survives original deletion, restored missing operations and B-05 recovery obligations.
Admission conservatively charges maxOutputBytes + canonical job JSON bytes + base64 reference length +1024 wire-overhead bytes. This is an infrastructure bound, not a token/image price. Stored original bytes and thumbnails count separately in user storage.
Unsubmitted originals expire after30min. Dispatch retains a reference up to90days from that dispatch (even a provable zero-charge preflight failure can retain it). Unknown/late billing retains its ledger beyond pixel retention; clearing source bytes never releases cost. ai.prune / existing maintenance command purges expired bytes and90day ingress counters. Reference replay metadata remains charged against own object/storage quota. Account deletion purges active reference/artifact bytes via existing owner flow; backup purge/RPO/RTO remains operational work.

## Error/action mapping
No error contains raw image/prompt/key/provider URL text. Existing ApiClient errors propagate to the controller with code/status/details:
- REFERENCE_IMAGE_UNSUPPORTED / REFERENCE_OPTIONS_UNSUPPORTED: select an advertised model/reference option; no upload sent.
- REFERENCE_IMAGE_LIMIT / IMAGE_BYTE_LIMIT / IMAGE_PIXEL_LIMIT: use an explicitly smaller supported source; app does not resize the original silently.
- IMAGE_PNG_BIT_DEPTH_UNSUPPORTED / IMAGE_PNG_INTERLACE_UNSUPPORTED: select an8-bit noninterlaced original.
- IMAGE_JPEG_PROGRESSIVE_UNSUPPORTED / IMAGE_JPEG_CMYK_UNSUPPORTED / IMAGE_JPEG_EXIF_UNSUPPORTED / IMAGE_JPEG_ADOBE_UNSUPPORTED / IMAGE_JPEG_COLOR_MODEL_UNSUPPORTED / IMAGE_COLOR_PROFILE_UNSUPPORTED: select baseline grayscale or JFIF YCbCr without those operations/metadata, or perform an explicit external conversion while keeping your original.
- IMAGE_INVALID / IMAGE_HASH_MISMATCH: rejected decode/integrity; obtain intact source bytes.
- IMAGE_CODEC_BUSY / IMAGE_UPLOAD_BUSY: bounded transient capacity; retry staging later with same ID/bytes. Codec work has no unbounded waiting queue. A paid response that cannot be decoded retains its actual/pending accounting and is not a fake artifact.
- IMAGE_DECODE_LIMIT / IMAGE_DECODE_TIMEOUT: choose a smaller supported source; no partial source published.
- REFERENCE_DELETED / REFERENCE_CHANGED / REFERENCE_CONTEXT_CHANGED / REFERENCE_EXPIRED / QUOTE_EXPIRED: prepare new current source/operation and obtain fresh explicit consent; never silently rebind an approval.
- AI_PROJECT_STALE / AI_RESULT_STALE / ACCESS_CHANGED: app does not apply result to changed project/session.
- PROVIDER_OUTPUT_URL_UNSUPPORTED / PROVIDER_IMAGE_FORMAT_UNSUPPORTED: paid response outside negotiated inline/codec subset; retain accounting, show unavailable artifact. No arbitrary URL fetch.
- QUOTA_EXCEEDED retains independent dimension/used/requested/limit/period; reference storage has REFERENCE_STORAGE_LIMIT.

AI.settle is now async because image validation runs in worker_threads before the accounting transaction. Internal dispatch awaits it; tests and any trusted server reconciliation callers must await it. Recovery plan/apply functions remain synchronous atomic SQLite operations.
