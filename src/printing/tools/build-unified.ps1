#requires -Version 7.0
param([Parameter(Mandatory)][string]$RunId,
 [Parameter(Mandatory)][ValidateSet('native','wasm')][string]$Target,
 [switch]$TestFixtures)
$ErrorActionPreference='Stop'
$printingRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
& (Join-Path $printingRepo 'tools/kernel/build.ps1') -Seat codex -RunId $RunId -Target $Target -Printing -TestFixtures:$TestFixtures
if($LASTEXITCODE -ne 0){throw 'Unified kernel build failed'}
