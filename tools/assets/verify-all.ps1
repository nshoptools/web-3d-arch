[CmdletBinding()]
param(
    [ValidateSet('grok', 'opus', 'codex')][string]$Seat,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
    [switch]$UpdateReports
)
$ErrorActionPreference = 'Stop'
if (-not $Seat) { throw 'Specify -Seat grok, opus or codex.' }
$VerifyEnvArgs = @{Seat=$Seat}
if ($RunId) { $VerifyEnvArgs.RunId = $RunId }
. (Join-Path $PSScriptRoot '../project-env.ps1') @VerifyEnvArgs
$VerifyRoot = $env:PROJECT_ROOT
$VerifyRun = $env:PROJECT_REVIEW_RUN
$VerifyResults = [Collections.Generic.List[object]]::new()
function Invoke-AssetCheck([string]$Name, [string]$Program, [string[]]$Arguments) {
    $VerifyLog = Join-Path $VerifyRun "evidence/$Name.log"
    & $Program @Arguments 2>&1 | Tee-Object -FilePath $VerifyLog
    $VerifyExitCode = $LASTEXITCODE
    $VerifyResults.Add([ordered]@{check=$Name; exitCode=$VerifyExitCode; command=@($Program) + $Arguments})
    if ($VerifyExitCode -ne 0) { throw "$Name failed with exit code $VerifyExitCode. See $VerifyLog" }
}
Push-Location $VerifyRoot
try {
    & (Join-Path $VerifyRoot 'tools/verify-project-env.ps1')
    $VerifyWrite = @()
    if ($UpdateReports) { $VerifyWrite = @('--write') }
    Invoke-AssetCheck 'fonts' 'python' (@('-B', 'tools/assets/build_catalogs.py') + $VerifyWrite)
    $VerifyOpenTypeArgs = @('tools/assets/verify-assets.mjs')
    if ($UpdateReports) { $VerifyOpenTypeArgs += @('--report', 'docs/assets/opentype-audit.json') }
    Invoke-AssetCheck 'opentype' 'node' $VerifyOpenTypeArgs
    Invoke-AssetCheck 'color' 'python' (@('-B', 'tools/assets/build_color_catalogs.py') + $VerifyWrite)
    Invoke-AssetCheck 'input' 'node' (@('tools/assets/verify-input.mjs') + $VerifyWrite)
    Invoke-AssetCheck 'artwork' 'python' (@('-B', 'tools/assets/verify_artwork.py') + $VerifyWrite)
    Invoke-AssetCheck 'readiness' 'python' (@('-B', 'tools/assets/verify_readiness.py') + $VerifyWrite)
} finally {
    $VerifySummary = $VerifyResults.ToArray() | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText((Join-Path $VerifyRun 'reports/verification-commands.json'), $VerifySummary, [Text.UTF8Encoding]::new($false))
    Pop-Location
}
Write-Output "All asset/input checks passed. Evidence: $VerifyRun"
