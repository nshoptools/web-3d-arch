#requires -Version 7
param([ValidateSet('native','wasm')][string]$Target='native',[Parameter(Mandatory=$true)][string]$RunId,[ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$BuildName='',[switch]$SkipBuild)
$ErrorActionPreference='Stop'
$curveCandidate=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$curveRepo=$curveCandidate
while(-not(Test-Path -LiteralPath (Join-Path $curveRepo 'tools/development/env.ps1'))){$curveRepo=Split-Path -Parent $curveRepo;if(-not $curveRepo){throw 'Repository missing'}}
. (Join-Path $curveRepo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
if(-not $BuildName){$BuildName="build-$Target"}
if(-not $SkipBuild){& "$PSScriptRoot/build.ps1" -Target $Target -RunId $RunId -BuildName $BuildName}
$curveBuild=Join-Path $env:PROJECT_REVIEW_RUN "work/$BuildName"
$env:ARCH_CURVED_BINARY=if($Target -eq 'native'){"$curveBuild/Release/curved_fixture.exe"}else{"$curveBuild/curved_fixture.js"}
$env:ARCH_MECHANICS_FIXTURE=if($Target -eq 'native'){"$curveBuild/src/kernel/mechanics/Release/mechanics_fixture.exe"}else{"$curveBuild/src/kernel/mechanics/mechanics_fixture.js"}
$env:ARCH_SOURCE_FIXTURE=if($Target -eq 'native'){"$curveBuild/src/kernel/source-assembly/Release/source_fixture.exe"}else{"$curveBuild/src/kernel/source-assembly/source_fixture.js"}
$env:ARCH_SOURCE_TEST_ID='curved-release'
Remove-Item Env:CURVED_FILTER -ErrorAction SilentlyContinue
function Invoke-CurveCheck([string]$Script,[string[]]$Arguments){
 & node "$curveCandidate/$Script" @Arguments
 if($LASTEXITCODE){throw "Check failed: $Script $Arguments"}
}
# Stage/derive once before running both targets concurrently. These helpers are
# intentionally outside this runner because they write shared input buffers.
if(-not(Test-Path "$env:PROJECT_REVIEW_RUN/inputs/corpus-variants/manifest.json")){throw 'Run stage-fixtures.mjs then derive.mjs first'}
$env:CURVED_CORPUS='corpus-production'
Invoke-CurveCheck 'tests/curved-products/run.mjs' @($Target,"release-$Target")
Invoke-CurveCheck 'tests/curved-products/oracle.mjs' @("release-$Target")
$env:CURVED_CORPUS='corpus-variants'
Invoke-CurveCheck 'tests/curved-products/run.mjs' @($Target,"release-variants-$Target")
Invoke-CurveCheck 'tests/curved-products/oracle.mjs' @("release-variants-$Target")
Invoke-CurveCheck 'tests/curved-products/resource.mjs' @($Target)
Invoke-CurveCheck 'tests/curved-products/r2-guards.mjs' @($Target)
Invoke-CurveCheck 'src/kernel/mechanics/tests/run.mjs' @($Target)
Invoke-CurveCheck 'src/kernel/mechanics/tests/remediation.mjs' @($Target)
Invoke-CurveCheck 'src/kernel/source-assembly/tests/run.mjs' @($Target)
if($Target -eq 'native'){
 Invoke-CurveCheck 'src/kernel/mechanics/tests/cancellation.mjs' @()
 & node --test "$curveCandidate/tests/curved-products/surface-parity.test.mjs"
 if($LASTEXITCODE){throw 'Surface parity oracle controls'}
}
