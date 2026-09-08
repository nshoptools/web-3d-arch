#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[ValidateSet('codex','opus','grok')][string]$Seat='codex')
$ErrorActionPreference='Stop'
$printingSource=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$printingRoot=$printingSource
while(-not (Test-Path -LiteralPath (Join-Path $printingRoot 'tools/development/env.ps1'))){$printingParent=Split-Path -Parent $printingRoot;if(-not $printingParent -or $printingParent -eq $printingRoot){throw 'Project root not found'};$printingRoot=$printingParent}
. (Join-Path $printingRoot 'tools/development/env.ps1') -Seat $Seat -RunId $RunId
$printingInstall=Join-Path $printingRoot '.toolchain/printing-js'
$printingModules=Join-Path $printingInstall 'node_modules'
$printingLink=Join-Path $printingSource 'node_modules'
foreach($printingPath in @($printingInstall,$printingModules)){
  $printingAncestor=[IO.Path]::GetFullPath($printingPath)
  if(-not $printingAncestor.StartsWith($printingRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Dependency path escapes project'}
  while($printingAncestor -ne $printingRoot){if((Test-Path -LiteralPath $printingAncestor) -and ((Get-Item -LiteralPath $printingAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Dependency target contains a link'};$printingAncestor=Split-Path -Parent $printingAncestor}
}
New-Item -ItemType Directory -Path $printingInstall -Force | Out-Null
foreach($printingName in @('package.json','package-lock.json')){Copy-Item -LiteralPath (Join-Path $printingSource $printingName) -Destination (Join-Path $printingInstall $printingName)}
& npm ci --prefix $printingInstall --ignore-scripts --no-audit --no-fund *> (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/printing-js-install.log')
if($LASTEXITCODE -ne 0){throw 'Pinned printing JS dependency install failed'}
if(Test-Path -LiteralPath $printingLink){
  $printingItem=Get-Item -LiteralPath $printingLink -Force
  if(-not ($printingItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.Path]::GetFullPath($printingItem.Target) -ne $printingModules){throw 'Existing dependency link has an unexpected target'}
}else{New-Item -ItemType Junction -Path $printingLink -Target $printingModules | Out-Null}
Write-Output 'Pinned printing JS dependencies prepared inside the project.'
