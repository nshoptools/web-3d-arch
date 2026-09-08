# UI request ownership regression tests

These tests execute the captured application UI with React 19, `UiStateProvider`, `BridgeProvider`, the production request hooks, `DialogHost`, `AIGenerateDialog`, `Toasts`, and live regions. `DeferredBridge` is an explicitly synthetic AppBridge 0.3: it holds promises until the test settles or rejects a particular call. It never invokes a controller, backend, image provider, kernel, or billable operation.

Run from the repository root after the files are integrated:

```powershell
./tests/ui/request-boundary/run.ps1 -RunId YOUR_UNIQUE_RUN_ID
```

The launcher locates the repository by its environment script, dot-sources `tools/development/env.ps1`, and uses the existing read-only Node 24.19.0 and `.toolchain/app-runtime/node_modules`. The suite needs the installed React, React DOM, Vite, TypeScript, Playwright, and three browser binaries. It never installs or downloads dependencies. Browser profiles, Vite cache, application data, temporary files, snapshots and results stay in the selected run. A candidate copy under a run can execute its own `tests/ui/request-boundary/run.ps1` before promotion; there is no dependency on a previous run.

Default execution runs the pure Node tests, strict TypeScript checking of the actual imported React component graph, and Chromium/Firefox/WebKit in sequence. `-Engines chromium` is a focused run, not three-browser evidence. Overall exit 1 means a failed assertion, failed typecheck, console/page error, unexpected non-loopback request, or incomplete engine execution; failures are not marked expected to manufacture a passing result.

The first run captures current `src/ui/**`, `src/contracts/**`, and the instructions/dependency metadata into `inputs/main`, recording bytes and SHA-256 in `inputs/capture.json`. It stages those exact captured bytes with the candidate tests into `work/h`. Later executions reject a changed main input instead of silently replacing that evidence. After an explicitly announced production revision, preserve the previous input and use:

```powershell
./tests/ui/request-boundary/run.ps1 -RunId YOUR_UNIQUE_RUN_ID -InputRevision r2 -EvidenceLabel r2
```

That creates `inputs/revisions/r2/main` with a separate `capture.json`. `-EvidenceLabel` names the output below `evidence/ui-request-boundary/`; reusing a label replaces only that label's generated results. Use a fresh label for evidence that must be retained. All source paths in the runner resolve from the repository/candidate location. The capture contains hashes, not a claim that the main production tree was modified by this suite.

`results.json` records the input-manifest hash, exact test-file hashes, installed package versions, browser versions, individual checks and errors. `pure.txt` and `typecheck.txt` retain native results. The browser's only permitted HTTP origin is its private loopback Vite server; external requests are blocked and fail the run. A real file chooser is intercepted by Playwright, and the chosen File is supplied through the actual input change handler, without opening a desktop chooser.

Promise order is explicit: click a real React handler, observe the held call, change context or input/unmount, and then settle the held call within React `act`. Account A→B→A and project P1→P2→P1 each send two synchronous bridge notifications in a single React event handler. Assertions verify that only the final identity committed while the monotonic context counter advanced. No delay or timeout is used to invent a race; normal browser startup/selector readiness deadlines are not race controls.

The suite asserts state contents and real DOM effects, including diagnostic detail, bounded dropped-answer codes, confirmation title/changes, live quote presence, toast counts and live-region text. A generic log entry may record the fact of a dropped answer; none of its synthetic private payload may appear. Positive controls require current matching errors and confirmations to remain visible and ensure wrapped commands are handled only once.

The optional `baseline.mjs` reproduces two pure collisions from an explicitly selected historical `identity.ts`. Set `ARCH_UI_BASELINE_IDENTITY` to that file inside this repository and `ARCH_UI_TEST_INPUT` to the current captured input, then execute it with the repository Node after dot-sourcing the run environment. It copies and hashes the historical source inside the current run; there is no built-in historical path. This optional check is not a full old-UI browser comparison.

See [coverage](coverage.md), [recorded r1 findings](r1-findings.md), and [evidence index](evidence.md). These are implementation regression tests, not an independent review or backend qualification. The inherited seat was described as Astra/max; fast-mode verification was unavailable, so no qualified seat-review result is claimed.
