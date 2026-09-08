#requires -Version 7.0
[CmdletBinding()]
param(
 [ValidateSet('codex','opus','grok')][string]$Seat='codex',
 [Parameter(Mandatory)][string]$RunId,
 [string]$ModulePath,
 [ValidatePattern('^[A-Za-z0-9_-]{1,64}$')][string]$Label='main'
)
$ErrorActionPreference='Stop'
$rpRepo=$PSScriptRoot
while(-not(Test-Path -LiteralPath (Join-Path $rpRepo 'tools/development/env.ps1'))){
 $rpParent=Split-Path -Parent $rpRepo
 if(-not $rpParent -or $rpParent -eq $rpRepo){throw 'Repository environment not found'}
 $rpRepo=$rpParent
}
. (Join-Path $rpRepo 'tools/development/env.ps1') -Seat $Seat -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:CARGO_TARGET_DIR=Join-Path $env:PROJECT_REVIEW_RUN 'work/rust-target'
$env:RUSTC=Join-Path $rpRepo '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin/rustc.exe'
$env:RUSTDOC=Join-Path $rpRepo '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin/rustdoc.exe'
if($ModulePath){$env:ARCH_KERNEL_MODULE=$ModulePath}
$env:ARCH_RASTER_TEST_LABEL=$Label
$rpNode=Join-Path $rpRepo '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
if(-not(Test-Path -LiteralPath $rpNode)){throw 'Pinned repository Node runtime is required'}
& $rpNode (Join-Path $PSScriptRoot 'run.mjs')
exit $LASTEXITCODE
