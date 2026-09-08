# Application build API1

Supersedes API-EARLY.md. Private tooling, no package.json change required.
CLI errors exit1 with a bounded code; compiler.log contains private build diagnostics.
Environment/key contents are not logged.

~~~text
node tools/application/pin-input.mjs <request.json> <new-input-directory>
node tools/application/cli.mjs prepare <application-input.json> <new-build-directory>
node tools/application/cli.mjs verify <build-directory> <prepared-sha256>
node tools/application/cli.mjs package <build-directory> <prepared-sha256> <new-artifact-directory>
~~~

PowerShell tools/application/run.ps1 accepts -Seat/-RunId/-Action/-InputPath:
prepare also needs -OutputPath; verify needs -SHA256; package needs both.
All paths are absolute within the repository. No symlinks/junctions/hardlinks.
Build work must use the caller's six run directories; only final package may also
use report/release/<id>.

## Exact input

~~~ts
type Pin = {file:string;sha256:string;bytes:number};
type Notice = {id:string;spdx:string;source:string;revision:string;file:string};
type Engine = {module:Pin;wasm:Pin;abi:2;semantics:3;source:2;buildReceipt:Pin};
type Request = {
 version:'arch-application-request/1';
 sourceRoot:string;appToolchainRoot:string;printingToolchainRoot:string;
 engine:Engine;libraryRoot:string;licenses:Notice[];privateLicenseRef:string;
};
type Input = {
 version:'arch-application-input/1';
 sourceRoot:string;appToolchainRoot:string;printingToolchainRoot:string;
 engine:Engine;
 library:{root:string;catalog:Pin;deployment:Pin;artwork:Pin;receipt:Pin;ready:Pin};
 licenses:(Notice & {sha256:string;bytes:number})[];
 privateLicenseRef:string;
};
~~~

pin-input pins declared files; it never chooses a grant/pair or repairs missing
legal coverage. Notice names are checked before reads. Embedded legal declarations
and oversized notices need explicitly prepared bounded records retaining original
hashes/byte offsets. Pinning alone is not prepare acceptance.

Library Pin.file names are exactly source-library/{catalog,deployment,artwork,
build-receipt,ready}.json. Other Pin.file paths are absolute. Deployed configs must
byte-match sourceRoot/src/assets/source-library. Exact current library:21,391
deduplicated resources/306,260,612 bytes and7,751 previews. The unchanged materializer
validates original schema; release planner verifies all resources and ready entries.

npm notices must match actual package LICENSE bytes/version; native notices match
declared source/version locks. Additional linked Rust/lib3mf/system notices belong
in the approved legal inventory. No customer/user.keys, TLS key, settings, provider
auth or detached credential file belongs here. Those are private operator inputs
after packaging. The project notice uses LicenseRef and privateLicenseRef, not an
invented public distribution license.

## Canonical native build input

engine.buildReceipt is a required exact Pin for arch-kernel-build-receipt/1.
It binds a production Printing=true/TestFixtures=false/exit0 canonical build,
its explicit command, outputs, three build inputs, two pinned Emscripten source
files and four named logs. The builder checks every actual referenced byte.
It captures tools/kernel/build.ps1 and module-incoming-api.json, checks the
explicit INCOMING_MODULE_JS_API flag and generated wasmBinary assignment, and
retains the untouched receipt/sources/logs privately under inputs/engine-build.
The current API list retains26 toolchain defaults plus wasmBinary. Limits:
receipt256KiB; source/log records1MiB each; exact record sets, no arbitrary file
collection. Key paths and unrelated logs are not accepted.

engine-build-contract.json and prepared.json bind this provenance and the exact
wrapper/WASM hashes. Keep the prepared seal with the separate release-manifest
seal; the strict existing arch-release-package/1 schema is unchanged. Exit0 and
syntactic/getter observations are not browser execution proof; see OWNED-WORKER.md.

## Generated files and semantics

- application-input.json: unchanged input bytes.
- inputs/source/: permitted main source, explicit private runtime/release recipe,
  source-library configs and build/legal metadata; NEVER public.
- inputs/engine/: unchanged original pair.
- inputs/licenses/, inputs/library/, inputs/toolchains/ and inputs/snapshot.json:
  own legal/config/lock copies and read-only dependency tree byte hashes.
- compiler-input.json, compiler-graph.json, compiler.log: settings, every actual
  loaded module hash, main/Worker chunks and resource edges.
- frontend/: actual compiled bytes plus addressed pair. .vite/manifest.json is
  private metadata and excluded from the public inventory.
- engine-derivation.json: original SHA/length, two byte offsets/quote styles,
  replacement count2, WASM SHA, derived wrapper SHA and full-addressed names.
- frontend-receipt.json: emitted entry/Workers/counts.
- runtime-lock.json: exact RUNTIME_FILES, Node24.19.0/schema5.
- package-input.json: exact arch-release-input/1 for the captured release tools.
- release-plan.json: fully checked deterministic release manifest before publication.
- input-stability.json: source/toolchain/pair checks and explicit scope boundaries.
- prepared.json: final seal binding the complete exact build file set.

prepare returns {version,status:'prepared',sha256,publicBuildId,publicAssets,
publicBytes,frontendFiles,sourceUnchanged:true,runtimeProof:'parent-required'}.
verify checks that exact seal. package returns existing release summary plus
preparedSHA256; release manifest SHA is the portable artifact verification key.

package checks prepared seal, builds in own staging, rechecks captured AND live
source/toolchain/pair, then renames to an absent destination under a publish lock.
Failure retains diagnostics and never publishes the requested destination.
No overwrite/delete shortcut or alternate runtime selection.

## Limits and errors

Source capture1,024 files/64MiB total; ordinary file/config64MiB.
Frontend4,096 files/64MiB total; real entry +4 ES Worker entries.
Toolchain20,000 files/1GiB per supplied installed tree.
Compiler180s deadline,1536MiB V8 heap ceiling,1MiB diagnostic capture.
Existing release limits:512MiB public,768MiB package,65,536 assets/32MiB manifest,
256 notices with1MiB each. These are admission/work limits and a V8 heap ceiling,
not an RSS cap, preload bound, OS scheduling or overall-duration guarantee.

Actionable failures:
- ENGINE_LITERAL_COUNT/ENGINE_UNEXPECTED_REFERENCE: wrong wrapper shape; supply
  the supported actual pair or obtain an explicit derivation change.
- ENGINE_VERSION_REQUIRED/INPUT_INTEGRITY: wrong version/hash/bytes; recapture.
- ENGINE_BUILD_*/ENGINE_INCOMING_API/ENGINE_WASM_INPUT_BINDING: supply the
  matching canonical receipt, untouched referenced inputs/logs and a generated
  factory retaining wasmBinary. Never infer execution proof from these checks.
- UNBUNDLED_SCRIPT_ASSET: source default emitted raw JS; fix source binding.
- SOURCE_CHANGED/TOOLCHAIN_CHANGED/BUILDER_CHANGED: take a new stable capture.
- LICENSE_PACKAGE_MISMATCH/LICENSE_NATIVE_MISMATCH/LICENSE_COVERAGE: correct
  original legal inventory; do not borrow another package's notice.
- LIBRARY_MAIN_MISMATCH or LIBRARY_*: use matching checked ready deployment,
  preserving original configs/suffixes.
- BUNDLE_EXTERNAL_INPUT/PRIVATE_BUNDLE_INPUT/BUNDLE_PATH_ESCAPE: remove invalid
  frontend dependency; never expose repository/backend paths.
