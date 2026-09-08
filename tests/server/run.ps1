[CmdletBinding()]
param(
  [ValidateSet('codex','opus','grok')][string]$Seat='codex',
  [Parameter(Mandatory)][string]$RunId
)
$ErrorActionPreference = 'Stop'
$BackendRepo = $PSScriptRoot
while ($BackendRepo -and -not (Test-Path -LiteralPath (Join-Path $BackendRepo 'tools/project-env.ps1'))) { $BackendRepo = Split-Path -Parent $BackendRepo }
if (-not $BackendRepo) { throw 'Cannot find repository tools/project-env.ps1' }
. (Join-Path $BackendRepo 'tools/project-env.ps1') -Seat $Seat -RunId $RunId
$BackendOutput = Join-Path $env:PROJECT_REVIEW_RUN 'evidence/backend-final.tap'
$BackendSummary = Join-Path $env:PROJECT_REVIEW_RUN 'reports/test-summary.json'
$BackendStarted = [DateTime]::UtcNow
$BackendSuiteFiles = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.test.mjs' -File | Sort-Object Name | ForEach-Object FullName)
$BackendSupportRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../src'))
if (-not (Test-Path -LiteralPath (Join-Path $BackendSupportRoot 'app/common.mjs'))) {
    $BackendSupportRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../inputs/main/src'))
}
$BackendSupportFiles = @('app/common.mjs','storage/common.mjs') | ForEach-Object { Get-Item -LiteralPath (Join-Path $BackendSupportRoot $_) }
$BackendHashFiles = @($BackendSupportFiles) + @(Get-Item -LiteralPath (Join-Path $PSScriptRoot '../../src/app/remote.mjs')) + @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../../src/server') -Recurse -File | Where-Object { $_.Extension -in @('.mjs','.cjs') }) + @(Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File)
$BackendBefore = $BackendHashFiles | ForEach-Object { Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 | Select-Object Path,Hash }
$BackendSyntax = $true
foreach ($BackendModule in $BackendHashFiles | Where-Object { $_.Extension -in @('.mjs','.cjs') }) {
    & node --check $BackendModule.FullName
    if ($LASTEXITCODE -ne 0) { $BackendSyntax = $false }
}
if (-not $BackendSyntax) { throw 'JavaScript syntax validation failed' }
& node --test --test-timeout=120000 --test-concurrency=1 --test-reporter=tap @BackendSuiteFiles 2>&1 | Set-Content -LiteralPath $BackendOutput -Encoding utf8
$BackendExit = $LASTEXITCODE
$BackendTap = [IO.File]::ReadAllText($BackendOutput)
function Read-TapCount([string]$Name) {
    $BackendMatch = [regex]::Match($BackendTap, '(?m)^# ' + $Name + ' (\d+)')
    if ($BackendMatch.Success) { return [int]$BackendMatch.Groups[1].Value }
    return $null
}
$BackendAfter = $BackendHashFiles | ForEach-Object { Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 | Select-Object Path,Hash }
$BackendStable = (($BackendBefore | ConvertTo-Json -Compress) -eq ($BackendAfter | ConvertTo-Json -Compress))
$BackendResult = [ordered]@{
    kind='implementation-self-test'; independentReview=$false
    node=(& node --version); platform='Windows'; database='node:sqlite persistent files'
    network='HTTP 127.0.0.1 ports assigned by OS; local signed OIDC test IdP; no real AI'
    startedAt=$BackendStarted.ToString('o'); completedAt=[DateTime]::UtcNow.ToString('o')
    command='node --test --test-timeout=120000 --test-concurrency=1 --test-reporter=tap tests/server/*.test.mjs'
    exitCode=$BackendExit; syntaxPassed=$BackendSyntax; codeStableDuringRun=$BackendStable
    tests=(Read-TapCount 'tests'); passed=(Read-TapCount 'pass'); failed=(Read-TapCount 'fail'); skipped=(Read-TapCount 'skipped'); todo=(Read-TapCount 'todo'); cancelled=(Read-TapCount 'cancelled')
    codeHashes=$BackendBefore
    modelConfiguration=@{requestedModel='gpt-6-astra';requestedEffort='max';source='caller instruction';runtimeModelVerified=$false;runtimeEffortVerified=$false;fastModeVerified=$false;serviceTierExposed=$false;qualifiedReview=$false}
}
[IO.File]::WriteAllText($BackendSummary, ($BackendResult | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Get-Content -LiteralPath $BackendOutput | Select-Object -Last 12
Write-Output ('Evidence: ' + $BackendSummary)
if (-not $BackendStable) { exit 1 }
exit $BackendExit

