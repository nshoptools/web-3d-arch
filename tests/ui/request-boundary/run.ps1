[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_-]+$')][string]$RunId,
 [ValidateSet('codex','opus','grok')][string]$Seat='codex',
 [ValidatePattern('^[A-Za-z0-9_-]+$')][string]$InputRevision='initial',
 [ValidatePattern('^[A-Za-z0-9_-]+$')][string]$EvidenceLabel='latest',
 [ValidateSet('chromium','firefox','webkit')][string[]]$Engines=@('chromium','firefox','webkit'),
 [ValidateSet('all','exports')][string]$CaseScope='all'
)
$ErrorActionPreference='Stop'
# Resolve from location, including when this candidate is below an isolated work directory.
$testRoot=$PSScriptRoot
while(-not (Test-Path -LiteralPath (Join-Path $testRoot 'tools/development/env.ps1'))){
 $testParent=Split-Path -Parent $testRoot
 if(-not $testParent -or $testParent -eq $testRoot){throw 'Cannot locate repository env script'}
 $testRoot=$testParent
}
. (Join-Path $testRoot 'tools/development/env.ps1') -Seat $Seat -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:npm_config_prefix=Join-Path $env:PROJECT_REVIEW_RUN 'cache/npm-prefix'
$env:ARCH_UI_INPUT_REVISION=$InputRevision
$env:ARCH_UI_EVIDENCE_LABEL=$EvidenceLabel
$env:ARCH_UI_ENGINES=$Engines -join ','
$env:ARCH_UI_CASE_SCOPE=$CaseScope
$testNode=Join-Path $testRoot '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
if(-not (Test-Path -LiteralPath $testNode)){throw 'Read-only repository Node 24.19.0 is required'}
& $testNode (Join-Path $PSScriptRoot 'run.mjs')
exit $LASTEXITCODE
