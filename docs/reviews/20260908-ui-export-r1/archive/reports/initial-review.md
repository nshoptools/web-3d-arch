Independent frontend review — captured export interface

**Disposition: needs changes.** Eight findings: one P1 and seven P2. This is an independent review of captured React UI with a controlled DeferredBridge. No product code was changed.

Run 20260908-ui-export-review-r1. Findings prepared at 2026-09-08T09:00:24.876Z. No author self-test conclusions or other reviewer conclusions were read. No additional seats were started.

Captured source: [inputs/source-manifest.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/inputs/source-manifest.json); SHA-256 `56949f2cd695ed86b206306f3f60113f25ba10788327c99c3e10751329924cac`. All 95 files matched before and after review, with no unlisted source files. Live main is outside this conclusion.

Actual seat: **gpt-6-astra / max / Fast disabled in launch and effective CLI configuration**, Codex CLI 0.153.4. Actual session metadata confirms model/effort. The launch selected service_tier=default and features.fast_mode=false; the matching features-list command reports false. Session metadata omits the served tier, so server-side routing is not independently attested. [evidence/seat-attestation.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/seat-attestation.json).

The parent official-source check is retained in [inputs/seat-source-check.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/inputs/seat-source-check.json). The reviewer also fetched the [official model page](https://developers.openai.com/api/docs/models/gpt-6-astra) and [speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed). No stronger available configuration was established. Auth was not inspected and raw events were not emitted.

**Findings**

**UI-R1-01 · P1 — Unsent export drafts migrate into a different project or account**

Source: [src/ui/sections/ExportConfiguration.tsx:78](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/sections/ExportConfiguration.tsx:78), [src/ui/sections/ExportConfiguration.tsx:126](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/sections/ExportConfiguration.tsx:126), [src/ui/components/Fields.tsx:577](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:577), [src/ui/layout/Panel.tsx:87](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/layout/Panel.tsx:87).

Trigger:

1. At project P1 / account A / revision 0, type PRIVATE_A_UNSENT into Tên tệp without submitting.
2. Publish P2 (or account B) atomically with the same format/field IDs, revision 0, and filename Published B.
3. Press Enter in the still-mounted filename control.

Observed: The control still displays PRIVATE_A_UNSENT. Enter dispatches export.configure with that old text and projectRevision:0 while the live context is P2 or account B. The captured public mount and Panel do not remount the export section on identity changes; row keys contain only field ID/kind.

Expected: Drafts and their starting revision must belong to the account/project access context in which editing began. A new context must show its own published value and must not adopt or submit another context's draft.

Impact: Possible disclosure of the previous account's input and unintended edits to another project whose revision happens to match.

Suggested direction: Reset or remount field-local state on account/project context changes, including context epochs; keep ordinary revision publications from destroying an active draft.

Bounds: Reproduced in all three engines with an atomic contract-valid publication retaining format/field IDs. A host that first unmounts these controls may mask the problem. Native persistence and account-service acceptance were not tested.

Evidence (L11-project, L11-account):

- [evidence/comprehensive-r2/chromium-L11-project-observed.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L11-project-observed.json) — SHA-256 `4ed9666d75a681395d16c5521ef3b4be808c011202966ad50c42f55549b9a5d3`.
- [evidence/comprehensive-r2/chromium-L11-account-observed.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L11-account-observed.json) — SHA-256 `1f502910cf922ec353c61691d58aa910abb780ed30e7746bec88a2d8fb56e58d`.
- [evidence/comprehensive-r2/chromium-L11-project.png](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L11-project.png) — SHA-256 `11a2d3543e8c6be129aa49e7891f880f3466822788a54835668da1281b0f7caf`.

**UI-R1-02 · P2 — Superseded field responses still open confirmations and publish shared errors**

Source: [src/ui/sections/ExportConfiguration.tsx:143](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/sections/ExportConfiguration.tsx:143), [src/ui/core/bridge.tsx:203](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/core/bridge.tsx:203), [src/ui/core/bridge.tsx:274](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/core/bridge.tsx:274), [src/ui/components/Fields.tsx:591](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:591).

Trigger:

1. Submit filename Old, then type New unsent while the response is pending; settle the old request with a confirmation.
2. Alternatively, submit a numeric value, press Escape, then return its confirmation.
3. Alternatively, submit First and Second, return the Second confirmation and then the First confirmation.

Observed: The old confirmation opens after typing or Escape. In the two-request case, OLDER replaces NEWEST. Opening the stale dialog also blurs the current field and submits New unsent in the rendered AppShell. A late rejected promise leaves the newer local text intact but still writes BRIDGE_CALL_REJECTED and its old detail to the log/live alert.

Expected: The same request/draft ownership fence must protect local validation and shared dialogs, logs, and alerts. Superseded responses must not replace the current consent question.

Impact: The user is asked to approve an obsolete change; a late modal can steal focus and submit newer text through blur. Current field state and shared feedback disagree.

Suggested direction: Check the originating field's edit generation and request serial before the shared result handler runs. Guard both local and shared effects without silencing other fields' independent current requests.

Bounds: The confirmation cases reproduce in Chromium, Firefox and WebKit; rejected-promise follow-up is Chromium only. No automatic proposal.accept was observed, and native proposal validation may refuse the obsolete ID.

Evidence (L04, L05, L14, F02):

- [evidence/comprehensive-r2/chromium-L04-state.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L04-state.json) — SHA-256 `134525a20feafabfc73afe077a9628a7e34b6f8c2cfc2e912252502e81cd123d`.
- [evidence/comprehensive-r2/chromium-L14-state.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L14-state.json) — SHA-256 `24374076792ad489fe408b7f0e8b42f3a55a5389c92878b443f48b9acb029933`.
- [evidence/followup-r5/chromium-F02-exact.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/followup-r5/chromium-F02-exact.json) — SHA-256 `58310e63f510d9333215e01e2af296427bd9e2e2ce4047b2e25da2179632797c`.
- [evidence/comprehensive-r2/chromium-L05.png](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L05.png) — SHA-256 `35b5f4bb051af130171d070519afe7d91c4961b6434c931827ea4bfd1a72e5ef`.

**UI-R1-03 · P2 — An already-open conversion confirmation survives project/account ABA**

Source: [src/ui/AppShell.tsx:245](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/AppShell.tsx:245), [src/ui/core/request-context.ts:10](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/core/request-context.ts:10), [src/ui/dialogs/CoreDialogs.tsx:110](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/dialogs/CoreDialogs.tsx:110).

Trigger:

1. Click export and return a conversion proposal with ID OPEN_CONSENT; leave its confirmation dialog open.
2. Deliver P1 → P2 → P1 or account A → B → A notifications in one React act/batch.

Observed: The existing confirmation remains open with retry {type:proposal.accept,id:OPEN_CONSENT,confirmed:true}. AppShell compares only the final rendered identity, so it does not remove the dialog. By contrast, a response arriving after the same ABA is correctly dropped by the request-context epoch fence.

Expected: An open consent question must retire when its originating access/project context is invalidated, even when the final IDs equal their original values.

Impact: The visible consent question belongs to an invalidated proposal and continues offering its old retry.

Suggested direction: Bind open confirmations to the observed account/project context epochs and validate that ownership when presenting or acting on them.

Bounds: Reproduced in all three engines using batched bridge notifications. This establishes stale UI consent, not successful execution of an invalid proposal; the native controller was not exercised.

Evidence (L12-project, L12-account, L10-project, L10-account):

- [evidence/comprehensive-r2/chromium-L12-project-state.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L12-project-state.json) — SHA-256 `ed0eef975a7c1a7b15c4acadc25d9012265d777fdebf80486a48a5c46c800901`.
- [evidence/comprehensive-r2/chromium-L12-account-state.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L12-account-state.json) — SHA-256 `a1ccd0e7ce88cfd19769f7cd8f0bb91f5e89dcb311362454aef15b1e68ac2dd5`.
- [evidence/comprehensive-r2/chromium-L12-account.png](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L12-account.png) — SHA-256 `b0b5d039eb91653e8d0181e10c679d3b677381ea3d8483ed73b79b0e77f21dc3`.

**UI-R1-04 · P2 — Numeric same-value Enter keeps an obsolete draft revision**

Source: [src/ui/components/Fields.tsx:200](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:200), [src/ui/components/Fields.tsx:285](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:285), [src/ui/components/Fields.tsx:583](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:583).

Trigger:

1. At revision 0 with numeric value 0.004, edit it to 0.009.
2. Publish revision 4 with that field still 0.004; type 0.004 again and press Enter.
3. Return STALE_REVISION, then type 0.006 and press Enter.

Observed: Enter sends 0.004 against revision 0. After rejection the next edit also sends projectRevision:0. Numeric blur and same-value text Enter correctly cancel the draft and permit a fresh revision, so the result depends on how the user leaves an equivalent field state.

Expected: Explicitly returning to the published value should resolve the dirty draft consistently and allow a subsequent edit to start at revision 4.

Impact: A keyboard user can be trapped on the obsolete revision and repeatedly rejected despite having restored the published value.

Suggested direction: Use the same same-value draft reset for numeric Enter that already exists for numeric blur and DraftTextField.

Bounds: The extra stale command reproduces in all three engines. The subsequent-rejection sequence is Chromium-only with a deterministic STALE_REVISION reply; native revision validation is out of scope.

Evidence (L06, L07, F01):

- [evidence/comprehensive-r2/chromium-L06-state.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-L06-state.json) — SHA-256 `6aee52bfa8e9596e3a99e0cdf6ed736e7d1c22a5bd339056ad51eea5dd573400`.
- [evidence/followup-r5/chromium-F01-exact.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/followup-r5/chromium-F01-exact.json) — SHA-256 `48ff478b8ef90b2dd8bbdb0a640615497839801c6833a2e3a932ae5ef511a6e6`.

**UI-R1-05 · P2 — One Escape cancels the draft and closes the mobile drawer**

Source: [src/ui/layout/Panel.tsx:32](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/layout/Panel.tsx:32), [src/ui/layout/Panel.tsx:57](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/layout/Panel.tsx:57), [src/ui/components/Fields.tsx:639](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:639).

Trigger:

1. At 320 CSS pixels, open the Export drawer and type a filename draft.
2. Press Escape once while the field has focus.

Observed: The draft resets to Mô hình and drawerOpen becomes false in the same key event. Focus remains on INPUT inside an inert ancestor. Panel's native keydown listener runs before the delegated React field handler can stop propagation.

Expected: The first Escape should cancel the field's edit while keeping the drawer open; a later Escape may close the drawer and restore useful focus. This follows UI-05's one-layer Escape rule.

Impact: Keyboard editing unexpectedly closes the work surface and leaves focus on an unavailable control.

Suggested direction: Coordinate Escape handling at one event layer or explicitly defer drawer dismissal until the field has had the chance to consume the event; restore focus when the drawer closes.

Bounds: Reproduced with actual keyboard events in all three engines at 320px. Real mobile virtual keyboards and assistive technology were not exercised.

Evidence (K02):

- [evidence/comprehensive-r2/chromium-K02-observed.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-K02-observed.json) — SHA-256 `43bb566af8a7f0152446868414e5020beae15997601d68f925ff371060d1ac0b`.
- [evidence/comprehensive-r2/chromium-K02.png](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-K02.png) — SHA-256 `8445ed4f6e288d36e04f688910b313ec9542755072abe6c6c87dc1d61442c156`.

**UI-R1-06 · P2 — Disabled checkbox/select settings lose the keyboard route to their reason**

Source: [src/ui/components/Fields.tsx:451](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:451), [src/ui/components/Fields.tsx:497](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:497), [src/ui/sections/ExportConfiguration.tsx:183](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/sections/ExportConfiguration.tsx:183).

Trigger:

1. Publish enabled:false and a reason for inspection and orientation settings.
2. Traverse the export configuration with Tab or attempt to focus their associated controls.

Observed: CheckField and SelectField use native disabled. Their reasons have aria-describedby targets, but their rows contain no enabled focus target. In the same fixture, readonly text and number controls remain focusable with their reasons.

Expected: Keep a keyboard-reachable control or explanation for unavailable settings as specified by UI-04; preserve actual refusal semantics.

Impact: Users navigating by Tab/forms mode cannot reach the explanation for these unavailable settings through the control.

Suggested direction: Provide a focusable reason or an appropriate non-mutating focusable disabled presentation, consistently with the text/number and Button patterns.

Bounds: DOM focusability was checked in all three engines. Reasons remain visibly printed and can be read in screen-reader browse mode; no screen-reader session was run. This is grounded in the project's focusable-reason requirement, not a blanket claim that every native disabled control violates WCAG.

Evidence (K03):

- [evidence/comprehensive-r2/chromium-K03-focus.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-K03-focus.json) — SHA-256 `cd7e368757bfdbeba84ce607997442b572fd8dca4a3430f1abe93120a458af5a`.
- [evidence/comprehensive-r2/chromium-K03.png](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-K03.png) — SHA-256 `6369fbec5ba3ab4186ad3e0a1a055b2f01b3be29e1f425b9306c47fe692d7e80`.

**UI-R1-07 · P2 — Numeric units and published limits are absent from the accessible description**

Source: [src/ui/sections/ExportConfiguration.tsx:237](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/sections/ExportConfiguration.tsx:237), [src/ui/components/Fields.tsx:269](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:269), [src/ui/components/Fields.tsx:301](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/components/Fields.tsx:301).

Trigger:

1. Publish a number field with unit:mm, min:0.000001, max:1, step:0.000001 and no optional hint.
2. Inspect the focused input's accessible label and described-by targets.

Observed: The visible row prints the unit and range, but the input's description is empty. Its accessible name is only Sai số hình học · errorMm. There are no associated min/max semantics either; the range note and unit span are outside the description mechanism.

Expected: The focused number control should expose its published unit and constraints in the accessible name/description, as required by UI-04, without parsing or modifying the raw input.

Impact: A user reading the field through assistive input navigation lacks the scale and legal range necessary to interpret and correct the value.

Suggested direction: Give the unit/range note stable IDs and include them in aria-describedby, including fields whose optional hint is absent.

Bounds: Association failure reproduces in all three engines via DOM/accessibility inspection. A separately authored hint may repeat this information and mask the omission; no native screen-reader output was captured.

Evidence (K04):

- [evidence/comprehensive-r2/chromium-K04-name.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-K04-name.json) — SHA-256 `0b3405d384d9ae10517ce8cb98ef4d7aedc8374353ce2149232cd3751557e5ab`.
- [evidence/comprehensive-r2/chromium-K04.png](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/chromium-K04.png) — SHA-256 `6369fbec5ba3ab4186ad3e0a1a055b2f01b3be29e1f425b9306c47fe692d7e80`.

**UI-R1-08 · P2 — Desktop select sizing collapses its label into vertical letters**

Source: [src/ui/styles/components.css:156](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/styles/components.css:156), [src/ui/sections/ExportConfiguration.tsx:204](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/review-source/src/ui/sections/ExportConfiguration.tsx:204).

Trigger:

1. Use the published orientation choices Hoa văn hướng lên and Lật hoa văn xuống và đặt đáy trên bàn in the actual ExportConfiguration.
2. At a 1280px viewport, inspect the 344px desktop panel at application font sizes 14 and 28.

Observed: In Chromium the label's width is 0px at normal text and about 3.14px at doubled text; its height is about 433px and 867px. Even the five-letter word Hướng spans five separate line rectangles. The auto control column consumes the panel while minmax(0,1fr) plus overflow-wrap:anywhere sacrifices the label. There is no horizontal overflow, so the earlier bounds-only checks passed.

Expected: Ordinary setting labels should remain readable beside or above the control in the narrow desktop panel. UI-06 requires actual usability and visual review, not just containment.

Impact: The direction label becomes a long vertical stack and makes the settings section excessively tall, even at normal text size.

Suggested direction: Reflow using the available panel/container width or allow the control column to shrink; do not rely solely on the viewport <=420px breakpoint.

Bounds: Measured in Chromium and WebKit; visually reproduced in the earlier Firefox r2 screenshot. The dedicated Firefox r7 measurement did not execute because page.goto timed out at 30 seconds. The 320px layout's one-column rule avoids this defect. Choice strings are an explicit contract fixture, not evidence of the native controller's current catalog.

Evidence (V02-1280-14, V02-1280-28, V02-320-28):

- [evidence/readability-r7/chromium-V02-1280-14-metrics.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/readability-r7/chromium-V02-1280-14-metrics.json) — SHA-256 `9b99813002d27aa39ebc762a85f2a2e01ed52f8ab23e44f75529787d4b7d7260`.
- [evidence/readability-r7/chromium-V02-1280-28-metrics.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/readability-r7/chromium-V02-1280-28-metrics.json) — SHA-256 `de784cd147ab07fa1ef3ab47a761865964da207e6d1e14db35f2c2cb056ef736`.
- [evidence/readability-r7/webkit-V02-1280-28.png](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/readability-r7/webkit-V02-1280-28.png) — SHA-256 `3c96b1f44c1ad778be954d3040213b9c88e072cef7e61fc720be9a5a33624164`.
- [evidence/comprehensive-r2/firefox-V01-1280-28-2.png](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/firefox-V01-1280-28-2.png) — SHA-256 `5234f43d162ec9b673b17b45259015e7188178e56be8fab360ac573505cd831a`.

**High-value checks without an issue in the tested bounds**

- Exact raw text/decimal drafts and their first-dirty revision survive newer publications; current success resets the base. Checks: L01, L02, L03, L07, F04. Bounds: Text and decimal fixtures, text late-success and numeric caret preservation. Numeric same-value Enter is a separate finding.
- Concurrent current field refusals and a current rejected promise remain visible beside their exact drafts. Checks: L08, F03. Bounds: Two fields and one rejection; superseded shared feedback has a separate finding.
- Conditional field removal and pending-request account/project ABA suppress old confirmation bodies. Checks: L09, L10-project, L10-account, R03. Bounds: Removed filename/receipt and batched fixture notifications; already-open confirmations have a separate defect.
- Inspection intent and proposal acceptance were not fabricated. Checks: L13. Bounds: Risky export sent only exportFile(formatId), left inspection false, and sent proposal.accept with the exact returned ID only after the explicit Apply click. No native execution claim.
- Receipt facts, reordered download IDs, unavailable metadata and honest download/printability wording were preserved. Checks: R01, R02. Bounds: Absent/empty receipts, four verdicts, inspection flags, old revision, SHA, exact byte count and warnings were rendered from fixtures. No actual file bytes or OS save verification.
- Renderer export over a stale model identifies the older model and leaves published revisions intact. Checks: R04. Bounds: UI text and command only; no native preview frame or exported pixels.
- The tested long receipt/field content remains inside the panel at 320px with normal and doubled application text. Checks: V01-320-14, V01-320-28. Bounds: All three engines. Bounds-only checks do not prove readability; visual inspection found the separate desktop label defect.
- Enabled controls and receipt metadata were reachable through a keyboard-only Tab/typing/Space/arrows/Enter route at desktop and 320px. Checks: K05-1280, K05-320. Bounds: Chromium/WebKit completed. Firefox's later navigation timed out. Earlier focused-control keyboard and ARIA-error checks completed in all three engines.
- Actual Chromium browser zoom was attested at 2.0 with focused controls inside the panel at 626 and 320 CSS px. Checks: browser-zoom-r4, browser-zoom-r6. Bounds: tabs.getZoom()=2, viewport 1252→626 and DPR 1→2; measured resize then produced exactly 320 CSS px. R6 native surface screenshots avoid the R4 screenshot crop. No Firefox/WebKit browser-zoom claim.

**Execution and reproducibility**

Every writing shell dot-sourced tools/development/env.ps1 -Seat codex -RunId 20260908-ui-export-review-r1. The adapted [work/browser-review/support.mjs](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/work/browser-review/support.mjs) verifies the pinned manifest and every captured file. Product imports resolve directly to the immutable snapshot. All profiles, caches, logs, downloads and temporary files are inside this room. Installed .toolchain dependencies were only read. The actual AppShell and its event handlers run under StrictMode; the observer and bridge publications are test fixtures.

| Probe | Exit | Evidence and bounds |
| --- | --- | --- |
| lifecycle-r1 | 1 | Exploratory; counting/host issues documented below, scripts retained. |
| comprehensive-r2, all three engines | 1 | 28 cases/engine: 17 satisfied and 11 failed; [evidence/comprehensive-r2/results.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/comprehensive-r2/results.json) |
| followup-r5, Chromium | 1 | Two reproduced defects and two counterchecks; [evidence/followup-r5/results.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/followup-r5/results.json) |
| readability-r7 | 1 | Chromium/WebKit fail desktop labels and pass 320px. Firefox startup unexecuted; [evidence/readability-r7/results.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/readability-r7/results.json) |
| keyboard-r8 | 1 | Chromium/WebKit complete both keyboard-only routes. Firefox startup unexecuted; [evidence/keyboard-r8/results.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/keyboard-r8/results.json) |
| browser-zoom-r3 / r4 / r6 | 1 / 0 / 0 | R3 resize assumption failed. R4 attests actual zoom; R6 captures native viewport surfaces; [evidence/browser-zoom-r6/results.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/browser-zoom-r6/results.json) |

Versions: React/React DOM 19.2.8, Vite 8.2.2, TypeScript package 7.0.2, Playwright 1.63.0. Engines: Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6. Vite compiled the rendered UI; no separate typecheck or native build was run.

Infrastructure limitations and corrections:

- Initial lifecycle-r1 counted six initial font/emoji fixture reads as commands. R2 correctly counts dispatch/exportFile. R1 L07 is a harness false alarm, not a product finding; R2 proves L06 sends one stale configuration command.
- R1 lacked the definite host height required by captured layout.css. R2 provides #root block-size:100dvh with overflow:auto. R1 screenshots are exploratory, not layout verdicts.
- R1 act-environment warnings arose from real Playwright DOM events outside React act. Subsequent harness versions enable the test flag only during explicit act calls; production code remains unchanged.
- Firefox network.proxy.type=0 was confined to this run’s isolated profiles. R2 completed. R7 and R8 later timed out in page.goto at the unchanged 30000ms timeout, so their Firefox checks are unexecuted.
- Zoom r3 incorrectly assumed outer window pixels equal content pixels and timed out during resize. R4 uses measured window/content delta and retains exact viewport assertions. R4 Playwright screenshots crop the zoomed viewport; R6 retains those assertions and captures the native CDP surface without a clip. Failed attempts and scripts remain in evidence.
- No timeouts were broadened and no product assertions weakened to declare a pass. Bounds-only layout checks were supplemented with visual inspection and a separate readability assertion, which fails.

Untested scope:

- Native application/controller/exporter/Worker/WASM, actual downloaded file/receipt bytes, persistence and OS save completion.
- Backend/account services, server authorization and native proposal acceptance/rejection; only frontend identity publications were simulated.
- Geometry, physical printing/fit/printability, and correspondence between a native preview frame and exported bytes.
- Screen-reader sessions, forced-colors/contrast measurements, touch hardware, virtual keyboards, exhaustive locale/font coverage.
- Actual browser zoom in Firefox/WebKit; later dedicated Firefox readability and Tab walkthrough cases did not start because navigation timed out.
- Full application journeys outside the assigned export/Fields/request-ownership milestone.

All test servers and browser contexts were explicitly closed; [evidence/process-cleanup-audit.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/process-cleanup-audit.json) found no matching owned test process. Isolation evidence consists of configured output/profile paths and process inspection, not a full OS filesystem-write trace. [evidence/source-verification-after.json](D:/VoSon/Code/web-3d-arch/tmp/reviews/codex/runs/20260908-ui-export-review-r1/evidence/source-verification-after.json) confirms captured source integrity.
