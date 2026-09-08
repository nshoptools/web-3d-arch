[CmdletBinding()]
param(
    [ValidateSet('codex')][string]$Seat = 'codex',
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')]
    [string]$RunId = '20260908-svg-wave1'
)
$ErrorActionPreference = 'Stop'
$svgRepo = [IO.Path]::GetFullPath($PSScriptRoot)
while ($svgRepo -and -not ((Test-Path -LiteralPath (Join-Path $svgRepo 'AGENTS.md')) -and
    (Test-Path -LiteralPath (Join-Path $svgRepo 'tools/development/env.ps1')))) {
    $svgRepo = Split-Path -Parent $svgRepo
}
if (-not $svgRepo) { throw 'Repository root with project environment was not found' }
. (Join-Path $svgRepo 'tools/development/env.ps1') -Seat $Seat -RunId $RunId
$env:CARGO_HOME = Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:RUSTUP_TOOLCHAIN = '1.98.1-x86_64-pc-windows-msvc'
$env:RUSTUP_AUTO_INSTALL = '0'
$svgToolchain = Join-Path $env:PROJECT_ROOT '.toolchain/rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin'
$env:RUSTC = Join-Path $svgToolchain 'rustc.exe'
$env:RUSTDOC = Join-Path $svgToolchain 'rustdoc.exe'
foreach ($svgTarget in @($env:CARGO_HOME, $PSScriptRoot)) {
    $svgTarget = [IO.Path]::GetFullPath($svgTarget)
    if (-not $svgTarget.StartsWith($env:PROJECT_ROOT + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Crate/cache path escapes repo'
    }
    $svgAncestor = $svgTarget
    while ($svgAncestor -ne $env:PROJECT_ROOT) {
        if ((Test-Path -LiteralPath $svgAncestor) -and
            ((Get-Item -LiteralPath $svgAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Crate/cache path contains a link: $svgAncestor"
        }
        $svgAncestor = Split-Path -Parent $svgAncestor
    }
}
New-Item -ItemType Directory -Path $env:CARGO_HOME -Force | Out-Null
$svgCargoExe = Join-Path $env:PROJECT_ROOT '.toolchain/cargo/bin/cargo.exe'
$svgManifest = Join-Path $PSScriptRoot 'Cargo.toml'
$svgLog = Join-Path $env:PROJECT_REVIEW_RUN 'evidence/svg-native-tests.log'
& $svgCargoExe test --locked --manifest-path $svgManifest 2>&1 | Tee-Object -FilePath $svgLog
$svgExit = $LASTEXITCODE
[ordered]@{
    schema_version = 1
    activity = 'implementation_tests_not_independent_review'
    timestamp_utc = [DateTime]::UtcNow.ToString('o')
    manifest = $svgManifest
    cargo_home = $env:CARGO_HOME
    rustup_home_read_only = $env:RUSTUP_HOME
    rustc = $env:RUSTC
    command = @($svgCargoExe,'test','--locked','--manifest-path',$svgManifest)
    exit_code = $svgExit
    log = $svgLog
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/svg-native-tests.result.json') -Encoding utf8NoBOM
exit $svgExit

