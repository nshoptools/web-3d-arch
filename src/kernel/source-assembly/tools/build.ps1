#requires -Version 7
param([ValidateSet('native','wasm')][string]$Target='native',
  [Parameter(Mandatory)][string]$RunId,
  [ValidateSet('codex','opus','grok')][string]$Seat='codex')
$ErrorActionPreference='Stop'
$sourceCandidate=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRepo=$sourceCandidate
while(-not(Test-Path -LiteralPath (Join-Path $sourceRepo 'tools/development/env.ps1'))){$sourceRepo=Split-Path -Parent $sourceRepo;if(-not $sourceRepo){throw 'Repository not found'}}
. (Join-Path $sourceRepo 'tools/development/env.ps1') -Seat $Seat -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
if($sourceCandidate -ne [IO.Path]::GetFullPath((Join-Path $sourceRepo 'src/kernel/source-assembly'))){throw 'Run the integrated source assembly tooling'}
& node (Join-Path $PSScriptRoot 'verify-pins.mjs')
if($LASTEXITCODE){throw 'Pin verification failed'}
$sourceBuild=Join-Path $env:PROJECT_REVIEW_RUN "work/build-source-$Target"
$sourceArgs=@('-S',$sourceCandidate,'-B',$sourceBuild,"-DARCH_MECHANICS_SOURCE=$sourceRepo/src/kernel/mechanics","-DARCH_MANIFOLD_SOURCE=$sourceRepo/.toolchain/manifold","-DARCH_CLIPPER2_SOURCE=$sourceRepo/.toolchain/clipper2-derived",'-DCMAKE_BUILD_TYPE=Release','-DARCH_SOURCE_FIXTURES=ON')
if($Target -eq 'native'){$sourceArgs+=@('-G','Visual Studio 18 2026')}
else{
  New-Item -ItemType Directory -Path $sourceBuild -Force | Out-Null
  '{"type":"commonjs"}' | Set-Content -LiteralPath (Join-Path $sourceBuild 'package.json') -Encoding utf8
  $sourceArgs+=@('-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$sourceRepo/.toolchain/ninja/bin/ninja.exe","-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake")
}
$sourceLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/source-$Target-configure.log"
& $env:CMAKE @sourceArgs *> $sourceLog
if($LASTEXITCODE){Get-Content -LiteralPath $sourceLog -Tail 35;throw 'Configure failed'}
$sourceLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/source-$Target-build.log"
& $env:CMAKE --build $sourceBuild --config Release --target source_fixture mechanics_bridge_fixture --parallel 5 *> $sourceLog
if($LASTEXITCODE){Get-Content -LiteralPath $sourceLog -Tail 45;throw 'Build failed'}
Write-Output $sourceBuild
