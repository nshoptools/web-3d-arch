# Human inspection (explicit local test identity)

Mode Preview uses the actual sealed release entry, Workers, WASM, HTTPS host and SQLite, and leaves a visible private Chromium window open. The logged-in member is a **local synthetic OIDC test identity**, not a production account. The backend verifies real signed OIDC/PKCE, session and CSRF in test-only configuration. No production IdP/TLS setup or external paid provider is implied. The UI bundle itself is unchanged.

Run from repo PowerShell after generating own-run TLS and Verify (see API-EARLY):

```powershell
. ./tools/project-env.ps1 -Seat codex -RunId <own-run>
& <candidate>/tests/product-acceptance/run.ps1 -RunId <own-run> -InputPath <exact-input.json> -Label human-preview -Mode Preview -Engine chromium
```

The JSON output/evidence/human-preview-chromium/preview.json gives actual ephemeral loopback origin, test user ID, PID and STOP-PREVIEW path. Use the opened private browser: another browser/profile has no test session and cannot rely on these bootstrapped cookies. Do not copy cookies to a production origin. All state, test keys, profile and downloads remain inside own run; the native engine remains local.

Closing that visible page or Ctrl+C stops it and closes the backend/IdP/browser. Alternatively create the exact STOP-PREVIEW file reported by this instance; do so under the same own-run project-env. It polls only that owned stop file. It does not schedule later agent work.

This command is a persistent test-host mode, not deployment. The baseline is suitable for inspecting known behavior with declared blockers. For the final artifact replace the whole input pin set, run integrity verification, then use a fresh label/profile. Check explicit STL float-conditioning proposal, displayed bounded change, consent, exact current revision and downloaded receipt in a limited smoke; do not carry approval or bytes from this baseline.
