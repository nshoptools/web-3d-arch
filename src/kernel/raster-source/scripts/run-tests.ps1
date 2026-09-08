[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')]
    [string]$RunId,
    [switch]$Release
)
$ErrorActionPreference='Stop'
$testRepo=Get-Item -LiteralPath $PSScriptRoot
while ($testRepo -and -not (Test-Path -LiteralPath (Join-Path $testRepo.FullName 'tools/development/env.ps1'))) {$testRepo=$testRepo.Parent}
if (-not $testRepo) {throw 'Run this candidate from inside web-3d-arch'}
. (Join-Path $testRepo.FullName 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:RUSTUP_TOOLCHAIN='1.98.1-x86_64-pc-windows-msvc'
$env:RUSTUP_AUTO_INSTALL='0'
$env:RUSTC=Join-Path $env:PROJECT_ROOT '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin/rustc.exe'
$env:RUSTDOC=Join-Path $env:PROJECT_ROOT '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin/rustdoc.exe'
New-Item -ItemType Directory -Path $env:CARGO_HOME -Force | Out-Null
$testCrate=Split-Path -Parent $PSScriptRoot
$testCargo=Join-Path $env:PROJECT_ROOT '.toolchain/cargo/bin/cargo.exe'
$testProfile=if ($Release) {'release'} else {'debug'}
$testLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/cargo-test-$testProfile.log"
$testArgs=@('test','--locked','--manifest-path',(Join-Path $testCrate 'Cargo.toml'))
if ($Release) {$testArgs+='--release'}
$testStarted=[DateTimeOffset]::UtcNow
$testRustc=& $env:RUSTC --version
$testCargoVersion=& $testCargo --version
& $testCargo @testArgs 2>&1 | Tee-Object -FilePath $testLog
$testExit=$LASTEXITCODE
[pscustomobject]@{
    startedUtc=$testStarted.ToString('o');endedUtc=[DateTimeOffset]::UtcNow.ToString('o')
    command=@($testCargo)+$testArgs;exitCode=$testExit;rustc=$testRustc;cargo=$testCargoVersion
    cargoHome=$env:CARGO_HOME;targetDir=$env:CARGO_TARGET_DIR;temp=$env:TEMP;profile=$testProfile
    evidenceKind='implementation native tests; not independent review'
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN "evidence/cargo-test-$testProfile-result.json") -Encoding utf8NoBOM
exit $testExit

