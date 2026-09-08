The frozen input is pinned by `inputs/source-manifest.json`; verification must succeed before interpreting a replay. All commands below were run from the repository root in PowerShell with:

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId 20260908-mesh-checker-review-r1
$room = $env:PROJECT_REVIEW_RUN
$node = Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
```

Actual test invocation arguments, timestamps, exit codes and entry-script hashes are retained in each `evidence/*-attempt-*/command.json` and in the standalone supplied-suite/oracle command files. `work/run-check.ps1` supplies this environment, uses the pinned Node executable and refuses to reuse a command-log directory. Several scenario scripts have fixed result filenames; preserve the original evidence and replay in a fresh archival copy of the review room. The source snapshot and runtime pair must keep their manifest hashes. Do not run a replay over the sealed artifacts.

| Executed script under `work/` | Evidence command directory | Actual exit |
| --- | --- | ---: |
| `independent-geometry.mjs` | `independent-geometry-attempt-1` | 0 |
| `predicate-corpus.mjs` | `predicate-corpus-attempt-1` | 0 |
| `predicate-oracle.py` (Python, after corpus generation) | `predicate-oracle-attempt-1-command.json` | 0 |
| `adversarial-solids.mjs` | `adversarial-solids-attempt-1` | 0 |
| `voxel-oracle.mjs` | `voxel-oracle-attempt-1` | 0 |
| `contact-and-containment.mjs` | `contact-containment-attempt-1` | 0 |
| `independent-authority.mjs` | `independent-authority-attempt-1` | 1 |
| `independent-authority-launch.mjs` | `independent-authority-attempt-2` | 1 |
| `independent-authority-launch-v2.mjs` | `independent-authority-attempt-3` | 0 |
| `browser-harness/browser.test.mjs` | `browser-baseline-attempt-1` | 0 |
| `independent-browser.mjs` | `independent-browser-attempt-1` | 1 |
| `independent-browser-v2.mjs` | `independent-browser-attempt-2` | 1 |
| `independent-browser-v3.mjs` | `independent-browser-attempt-3` | 1 (Chromium/WebKit completed; Firefox navigation failed) |
| `independent-browser-v4.mjs` | `independent-browser-attempt-4` | 0 (Firefox only) |
| `volume-diagnostic-browser.mjs` | `volume-diagnostic-attempt-1` | 0 (diagnostic only) |
| `verify-snapshot.mjs` | `source-final-verification` | 0 |
| `seal-initial.mjs` | `initial-seal-command` | 0 |

The browser environment settings actually used were:

| Attempt | Environment in addition to project env |
| --- | --- |
| Supplied baseline | `SCENE_RUNTIME_DIRECTORY=$room/work/module`, `SCENE_BROWSER_TAG=baseline-1`, `SCENE_BROWSER_PAGE=initial`; engines and qualification used defaults `chromium,firefox,webkit` and `complete` |
| Independent 1 | Default `REVIEW_BROWSER_TAG=independent-1`, all three engines, initial page; stopped during route collection |
| Independent 2 | `REVIEW_BROWSER_TAG=independent-2`, all three engines, initial page |
| Independent 3 | `REVIEW_BROWSER_TAG=independent-3`, all three engines, initial page |
| Independent 4 | `REVIEW_BROWSER_TAG=ind-ff-4`, `REVIEW_BROWSER_ENGINES=firefox`, `REVIEW_BROWSER_PAGE=new`; shorter profile path |
| Volume diagnostic | `REVIEW_BROWSER_TAG=volume-diag-5`, `REVIEW_BROWSER_ENGINES=chromium`; initial page |

The supplied Node command was `$node --test` with the five captured files `qualification.test.mjs`, `provider.test.mjs`, `provider-analysis.test.mjs`, `material-ledger.test.mjs`, and `gates.test.mjs` under `work/review-source/tests/final-scene`. Its genuine exit code was 0; it was not counted as independent geometry evidence. The supplied PowerShell runner was read for its environment and prerequisites but was not invoked: it would discover a root within the frozen tree, so an own-room wrapper was used instead. No overlay replaced captured checker or root source modules.

The original supplied browser harness and page remain in the frozen snapshot. The adapted own-room baseline changes only the base path to captured source, the private profile location, the explicit loopback request allowlist, and route exclusion of backend/test/tool modules. The separate independent harness uses a transitive source-module route allowlist; omitted optional text assets remain unserved. Root runtime bytes were staged from `runtime-production` without rebuilding. Browser route manifests pin every served module, synthetic reviewer Worker and runtime file; no server maps the repository root or evidence directories.

Failed attempts are fully retained. Their causes and the independent source-volume diagnostic are described in `initial-review.md`. The `.mjs` versions in `work/` were kept rather than overwritten. No dependency was installed: the authority launcher's resolver points to existing `fflate` 0.8.3 and `@xmldom/xmldom` 0.9.12 in `.toolchain/printing-js`. Browser automation uses pinned Playwright 1.63.0 and repo browser revisions. Private browser caches and raw agent session/event/profile data are intentionally excluded from the shareable evidence manifest.
