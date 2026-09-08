# Actual release binding — owned-r2
Implementation/test only, inherited Astra/max; fast/service-tier not exposed. No independent configured review.

The input is tests/product-acceptance/baseline.json. It binds:
- release manifest 1147ad94ad005ffdb5f2524e4d9e6ada71778f3cc84c1b3cf590b2165c3b621f
- prepared seal 136b8b90a35e4007a6e110db7a2737d73eb25f12c8b33fc9b44b595fb333d2e9
- canonical module 64c5f89e2ee8fecda371436f907faf83e9120c41e11089979bd011bc8a197ed2
- derived public module 11870a06cd38aa2d86c5faf3e4a6fd158e4d52062ff3ed9a2bd8eb67e1f81877
- WASM b67d421769ba188e5dc6328bf520ab683213239459da3c308d92411df458e949
- canonical build receipt 171daf4a7bcb16836970ace1634217ed8aeb6d986da4ad2ef0963abb1a991f42.

The complete package and owned prepared file set are checked, including hash/length/path/link constraints, and the package's sealed canonical verifier is run. Preparation source/main stability at its original build time belongs to the builder; later live main is deliberately not a runtime dependency. The exact frozen package is served read-only by its actual host; all TLS, SQLite, profiles, downloads and evidence are in the acceptance run.

The public entry is the unmodified compiled src/main.mjs -> bootProductApplication -> productProcessing composition. Four emitted Workers are actual geometry/source, PNG, editing, and mesh qualification. No global controller is added, no recipe or adapter is replaced, and downloads use the product's actual browser anchor route.

Device initialization: localStorage arch-device-v1 uses the backend-issued test member's exact device UUID before the first production entry. This is synthetic identity setup only. The actual signed OIDC/PKCE exchange, closed owner invitation, backend session, CSRF, settings routes and SQLite remain real. No browser authorization bypass is used. The local test IdP's HTTP authorization URL cannot satisfy production HTTPS navigation policy; IdP UI navigation is not covered by this fixture.

Read-only witnesses use existing DOM attributes: data-step-chip, data-visible-model-revision, data-export-option, data-export-receipt*. Rescue packages and raw export downloads are independently decoded. Assertions never invoke controller.dispatch or mutate product state outside UI.

The baseline includes no dedicated printer profile library screen. Its settings JSON import/export/reset paths can still exercise real personal settings composition without a project. Dedicated profile rows/import/delete are retained as not covered until rebuilt UI arrives. Known native curved failures and pending source/import features stay open.

The eight readback/ledger Node tests are harness tests, not whole-product passes. A pilot is separately labeled; the final campaign's requirement verdicts need executed flow evidence.
