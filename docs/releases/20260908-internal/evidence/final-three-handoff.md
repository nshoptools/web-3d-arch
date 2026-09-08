# Final three-flow handoff — frozen implementation evidence

**3/3 targeted flows PASS; Chromium visible; exit0.** No additional cases or browsers were run after this result. Existing baseline33/638 seal remains unchanged. Implementation/self-test only; inherited Astra/max, fast not exposed; no configured independent-review claim.

## Exact final artifact

- Input: report/preview/20260908-internal/input.json; own copy inputs/final/input.json; SHA256 3ee43aa58efddfb937886696ec1b965cb44196988bf0a239dff02584aa65677b.
- Release:720e815fbb0b5817b3a3a66918114393b0b60542ff73cd3e8b825d22d279a898.
- Prepared:029689a4e449e5f2137094090050ed3f50f6a9ea34423456df8fc5eeb41494f6. Its releasePlanSHA256 equals the actual release; the old3b527 binding was not accepted and artifact.mjs equality was not relaxed.
- Canonical MJS:cd92ea536fcdff3f53bed29fc42022229f8e2cd24a942fa87237fa89fed58828.
- Derived MJS:0fd2608e295add773c399bf5624104392ae27996604dc6b89d28acccfbcae589.
- WASM:064f52946188df285fc1328e7e2607a7cbdb174a82f85eded2e949a71f4c1b3c.
- Build receipt:2f3b120da8282f537ad511af042bebf3536984bf14cd5d09a41d38e98793ea17.

Stable tools/preview/start.ps1 ran full artifact verification first: exit0,21647 package files/374874711bytes;21414public assets/360491890bytes;512prepared files. Exact file inventories/sizes/SHA, source/build bindings and canonical release verifier passed. No package/native/UI edits.

## Three results and saved downloads

| Case | Result | Measured flow time |
|---|---|---|
|SETTINGS-JSON|Without a project, actual UI import/export equals current-account HTTPS/SQLite values {language:"vi"}, revision1; exported schema contains only schemaVersion/values.|2801ms|
|ORDINARY-PRODUCT-STL|Approved stable SVG, actual ordinary keychain/Worker/WASM/Three at revision2,48×32×3.2mm;95084-byte STL/1900triangles, independent manifold/winding/nondegenerate/positive-volume readback, exact receipt.|18714ms|
|RESCUE-ZIP|96373-byte ZIP,8entries; complete:true/issues:[], CRC/size/SHA inventory and selected manifest valid; original SVG retained; project/revision agree with STL receipt.|428ms|

Files under evidence/final-three-r2-chromium:
- keychain.stl — ffb7a42dbb036c699e12f67653ac8dca21f3d7061f7529a65837bcbbd60ca810. Receipt records the product's suggested filename final-keychain-smoke.stl.
- keychain-receipt.json — 599302d31a1a269dd828a60bdc05893b7975adde43a4fa4839a590d26c800cdb.
- settings.json — d3fd325e089a40fe65edd942c806276bcfd9b5649b6330d19c01d4e0a0870ef2.
- final-rescue.arch-project.zip — 89d013f2052059d87f737a5ae828bfa3ab0f941acdb043e672c91dc16eb69468.

These are saved download filenames; no original baseline ZIP was overwritten. Original docs/examples/hai-mau-co-lo.svg SHA3b7d19bb6c35a79ac569933e474a20f71845818af977e9850b25ea9549814d88 is included byte-for-byte. Rescue selected manifest6f4af4458ab2d629669f4f57680f0b318fec1e69d115536e3ef2fe26a84773af; project9fb7583b-a4e9-4e2b-8993-8ea984030686,revision2.

Actual model screenshot: evidence/final-three-r2-chromium/ACTUAL-MODEL.png. This is the tested model, not a claim that the separate live preview is prefilled.

## Startup and errors

R1 headless failed BEFORE any case at the10s initial page.goto deadline. Root/CSS/JS had HTTP200; no page/console errors were observed. Its log, runtime and exit1 are retained; it is not counted as a flow pass.

R2 had already started with visible Chromium before the parent's60s startup allowance arrived. Its original10s navigation,60s account-ready and45s flow deadlines remained unchanged. From runtime start: signed fixture/SQLite3.188s; host listening15.429s; browser launched16.484s; explicit page created25.734s. Navigation then completed and all3 cases ran. Exact navigation elapsed was not separately logged; do not invent it or claim R1 met10s. No claim that changing headless mode fixed a browser cause.

R2 runtime issues array is empty: **0 page/console errors**. Network observer retained2 net::ERR_ABORTED fetches, /api/v1/ai/providers and /api/v1/ai/credentials. They did not fail the3 flows; this is not a blanket claim of zero network aborts. The source-ingest confirmation was explicitly approved; its PROPOSAL_REQUIRED diagnostic is retained. No external/paid AI call was made.

STL was exported directly for this sample; no float-conditioning proposal occurred. **The float consent branch is not qualified by these3 smoke results.** Receipt says mesh pass, physical/slicer unverified. This readback adds no physical fit/global error/self-intersection proof.

## Live human preview kept running

Stable launcher: tools/preview/start.ps1.
URL: **https://127.0.0.1:63698**
Node/service PID:**12544**; independent launcher PID:**17420**.
Listening process verified on loopback63698 after the3-flow test runtime closed normally.

Use the already open Chromium window. It is signed in as local test user6e144135-da43-4fc3-9e9c-a873d3afb0d6, an explicitly **local synthetic signed OIDC/PKCE test identity**, not an operator production account. Actual backend/session/CSRF/SQLite and compiled UI/Workers/WASM execute. No production OIDC/TLS deployment was supplied or claimed.

Prefill was skipped as authorized: this already running stable preview has no configured reusable Playwright/CDP attachment, and the available browser-control surface did not expose that Chromium profile. It was not closed, restarted or patched. The user can create a keychain, load docs/examples/hai-mau-co-lo.svg, accept any shown source proposal and build using the stable sample guide.

Close that particular preview page or create its exact evidence/final-human-r1-chromium/STOP-PREVIEW file under the same own-run project environment to stop its services. Do not stop unrelated processes. No arbitrary expiry timer was added by the host helper. For a later clean relaunch use a FRESH RunId as well as a fresh Label, because full Verify refuses to overwrite an existing inputs/<id> verification record:
tools/preview/start.ps1 -RunId <fresh-own-run> -InputPath report/preview/20260908-internal/input.json -Label final-human-r1.

## Exit and seal

Executed smoke source is work/final-smoke-r2/three.mjs, with copied/pinned main tests/product-acceptance helpers and actual stable SVG/input. evidence/final-three-r2-exit.json records exit0 and final input SHA; all source hashes were rechecked after execution. Smoke browser/host/backend/IdP closed successfully. Only the separate human preview remains intentionally live.

final-three-manifest.json pins completed r1/r2 evidence, raw downloads, screenshots, source snapshots, verification output and static human-readiness record. FINAL-THREE-FROZEN.json binds the manifest, summary and this report. Active browser profile/SQLite/test keys are private and not in the frozen evidence manifest. No further test, browser, native/UI or main change is part of this handoff.
