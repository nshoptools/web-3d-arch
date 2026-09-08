#requires -Version 7
param([ValidateSet('native','wasm')][string]$Target='native',[Parameter(Mandatory=$true)][string]$RunId,[ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$BuildName='')
$ErrorActionPreference='Stop'
$curveCandidate=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$curveRepo=$curveCandidate
while(-not(Test-Path -LiteralPath (Join-Path $curveRepo 'tools/development/env.ps1'))){$curveRepo=Split-Path -Parent $curveRepo;if(-not $curveRepo){throw 'Repository missing'}}
. (Join-Path $curveRepo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
if(-not $BuildName){$BuildName="build-$Target"}
$curveBuild=Join-Path $env:PROJECT_REVIEW_RUN "work/$BuildName"
$curveArgs=@('-S',"$curveCandidate/tests/curved-products",'-B',$curveBuild,"-DARCH_MANIFOLD_SOURCE=$curveRepo/.toolchain/manifold","-DARCH_CLIPPER2_SOURCE=$curveRepo/.toolchain/clipper2-derived",'-DCMAKE_BUILD_TYPE=Release')
if($Target -eq 'native'){$curveArgs+=@('-G','Visual Studio 18 2026')}
else{
 New-Item -ItemType Directory -Force -Path $curveBuild | Out-Null
 '{"type":"commonjs"}' | Set-Content -LiteralPath "$curveBuild/package.json" -Encoding utf8
 $curveArgs+=@('-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$curveRepo/.toolchain/ninja/bin/ninja.exe","-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake")
}
& $env:CMAKE @curveArgs *> "$env:PROJECT_REVIEW_RUN/evidence/$BuildName-configure.log"
if($LASTEXITCODE){Get-Content "$env:PROJECT_REVIEW_RUN/evidence/$BuildName-configure.log" -Tail 30;throw 'Configure failed'}
& $env:CMAKE --build $curveBuild --config Release --parallel 4 *> "$env:PROJECT_REVIEW_RUN/evidence/$BuildName-build.log"
if($LASTEXITCODE){Get-Content "$env:PROJECT_REVIEW_RUN/evidence/$BuildName-build.log" -Tail 35;throw 'Build failed'}
Write-Output $curveBuild
