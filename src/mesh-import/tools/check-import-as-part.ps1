#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[Parameter(Mandatory)][string]$CandidateRoot,[string]$Tag='r1')
$ErrorActionPreference='Stop'
. ./tools/development/env.ps1 -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:CARGO_NET_OFFLINE='true'
$CandidateRoot=[IO.Path]::GetFullPath($CandidateRoot)
if(-not $CandidateRoot.StartsWith($env:PROJECT_REVIEW_RUN+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Candidate must be in own run'}
if($Tag -notmatch '^[a-zA-Z0-9_-]+$'){throw 'Tag domain'}
# Prepared caches are optional read-only sources; copy into the NEW run only.
foreach($pair in @(@('.toolchain/cargo/registry/cache','cache/cargo/registry/cache'),@('.toolchain/cargo/registry/index','cache/cargo/registry/index'),@('.toolchain/emsdk/upstream/emscripten/cache','cache/emscripten'))){
 $target=Join-Path $env:PROJECT_REVIEW_RUN $pair[1]
 if(-not(Test-Path -LiteralPath $target)){
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $env:PROJECT_ROOT $pair[0]) -Destination $target -Recurse
 }
}
$tests=Join-Path $CandidateRoot 'src/mesh-import/tests'
$build=Join-Path $CandidateRoot 'src/mesh-import/tools/build-root.ps1'
& $build -RunId $RunId -CandidateRoot $CandidateRoot -Target native -EvidenceTag $Tag
$env:ARCH_NATIVE_BUILD=Join-Path $env:PROJECT_REVIEW_RUN 'work/native-build'
& "$env:PROJECT_ROOT/.toolchain/cargo/bin/cargo.exe" +1.98.1 build --manifest-path "$CandidateRoot/src/kernel/Cargo.toml" --release --locked --offline --features test-fixtures --example import-as-part-probe *> "$env:PROJECT_REVIEW_RUN/evidence/apart-native-probe-$Tag.log"
if($LASTEXITCODE -ne 0){throw 'Native probe build failed'}
$env:PROOF_TAG=$Tag
node "$tests/prepare-import-as-part-native.mjs"
if($LASTEXITCODE -ne 0){throw 'Fixture generation failed'}
foreach($productKind in @('keychain','clicky','strap','lego','charm')){
 $out=Join-Path $env:PROJECT_REVIEW_RUN "evidence/import-as-part-native-$Tag/$productKind"
 if(Test-Path -LiteralPath $out){throw 'Evidence directory already exists'}
 New-Item -ItemType Directory -Path $out | Out-Null
 & "$env:CARGO_TARGET_DIR/release/examples/import-as-part-probe.exe" "$env:PROJECT_REVIEW_RUN/inputs/import-as-part-native-$Tag/$productKind/cases.json" $out *> "$out/run.log"
 if($LASTEXITCODE -ne 0){throw "Native $productKind failed"}
}
& $build -RunId $RunId -CandidateRoot $CandidateRoot -Target wasm -EvidenceTag $Tag
$env:ARCH_CSG_MODULE=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
node "$tests/import-as-part.test.mjs" *> "$env:PROJECT_REVIEW_RUN/evidence/apart-wasm-$Tag.log"
if($LASTEXITCODE -ne 0){throw 'WASM proof failed'}
$env:APART_NATIVE_EVIDENCE="evidence/import-as-part-native-$Tag"
$env:APART_WASM_EVIDENCE="evidence/import-as-part-wasm-$Tag"
node "$tests/import-as-part-oracles.mjs" *> "$env:PROJECT_REVIEW_RUN/evidence/apart-oracles-$Tag.log"
if($LASTEXITCODE -ne 0){throw 'Independent oracle failed'}
node "$tests/root-node.test.mjs" *> "$env:PROJECT_REVIEW_RUN/evidence/apart-parent-csg-$Tag.log"
if($LASTEXITCODE -ne 0){throw 'Existing CSG regression failed'}
