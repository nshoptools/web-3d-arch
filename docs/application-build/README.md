# Production application builder

Implementation tooling for index.html -> src/main.mjs -> the actual
src/integration/product-entry.mjs. It generates an explicit frontend inventory
for existing tools/release/plan/build, with private RUNTIME_FILES/schema5 and
unchanged source-library deployment1.

No UI/controller/entry/core/backend replacement or second Module. The sole wrapper
derivation replaces exactly two quoted arch-kernel.wasm literals with the full
WASM content address. All other emitted bytes remain unchanged. The original pair
and actual source/input hashes are retained.

## Operator flow

Node24.19.0; already installed pinned Vite8.2.2 toolchain, read-only.
Dot-source tools/project-env.ps1 with the actual Seat/RunId before writing Node
commands. The PowerShell wrapper applies it automatically. No install/download,
credentials, .env, custom Vite config, machine configuration or public test selector.

1. Supply an approved legal inventory and explicit module pair with expected
   bytes/SHA256 and the exact canonical engine.buildReceipt Pin. Fill arch-application-request/1 (API.md): current sourceRoot,
   app/printing toolchains and ready library.
2. pin-input.mjs copies original notices under safe NOTICE.txt names and produces
   application-input.json. Inspect exact pins and privateLicenseRef.
3. prepare captures main, runtime, original pair, legal/config bytes and toolchain
   pins BEFORE compiling. It audits actual output and invokes the frozen release
   planner to validate every resource and reference.
4. Keep the returned prepared SHA. verify rehashes the complete build and live
   inputs. package requires that exact SHA and publishes only after rechecking.
5. Run compiled-entry smoke and the parent's final application qualification.
   Configure/start/stop/rollback via the artifact's docs/release/RUNBOOK.md.

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId <fresh-run>
node tools/application/pin-input.mjs <absolute-request.json> <new-input-directory>
node tools/application/cli.mjs prepare <absolute-application-input.json> <new-build-directory>
node tools/application/cli.mjs verify <build-directory> <prepared-sha256>
node tools/application/cli.mjs package <build-directory> <prepared-sha256> <new-artifact-directory>
~~~

Angle-bracket values are explicit inputs, never defaults. No tmp module path is
inferred. Source/UI/core changes require a fresh capture. Existing builds/releases
are refused. All work/cache/logs/profiles stay in the chosen repository run. After
integration, only final packages may additionally target report/release/<id>.

## Runtime binding

The existing planner generates /release-bindings.json with actual compiled entry,
full-addressed engine pair, original catalog/deployment/artwork/receipt and separate
arch-release-transport/1. SVG/text bytes use inert .bin transport with unchanged
SHA/semantic media type. All7,751 previews are PNG. The actual browser bootstrap
bundles tools/release/source-transport.mjs and its pure pinned validator.

Production passes four explicit ?worker&url ES bundles. Source-level @vite-ignore
defaults remain only for direct unbundled component use; production must continue
passing all four URLs. Arbitrary dynamic fallback paths are not qualified.

Engine/library use full SHA256 with immutable cache. Vite's short chunk hashes use
revalidate, as do HTML and release-bindings. No recursive output rewriting,
sourcemaps, inlined assets, backend bundle or repository routes.

Prepared/packaged is artifact integrity. Parent runtime proof and combined app
acceptance remain separate, even when the compiled shell opens. No target fit,
slicer, native frame, physical printing, deployment or independent-review claim.

Absolute input paths affect private receipt/input identity. Public byte hashes and
buildId are deterministic; two packages from the SAME prepared input have identical
release manifests. Different request path strings may change private identity
without changing any public bytes.
