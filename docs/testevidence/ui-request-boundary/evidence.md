# Recorded execution evidence

| Revision | Native pure tests | Strict TypeScript | Chromium 153.0.8010.12 | Firefox 155.0 | WebKit 26.6 | Runner exit |
| --- | --- | --- | --- | --- | --- | --- |
| Preserved r1 | 10/10 | 0 | 35/38 | 35/38 | 35/38 | 1 |
| Announced r2 | 10/10 | 0 | 41/41 | 41/41 | 41/41 | 0 |

The r2 suite retains all 38 r1 assertions unchanged and adds three input A→B→A scenarios requested by the parent: a late quote, returned confirmation and unexpected rejection. The only test-code changes are an input-sequence driver and these three checks. Each input sequence dispatches two real textarea input events synchronously in one act, ending at the original prompt string. The test does not weaken an assertion, mark a failure expected, lengthen a timeout, or patch production.

The parent fixed production between captures. The full 75-file r2 input differs from r1 in exactly two files:

- `src/ui/core/bridge.tsx`: `d403049c2127a3e1ccf34e383fd267349cd1259fffbecb33a0741fdef184075a`
- `src/ui/ai/AIGenerateDialog.tsx`: `75f4afca00fbd820d765d320bc7f88236de3e751ce92d33c90a74409dab9108d`

The r2 source manifest SHA-256 is `e893a13df8884efdbfa6daf1aee1bf06dc9c22b01ed8cf557b3a2ffd6c3ff5cb`. The preserved r1 manifest is `73b54d49a1bd359a58e9fedac0fd93958daf62432be1f7a32b5a54525ce68ada`. The native runner reads those manifests and stages the exact captured source. TypeScript 7.0.2 was already installed and used through the repository Node; no dependency installation or global tool configuration was necessary.

Portable records:

- [inputs-r1.json](inputs-r1.json) and [inputs-r2.json](inputs-r2.json): exact source/config bytes and hashes.
- [tests-r1.json](tests-r1.json): preserved r1 test-file preimages. The actual r1 test bytes remain in the execution run's immutable inputs/r1-tests.
- [results-r1.json](results-r1.json): all per-engine r1 checks and observed failing UI payloads; stack paths are normalized to CANDIDATE, with a hash of the unmodified raw evidence retained.
- [results-r2.json](results-r2.json): r2 engine/native results and exact executed test-file hashes.
- [baseline-results.json](baseline-results.json): two optional historical pure identity collisions reproduced, with old/current source hashes. This does not claim a historical React rerun.
- [integrity.json](integrity.json): post-run checks that preserved source/tests still match their manifests and the final suite matches executed r2 test hashes.

The installed package versions were React/React DOM 19.2.8, Vite 8.2.2, TypeScript 7.0.2 and Playwright 1.63.0. No console errors, page errors or non-loopback request attempts were observed in any r1/r2 engine run. The synthetic prepare operations did not submit an AI job or access any paid service.

Commands used the candidate's `tests/ui/request-boundary/run.mjs` after dot-sourcing `tools/development/env.ps1` with the assigned run and overriding CARGO_HOME. The final portable launcher was also executed for r2:

```powershell
./tests/ui/request-boundary/run.ps1 -RunId YOUR_UNIQUE_RUN_ID -InputRevision r2 -EvidenceLabel r2
```

When run for a new checkout, this captures that checkout's current source as r2; it does not fetch or substitute the historical r2 source. Use the included recorded hashes to compare a rerun. Output belongs to the selected run and is not committed under tests.

These results qualify only the asserted UI publication boundaries under a controlled AppBridge. They are implementation evidence, not an independent review, a real backend/security evaluation, visual/browser accessibility qualification, or a statement about paid provider processing.
