param(
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
 [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$')][string]$Label='release',
 [string]$LibraryRoot
)
$ErrorActionPreference='Stop'
$ReleaseProject=$PSScriptRoot
while(-not (Test-Path -LiteralPath (Join-Path $ReleaseProject 'tools/project-env.ps1'))){
 $ReleaseParent=Split-Path -Parent $ReleaseProject
 if(-not $ReleaseParent -or $ReleaseParent -eq $ReleaseProject){throw 'Repository not found'}
 $ReleaseProject=$ReleaseParent
}
. (Join-Path $ReleaseProject 'tools/project-env.ps1') -Seat codex -RunId $RunId
if((& node --version) -ne 'v24.19.0'){throw 'Node24.19.0 required'}
$ReleaseCandidate=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ReleaseTap=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'.tap')
$ReleaseSummary=Join-Path $env:PROJECT_REVIEW_RUN ('reports/'+$Label+'-summary.json')
if((Test-Path -LiteralPath $ReleaseTap) -or (Test-Path -LiteralPath $ReleaseSummary)){throw 'Evidence label exists'}
$env:RELEASE_TEST_TLS=Join-Path $env:PROJECT_REVIEW_RUN ('inputs/tls-'+$Label)
& (Join-Path $PSScriptRoot 'generate-tls.ps1') -RunId $RunId -OutputDirectory $env:RELEASE_TEST_TLS
if($LibraryRoot){$env:RELEASE_LIBRARY_ROOT=[IO.Path]::GetFullPath($LibraryRoot)}
else {
 $env:RELEASE_LIBRARY_ROOT=Join-Path $env:PROJECT_REVIEW_RUN ('inputs/library-'+$Label)
 & node (Join-Path $PSScriptRoot 'stage-library.mjs') $ReleaseProject $env:RELEASE_LIBRARY_ROOT
 if($LASTEXITCODE -ne 0){throw 'Checked full library stage failed'}
}
function Get-ReleaseSnapshot {
 $ReleaseFiles=@()
 foreach($ReleaseTree in @('src/server','src/host','tools/release','tests/release','docs/release')){
  $ReleaseFiles+=Get-ChildItem -LiteralPath (Join-Path $ReleaseCandidate $ReleaseTree) -File -Recurse
 }
 $ReleaseFiles+=Get-Item -LiteralPath (Join-Path $ReleaseCandidate 'tests/server/helpers.mjs')
 $ReleaseFiles+=Get-ChildItem -LiteralPath $env:RELEASE_TEST_TLS -File
 foreach($ReleaseConfig in @('catalog','deployment','artwork','build-receipt','ready')){
  $ReleaseFiles+=Get-Item -LiteralPath (Join-Path $env:RELEASE_LIBRARY_ROOT ('source-library/'+$ReleaseConfig+'.json'))
 }
 @($ReleaseFiles|Sort-Object FullName|ForEach-Object{
  @{path=[IO.Path]::GetRelativePath($env:PROJECT_ROOT,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
 })
}
$ReleaseBefore=Get-ReleaseSnapshot
$ReleaseSyntax=$true
foreach($ReleaseCode in (Get-ChildItem -LiteralPath (Join-Path $ReleaseCandidate 'tools/release'),(Join-Path $ReleaseCandidate 'tests/release') -File -Recurse|Where-Object Extension -In @('.mjs','.cjs'))){
 & node --check $ReleaseCode.FullName
 if($LASTEXITCODE -ne 0){$ReleaseSyntax=$false}
}
if(-not $ReleaseSyntax){throw 'Syntax check failed'}
$ReleaseStarted=[DateTime]::UtcNow
Push-Location $env:PROJECT_REVIEW_RUN
try {
 & node --test --test-reporter=tap --test-concurrency=1 (Join-Path $PSScriptRoot '*.test.mjs') 2>&1 | Tee-Object -FilePath $ReleaseTap
 $ReleaseExit=$LASTEXITCODE
}finally{Pop-Location}
$ReleaseAfter=Get-ReleaseSnapshot
$ReleaseStable=(ConvertTo-Json -InputObject $ReleaseBefore -Depth 5 -Compress) -eq (ConvertTo-Json -InputObject $ReleaseAfter -Depth 5 -Compress)
$ReleaseText=Get-Content -LiteralPath $ReleaseTap -Raw
$ReleaseCounts=@{}
foreach($ReleaseName in @('tests','pass','fail','cancelled','skipped','todo')){
 $ReleaseMatch=[regex]::Match($ReleaseText,'(?m)^# '+$ReleaseName+' (\d+)\s*$')
 if(-not $ReleaseMatch.Success){throw 'Missing TAP count'}
 $ReleaseCounts[$ReleaseName]=[int]$ReleaseMatch.Groups[1].Value
}
$ReleaseSuccess=$ReleaseExit -eq 0 -and $ReleaseStable -and $ReleaseCounts.tests -eq 46 -and $ReleaseCounts.pass -eq 46 -and $ReleaseCounts.fail -eq 0 -and $ReleaseCounts.cancelled -eq 0 -and $ReleaseCounts.skipped -eq 0 -and $ReleaseCounts.todo -eq 0
$ReleaseResult=@{
 status=if($ReleaseSuccess){'passed'}else{'failed'};counts=$ReleaseCounts;exitCode=$ReleaseExit;
 codeStableDuringRun=$ReleaseStable;syntax=$ReleaseSyntax;node='24.19.0';playwright='1.63.0';
 startedUtc=$ReleaseStarted.ToString('o');finishedUtc=[DateTime]::UtcNow.ToString('o');
 tapSha256=(Get-FileHash -LiteralPath $ReleaseTap -Algorithm SHA256).Hash.ToLowerInvariant();
 fullLibraryResources=21391;originalAssetBytes=306260612;previews=7751;
 implementationOnly=$true;independentReview=$false;actualModelEffortFastIndependentlyAttested=$false;
 actualLocalHTTPS=$true;browserConcurrency=1;syntheticEntryAndWasm=$true;
 liveProviderCalls=0;realDeployment=$false;appComplete=$false
}
ConvertTo-Json -InputObject $ReleaseBefore -Depth 5|Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN ('reports/'+$Label+'-test-inputs.json')) -Encoding utf8NoBOM
$ReleaseResult|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $ReleaseSummary -Encoding utf8NoBOM
$ReleaseResult|ConvertTo-Json -Depth 8
if(-not $ReleaseSuccess){exit 1}
