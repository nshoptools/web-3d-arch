[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[Parameter(Mandatory)][string]$ModulePath,[switch]$Browsers)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../tools/development/env.ps1') -Seat codex -RunId $RunId
$env:PRODUCT_APP_MODULE=[IO.Path]::GetFullPath($ModulePath)
& node (Join-Path $PSScriptRoot 'prepare.mjs')
if($LASTEXITCODE -ne 0){throw 'Product source input staging failed'}
$env:PRODUCT_APP_MODULE=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
$env:ARCH_BRIDGE_MATRIX='1'
$env:ARCH_BRIDGE_DISCOVER='1'
$env:ARCH_BRIDGE_TAG='final'
& node --test (Join-Path $PSScriptRoot 'manufacturing-frame.test.mjs') 2>&1 | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/manufacturing-frame-main.log')
if($LASTEXITCODE -ne 0){throw 'Manufacturing frame orientation failed'}
& node --test (Join-Path $PSScriptRoot 'node.test.mjs') 2>&1 | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/source-node-main.log')
if($LASTEXITCODE -ne 0){throw 'Product source Node matrix failed'}
& node --test (Join-Path $PSScriptRoot 'artifact-boundaries.test.mjs') 2>&1 | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/artifact-boundaries-main.log')
if($LASTEXITCODE -ne 0){throw 'Product source artifact boundary failed'}
if($Browsers){
 foreach($SourceColor in @('0','1')){
  $env:ARCH_BRIDGE_COLOR=$SourceColor
  & node --test (Join-Path $PSScriptRoot 'browser.test.mjs') 2>&1 | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN ('evidence/source-browser-main-'+$SourceColor+'.log'))
  if($LASTEXITCODE -ne 0){throw 'Product source browser matrix failed'}
 }
}
