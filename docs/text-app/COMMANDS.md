# Reproduce source and text integration checks

Run from the repository root. Choose a fresh RunId. Set `ARCH_KERNEL_MODULE`
to an already built ABI2 `arch-kernel.mjs` inside this repository; its sibling
WASM must be the matching build. Tests reject missing or external module paths.

```powershell
. ./tools/development/env.ps1 -Seat codex -RunId text-app-verification
# Set ARCH_KERNEL_MODULE to the checked existing module before these commands.
node tests/text-app/node.test.mjs
node tests/text-app/browser.test.mjs chromium
node tests/text-app/browser.test.mjs firefox
node tests/text-app/browser.test.mjs webkit
node .toolchain/app-runtime/node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --allowJs --module NodeNext --moduleResolution NodeNext --target ES2024 (Join-Path $env:PROJECT_REVIEW_RUN 'work/text-app-stage/tests/text-app/types.test.mts')
```

The runners stage current source, adapter and controller dependencies into the
assigned run. Node runs first: it creates explicit fixture mappings and derives
the small monochrome thumbnail fixture from the original font. No production
asset is overwritten. Profiles, output and downloads remain in that run. Use one
engine at a time. Pinned tools must already be installed inside the repository.

Source-only regressions run directly from permanent paths with the same assigned
environment and `ARCH_KERNEL_MODULE`:

```powershell
node tests/text-source/node.test.mjs
node tests/text-source/bridge-client.test.mjs
node tests/text-source/browser.test.mjs
```

The inherited browser suite distinguishes successful cases, explicit unsupported
direct Worker-canvas cases and private main-renderer bridge results. Exit 2 means
an unavailable capability; exit 1 means a failed test or launch. Neither is an
unconditional pass. Source, adapter, root transport and full application
acceptance have separate scopes.

Root Worker integration uses `ARCH_WASM_MODULE`, set to the same checked module:

```powershell
$env:ARCH_WASM_MODULE = $env:ARCH_KERNEL_MODULE
node --test --test-concurrency=1 tests/kernel/text-rpc.test.mjs
```

This checks runtime ownership and source publication against the current root
worker. It does not prove full product, renderer-fallback, slicer or physical-fit
acceptance.
