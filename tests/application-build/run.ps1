[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$')][string]$RunId,
 [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$')][string]$Label,
 [string]$ApplicationInput,
 [switch]$BrowserSmoke
)
$ErrorActionPreference='Stop'
$ApplicationTestRoot=$PSScriptRoot
while($ApplicationTestRoot -and -not(Test-Path -LiteralPath (Join-Path $ApplicationTestRoot 'AGENTS.md'))){$ApplicationTestRoot=Split-Path -Parent $ApplicationTestRoot}
if(-not $ApplicationTestRoot){throw 'PROJECT_ROOT_REQUIRED'}
. (Join-Path $ApplicationTestRoot 'tools/project-env.ps1') -Seat codex -RunId $RunId
$env:APPLICATION_BUILD_LABEL=$Label
$ApplicationTestLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$Label-unit.tap"
if(Test-Path -LiteralPath $ApplicationTestLog){throw 'EVIDENCE_EXISTS'}
& node --test --test-concurrency=1 (Join-Path $PSScriptRoot 'unit.test.mjs') *> $ApplicationTestLog
if($LASTEXITCODE -ne 0){throw 'APPLICATION_UNIT_FAILED'}
if($ApplicationInput){
 $env:APPLICATION_BUILD_INPUT=$ApplicationInput
 & node --test --test-concurrency=1 (Join-Path $PSScriptRoot 'receipt.test.mjs') *> (Join-Path $env:PROJECT_REVIEW_RUN "evidence/$Label-receipt.tap")
 if($LASTEXITCODE -ne 0){throw 'APPLICATION_RECEIPT_FAILED'}
 & node --test --test-concurrency=1 (Join-Path $PSScriptRoot 'acceptance.test.mjs') *> (Join-Path $env:PROJECT_REVIEW_RUN "evidence/$Label-acceptance.tap")
 if($LASTEXITCODE -ne 0){throw 'APPLICATION_ACCEPTANCE_FAILED'}
 if($BrowserSmoke){
  $env:APPLICATION_BUILD_ACCEPTANCE=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$Label-acceptance.json"
  $env:APPLICATION_BUILD_TLS=Join-Path $env:PROJECT_REVIEW_RUN "temp/$Label-synthetic-tls"
  & (Join-Path $PSScriptRoot 'generate-tls.ps1') -RunId $RunId -OutputDirectory $env:APPLICATION_BUILD_TLS
  & node --test --test-concurrency=1 (Join-Path $PSScriptRoot 'browser.test.mjs') *> (Join-Path $env:PROJECT_REVIEW_RUN "evidence/$Label-browser.tap")
  if($LASTEXITCODE -ne 0){throw 'APPLICATION_BROWSER_FAILED'}
  $ApplicationOwnedSummary=Get-Content -LiteralPath $env:APPLICATION_BUILD_ACCEPTANCE -Raw | ConvertFrom-Json
  $env:APPLICATION_OWNED_PREPARED=$ApplicationOwnedSummary.prepared.directory
  $env:APPLICATION_OWNED_SHA256=$ApplicationOwnedSummary.prepared.sha256
  & node --test --test-concurrency=1 (Join-Path $PSScriptRoot 'owned-worker.test.mjs') *> (Join-Path $env:PROJECT_REVIEW_RUN "evidence/$Label-workers.tap")
  if($LASTEXITCODE -ne 0){throw 'APPLICATION_OWNED_WORKER_FAILED'}
 }
}
Write-Output "Application builder checks passed: $Label. Implementation checks, not independent review."
