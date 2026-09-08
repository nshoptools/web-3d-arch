# Adapter wave — issues and evidence limits

Implementation/self-test only. No independent review has been performed by this worker.

| ID | Status | Consequence / integration action |
| --- | --- | --- |
| A-01 | unverified live | No user key was read and no inference request was sent. Controlled transport establishes emitted requests and handling, not live permission, account region, service acceptance, image quality or invoicing. No live success is claimed. |
| A-02 | documented contract divergence | xAI generation guide dated 2026-08-29 documents explicit quality for image 2.0; the fetched OpenAPI GenerateImageRequest omits quality and has older examples. Implementation follows the current feature guide, records both hashes and refuses implicit auto. Review this divergence before deployment; a 400 is a safe failure, never fake success. |
| A-03 | conditional capability | Full metadata pricing matrix is required. Schema says pricing is optional for uniform-price models, but this model's tiered capability does not infer a price from missing data. Missing tier/model/currency/limits blocks POST. Metadata sample max_prompt_length has no unit; byte comparison is conservative. |
| A-04 | mutable alias | No official immutable snapshot guarantee was found for grok-imagine-image-2.0. Registry states mutable alias. Same-ID internal changes cannot be independently detected from a response lacking model/version. Different explicit IDs are rejected. |
| A-05 | no provider retry/status | No image-endpoint idempotency/status/cancel mechanism was established. Unknown remains pending in its original UTC periods. Candidate B-05 supplies offline evidence-bound manual reconciliation; see RECOVERY-RUNBOOK.md. Operator invoice/cutover truth and parent integration remain unverified. Optional x-request-id availability is unverified live; null is intentional if absent. |
| A-06 | bounded image subset | B-03 implements full bounded PNG8 sample reconstruction and pinned baseline JPEG entropy/DCT decode, staged references, private original retrieval and genuine thumbnails. IMAGE-CODEC.md pins the subset: progressive/CMYK/EXIF/ICC/animation/WebP and provider-returned remote URLs remain explicitly unsupported. Client source/geometry validation remains necessary. |
| A-07 | operational | The adapter circuit blocks new quotes after a reported over-cap charge in that process. Disable provider via durable owner policy before restart. Taxes/FX/funding/hosting/outside-app use are excluded; no provider hard spend cap is asserted. Snapshot expires 2026-10-08T00:00:00Z. |
| A-08 | review configuration limitation | Caller requested inherited gpt-6-astra, effort max. This interface exposes no fast/service-tier verification and does not independently attest runtime model/effort. This work is not a review satisfying seat-config. No other agent/seat was started. |
| A-09 | operational acceptance | Existing OIDC/HTTPS deployment, restore hold/reconciliation, backup purge, browser/UI integration and load/resource benchmarks remain with parent/baseline issues. Passing adapter tests does not certify G4 deployment. |
| A-11 | reference pricing/contract | Single-reference medium1k/2k only, JSON edits endpoint, no aspect_ratio/quality field. Input USD0.01 is dated publication evidence; no live input-price metadata field exists. See IMAGE-PROVIDER-EVIDENCE.md and image-source-pins.json. |
| A-10 | memory boundary | Vault buffers are cleared; plaintext JS/header strings exist only in trusted server execution but cannot be proven securely erased from Node's heap. No prompt, secret or raw provider error is logged or included in public metadata. |

The request pipeline performs a final synchronous authorization check after DNS.
If that check fails after transport dispatch has begun, the adapter conservatively
records unknown/pending even if the socket was not opened. Earlier preflight
failures prove zero inference attempts and can record actual zero.

Source snapshots are in this run's inputs; public provenance/hashes are in
source-pins.json. Node runtime docs were retrieved from the official nodejs/node
v24.19.0 tag. Standard PNG structure is cross-referenced with the
[W3C PNG specification](https://www.w3.org/TR/png-3/).

The regression suite retains the original 32 backend tests, changes their run
isolation only, and adds 26 adapter/network/HTTP/CLI checks. Initial failures and
fixes are recorded in HANDOFF.md; the final report alone determines pass/fail.

