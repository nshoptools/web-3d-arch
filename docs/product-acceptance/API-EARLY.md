# Actual product acceptance API (frozen implementation candidate)

This supersedes the preparation-only early note. Baseline input is product-acceptance-input/2; full pins and production binding are in API-OWNED-R2.md. Own integrity verification passed before product tests. No UI/main/toolchain edits or independent-review claim. Opus is disabled by latest owner instruction; this harness neither calls nor waits for agents.

Run tests/product-acceptance/run.ps1 with mandatory RunId, InputPath and unique Label. Modes: Verify, Pilot, Campaign, Focused, Downloads, Interactions, Navigation, Preview, Node. Engine: chromium/firefox/webkit/all. CaseFilter is supported by Focused only; excluded cases are not executed and are never passes. Empty executed selection returns2. Each invocation copies source and input into its own immutable harness snapshot and verifies those source hashes after execution.

For a new run:
1. Dot-source tools/project-env.ps1 -Seat codex -RunId <id>.
2. Run generate-tls.ps1 -RunId <id> -OutputDirectory <absolute-ownrun>/temp/tls. It generates only run-scoped synthetic test credentials; do not install them into Windows.
3. Supply a fresh exact release/prepared input envelope; run Mode Verify once, then reuse its mandatory artifact-check.json. The supplied baseline.json is an environment-specific pin record, not a moving main alias.
4. Run the selected bounded smoke flow. All profiles, download directories, HTTPS host output and actual SQLite live under that run. No artifact mutation.

Production entry, source/geometry/editing/PNG/qualification Workers and WASM remain unchanged. The actual release's allowlisted HTTPS host validates all public assets at cold start. Every test uses the real UI DOM, keyboard and browser downloads; there is no controller global, fake recipe or native replacement. OIDC and AI provider are named local synthetic fixtures; real backend/auth/CSRF/settings/SQLite operate over HTTPS. No external or paid provider call.

Runtime creates an explicit new page, records startup phase times, and retains the unused blank page until context shutdown. Chromium trusts only the synthetic SPKI. Firefox/WebKit context TLS options are test-scoped; production COI/CSP are unchanged. Existing observations include long Firefox page startup and a manually interrupted contaminated run; consult handoff. Operation45s and navigation10s deadlines were not raised. newPage itself currently has no explicit120s guard; elapsed times are evidence, not an SLA pass.

Readback tests are infrastructure checks, not product acceptance. Real download readers verify ZIP CRC/inventory/SHA and STL topology/winding/degenerate faces/positive volume. They do not qualify self-intersections, physical fit or whole-pipeline tolerance. FROZEN and checked manifests bind candidate bytes and a snapshot of completed evidence; active/incomplete cases are explicitly excluded.
