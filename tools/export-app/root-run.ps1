[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$')][string]$RunId,
 [Parameter(Mandatory=$true)][string]$ModulePath,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedMjsSha,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedWasmSha,
 [ValidatePattern('^[A-Za-z0-9_-]{1,48}$')][string]$CaptureTag='initial',
 [switch]$Browsers,[switch]$PrepareOnly)
$ErrorActionPreference='Stop'
$exportRepo=$PSScriptRoot
while($exportRepo -and -not(Test-Path -LiteralPath (Join-Path $exportRepo 'tools/project-env.ps1'))){$exportRepo=Split-Path -Parent $exportRepo}
if(-not $exportRepo){throw 'Repository environment not found'}
. (Join-Path $exportRepo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$exportModule=(Resolve-Path -LiteralPath $ModulePath).Path
if(-not $exportModule.StartsWith($env:PROJECT_ROOT+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Runtime pair outside repo'}
$env:ARCH_EXPORT_MODULE_INPUT=$exportModule
$env:ARCH_EXPORT_EXPECTED_MJS=$ExpectedMjsSha
$env:ARCH_EXPORT_EXPECTED_WASM=$ExpectedWasmSha
$env:ARCH_EXPORT_CAPTURE_TAG=$CaptureTag
$exportNode=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
& $exportNode (Join-Path $PSScriptRoot 'root-prepare.mjs')
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
if($PrepareOnly){exit 0}
$exportCaptureSuffix=if($CaptureTag -eq 'initial'){''}else{'-'+$CaptureTag}
$exportOverlay=Join-Path $env:PROJECT_REVIEW_RUN ('work/root-test-overlay'+$exportCaptureSuffix)
$exportEvidence=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/root-integration'+$exportCaptureSuffix)
New-Item -ItemType Directory -Path $exportEvidence -Force | Out-Null
$exportSuites=@(
 @{name='node';args=@('--test','--test-concurrency=1','tests/export-root-integration/export-adapters.test.mjs','tests/export-root-integration/export-float.test.mjs','tests/export-root-integration/export-worker-diagnostic.test.mjs','tests/final-scene/provider.test.mjs','tests/final-scene/provider-analysis.test.mjs')},
 @{name='parent-controls';args=@('--test','tests/app/export-controls.node.test.mjs')},
 @{name='helper-wasm';args=@('--test','--test-concurrency=1','tests/export-root-integration/export-float-runtime.test.mjs')},
 @{name='types';args=@((Join-Path $env:PROJECT_ROOT 'node_modules/typescript/bin/tsc'),'--ignoreConfig','--noEmit','--strict','--module','NodeNext','--target','ES2023','--lib','ES2023,DOM','--skipLibCheck','tests/export-root-integration/export-types.mts')}
)
if($Browsers){$exportSuites+=@{name='browsers';args=@('tools/export-app/root-browser.mjs')}}
$exportResults=@()
Push-Location -LiteralPath $exportOverlay
try{foreach($exportSuite in $exportSuites){
 $exportLog=Join-Path $exportEvidence ($exportSuite.name+'.log')
 & $exportNode @($exportSuite.args) *> $exportLog
 $exportResults+=@{suite=$exportSuite.name;exit=$LASTEXITCODE;log=$exportLog}
 Get-Content -LiteralPath $exportLog | Select-Object -Last 12
}}finally{Pop-Location}
@{run=$RunId;suites=$exportResults;configuredIndependentReview=$false} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $exportEvidence 'runner.json') -Encoding utf8
if(@($exportResults | Where-Object {$_.exit -ne 0}).Count){exit 1}
