# Printer library integrity and lifecycle decisions

## Reproduced defects
Five initial tests failed on the pinned original sources: account/epoch key reuse, a mutable context moving the old epoch guard, unrelated original-file bytes being advertised as available when their own raw hash matched, ignored abort reporting a successful download, and real HTTP accepting a declared original hash that did not match its bytes. Failure output is retained, not replaced by a successful rerun.

## Integrity layers
There are three different hashes:
1. sha256 on the sealed normalized record hashes canonical payload JSON.
2. printerProfileSources.sha256 hashes the exact incoming bytes, including UTF-8 BOM, whitespace and line endings.
3. payload.source.sha256 is merely the profile's declared source hash; these checks do not establish ownership or availability of vendor-original bytes.

Both library and backend verify original encoding/size/canonical base64, raw SHA256, fatal UTF-8 parsing, exact {payload,sha256} envelope and payload hash, and canonical equality with the referenced normalized record. Backend also rejects duplicate/orphan source references. The byte stream is retained separately and is returned unchanged on original export.

The backend intentionally remains an integrity/storage service, without duplicating the asynchronous printing adapter schema or assuming supported machine versions. Legacy/unknown safe JSON profile records without an original attachment remain roundtrippable and removable. Printing validation is still the existing validateProfile. A linked source must now be coherent on every settings write; legacy corrupt originals may require explicit repair/deletion before unrelated settings can be saved. No read migration or silent repair removes user bytes.

Replacing a unique profile ID changes only that profile and its matching source. Deletion retains source records referenced by remaining profiles, including legacy duplicates. Ambiguous duplicate IDs cannot be replaced by import; the user deletes a specific row first. The 50-profile/50-source and 1 MiB per incoming file/2 MiB retained-original budgets are independent of the backend whole-settings quota (canonical values include base64 overhead). Quota rejection never trims existing data to manufacture success.

## Concurrency and publication
Each capture stores scalar user/epoch/revision/ETag values plus the immutable settings object and reset lifecycle. This blocks A→B→A and reset even when the same data and revision reappear. Opaque row keys are newly minted per refresh capture. Confirmation is private, one-use and exact; rejected or conflicted writes require re-preparation.

The backend retains its synchronous SQLite CAS transaction and authenticated user scope. Both copies of a valid CAS conflict retain their own original bytes. No automatic last-writer-wins retry is added. Preparation does not call the backend write route. After an awaited preflight, all bindings are rechecked; after a write only same identity/lifecycle is allowed, since the successful write must advance settings revision. The dispatch hook rechecks epoch/user before invalidating any current project preview/job.

The controller's optional online-only session continues to perform its real fresh-authenticated preflight; ordinary verified-offline behavior is unchanged. Cloud writes always use actual HTTP auth/CAS. This candidate's policy-routing unit test uses an explicitly named policy test double; it is not a new browser trust proof. The real HTTP controller tests initialize with a real signed lease and existing verification.

## Limits and assertions
No actual printer, vendor profile, slicer execution, physical fit or native geometry is tested or qualified. Synthetic normalized profiles carry internal-testing rights. Tests run actual Node backend HTTP/SQLite and local OIDC/PKCE; no external provider is contacted. Only project storage, OS download and one policy preflight test are explicit doubles in controller tests; profile operations must never invoke the project-store commit double.

Browser UI, TLS/OIDC provider deployment, browser download permission and OS file persistence are left to parent/UI integration. No new browser acceptance result is claimed. An already accepted server write or OS download cannot be revoked by a later account switch; guards suppress late publication and prevent a new account from inheriting the action. Actual asynchronous readers/transports may hold bounded in-flight byte references until they settle; reset cancels authority and signals but does not claim physical memory erasure.
