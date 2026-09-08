#requires -Version 7.0
[CmdletBinding()]
param([string]$RunId,[ValidateSet('native','wasm')][string]$Target='native',[string]$CandidateRoot,[string]$EvidenceTag='r1')
$ErrorActionPreference='Stop'
$taskRepository=([IO.Path]::GetFullPath((Get-Location).Path))
if(-not(Test-Path -LiteralPath "$taskRepository/AGENTS.md")){throw 'Run from repository root'}
. "$taskRepository/tools/development/env.ps1" -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:CARGO_NET_OFFLINE='true'
if(-not $CandidateRoot){$CandidateRoot=Join-Path $env:PROJECT_REVIEW_RUN 'work/imported-csg-root'}
$CandidateRoot=[IO.Path]::GetFullPath($CandidateRoot)
if(-not $CandidateRoot.StartsWith($env:PROJECT_REVIEW_RUN+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Candidate must be in own run'}
$taskBuild=Join-Path $env:PROJECT_REVIEW_RUN "work/$Target-build"
$env:ARCH_NATIVE_BUILD=$taskBuild
$env:ARCH_PRINTING_ENABLED=''
$taskKernel=Join-Path $CandidateRoot 'src/kernel'
$taskArgs=@('-S',"$taskKernel/native",'-B',$taskBuild,"-DARCH_MANIFOLD_SOURCE=$taskRepository/.toolchain/manifold","-DARCH_CLIPPER2_SOURCE=$taskRepository/.toolchain/clipper2-derived","-DARCH_HARFBUZZ_SOURCE=$taskRepository/.toolchain/harfbuzz-original",'-DARCH_NATIVE_SMOKE=OFF','-DARCH_FINAL_EXPORT_TESTS=ON','-DFETCHCONTENT_FULLY_DISCONNECTED=ON','-DFETCHCONTENT_UPDATES_DISCONNECTED=ON')
if($Target -eq 'native'){
 $taskArgs+=@('-G','Visual Studio 18 2026')
 $env:RUSTFLAGS=''
 $taskRustArgs=@('+1.98.1','build','--release','--features','test-fixtures')
}else{
 $taskArgs+=@('-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$taskRepository/.toolchain/ninja/bin/ninja.exe","-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake",'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_C_FLAGS=-pthread','-DCMAKE_CXX_FLAGS=-pthread -fexceptions')
 $env:RUSTFLAGS='-C panic=abort -C target-feature=+atomics,+bulk-memory,+mutable-globals'
 $env:EMCC_CFLAGS='-pthread -fexceptions'
 $env:CARGO_TARGET_DIR=Join-Path $env:PROJECT_REVIEW_RUN 'work/rust-nightly-target'
 $taskRustArgs=@('+nightly-2026-09-07','build','-Zbuild-std=std,panic_abort','--target','wasm32-unknown-emscripten','--release','--lib','--features','test-fixtures')
}
$taskPrefix=Join-Path $env:PROJECT_REVIEW_RUN "evidence/root-$Target-$EvidenceTag"
if(Test-Path -LiteralPath "$taskPrefix-configure.log"){throw 'Evidence tag exists'}
& $env:CMAKE @taskArgs *> "$taskPrefix-configure.log"
if($LASTEXITCODE -ne 0){Get-Content "$taskPrefix-configure.log" -Tail 30;throw 'configure failed'}
& $env:CMAKE --build $taskBuild --config Release --parallel 6 *> "$taskPrefix-build.log"
if($LASTEXITCODE -ne 0){Get-Content "$taskPrefix-build.log" -Tail 40;throw 'native library build failed'}
& "$taskRepository/.toolchain/cargo/bin/cargo.exe" @taskRustArgs --manifest-path "$taskKernel/Cargo.toml" --locked --offline *> "$taskPrefix-rust.log"
if($LASTEXITCODE -ne 0){Get-Content "$taskPrefix-rust.log" -Tail 55;throw 'Rust root build failed'}
if($Target -eq 'wasm'){
 $taskExports=@('_arch_abi_version','_arch_control_ptr','_arch_control_reset','_arch_snapshot_acquire','_arch_snapshot_ptr','_arch_snapshot_len','_arch_snapshot_release','_arch_error_ptr','_arch_error_len','_arch_metadata_ptr','_arch_metadata_len','_arch_input_create','_arch_input_ptr','_arch_input_release','_arch_build_svg','_arch_test_fixture','_arch_font_library_version','_arch_export_stl','_arch_output_ptr','_arch_output_len','_arch_output_release','_malloc','_free','_arch_mech_abi_version','_arch_mech_semantics_version','_arch_mech_source_datum_extension_version','_arch_mech_derived_guard_version','_arch_source_abi_version','_arch_source_semantics_version')
 foreach($taskList in @("$taskKernel/native/product-exports.json","$taskKernel/native/raster-exports.json","$taskKernel/final-scene-export/native/exports.json","$CandidateRoot/src/mesh-import/cmake/required-exports.json","$CandidateRoot/src/mesh-import/cmake/csg-exports.json","$CandidateRoot/src/mesh-import/cmake/root-exports.json")){
  $taskExports+=@(Get-Content -LiteralPath $taskList -Raw|ConvertFrom-Json)
 }
 $taskHb=& node --input-type=module -e 'import{readFileSync}from"node:fs";const m=new WebAssembly.Module(readFileSync("src/assets/harfbuzz/dist/harfbuzz.wasm"));console.log(JSON.stringify(WebAssembly.Module.exports(m).filter(e=>e.kind==="function"&&e.name.startsWith("hb_")).map(e=>"_"+e.name)));'
 if($LASTEXITCODE -ne 0){throw 'HB export inventory'}
 $taskExports+=@($taskHb|ConvertFrom-Json)
 $taskExportJson=ConvertTo-Json -InputObject @($taskExports|Select-Object -Unique) -Compress
 $taskModule=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
 New-Item -ItemType Directory -Path (Split-Path -Parent $taskModule) -Force|Out-Null
 $taskIncoming=ConvertTo-Json -InputObject @(Get-Content -LiteralPath "$CandidateRoot/tools/kernel/module-incoming-api.json" -Raw|ConvertFrom-Json) -Compress
 python -B "$env:EMSDK/upstream/emscripten/em++.py" "$env:CARGO_TARGET_DIR/wasm32-unknown-emscripten/release/libarch_kernel.a" -o $taskModule --no-entry -O2 -pthread -fexceptions -sWASM_BIGINT=1 -sMODULARIZE=1 -sEXPORT_ES6=1 "-sINCOMING_MODULE_JS_API=$taskIncoming" -sALLOW_TABLE_GROWTH=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=1073741824 -sSTACK_SIZE=4194304 "-sEXPORTED_FUNCTIONS=$taskExportJson" '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPU16","HEAPU32","HEAPF32","addFunction","removeFunction","stackAlloc","stackSave","stackRestore"]' *> "$taskPrefix-link.log"
 if($LASTEXITCODE -ne 0){Get-Content "$taskPrefix-link.log" -Tail 25;throw 'unified module link failed'}
 Write-Output $taskModule
}
