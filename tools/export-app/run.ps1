[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$RunId,
 [string]$RepoRoot,
 [string]$ModulePath,
 [switch]$Browsers
)
$ErrorActionPreference='Stop'
$candidateRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if(-not $RepoRoot){
 $searchRoot=$candidateRoot
 while(-not (Test-Path -LiteralPath (Join-Path $searchRoot 'tools/development/env.ps1'))){
  $nextRoot=Split-Path -Parent $searchRoot
  if(-not $nextRoot -or $nextRoot -eq $searchRoot){throw 'Pass -RepoRoot for the repository containing its environment script'}
  $searchRoot=$nextRoot
 }
 $RepoRoot=$searchRoot
}
$RepoRoot=[IO.Path]::GetFullPath($RepoRoot)
. (Join-Path $RepoRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
if(Test-Path -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'reports/FROZEN.json')){throw 'Frozen run; select a new own RunId'}
if($ModulePath){$env:ARCH_EXPORT_TEST_MODULE=[IO.Path]::GetFullPath($ModulePath)}
elseif(-not (Test-Path -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'))){throw 'Pass -ModulePath to a same-Module runtime containing final-export, lib3mf and test fixtures'}
Push-Location $RepoRoot
try{
 & node (Join-Path $PSScriptRoot 'prepare.mjs')
 if($LASTEXITCODE -ne 0){throw 'Private overlay preparation failed'}
 $env:ARCH_EXPORT_TEST_MODULE=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
 $overlay=Join-Path $env:PROJECT_REVIEW_RUN 'work/app-overlay'
 $evidence=Join-Path $env:PROJECT_REVIEW_RUN 'evidence'
 & node --test --test-reporter=tap (Join-Path $overlay 'tests/integration/export-adapters.test.mjs') *> (Join-Path $evidence 'node-tests-runner.log')
 $nodeExit=$LASTEXITCODE
 & node (Join-Path $RepoRoot 'node_modules/typescript/lib/tsc.js') --ignoreConfig --noEmit --strict --module NodeNext --moduleResolution NodeNext --target ES2023 --lib ES2023,DOM (Join-Path $overlay 'tests/integration/export-types.mts') *> (Join-Path $evidence 'types-runner.log')
 $typesExit=$LASTEXITCODE
 $browserExit=$null
 if($Browsers){
  & node (Join-Path $PSScriptRoot 'browser.mjs') *> (Join-Path $evidence 'browser-runner.log')
  $browserExit=$LASTEXITCODE
 }
 [ordered]@{schema='arch-export-app-test/1';nodeExit=$nodeExit;typesExit=$typesExit;browserExit=$browserExit;browsersSelected=[bool]$Browsers;rootWrites=$false;parentRPCQualificationClaim=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'runner.json') -Encoding utf8NoBOM
 Get-Content -LiteralPath (Join-Path $evidence 'node-tests-runner.log') | Select-Object -Last 9
 if($nodeExit -ne 0 -or $typesExit -ne 0 -or ($Browsers -and $browserExit -ne 0)){throw 'Selected checks failed; see evidence logs'}
}finally{Pop-Location}
