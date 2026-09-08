From the repository root, before every writing PowerShell process:

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId 20260908-ui-export-review-r1
$env:REVIEW_PHASE='reproduce-comprehensive-01'
$env:REVIEW_ENGINES='chromium,firefox,webkit'
$env:REVIEW_ONLY=''
node (Join-Path $env:PROJECT_REVIEW_RUN 'work/browser-review/run.mjs')
```

Use a new phase label for fresh profile/evidence directories. REVIEW_ONLY may be followup, readability, or keyboard. support.mjs verifies the exact pinned manifest and every captured byte; @review imports work/review-source/src. PROJECT_ROOT is used only for installed read-only .toolchain dependencies. Do not redirect product imports to live main.

zoom.mjs uses a locally generated extension in work/browser-review/zoom-extension to call chrome.tabs.setZoom(2) on its own loopback tab. It uses existing full Chromium, measured window/content dimensions and native Page.captureScreenshot without clipping. It does not change global browser settings. Its final phase is browser-zoom-r6; copy/adapt that phase in another work script before rerunning to preserve original evidence.

DeferredBridge was copied from captured tests/ui/request-boundary/deferred-bridge.ts with its contract import redirected to @review. The independent harness adds the actual AppShell/StrictMode, fixture fields/receipts, deterministic publications and an observer. It never calls original support.mjs capture(), which defaults to live main.

Executed harness versions from r1, r2, r5 and r7 are archived in evidence/<phase>/scripts. r3/r4 zoom.mjs are archived beside their results. The current work scripts cover final probes. Failed attempts remain failures.

No installation is required: Node, .toolchain/app-runtime/node_modules and .toolchain/playwright were pre-existing. All outputs, profiles, Vite caches, APPDATA/LOCALAPPDATA, TEMP, downloads and traces belong to this room. Servers use ephemeral loopback ports and close in finally. Final cleanup and source verification are in evidence/process-cleanup-audit.json and evidence/source-verification-after.json.
