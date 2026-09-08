# Raster application tests and binding

This directory documents the permanent tests in [tests/raster-app](../../tests/raster-app/README.md)
and the existing production [raster operations](../../src/core/raster-operations.mjs)
and [source adapter](../../src/integration/raster-adapters.mjs).

- [COMMANDS.md](COMMANDS.md): inputs, isolated staging and reproducible commands.
- [API.md](API.md): SourceContext, exact common approval, typed geometry and lifecycle.
- [CALLBACK-LIFECYCLE.md](CALLBACK-LIFECYCLE.md): product callback ownership, type delta and publication races.
- [ACCEPTANCE.md](ACCEPTANCE.md): exercised invariants and limits of the evidence.
- [NOTICES.md](NOTICES.md): unchanged synthetic fixture provenance and codec notices.
- [ASSET-LIBRARY-NEEDS.md](ASSET-LIBRARY-NEEDS.md): bounded follow-up needs from source-catalog.

No production Module is bundled with the tests. The host supplies an existing main
build through ARCH_KERNEL_MODULE; the runner copies that Module and current main
dependencies into its own run. The test Worker uses one Module and the production
dispatcher. It does not implement or qualify the application's EngineClient RPC.

The tests are implementation evidence, not independent review, complete application
acceptance, printer accuracy, physical fit or 3MF qualification.
