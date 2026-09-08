#requires -Version 7.0
param([Parameter(Mandatory)][string]$RunId,
 [Parameter(Mandatory)][ValidateSet('native','wasm')][string]$Target,[switch]$TestFixtures)
# Wave2 default is the single runtime ABI 2 module. See docs/BUILD.md.
& (Join-Path $PSScriptRoot 'build-unified.ps1') -RunId $RunId -Target $Target -TestFixtures:$TestFixtures
