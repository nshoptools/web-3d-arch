# Portable test runner with bounded online-policy overlay

Run from main after integration, with an explicit seat and a new run ID:

~~~powershell
. ./tools/development/env.ps1 -Seat codex -RunId <own-run-id>
./tests/app/run.ps1 -Seat codex -RunId <own-run-id>
~~~

The frozen handoff used the own-room tests/app/run.ps1 and the exact selected cases in reports/checks.json and handoff.md. Main mode stages current main. Own-room mode stages current main plus the explicit source delta in stage.mjs. There is no hardcoded prior-room product path. The runner requires RunId and matching PROJECT_REVIEW_RUN, discovers the real repository with git or the project environment scripts, and ignores nested tests/AGENTS.md as a root marker.

Each invocation creates a unique runtime, evidence directory and per-browser profile/temp/download path inside the supplied run. .toolchain app-runtime and Playwright binaries are read-only. Current src/server, tests/server/helpers.mjs and fixtures are staged for the real authenticated backend. Three vendor bytes come from the installed repo dependency. SHA-256 checks bind source, staged and browser-served modules.

The HTTPS loopback server listens on an ephemeral private port with an in-memory static whitelist. Only staged browser modules, the harness and required Three modules are served. Repository roots, credentials, tmp, backend source and test helper routes are denied. A self-signed certificate lives only under that run; browser contexts explicitly ignore its test trust error. Synthetic test accounts/provider metadata are confined to the local backend fixture. External browser requests are blocked.

The online suite forces Ed25519 NotSupportedError and verify=false branches in clearly marked tests. It also exercises undoubled Ed25519 behavior: Chromium/Firefox verify the actual backend signature; this installed WebKit reports unsupported. OPFS capability is measured, including the explicit WebKit verification-failed IDB fallback. Those are separate unavailable capability outcomes, never a skipped check counted as support. Geometry is an analytical test double. The editing shutdown test uses the actual Worker with resident raster data and checks that reset terminates it and closes later RPC.

This payload includes the five portable runner/test support files already handed to parent separately. The manifest marks identical files as already-identical and captures the current main preimages of the three extended runner scripts; compare those hashes before integration. It does not replace server helpers, fixtures or vendor bytes.
