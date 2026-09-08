[CmdletBinding()]
param([string]$RunId='20260908-raster-wave2')
$ErrorActionPreference='Stop'
$parityRepo=Get-Item -LiteralPath $PSScriptRoot
while($parityRepo -and -not(Test-Path -LiteralPath (Join-Path $parityRepo.FullName 'tools/development/env.ps1'))){$parityRepo=$parityRepo.Parent}
if(-not $parityRepo){throw 'Candidate must be inside the repository'}
. (Join-Path $parityRepo.FullName 'tools/development/env.ps1') -Seat codex -RunId $RunId
if($RunId -ne '20260908-raster-wave2'){throw 'This evidence runner is scoped to the wave2 run'}
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:RUSTUP_TOOLCHAIN='1.98.1-x86_64-pc-windows-msvc'
$env:RUSTUP_AUTO_INSTALL='0'
$env:RUSTC=Join-Path $env:PROJECT_ROOT '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin/rustc.exe'
$env:RUSTDOC=Join-Path $env:PROJECT_ROOT '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin/rustdoc.exe'
$env:EMSDK_NODE=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
$env:EMSDK_PYTHON=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/python/3.13.3_64bit/python.exe'
$env:EMCC_SKIP_SANITY_CHECK='1'
$env:EMCC_CORES='4'
$env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $env:PROJECT_ROOT '.toolchain/playwright'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1'
New-Item -ItemType Directory -Path $env:CARGO_HOME,$env:EM_CACHE -Force | Out-Null
if(-not(Test-Path -LiteralPath "$env:EM_CACHE/sysroot/include/assert.h")){
    New-Item -ItemType Directory -Path "$env:EM_CACHE/sysroot" -Force | Out-Null
    Copy-Item -Path "$env:PROJECT_ROOT/.toolchain/emsdk/upstream/emscripten/cache/sysroot/*" -Destination "$env:EM_CACHE/sysroot" -Recurse -Force
    Copy-Item -LiteralPath "$env:PROJECT_ROOT/.toolchain/emsdk/upstream/emscripten/cache/sysroot_install.stamp" -Destination "$env:EM_CACHE/sysroot_install.stamp" -Force
}
$parityCrate=Split-Path -Parent $PSScriptRoot
$parityCargo=Join-Path $env:PROJECT_ROOT '.toolchain/cargo/bin/cargo.exe'
$started=[DateTimeOffset]::UtcNow
$nativeArgs=@('run','--manifest-path',"$parityCrate/Cargo.toml",'--locked','--release','--example','parity_harness')
& $parityCargo @nativeArgs *> "$env:PROJECT_REVIEW_RUN/evidence/native-parity.log"
if($LASTEXITCODE -ne 0){throw "Native parity executable failed: $LASTEXITCODE"}
$env:CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_LINKER=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/upstream/emscripten/emcc.exe'
$env:CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_RUSTFLAGS='-C link-arg=-sMODULARIZE=1 -C link-arg=-sEXPORT_NAME=RasterParity -C link-arg=-sALLOW_MEMORY_GROWTH=1 -C link-arg=-sMAXIMUM_MEMORY=1073741824 -C link-arg=-sSTACK_SIZE=8388608 -C link-arg=-sEXPORTED_FUNCTIONS=_main,_raster_parity_run,_raster_parity_len -C link-arg=-sEXPORTED_RUNTIME_METHODS=HEAPU8 -C link-arg=-sENVIRONMENT=web,worker,node'
$wasmArgs=@('build','--manifest-path',"$parityCrate/Cargo.toml",'--locked','--release','--target','wasm32-unknown-emscripten','--example','parity_harness')
& $parityCargo @wasmArgs *> "$env:PROJECT_REVIEW_RUN/evidence/wasm-build-final.log"
if($LASTEXITCODE -ne 0){throw "WASM parity build failed: $LASTEXITCODE"}
# The repo is ESM; generated Emscripten factory is CommonJS for Node.
'{"type":"commonjs"}' | Set-Content -LiteralPath "$env:CARGO_TARGET_DIR/wasm32-unknown-emscripten/release/examples/package.json" -Encoding utf8NoBOM
& $env:EMSDK_NODE "$PSScriptRoot/parity-runner.mjs" 2>&1 | Tee-Object -FilePath "$env:PROJECT_REVIEW_RUN/evidence/parity-run.log"
$parityExit=$LASTEXITCODE
[pscustomobject]@{
    startedUtc=$started.ToString('o');endedUtc=[DateTimeOffset]::UtcNow.ToString('o')
    nativeCommand=@($parityCargo)+$nativeArgs;wasmCommand=@($parityCargo)+$wasmArgs
    nodeCommand=@($env:EMSDK_NODE,"$PSScriptRoot/parity-runner.mjs");exitCode=$parityExit
    rustc=(& $env:RUSTC --version);emcc=(& $env:CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_LINKER --version | Select-Object -First 1)
    rustflags=$env:CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_RUSTFLAGS
    cargoHome=$env:CARGO_HOME;targetDir=$env:CARGO_TARGET_DIR;emCache=$env:EM_CACHE;temp=$env:TEMP
    evidenceKind='implementation native/WASM/Worker tests; not independent review'
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath "$env:PROJECT_REVIEW_RUN/evidence/parity-command-result.json" -Encoding utf8NoBOM
exit $parityExit

