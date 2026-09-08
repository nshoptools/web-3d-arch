#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[ValidateSet('codex','opus','grok')][string]$Seat='codex')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../development/env.ps1') -Seat $Seat -RunId $RunId
& python -B (Join-Path $PSScriptRoot 'prepare-harfbuzz.py')
if($LASTEXITCODE -ne 0){throw 'Pinned HarfBuzz source preparation/verification failed'}
