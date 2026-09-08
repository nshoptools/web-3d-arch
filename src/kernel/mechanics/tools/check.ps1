#requires -Version 7
param([ValidateSet('native','wasm')][string]$Target='native',[Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference='Stop'
$checkCandidate=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$checkRepo=$checkCandidate
while(-not(Test-Path -LiteralPath (Join-Path $checkRepo 'AGENTS.md'))){$checkRepo=Split-Path -Parent $checkRepo;if(-not $checkRepo){throw 'Repository root not found'}}
. (Join-Path $checkRepo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
& (Join-Path $PSScriptRoot 'build.ps1') -Target $Target -RunId $RunId -SourceAssembly (Join-Path $checkRepo 'src/kernel/source-assembly')
foreach($checkSuite in @('remediation','run','source-regression')){
  $checkLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$checkSuite-$Target.log"
  & node (Join-Path $checkCandidate "tests/$checkSuite.mjs") $Target *> $checkLog
  if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $checkLog -Tail 12;throw "$checkSuite failed on $Target"}
}
Write-Output "$Target remediation, mechanics baseline and frozen source integration passed"
