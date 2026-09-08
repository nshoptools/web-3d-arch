#requires -Version 7
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[ValidateSet('native','wasm')][string]$Target='native',[switch]$CppOnly,[switch]$SkipPrepare)
$ErrorActionPreference='Stop'
$exportRoot=$env:PROJECT_ROOT
if(-not $exportRoot){$exportRoot=(Get-Location).Path}
if(-not (Test-Path -LiteralPath (Join-Path $exportRoot 'AGENTS.md'))){throw 'Set PROJECT_ROOT or run from repo root'}
. (Join-Path $exportRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$exportCandidate=Split-Path -Parent $PSScriptRoot
$exportKernel=Join-Path $env:PROJECT_REVIEW_RUN 'work/kernel-overlay'
if(-not $SkipPrepare){
 & node (Join-Path $PSScriptRoot 'prepare.mjs')
 if($LASTEXITCODE){throw 'Private overlay preparation failed'}
}
if(-not (Test-Path -LiteralPath (Join-Path $env:CARGO_HOME 'registry'))){
 New-Item -ItemType Directory -Path $env:CARGO_HOME -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $exportRoot '.toolchain/cargo/registry') -Destination $env:CARGO_HOME -Recurse
}
$exportBuild=Join-Path $env:PROJECT_REVIEW_RUN "work/$Target-build"
$env:ARCH_NATIVE_BUILD=$exportBuild
$env:ARCH_PRINTING_ENABLED=''
$exportArgs=@('-S',"$exportKernel/native",'-B',$exportBuild,"-DARCH_MANIFOLD_SOURCE=$exportRoot/.toolchain/manifold","-DARCH_CLIPPER2_SOURCE=$exportRoot/.toolchain/clipper2-derived","-DARCH_HARFBUZZ_SOURCE=$exportRoot/.toolchain/harfbuzz-original",'-DARCH_NATIVE_SMOKE=OFF','-DARCH_FONT_PROBE=OFF','-DARCH_FINAL_EXPORT_TESTS=ON','-DFETCHCONTENT_FULLY_DISCONNECTED=ON','-DFETCHCONTENT_UPDATES_DISCONNECTED=ON')
if($Target -eq 'native'){
 $exportArgs+=@('-G','Visual Studio 18 2026')
 $env:RUSTFLAGS=''
 $exportRustArgs=@('+1.98.1','build','--release','--example','final-export-probe')
}else{
 $exportArgs+=@('-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$exportRoot/.toolchain/ninja/bin/ninja.exe","-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake",'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_C_FLAGS=-pthread','-DCMAKE_CXX_FLAGS=-pthread -fexceptions')
 $env:RUSTFLAGS='-C panic=abort -C target-feature=+atomics,+bulk-memory,+mutable-globals'
 $env:EMCC_CFLAGS='-pthread -fexceptions'
 $env:CARGO_TARGET_DIR=Join-Path $env:PROJECT_REVIEW_RUN 'work/rust-nightly-target'
 $exportRustArgs=@('+nightly-2026-09-07','build','-Zbuild-std=std,panic_abort','--target','wasm32-unknown-emscripten','--release','--lib')
}
foreach($exportStep in @('configure','build')){
 $exportLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$Target-$exportStep.log"
 if($exportStep -eq 'configure'){& $env:CMAKE @exportArgs *> $exportLog}
 else{& $env:CMAKE --build $exportBuild --config Release --parallel 5 *> $exportLog}
 if($LASTEXITCODE){Get-Content -LiteralPath $exportLog -Tail 25;throw "C++ $exportStep failed"}
}
if($CppOnly){Write-Output $exportBuild;return}
$exportRustArgs+=@('--manifest-path',"$exportKernel/Cargo.toml",'--locked','--offline','--features','test-fixtures')
& "$exportRoot/.toolchain/cargo/bin/cargo.exe" @exportRustArgs *> "$env:PROJECT_REVIEW_RUN/evidence/$Target-rust.log"
if($LASTEXITCODE){Get-Content -LiteralPath "$env:PROJECT_REVIEW_RUN/evidence/$Target-rust.log" -Tail 35;throw 'Rust build failed'}
if($Target -eq 'wasm'){
 $exportModule=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
 New-Item -ItemType Directory -Path (Split-Path -Parent $exportModule) -Force | Out-Null
 $exportFunctions=@('_arch_abi_version','_arch_control_ptr','_arch_control_reset','_arch_snapshot_acquire','_arch_snapshot_ptr','_arch_snapshot_len','_arch_snapshot_release','_arch_error_ptr','_arch_error_len','_arch_metadata_ptr','_arch_metadata_len','_arch_input_create','_arch_input_ptr','_arch_input_release','_arch_build_svg','_arch_test_fixture','_arch_export_stl','_arch_output_ptr','_arch_output_len','_arch_output_release','_arch_final_test_fixture','_arch_final_test_stats','_malloc','_free')
 $exportFunctions+=@(Get-Content -LiteralPath (Join-Path $exportCandidate 'native/exports.json') -Raw | ConvertFrom-Json)
 $exportJSON=ConvertTo-Json -InputObject $exportFunctions -Compress
 python -B "$env:EMSDK/upstream/emscripten/em++.py" "$env:CARGO_TARGET_DIR/wasm32-unknown-emscripten/release/libarch_kernel.a" -o $exportModule --no-entry -O2 -pthread -fexceptions -sWASM_BIGINT=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_TABLE_GROWTH=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=1073741824 -sSTACK_SIZE=4194304 "-sEXPORTED_FUNCTIONS=$exportJSON" '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPU32","HEAPF64","addFunction","removeFunction"]' *> "$env:PROJECT_REVIEW_RUN/evidence/wasm-link.log"
 if($LASTEXITCODE){Get-Content -LiteralPath "$env:PROJECT_REVIEW_RUN/evidence/wasm-link.log" -Tail 25;throw 'WASM link failed'}
 Write-Output $exportModule
}else{Write-Output (Join-Path $env:CARGO_TARGET_DIR 'release/examples/final-export-probe.exe')}
