# Native source test instructions

Run from the repository root in PowerShell. All generated files go to your new
own run; .toolchain is read-only. No prior run path is embedded in the tests.
The tests require the repository's existing pinned toolchains and dependencies;
they do not install packages or fetch resources.

## Prepare and capture

~~~powershell
. tools/development/env.ps1 -Seat codex -RunId YOUR-NEW-RUN
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:CARGO_TARGET_DIR=Join-Path $env:PROJECT_REVIEW_RUN 'work/rust-native-target'
$env:RUSTC=Join-Path $env:PROJECT_ROOT '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin/rustc.exe'
$env:RUSTDOC=Join-Path $env:PROJECT_ROOT '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin/rustdoc.exe'
$env:PIP_TARGET=Join-Path $env:PROJECT_REVIEW_RUN 'cache/python-deps'
$env:npm_config_prefix=Join-Path $env:PROJECT_REVIEW_RUN 'cache/npm-prefix'
$nsNode=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
& $nsNode tests/native-source/stage.mjs
$nsSource=Join-Path $env:PROJECT_REVIEW_RUN 'work/native-source-test-snapshot'
~~~

stage.mjs captures current main kernel/components/tests into inputs and a private
work copy. ARCH_SOURCE_TEST_ROOT may instead point to an in-repo candidate.
It rejects links and changed captures rather than overwriting them.
Existing app-runtime/printing-js node_modules are copied into the private tree.
Populate the own Cargo registry from the verified read-only pinned cache before
offline Cargo commands; never leave CARGO_HOME at the shared toolchain path.

## Build prerequisites

Set ARCH_KERNEL_MODULE to an actual matching unified arch-kernel.mjs (its
arch-kernel.wasm sibling must exist). Default main build layout is your build
run's work/module/arch-kernel.mjs. Module hashes are recorded in the evidence;
do not mix pre-patch native archives with a post-patch WASM pair.

Native tests use ARCH_NATIVE_BUILD pointing to your own CMake Release outputs.
Those archives must be built from the captured src/kernel/native with the pinned
Clipper2, Manifold, HarfBuzz and printing source dependencies. Enable
ARCH_PRINTING_ENABLED=1 for the unified build. The repository build process and
its prepared lib3MF source rules remain authoritative; this delta does not
replace build.rs, CMakeLists.txt or tools/kernel/build.ps1.

The implementation run used Visual Studio18 2026 x64, Rust1.98.1, Emsdk6.0.9,
nightly Rust2026-09-07 with build-std/atomics for wasm32-unknown-emscripten,
Clipper46f639177fe418f9689e8ddb74f08a870c71f5b4,
Manifold3.5.3 and HarfBuzz14.4.0 plus lib3MF2.5.0. There are no new production
dependencies. Exact build invocations and output hashes accompany the checked
handoff; tests can consume the parent's matching standard unified output.

## Native, Node and actual Worker suites

After dot-sourcing the own environment and setting the paths above:

~~~powershell
$env:ARCH_NATIVE_BUILD=Join-Path $env:PROJECT_REVIEW_RUN 'work/unified-native-build'
$env:ARCH_PRINTING_ENABLED='1'
$nsCargo=Join-Path $env:PROJECT_ROOT '.toolchain/cargo/bin/cargo.exe'
& $nsCargo +1.98.1 test --offline --locked --release --lib --manifest-path "$nsSource/src/kernel/Cargo.toml" -- --test-threads=1
& $nsCargo +1.98.1 run --offline --locked --release --manifest-path "$nsSource/tests/native-source/native/Cargo.toml" -- "$nsSource/tests/native-source/fixtures" "$env:PROJECT_REVIEW_RUN/evidence/native-source"
$env:ARCH_KERNEL_MODULE=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
& $nsNode --test "$nsSource/tests/native-source/runtime.test.mjs"
$env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $env:PROJECT_ROOT '.toolchain/playwright'
& $nsNode --test "$nsSource/tests/native-source/worker.test.mjs"
& $nsNode "$nsSource/tests/native-source/regenerate-text.mjs"
& $nsNode "$nsSource/node_modules/typescript/lib/tsc.js" --ignoreConfig --noEmit --strict --module nodenext --target es2022 --skipLibCheck "$nsSource/tests/native-source/api-types.mts"
~~~

Native must run before Node/Workers: its ARCH files are their independent parity
inputs. Node and Worker tests share actual root operations, not a fake backend.
The Worker server is private loopback with COOP/COEP; no UI/cloud/paid service.
Worker profiles are short own paths p/c, p/f, p/w. Firefox sets
network.proxy.type=0 and uses context.pages()[0] with a new-page fallback.
Navigation timeout remains30s and each Worker test remains120s. Do not increase
timeouts to mask a failure. Keep failed logs when changing harness configuration.

regenerate-text.mjs reads and verifies the original Inter.ttf from
src/assets/fonts/ttf/Inter.ttf and fonts-cat.json, and uses the same Module's
HarfBuzz functions. It does not use an OS font or second shaping Module.

## Direct pinned Clipper stages

The small C++ program consumes numeric records emitted by the actual SVG parser,
not SVG/XML itself. It reports union, viewport intersection and repeat union.
It is a diagnostic golden generator; the separate analytic/mesh tests remain
necessary.

~~~powershell
$nsClipBuild=Join-Path $env:PROJECT_REVIEW_RUN 'work/clipper-stage-build'
& $env:CMAKE -S "$nsSource/tests/native-source/clipper-stage" -B $nsClipBuild -G 'Visual Studio 18 2026' -A x64 "-DARCH_CLIPPER2_SOURCE=$env:PROJECT_ROOT/.toolchain/clipper2-derived"
& $env:CMAKE --build $nsClipBuild --config Release --parallel 4
$nsRecord=Join-Path $env:PROJECT_REVIEW_RUN 'evidence/source-record.json'
$nsNumeric=Join-Path $env:PROJECT_REVIEW_RUN 'evidence/source-numeric.txt'
& "$env:CARGO_TARGET_DIR/release/arch-native-source-tests.exe" dump-vector "$nsSource/tests/native-source/fixtures/combined-vietnamese-original.svg" $nsRecord
python -B "$nsSource/tests/native-source/clipper-stage/format-input.py" $nsRecord $nsNumeric
& "$nsClipBuild/Release/source_clipper_stage.exe" $nsNumeric "$env:PROJECT_REVIEW_RUN/evidence/clipper-stages.json"
~~~

The formatter is intentionally limited to these numeric no-extra-clip fixtures.
It refuses unsupported clip graphs; the production parser handles SVG syntax.
Do not regenerate checked goldens just to hide a mismatch.

Existing tests/kernel/svg-source.test.mjs can also be run with ARCH_NATIVE_BIN
pointing to the own root CLI and ARCH_WASM_MODULE to the same WASM pair. This
implementation preserved that suite byte for byte and ran all7 cases.
