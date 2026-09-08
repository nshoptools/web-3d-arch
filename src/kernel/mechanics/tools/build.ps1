#requires -Version 7
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[ValidateSet('native','wasm')][string]$Target='native',[string]$SourceAssembly)
$ErrorActionPreference='Stop'
$mechCandidate=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mechRepo=$mechCandidate
while(-not(Test-Path -LiteralPath (Join-Path $mechRepo 'tools/development/env.ps1'))) {
  $mechRepo=Split-Path -Parent $mechRepo
  if(-not $mechRepo){throw 'Repository root not found'}
}
. (Join-Path $mechRepo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
if(-not $mechCandidate.StartsWith($mechRepo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Package outside project'}
$mechBuild=Join-Path $env:PROJECT_REVIEW_RUN "work/build-mechanics-$Target"
$mechManifold=Join-Path $mechRepo '.toolchain/manifold'
& node (Join-Path $PSScriptRoot 'verify-pins.mjs')
if($LASTEXITCODE -ne 0){throw 'Dependency content verification failed'}
if((git -C $mechManifold rev-parse HEAD).Trim() -ne '0edd9d54876f3135e431575214dd6d8a72866fee'){throw 'Manifold pin mismatch'}
$mechArgs=@('-S',$mechCandidate,'-B',$mechBuild,"-DARCH_MANIFOLD_SOURCE=$mechManifold","-DARCH_CLIPPER2_SOURCE=$mechRepo/.toolchain/clipper2-derived",'-DCMAKE_BUILD_TYPE=Release','-DARCH_MECHANICS_FIXTURES=ON')
if($SourceAssembly){$mechArgs+="-DARCH_SOURCE_ASSEMBLY_TEST_SOURCE=$SourceAssembly"}
if($Target -eq 'native'){$mechArgs+=@('-G','Visual Studio 18 2026')}
else{
  New-Item -ItemType Directory -Path $mechBuild -Force | Out-Null
  '{"type":"commonjs"}' | Set-Content -LiteralPath (Join-Path $mechBuild 'package.json') -Encoding utf8
  $mechArgs+=@('-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$mechRepo/.toolchain/ninja/bin/ninja.exe","-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake")
}
$mechLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/mechanics-$Target-configure.log"
& $env:CMAKE @mechArgs *> $mechLog
if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $mechLog -Tail 35;throw 'Configure failed'}
$mechLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/mechanics-$Target-build.log"
$mechTargets=@('mechanics_fixture')
if($SourceAssembly){$mechTargets+='source_mechanics_fixture'}
& $env:CMAKE --build $mechBuild --config Release --target @mechTargets --parallel 4 *> $mechLog
if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $mechLog -Tail 45;throw 'Build failed'}
Write-Output $mechBuild
