# Negative checks use only a disposable directory within the current seat's room.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$AuditRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$AuditScript = Join-Path $PSScriptRoot 'project-env.ps1'
if (-not $env:PROJECT_REVIEW_RUN) { throw 'Dot-source project-env.ps1 before verification.' }
$AuditOriginalRun = $env:PROJECT_REVIEW_RUN
$AuditSeat = Split-Path (Split-Path (Split-Path $AuditOriginalRun -Parent) -Parent) -Leaf
$AuditRunId = Split-Path $AuditOriginalRun -Leaf
$AuditPaths = @('PROJECT_ROOT', 'PROJECT_REVIEW_RUN', 'TEMP', 'TMP', 'TMPDIR', 'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'npm_config_cache', 'npm_config_prefix',
    'PIP_CACHE_DIR', 'PIP_TARGET', 'PYTHONPYCACHEPREFIX', 'PYTHONPATH', 'UV_CACHE_DIR',
    'UV_PROJECT_ENVIRONMENT', 'PLAYWRIGHT_BROWSERS_PATH', 'HF_HOME', 'TORCH_HOME', 'MPLCONFIGDIR', 'DOTNET_CLI_HOME')
foreach ($AuditName in $AuditPaths) {
    $AuditValue = [IO.Path]::GetFullPath([Environment]::GetEnvironmentVariable($AuditName))
    if ($AuditValue -ne $AuditRoot -and
        -not $AuditValue.StartsWith($AuditRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Environment escapes project: $AuditName"
    }
}
function Assert-Rejected([scriptblock]$Action, [string]$Pattern) {
    $AuditRejected = $false
    try { & $Action } catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw }
        $AuditRejected = $true
    }
    if (-not $AuditRejected) { throw 'Expected output-path validation to reject the operation.' }
}
Assert-Rejected { . $AuditScript } 'Specify -Seat'
Assert-Rejected { . $AuditScript -Seat $AuditSeat -RunId '../escape' } 'pattern'
$AuditFixtureId = 'env-guard-' + [guid]::NewGuid().ToString('N')
$AuditFixture = Join-Path $AuditRoot "tmp/reviews/$AuditSeat/runs/$AuditFixtureId"
$AuditCache = Join-Path $AuditFixture 'cache'
$AuditJunction = Join-Path $AuditCache 'npm'
New-Item -ItemType Directory -Path $AuditCache -Force | Out-Null
try {
    # Target also stays in this run/repo; rejection must apply to any reparse point.
    New-Item -ItemType Junction -Path $AuditJunction -Target (Join-Path $AuditOriginalRun 'inputs') | Out-Null
    Assert-Rejected { . $AuditScript -Seat $AuditSeat -RunId $AuditFixtureId } 'junction/symlink'
} finally {
    if (-not [IO.Path]::GetFullPath($AuditFixture).StartsWith($AuditRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Invalid cleanup target'
    }
    # No recursive deletion and no traversal through the junction.
    if (Test-Path -LiteralPath $AuditJunction) { Remove-Item -LiteralPath $AuditJunction -Force }
    Remove-Item -LiteralPath $AuditCache -Force
    Remove-Item -LiteralPath $AuditFixture -Force
    . $AuditScript -Seat $AuditSeat -RunId $AuditRunId
}
$AuditReport = [ordered]@{status='pass'; pathsChecked=$AuditPaths.Count;
    rejected=@('implicit seat', 'run path traversal', 'nested cache junction');
    scope='Environment/tool convention checks; not an operating system sandbox'}
$AuditJson = $AuditReport | ConvertTo-Json -Depth 3
$AuditDestination = Join-Path $AuditOriginalRun 'reports/project-env-audit.json'
[IO.File]::WriteAllText($AuditDestination, $AuditJson, [Text.UTF8Encoding]::new($false))
Write-Output $AuditJson
