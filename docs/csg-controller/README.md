# Actual CSG controller acceptance

Implementation test engineering only. This harness compiles the copied real application and calls its public controller bridge. It does not inject a product recipe, CSG/kernel result, generated base, qualification verdict, storage, exporter, or settings stub. Its browser observer reads private state only for evidence and never mutates it.

The last authorized run selects ONLY STL-TWO-APPROVALS-REPLAY-HISTORY. The OBJ and two-stage cancellation definitions are retained as reusable tests but are not selected; they must not be counted as passed. Exact attempted outcomes, missing coverage and source receipts are in the run reports/handoff.md and reports/FROZEN.json.

## Reproduce

From repository root, use PowerShell 7 and installed repository dependencies. Supply a NEW run/label and a parent-authorized arch-csg-controller-ready/1 input; no implicit live-main/module pairing.

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId <new-own-run>
& <candidate>/tests/csg-controller/run.ps1 -RunId <new-own-run> -InputPath <pinned-ready-input.json> -Label <new-label>
```

Input fields: authorization parent-composition-ready; scope actual-controller-test-only; testFixtures true; printing false; sourceRoot containing the composed src tree, package.json, tsconfig.json and tools/application/{engine,core}.mjs; engine.module and engine.wasm with file/bytes/sha256; libraryReleaseRoot and libraryReleaseSHA256 for original pinned library bytes only. No old release entry/core/WASM is reused. The optional librarySnapshot field in ready-r4 is provenance metadata; this runner still copies and verifies all library bytes through the pinned release manifest.

ResumeStage requires an immutable stage.json and a fresh label. It reuses the exact previously compiled product while capturing the current Node test driver. It cannot exercise a new parent product fix. A source or module change requires a fresh source snapshot and build.

The launcher sets own-run TEMP/cache/profile/TLS/download/log paths, refuses overwrite, copies the Node runner, creates local synthetic TLS, and launches one Chromium persistent context with an explicit fresh page. Only the allowlisted copied public build is served. The old human preview is never inspected, closed or restarted.

Authentication uses a clearly labeled local signed OIDC/PKCE identity fixture against the actual HTTP/SQLite backend. It is not production operator IdP qualification. Chromium trusts only the exact local test certificate SPKI; ignoreHTTPSErrors stays false. Production CSP/COI is unchanged. No paid provider calls.

## Assertions and limits

- Ordinary real SVG/keychain build and real STL download/receipt establish the generated baseline.
- The imported closed 12-triangle cuboid is authored on a six-decimal millimetre grid. Placement is checked against the actual target prism and other parts, not just a global bounding box.
- Full generated block ID and current logical material ID are selected explicitly. The keychain also has a role-0/group-0 keyring: @main-body is ambiguous under the captured selector.
- Input interpretation and CSG approval must remain separate proposal IDs/hashes under the same original job. Head/state/history/visible bytes must stay unchanged while proposals are pending. Only final approval may commit.
- Export readback checks actual downloaded bytes, finite/nondegenerate triangles, two-face opposite-oriented edges, vertex links and volume. The expected cut volume is independently authored; no global error/fit claim is inferred.
- Save/open/build, source/recipe byte retention, geometry identity and increasing-revision undo/redo are checked only if reached. Native transport generation is excluded from geometry identity.
- Deadlines are startup 60 seconds, command/download 45 seconds, selected case 300 seconds. A failure stops the selected run. No timeout increase, automatic retry or matrix expansion.

The observer and entry are test-only. Do not ship this global observer in the production entry. The tested native pairs enable TestFixtures and disable Printing; these runs are not production release or printing/3MF qualification.

## Files

run.ps1/run.mjs manage own-run execution; stage.mjs captures/builds exact source; runtime.mjs owns real local HTTP/SQLite/TLS/browser resources; entry.mjs/observer.mjs expose actual controller observation; driver.mjs uses public commands and downloads; cases.mjs contains flow assertions; fixtures.mjs supplies independently checked input geometry. support/ files are exact reused readers and local fixture helpers with inputs/support-pins.json provenance. hai-mau-co-lo.svg retains the original stable example bytes.
