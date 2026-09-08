#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('codex','opus','grok')][string]$Seat,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../project-env.ps1') -Seat $Seat -RunId $RunId
$selfOriginalRunId=$RunId
$selfRoot=$env:PROJECT_ROOT
$selfRun=$env:PROJECT_REVIEW_RUN
$selfDestination=[IO.Path]::GetFullPath((Join-Path $selfRun 'work/permanent-only'))
$selfEvidence=Join-Path $selfRun 'evidence'
if (-not $selfDestination.StartsWith($selfRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Snapshot destination escapes repository.'
}
if (Test-Path -LiteralPath $selfDestination) { throw 'Snapshot already exists. Use a new RunId; existing work is preserved.' }
$selfCopied=[Collections.Generic.List[string]]::new()
function Copy-PermanentInput([string]$Relative) {
    $selfSource=[IO.Path]::GetFullPath((Join-Path $selfRoot $Relative))
    if (-not $selfSource.StartsWith($selfRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw "Input escapes repository: $Relative"
    }
    $selfAncestor=$selfSource
    while ($selfAncestor -ne $selfRoot) {
        $selfInfo=Get-Item -LiteralPath $selfAncestor -Force
        if ($selfInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Input traverses a link: $Relative" }
        $selfAncestor=Split-Path -Parent $selfAncestor
    }
    $selfItem=Get-Item -LiteralPath $selfSource -Force
    if ($selfItem.PSIsContainer) {
        foreach ($selfChild in Get-ChildItem -LiteralPath $selfSource -Force) {
            Copy-PermanentInput (Join-Path $Relative $selfChild.Name)
        }
    } else {
        $selfTarget=Join-Path $selfDestination $Relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $selfTarget) -Force | Out-Null
        Copy-Item -LiteralPath $selfSource -Destination $selfTarget
        $selfCopied.Add($Relative.Replace('\','/'))
    }
}
# Explicit durable inputs only; no working directories, downloads or installed caches.
foreach ($selfInput in @('docs','tests','tools','src/input','src/assets/harfbuzz','src/assets/fonts/fonts-cat.json','AGENTS.md','README.md','.gitignore')) {
    Copy-PermanentInput $selfInput
}
$selfFontCatalog=Get-Content -LiteralPath (Join-Path $selfRoot 'src/assets/fonts/fonts-cat.json') -Raw | ConvertFrom-Json
$selfInter=@($selfFontCatalog | Where-Object id -eq 'inter')
if ($selfInter.Count -ne 1) { throw 'Expected exactly one Inter fixture in the font catalog.' }
Copy-PermanentInput (Join-Path 'src/assets/fonts' $selfInter[0].path)
foreach ($selfExcluded in @('tmp','report','.toolchain','.git')) {
    if (Test-Path -LiteralPath (Join-Path $selfDestination $selfExcluded)) { throw "Unexpected non-durable tree: $selfExcluded" }
}
$selfSummary=[ordered]@{
    schemaVersion=1
    method='Copy explicit permanent inputs to a fresh ordinary directory, then execute baseline and source audit there'
    copiedFileCount=$selfCopied.Count
    absentBeforeExecution=@('tmp','report','.toolchain','.git')
    outputs='Child runner creates its own isolated output directories after the absence check'
    sourceManifestSha256=(Get-FileHash -LiteralPath (Join-Path $selfDestination 'docs/specs/source-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    testScriptSha256=(Get-FileHash -LiteralPath (Join-Path $selfDestination 'tests/specification/specification.test.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
    auditScriptSha256=(Get-FileHash -LiteralPath (Join-Path $selfDestination 'tools/reviews/audit-spec-sources.py') -Algorithm SHA256).Hash.ToLowerInvariant()
    scope='Document/input suites and structural data audit; no product, slicer or physical-print certification'
}
$selfCode=1
try {
    $selfPwsh=(Get-Process -Id $PID).Path
    & $selfPwsh -NoProfile -File (Join-Path $selfDestination 'tools/tests/run.ps1') -Seat $Seat -RunId permanent-proof -Suite baseline
    $selfSummary.baselineExitCode=$LASTEXITCODE
    $selfChildRun=Join-Path $selfDestination "tmp/reviews/$Seat/runs/permanent-proof"
    $selfSummary.baseline=Get-Content -LiteralPath (Join-Path $selfChildRun 'reports/tests-summary.json') -Raw | ConvertFrom-Json
    foreach ($selfSuite in @('specification','input')) {
        Copy-Item -LiteralPath (Join-Path $selfChildRun "evidence/tests-$selfSuite.tap") -Destination (Join-Path $selfEvidence "standalone-tests-$selfSuite.tap")
    }
    # Initialize the child environment before invoking Python, then restore this run.
    . (Join-Path $selfDestination 'tools/project-env.ps1') -Seat $Seat -RunId permanent-proof
    python -B (Join-Path $selfDestination 'tools/reviews/audit-spec-sources.py')
    $selfSummary.auditExitCode=$LASTEXITCODE
    $selfAuditPath=Join-Path $selfChildRun 'evidence/source-audit-rechecked.json'
    $selfAudit=Get-Content -LiteralPath $selfAuditPath -Raw | ConvertFrom-Json
    $selfSummary.audit=$selfAudit.summary
    Copy-Item -LiteralPath $selfAuditPath -Destination (Join-Path $selfEvidence 'standalone-source-audit.json')
    $selfCode=if ($selfSummary.baselineExitCode -eq 0 -and $selfSummary.auditExitCode -eq 0) { 0 } else { 1 }
} catch {
    $selfSummary.error=$_.Exception.Message
    Write-Warning $_.Exception.Message
} finally {
    . (Join-Path $selfRoot 'tools/project-env.ps1') -Seat $Seat -RunId $selfOriginalRunId
    $selfSummary.status=if ($selfCode -eq 0) { 'pass' } else { 'fail' }
    $selfSummary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $selfRun 'reports/self-contained-summary.json') -Encoding utf8
}
exit $selfCode
