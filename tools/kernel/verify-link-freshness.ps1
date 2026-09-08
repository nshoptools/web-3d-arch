#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[ValidateSet('codex','opus','grok')][string]$Seat='codex')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../development/env.ps1') -Seat $Seat -RunId $RunId
$env:ARCH_NATIVE_BUILD=Join-Path $env:PROJECT_REVIEW_RUN 'work/native-build'
$freshArchive=Join-Path $env:ARCH_NATIVE_BUILD 'Release/arch_geometry.lib'
$freshCargo=Join-Path $env:PROJECT_ROOT '.toolchain/cargo/bin/cargo.exe'
$freshArgs=@('+1.98.1','build','--release','--features','test-fixtures','--locked','--manifest-path',(Join-Path $env:PROJECT_ROOT 'src/kernel/Cargo.toml'),'-vv')
& $freshCargo @freshArgs *> (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/freshness-before.log')
if($LASTEXITCODE -ne 0){throw 'Initial freshness baseline failed'}
$freshResolved=[IO.Path]::GetFullPath($freshArchive)
if(-not $freshResolved.StartsWith($env:PROJECT_REVIEW_RUN+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive outside own run'}
$freshAncestor=$freshResolved
while($freshAncestor -ne $env:PROJECT_REVIEW_RUN){if((Get-Item -LiteralPath $freshAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Archive path contains a link'};$freshAncestor=Split-Path -Parent $freshAncestor}
$freshBytes=[IO.File]::ReadAllBytes($freshResolved)
$freshHash=(Get-FileHash -LiteralPath $freshResolved -Algorithm SHA256).Hash
Start-Sleep -Milliseconds 1100
# Simulate the final output write of a C++-only rebuild. Preserve exact bytes.
[IO.File]::WriteAllBytes($freshResolved,$freshBytes)
$freshLog=Join-Path $env:PROJECT_REVIEW_RUN 'evidence/freshness-after.log'
& $freshCargo @freshArgs *> $freshLog
if($LASTEXITCODE -ne 0){throw 'Rust relink after native archive write failed'}
if((Get-FileHash -LiteralPath $freshResolved -Algorithm SHA256).Hash -ne $freshHash){throw 'Native archive content unexpectedly changed'}
$freshObserved=Get-Content -LiteralPath $freshLog -Raw
if($freshObserved -notmatch 'Dirty arch-kernel' -or $freshObserved -notmatch 'arch_geometry.lib'){throw 'Cargo did not report the native archive as the rebuild dependency'}
[ordered]@{status='pass';archiveSha256=$freshHash;sourceBytesChanged=$false;method='Rewrite own built archive without changing bytes; Cargo -vv must identify archive as Dirty reason and relink';scope='Cargo dependency graph, not C++ behavior change'} | ConvertTo-Json |
  Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/link-freshness.json') -Encoding utf8
Write-Output 'C++ archive write correctly triggers Rust relink; archive bytes preserved.'
