# App controller test runner portability delta

Implementation delta dated 2026-09-08. Integrate only the five files in tests/app and the two documents listed in the delta manifest. There are no src/app files in this delta. The previously checked 29-file controller candidate is immutable.

## Run from main

Use PowerShell 7 and the installed Node / .toolchain/app-runtime / .toolchain/playwright dependencies. Both Seat and RunId are mandatory; no previous room is a default.

~~~powershell
& ./tests/app/run.ps1 -Seat codex -RunId <explicit-own-run-id>
~~~

A bounded smoke run is explicit in its evidence:

~~~powershell
& ./tests/app/run.ps1 -Seat codex -RunId <explicit-own-run-id> -Browsers chromium,firefox,webkit -Cases completeSvgFlow,sourceEditActualWorker,separateVectorPreviewAndRemount
~~~

Omitting Cases selects the existing main controller suite. A selected run is not reported as a full suite. Unknown, repeated or empty browser/case selections fail. The runner invokes Node tests and TypeScript before the browser checks, and exits nonzero if a required phase fails or does not run.

The runner resolves the repository with git rev-parse --show-toplevel starting from its own file. If Git is absent or the source tree is exported, it ascends to tools/project-env.ps1 and tools/development/env.ps1. A nested tests/AGENTS.md never qualifies as the root. It dot-sources the actual development environment with the explicit seat/run before any test output is created.

Direct Node entry points also require --run-id and an already prepared matching PROJECT_ROOT / PROJECT_REVIEW_RUN / TEMP / TMP / TMPDIR. stage.mjs rejects a missing ID before allocating a runtime. run-browser.mjs must run from a staged runtime bearing its matching stage.json; do not launch the old main directory as a static root.

## Snapshot and dependencies

Each invocation creates a fresh timestamp/UUID stage under the selected room:

- work/app-controller-tests/<stage-id>/runtime: read-only test input snapshot after staging.
- evidence/app-controller-tests/<stage-id>: stage.json, node.log, types.log, browser.log, browser-results.json and exits.json.
- temp/app-controller-tests/<stage-id>: test-only TLS certificate, separate persistent profiles/download/cache/home/temp directories per browser.
- The actual tests/server/helpers.mjs separately creates unique evidence/http-sqlite-* directories in the same room for its synthetic SQLite backend and test IdP fixtures.

The stage copies current main src/app, domain, storage, editing, contracts and server code; the two viewport modules; main tests/app; tests/server/helpers.mjs and its committed fixture bytes. It copies only the three Three distribution files used by the harness from the installed .toolchain/app-runtime/node_modules/three. Nothing installs or changes .toolchain.

An unintegrated delta overlays its own five runner/test files into the stage. Product modules, existing test cases and backend helpers still come from current main, not from an earlier worker room. Once copied into main, those five files naturally also come from main. Each manifest entry records its source path, byte count and SHA-256. The stage rechecks source hashes before publishing stage.json and fails SOURCE_CHANGED_DURING_STAGE if a concurrent change is observed. It is a bounded file snapshot, not a claim of an atomic Git checkout.

The stage copies code/fixtures using explicit source directories and extensions, rejects linked/escaping paths and files larger than 32 MiB, and never deletes or reuses a previous stage. The runner verifies the browser binary path points at this repository's installed .toolchain/playwright.

## Server and evidence

The HTTPS loopback server binds an ephemeral 127.0.0.1 port. Its self-signed certificate is generated only for the test and stored inside the stage temporary directory; it is not installed in a certificate store. HTTPS errors are ignored only in this isolated test browser context. No production TLS exception is proposed.

Only explicitly whitelisted app/domain/storage/editing module URLs, the two viewport modules, three harness files and three Three vendor files can be served as static content. Each served byte sequence is checked against stage.json. Backend/IdP logic executes under Node; backend source, helper files, repo roots, tmp, .git and credential directories are not static routes. The runner checks forbidden paths and blocks browser requests outside the private harness origin. Server origins and test account credentials are not printed as public output.

exits.json is written with status running and null pending phase exits before tests. It is marked complete after the attempted phases; a null browser exit never counts as success. Per-stage output avoids mistaking an earlier browser result for the current run.

Browser cases use real IndexedDB/OPFS, the real editing Dedicated Worker, actual Three and actual backend route fixtures. The geometry/source/STL adapters are explicitly named analytical test doubles. This suite does not replace the parent's actual native-kernel/UI E2E or prove physical-crash durability. Capability outcomes unavailable are recorded independently from case pass/fail.

## Integration ownership

Parent owns the workspaceStep fix: default/reset/open 1, successful model promotion 2, and project.step changes presentation only after validating 1/2. Legacy persisted app.step remains readable. Navigation must not advance the manufacturing revision/history or invalidate a model export. This delta does not implement or overwrite controller.mjs, jobs.mjs or projects.mjs and does not independently qualify that UI fix.

See webkit-online-session-policy.md for the observed signature capability and the proposed release gate. Copy only the files listed in reports/controller-portability-files.json; the surrounding stages, profiles and backend databases are evidence, not product inputs.
