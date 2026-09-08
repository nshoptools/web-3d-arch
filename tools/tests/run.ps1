#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('codex','opus','grok')][string]$Seat,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
    [ValidateSet('baseline','specification','input')][string]$Suite = 'baseline'
)
$ErrorActionPreference = 'Stop'
$testEnvArgs = @{Seat=$Seat}
if ($RunId) { $testEnvArgs.RunId=$RunId }
. (Join-Path $PSScriptRoot '../project-env.ps1') @testEnvArgs
$testRoot=$env:PROJECT_ROOT
$testRun=$env:PROJECT_REVIEW_RUN
$testResults=[Collections.Generic.List[object]]::new()
$testExit=0
try {
    $testNode=@(Get-Command node -CommandType Application -ErrorAction SilentlyContinue)[0]
    if (-not $testNode) { throw 'Node 20+ is required; no dependency is installed automatically.' }
    $testVersion=& $testNode.Source --version
    if ($LASTEXITCODE -ne 0 -or [int]($testVersion.TrimStart('v').Split('.')[0]) -lt 20) { throw 'Node 20+ is required.' }
    $testSuites=if($Suite -eq 'baseline') { @('specification','input') } else { @($Suite) }
    Push-Location $testRoot
    try {
        foreach($testSuite in $testSuites) {
            $testFile=if($testSuite -eq 'input') { 'tests/contracts/font-source.test.mjs' } else { 'tests/specification/specification.test.mjs' }
            if(-not (Test-Path -LiteralPath $testFile)) { throw "Missing declared test suite: $testFile" }
            $testLog=Join-Path $testRun "evidence/tests-$testSuite.tap"
            & $testNode.Source --test --test-reporter=tap $testFile 2>&1 | Tee-Object -FilePath $testLog
            $testCode=$LASTEXITCODE
            $testResults.Add([ordered]@{suite=$testSuite;file=$testFile;exitCode=$testCode;status=$(if($testCode -eq 0){'pass'}else{'fail'});log="evidence/tests-$testSuite.tap"})
            if($testCode -ne 0) { $testExit=1 }
        }
    } finally { Pop-Location }
} catch {
    Write-Warning $_.Exception.Message
    $testResults.Add([ordered]@{suite=$Suite;status='unverified';reason=$_.Exception.Message;exitCode=2})
    if($testExit -ne 1) { $testExit=2 }
} finally {
    $testPlannedCount=$null
    $testPlannedCheckCount=$null
    $testAcceptanceReason='Acceptance campaigns are planned, not executed by this runner.'
    try {
        $testPlan=Get-Content -LiteralPath (Join-Path $testRoot 'tests/acceptance/cases.json') -Raw | ConvertFrom-Json
        if(-not $testPlan.cases -or @($testPlan.cases).Count -eq 0) { throw 'Acceptance manifest has no cases.' }
        $testPlannedCount=@($testPlan.cases).Count
        $testPlannedCheckCount=@($testPlan.cases | ForEach-Object { $_.checks }).Count
    } catch {
        $testAcceptanceReason="Acceptance manifest unavailable: $($_.Exception.Message)"
        if($testExit -ne 1) { $testExit=2 }
    }
    [ordered]@{schemaVersion=1;requestedSuite=$Suite;node=$testVersion;exitCode=$testExit;results=$testResults.ToArray();acceptance=@{executedByThisRunner=$false;plannedCases=$testPlannedCount;plannedChecks=$testPlannedCheckCount;status='unverified';reason=$testAcceptanceReason};scope='Only implemented baseline suites; not UI, mesh, slicer or physical-print certification'} |
        ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $testRun 'reports/tests-summary.json') -Encoding utf8
}
exit $testExit
