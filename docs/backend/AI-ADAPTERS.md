# xAI image adapter contract — implementation candidate

Effective evidence date: 2026-09-08 (Asia/Ho_Chi_Minh). This package adds real
production request/response code. Tests inject controlled HTTP transport and do
not establish live account eligibility, image quality or invoice agreement.

## Provider and price provenance

The selected model is xAI `grok-imagine-image-2.0`. Gemini Imagen was excluded
because Google's [deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations?hl=en)
lists retirement on 2026-08-17. No OpenAI API/SDK is used or evaluated here.

The [xAI model page](https://docs.x.ai/developers/models/grok-imagine-image-2.0)
provides this public USD price matrix. The endpoint uses the provider's global
routing; the page lists us-east-1/us-west-2, without a data-residency guarantee.

| UI size | Explicit quality | Count | Reservation (USD micro) |
| --- | --- | --- | --- |
| 1k | low | 1 | 40000 |
| 1k | medium | 1 | 60000 |
| 2k | low | 1 | 60000 |
| 2k | medium | 1 | 80000 |

The generation endpoint is `POST https://api.x.ai/v1/images/generations`.
[Generation instructions](https://docs.x.ai/developers/model-capabilities/images/generation)
document explicit quality, resolution, square aspect ratio and base64 output.
Only those bounded choices are exposed; auto quality, reference images, edits,
batch, video, tools, arbitrary URLs and multiple images are unavailable.

`modelVersion="alias:grok-imagine-image-2.0"` describes a mutable alias contract,
not a snapshot of weights. The provider may change its implementation without
changing that ID. A different returned model ID is rejected. Neither endpoint
`v1` nor OpenAPI info.version `1.0.0` pins the model weights.

## Bound and billing semantics

App input is at most 4000 graphemes and 16000 UTF-8 bytes, well-formed Unicode;
request JSON is at most 65536 bytes. Count is always one. Prompt text does not
introduce token charges in the fixed image tariff described by the
[Imagine overview](https://docs.x.ai/developers/model-capabilities/imagine).
Output is square, at most 2048×2048 pixels and 12000000 encoded-file bytes.

Before every POST, a GET of `/v1/image-generation-models/grok-imagine-image-2.0`
checks the selected pricing tier, model ID/modalities and prompt limit. The
[REST schema](https://api.x.ai/api-docs/openapi.json) defines
`pricing[].price_per_image` in 1/100000000 of a USD cent. The adapter compares
that integer to `quote.maxCostMicros * 10000`. It does not mistake
`image_price` (cents) for tier ticks. Missing/duplicate/invalid tiers, higher
rates, currency mismatch, unrepresentable numbers and changed capability stop
the operation before POST. A lower live rate keeps the conservative quoted cap.

`max_prompt_length` has no explicit unit in this schema. The preflight compares
the prompt's UTF-8 byte count to it, a conservative additional application gate;
this does not claim provider tokenization was measured. The published price
snapshot is accepted from its retrieval time until 2026-10-08T00:00:00Z; after
that the operator must reverify sources and release a new adapter/price version.

These bounds cover published API inference charges, not tax, FX, funding fees,
hosting, other use of the key or a provider changing its price after the GET.
The request reservation is an app budget gate, not a provider-enforced spend
cap. No API parameter or header falsely claims to enforce a dollar limit.

[Cost tracking](https://docs.x.ai/developers/cost-tracking) defines
`usage.cost_in_usd_ticks` as the request's actual provider charge:
1 USD = 10000000000 ticks. Exact safe-integer ticks are persisted as a decimal
string; app micros use `ceil(ticks / 10000)`. Rounding can add less than one
micro per job to the app budget. The original ticks remain available for exact
reconciliation. Missing usage is null/estimated, never actual zero.
Only explicit zero usage or proof that no inference POST was attempted permits
actualMicros=0. A reported charge above the quote is preserved, flagged
PROVIDER_COST_EXCEEDED and blocks new quotes in that adapter process; disable
the provider in system policy until prices are reverified before restarting.

A moderation refusal can still incur a charge. A confirmed refusal without
usage is failed/estimated and retains the cap as liability. A timeout, 5xx,
unusable response without reliable billing, disconnect, restart or uncertain
cancellation is unknown/pending and holds the original UTC reservation.
A valid image without usage is succeeded/estimated. A bad image with reliable
usage is failed/actual; the charge is retained but no artifact is committed.

## UI and backend protocol

1. GET `/api/v1/ai/providers` after login. Respect `allowed`, model
   `qualities/sizes`, explicit options, prices and capability limitations.
2. POST `/api/v1/ai/credentials` with the user's own key, label,
   providerId=`xai-imagine`, endpointId=`xai-api-https-v1`.
   The key goes only to the existing AES-GCM vault.
3. POST `/ai/credentials/:id/check` with the credential version. The adapter
   sends only GET `/v1/api-key` and inspects three enabled/blocked flags.
   No image or prompt is sent. This is a non-inference metadata check, inferred
   to have zero image-generation cost from the documented GET operation and
   per-generated-image tariff; no live invoice experiment was performed.
   It does not prove credit, region or permission to generate this model.
4. Set a USD budget using the existing revision/If-Match contract. An example
   100000-micro operation cap is $0.10, not 100000 dollars or requests.
5. Prepare with a new UUID operationId and Idempotency-Key; include the selected
   modelId/modelVersion, credentialId, projectId/revision, prompt and
   `options:{quality:"low",size:"1k"}`. No provider traffic on prepare.
6. Display the returned quote, recipient, data to send, unknowns and masked
   key. Submit with `{quoteHash,consent:true}` only after user consent.
7. Poll job/result/ledger using the current authenticated user. Apply the
   artifact only after user/revision checks; the backend returns tray context.

All paths above retain the existing /api/v1 prefix, session, CSRF, Origin and
IDOR rules in API.md. Repeating an operation returns its existing job, including
after failures. No documented idempotency or result-status mechanism for this
image endpoint was established; no guessed Idempotency-Key header, polling API
or automatic billable retry is used. A new charge needs a new explicit intent.

Additional job field (owner-scoped, also in cost history):

~~~json
{"providerUsage":{"currency":"USD","unit":"usd_tick","costInUsdTicks":"400000000","microsRounding":"ceil","source":"provider-response"}}
~~~

`requestId` contains a validated upstream `x-request-id` header if present;
otherwise null. Its availability is not promised by the image schema and was
not verified live. It is never populated with a local ID pretending to be a
provider ID. The local settlement event ID is a distinct backend identifier.
No revised prompt, raw error, key metadata, ACL, signed URL or extra usage field
is exposed or retained. Input prompts remain private under the existing ledger.

## Error mapping

| Evidence | Safe job code | Outcome without usage |
| --- | --- | --- |
| 401 / recognized invalid-key code | PROVIDER_AUTH | failed/estimated |
| 403 | PROVIDER_PERMISSION | failed/estimated |
| 402 | PROVIDER_CREDIT | failed/estimated |
| recognized quota code | PROVIDER_QUOTA | failed/estimated |
| 429 without specific quota evidence | PROVIDER_RATE_LIMIT | failed/estimated |
| 422 / known invalid argument | PROVIDER_INVALID_REQUEST | failed/estimated |
| ambiguous 400 | PROVIDER_AUTH_OR_REQUEST | failed/estimated |
| moderation flag / recognized refusal code | PROVIDER_CONTENT_REFUSAL | failed/estimated |
| 404 / model mismatch | PROVIDER_MODEL_UNAVAILABLE | failed/estimated or unknown |
| 5xx | PROVIDER_SERVER_ERROR | unknown/pending |
| 408/504/deadline | PROVIDER_TIMEOUT_UNKNOWN | unknown/pending |
| other transport ambiguity | PROVIDER_DELIVERY_UNKNOWN | unknown/pending |
| invalid image/JSON/MIME/usage | PROVIDER_RESPONSE_INVALID | unknown/pending |
| authorization/quota changed | PROVIDER_SEND_BLOCKED | pre-dispatch failed/0; post-dispatch unknown/pending |
| higher/expired/unbounded tariff | PROVIDER_PRICE_CHANGED / PROVIDER_CAPABILITY_BLOCKED | no-POST actual 0 |

HTTP status meanings come from [Debugging errors](https://docs.x.ai/developers/debugging).
Named upstream error-code recognition is a defensive optional classifier, not
a claim that the provider guarantees an exhaustive stable enum. Unknown
400/429 causes are kept ambiguous instead of parsing arbitrary prose.
Credential checks return invalid for rejected/disabled keys; other safe errors
are mapped to the protected API's error envelope. Never display raw provider
messages or infer a refund from an HTTP status.

## Transport and image boundary

The production factory uses Node HTTPS exclusively, with api.x.ai allowlisted,
default TLS hostname/certificate checks, public IPv4 DNS resolution pinned for
each request, redirects forbidden and no proxy-env routing. DNS, TLS and body
share an absolute deadline. Response headers are capped at 16 KiB, metadata and
error bodies at 65536 bytes, inference JSON at 16100000 bytes. Compressed HTTP
responses, oversize declared or chunked bodies and truncated responses fail.
A final backend authorization check runs after DNS immediately before socket
creation. Aborting during GET/DNS prevents the later inference send.

Strict canonical base64, MIME/signature agreement, dimensions and pixel count
precede commit. PNG checks chunk CRC/order, decoded scanline sizes/filter types
and bounded zlib output, including Adam7 sizes. Animation and compressed PNG
metadata are rejected. JPEG validation is bounded structural marker/frame
validation, not a full entropy decoder. Only PNG/JPEG are accepted; unsupported
WebP never silently converts. Bytes/hash are preserved. Client decoder and
source validation still run before adopting an image; image acceptance is not
a mesh or printability verdict.

Buffers owned by the vault/network are cleared where possible. JavaScript
strings and Node internal request buffers cannot provide guaranteed immediate
memory erasure; process operators remain inside the backend trust boundary.

## Proposed integration and deployment

New modules: adapters/{xai-contract,xai-image,images,registry}.mjs.
Integrate the proposed changes to network.mjs, ai.mjs, database.mjs,
operations.mjs, credentials.mjs and cli.mjs together. Schema 3 adds only nullable
jobs.provider_usage; schema 1/2 restore upgrades through Store and keeps the
existing restore AI hold. Rolling back to old schema-2 code requires restoring
a known backup, never deleting the usage column in production.

Keep the established backend bootstrap/OIDC/vault setup, then explicitly set:

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId backend-runtime
$env:BACKEND_AI_ADAPTERS = 'xai-imagine'
$env:BACKEND_ORIGIN = 'https://your-app-origin.example'
# BACKEND_DATA_DIR / BACKEND_KEYS_FILE / BACKEND_OIDC_FILE: operator's explicit deployment files.
node ./src/server/cli.mjs serve
~~~

The CLI has no environment variable for an AI key and no common credential.
An empty BACKEND_AI_ADAPTERS disables registration; any other selection is a
startup error. Registering an adapter does not authorize a user's spend:
system allowlist + active user credential + user budget + consent remain
required. Use policy.xai.example.json only as a proposed configuration, not a
measured capacity claim.

No provider calls occur merely at startup, registry lookup or quote. A user
pressing Check key sends metadata GET; submitting consent also performs fresh
metadata GET then at most one billable POST. Reverify the raw source hashes in
source-pins.json, price changes and model retirement before release.



Fixture schemas and request example: ../tests/server/fixtures/xai-contract.fixture.json. Fixture bytes and GDI+ oracle hashes: ../tests/server/fixtures/manifest.json. See ADAPTER-ISSUES.md for unresolved/live limits.
