#requires -Version 7.0
[CmdletBinding()]
param(
  [ValidateSet('codex','opus','grok')][string]$Seat='codex',
  [Parameter(Mandatory)][string]$RunId,
  [Parameter(Mandatory)][ValidateSet('native','wasm')][string]$Target,
  [switch]$TestFixtures,
  [switch]$Printing,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$')][string]$EvidenceTag,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$')][string]$ModuleDirectory='module'
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../development/env.ps1') -Seat $Seat -RunId $RunId
$kernelRoot=Join-Path $env:PROJECT_ROOT 'src/kernel'
$kernelManifold=Join-Path $env:PROJECT_ROOT '.toolchain/manifold'
$kernelClipper=Join-Path $env:PROJECT_ROOT '.toolchain/clipper2-derived'
$kernelHarfBuzz=Join-Path $env:PROJECT_ROOT '.toolchain/harfbuzz-original'
$env:ARCH_PRINTING_ENABLED=''
$kernelPrinting=Join-Path $env:PROJECT_ROOT 'src/printing'
if($Printing){
  python -B (Join-Path $kernelPrinting 'tools/verify-unified-inputs.py')
  if($LASTEXITCODE -ne 0){throw 'Prepare pinned printing dependencies in this run first'}
  $kernelManifold=Join-Path $env:PROJECT_REVIEW_RUN 'work/deps/manifold'
  $kernelClipper=Join-Path $env:PROJECT_REVIEW_RUN 'work/deps/clipper2-derived'
  $kernelHarfBuzz=Join-Path $env:PROJECT_REVIEW_RUN 'work/deps/harfbuzz-original'
  $env:ARCH_PRINTING_ENABLED='1'
}
if(-not (Test-Path -LiteralPath (Join-Path $kernelClipper 'CPP/CMakeLists.txt'))){throw 'Run tools/kernel/prepare-clipper.ps1 with your seat/run first'}
if(-not $Printing -and (git -C $kernelManifold rev-parse HEAD).Trim() -ne '0edd9d54876f3135e431575214dd6d8a72866fee'){throw 'Unexpected Manifold revision'}
$kernelCargo=Join-Path $env:PROJECT_ROOT '.toolchain/cargo/bin/cargo.exe'
$kernelBuild=Join-Path $env:PROJECT_REVIEW_RUN "work/$(if($Printing){'unified-'}else{''})$Target-build"
$env:ARCH_NATIVE_BUILD=$kernelBuild
$kernelLogPrefix=if($EvidenceTag){"$EvidenceTag-$Target"}else{$Target}
$kernelConfigureLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$kernelLogPrefix-configure.log"
$kernelBuildLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$kernelLogPrefix-build.log"
$kernelRustLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$kernelLogPrefix-rust.log"
if($EvidenceTag -and ((Test-Path -LiteralPath $kernelConfigureLog) -or (Test-Path -LiteralPath $kernelBuildLog) -or (Test-Path -LiteralPath $kernelRustLog))){throw 'Build evidence tag already exists'}
$kernelConfigure=@('-S',(Join-Path $kernelRoot 'native'),'-B',$kernelBuild,"-DARCH_MANIFOLD_SOURCE=$kernelManifold","-DARCH_CLIPPER2_SOURCE=$kernelClipper","-DARCH_HARFBUZZ_SOURCE=$kernelHarfBuzz",'-DARCH_NATIVE_SMOKE=OFF')
$kernelConfigure+="-DARCH_FINAL_EXPORT_TESTS=$(if($TestFixtures){'ON'}else{'OFF'})"
if($Printing){$kernelConfigure+=@("-DARCH_PRINTING_SOURCE=$kernelPrinting","-DARCH_LIB3MF_SOURCE=$env:PROJECT_REVIEW_RUN/work/deps/lib3mf-src",'-DFETCHCONTENT_FULLY_DISCONNECTED=ON','-DFETCHCONTENT_UPDATES_DISCONNECTED=ON','-DCMAKE_POLICY_VERSION_MINIMUM=3.5','-DCMAKE_EXPORT_COMPILE_COMMANDS=ON')}
if($Target -eq 'native'){
  $kernelConfigure+=@('-G','Visual Studio 18 2026')
  $kernelConfigure+="-DARCH_FONT_PROBE=$(if($TestFixtures){'ON'}else{'OFF'})"
  $env:RUSTFLAGS=''
  $kernelRustArgs=@('+1.98.1','build','--release')
}else{
  $kernelConfigure+=@('-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$env:PROJECT_ROOT/.toolchain/ninja/bin/ninja.exe","-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake",'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_C_FLAGS=-pthread','-DCMAKE_CXX_FLAGS=-pthread -fexceptions')
  $env:RUSTFLAGS='-C panic=abort -C target-feature=+atomics,+bulk-memory,+mutable-globals'
  $env:EMCC_CFLAGS='-pthread -fexceptions'
  $env:CARGO_TARGET_DIR=Join-Path $env:PROJECT_REVIEW_RUN 'work/rust-nightly-target'
  $kernelRustArgs=@('+nightly-2026-09-07','build','-Zbuild-std=std,panic_abort','--target','wasm32-unknown-emscripten','--release','--lib')
}
& $env:CMAKE @kernelConfigure *> $kernelConfigureLog
if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $kernelConfigureLog -Tail 20;throw 'Kernel configure failed'}
& $env:CMAKE --build $kernelBuild --config Release --parallel 6 *> $kernelBuildLog
if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $kernelBuildLog -Tail 20;throw 'Kernel C++ build failed'}
$kernelRustArgs+=@('--manifest-path',(Join-Path $kernelRoot 'Cargo.toml'),'--locked','--offline')
if($TestFixtures){$kernelRustArgs+=@('--features','test-fixtures')}
& $kernelCargo @kernelRustArgs *> $kernelRustLog
if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $kernelRustLog -Tail 25;throw 'Kernel Rust build failed'}
if($Target -eq 'wasm'){
  $kernelModule=Join-Path $env:PROJECT_REVIEW_RUN "work/$ModuleDirectory/arch-kernel.mjs"
  New-Item -ItemType Directory -Path (Split-Path -Parent $kernelModule) -Force | Out-Null
  $kernelFunctions=@('_arch_abi_version','_arch_control_ptr','_arch_control_reset','_arch_snapshot_acquire','_arch_snapshot_ptr','_arch_snapshot_len','_arch_snapshot_release','_arch_error_ptr','_arch_error_len','_arch_metadata_ptr','_arch_metadata_len','_arch_input_create','_arch_input_ptr','_arch_input_release','_arch_build_svg')
  if($TestFixtures){$kernelFunctions+='_arch_test_fixture'}
  $kernelFunctions+=@('_arch_font_library_version','_arch_export_stl','_arch_output_ptr','_arch_output_len','_arch_output_release')
  $kernelFunctions+=@('_arch_mech_abi_version','_arch_mech_semantics_version','_arch_mech_source_datum_extension_version','_arch_mech_build','_arch_mech_build_controlled','_arch_mech_view','_arch_mech_destroy','_arch_mech_control_create','_arch_mech_control_cancel','_arch_mech_control_progress','_arch_mech_control_stage','_arch_mech_control_destroy','_arch_mech_source_field')
  $kernelFunctions+=@(Get-Content -LiteralPath (Join-Path $kernelRoot 'native/product-exports.json') -Raw | ConvertFrom-Json)
  $kernelFunctions+=@(Get-Content -LiteralPath (Join-Path $kernelRoot 'native/raster-exports.json') -Raw | ConvertFrom-Json)
  $kernelFunctions+=@('_arch_source_abi_version','_arch_source_semantics_version','_arch_source_build','_arch_source_build_indexed','_arch_assembly_source','_arch_source_view','_arch_source_destroy')
  $kernelFunctions+=@(Get-Content -LiteralPath (Join-Path $kernelRoot 'final-scene-export/native/exports.json') -Raw | ConvertFrom-Json)
  if($TestFixtures){$kernelFunctions+=@('_arch_final_test_fixture','_arch_final_test_stats')}
  # Export the exact HB surface used by the already validated harfbuzzjs
  # wrapper, from the same native revision. Preserve the original runtime.
  $kernelHbExports=& node --input-type=module -e 'import{readFileSync}from"node:fs";const m=new WebAssembly.Module(readFileSync("src/assets/harfbuzz/dist/harfbuzz.wasm"));console.log(JSON.stringify(WebAssembly.Module.exports(m).filter(e=>e.kind==="function"&&e.name.startsWith("hb_")).map(e=>"_"+e.name)));'
  if($LASTEXITCODE -ne 0){throw 'Cannot read validated HarfBuzz export surface'}
  $kernelFunctions+=@($kernelHbExports | ConvertFrom-Json)
  $kernelFunctions+=@('_malloc','_free')
  $kernelFunctions+='_arch_mech_derived_guard_version'
  foreach($meshExportList in @('required-exports.json','csg-exports.json','root-exports.json')){
    $kernelFunctions+=@(Get-Content -LiteralPath (Join-Path $kernelRoot "../mesh-import/cmake/$meshExportList") -Raw | ConvertFrom-Json)
  }
  if($Printing){$kernelFunctions+=@(Get-Content -LiteralPath (Join-Path $kernelPrinting 'cmake/unified-exports.json') -Raw | ConvertFrom-Json)}
  $kernelExport=ConvertTo-Json -InputObject @($kernelFunctions|Select-Object -Unique) -Compress
  $kernelLinkLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$kernelLogPrefix-module-link.log"
  if($EvidenceTag -and (Test-Path -LiteralPath $kernelLinkLog)){throw 'Link evidence tag already exists'}
  # Preserve the pinned toolchain default incoming API and explicitly retain
  # wasmBinary; it is not a default in this Emscripten revision. The release
  # loader must instantiate the exact verified owned bytes without refetch.
  $kernelIncomingApi=ConvertTo-Json -InputObject @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'module-incoming-api.json') -Raw | ConvertFrom-Json) -Compress
  python -B "$env:EMSDK/upstream/emscripten/em++.py" (Join-Path $env:CARGO_TARGET_DIR 'wasm32-unknown-emscripten/release/libarch_kernel.a') -o $kernelModule --no-entry -O2 -pthread -fexceptions -sWASM_BIGINT=1 -sMODULARIZE=1 -sEXPORT_ES6=1 "-sINCOMING_MODULE_JS_API=$kernelIncomingApi" -sALLOW_TABLE_GROWTH=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=1073741824 -sSTACK_SIZE=4194304 "-sEXPORTED_FUNCTIONS=$kernelExport" '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPU16","HEAPU32","HEAPF32","addFunction","removeFunction","stackAlloc","stackSave","stackRestore"]' *> $kernelLinkLog
  if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $kernelLinkLog -Tail 15;throw 'Kernel WASM link failed'}
  Write-Output $kernelModule
}else{Write-Output (Join-Path $env:CARGO_TARGET_DIR 'release/arch-kernel.exe')}
