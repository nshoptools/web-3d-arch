param([Parameter(Mandatory)][string]$RunId,[ValidatePattern('^[a-zA-Z0-9_-]{1,60}$')][string]$Label='host-integration')
$ErrorActionPreference='Stop'
$WebHostProject=$PSScriptRoot
while(-not (Test-Path (Join-Path $WebHostProject 'tools/project-env.ps1'))) {
  $WebHostProject=Split-Path -Parent $WebHostProject
  if(-not $WebHostProject){throw 'Project root not found'}
}
. (Join-Path $WebHostProject 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:HOST_TEST_RUN_ID=$RunId
if((& node --version) -ne 'v24.19.0'){throw 'Node 24.19.0 required'}
$WebHostCandidate=$WebHostProject
$env:HOST_TEST_TLS=Join-Path $env:PROJECT_REVIEW_RUN ('inputs/host-tls-'+$Label)
& (Join-Path $PSScriptRoot 'generate-tls.ps1') -RunId $RunId -OutputDirectory $env:HOST_TEST_TLS
$WebHostFontDir=Join-Path $env:PROJECT_REVIEW_RUN 'inputs/font'
New-Item -ItemType Directory -Path $WebHostFontDir -Force|Out-Null
Copy-Item -LiteralPath (Join-Path $WebHostProject 'src/assets/fonts/ttf/PatrickHand.ttf') -Destination $WebHostFontDir
Copy-Item -LiteralPath (Join-Path $WebHostProject 'src/assets/fonts/licenses/patrickhand/OFL.txt') -Destination $WebHostFontDir
$WebHostTap=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'.tap')
$WebHostSummary=Join-Path $env:PROJECT_REVIEW_RUN ('reports/'+$Label+'-summary.json')
if((Test-Path $WebHostTap) -or (Test-Path $WebHostSummary)){throw 'Evidence label already exists'}
if((Get-Content -Raw -LiteralPath (Join-Path $WebHostProject 'node_modules/playwright/package.json')|ConvertFrom-Json).version -ne '1.63.0'){throw 'Pinned Playwright 1.63.0 required'}
$WebHostFixture=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'fixtures/host-v1.json')|ConvertFrom-Json
$WebHostFontPin=$WebHostFixture.assets|Where-Object file -eq 'fixture-font.ttf'
if((Get-FileHash -LiteralPath (Join-Path $WebHostFontDir 'PatrickHand.ttf')).Hash.ToLowerInvariant() -ne $WebHostFontPin.sha256){throw 'Original font fixture changed'}
function Get-WebHostSnapshot {
  $WebHostPaths=@()
  foreach($WebHostTree in @('src/host','src/server','tools/hosting','tests/host')){$WebHostPaths+=Get-ChildItem -LiteralPath (Join-Path $WebHostProject $WebHostTree) -File -Recurse}
  $WebHostPaths+=Get-Item (Join-Path $WebHostProject 'tests/server/helpers.mjs'),(Join-Path $WebHostProject 'docs/backend/policy.example.json')
  $WebHostPaths+=Get-ChildItem -LiteralPath $WebHostFontDir -File
  $WebHostPaths+=Get-Item (Join-Path $env:HOST_TEST_TLS 'synthetic-cert.pem'),(Join-Path $env:HOST_TEST_TLS 'synthetic-key.pem')
  @($WebHostPaths|Sort-Object FullName|ForEach-Object {
    @{path=[IO.Path]::GetRelativePath($env:PROJECT_REVIEW_RUN,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
  })
}
$WebHostBefore=Get-WebHostSnapshot
$WebHostStarted=[DateTime]::UtcNow
Push-Location $env:PROJECT_REVIEW_RUN
try {
  & node --test --test-reporter=tap --test-concurrency=1 (Join-Path $PSScriptRoot '*.test.mjs') 2>&1 | Tee-Object -FilePath $WebHostTap
  $WebHostExit=$LASTEXITCODE
}finally{Pop-Location}
$WebHostAfter=Get-WebHostSnapshot
$WebHostStable=(ConvertTo-Json -InputObject $WebHostBefore -Depth 5 -Compress) -eq (ConvertTo-Json -InputObject $WebHostAfter -Depth 5 -Compress)
$WebHostText=Get-Content $WebHostTap -Raw
function Get-WebHostCount([string]$Name) {
  $WebHostMatch=[regex]::Match($WebHostText,'(?m)^# '+$Name+' (\d+)\s*$')
  if(-not $WebHostMatch.Success){throw 'Missing TAP count'}
  [int]$WebHostMatch.Groups[1].Value
}
$WebHostCounts=@{}
foreach($WebHostName in @('tests','pass','fail','cancelled','skipped','todo')){$WebHostCounts[$WebHostName]=Get-WebHostCount $WebHostName}
$WebHostSuccess=$WebHostExit -eq 0 -and $WebHostStable -and $WebHostCounts.tests -eq 25 -and $WebHostCounts.pass -eq 25 -and $WebHostCounts.fail -eq 0 -and $WebHostCounts.skipped -eq 0 -and $WebHostCounts.cancelled -eq 0 -and $WebHostCounts.todo -eq 0
$WebHostResult=@{status=if($WebHostSuccess){'passed'}else{'failed'};implementationOnly=$true;independentReview=$false;counts=$WebHostCounts;exitCode=$WebHostExit;inputsStable=$WebHostStable;node='24.19.0';playwright='1.63.0';startedUtc=$WebHostStarted.ToString('o');finishedUtc=[DateTime]::UtcNow.ToString('o');tapSha256=(Get-FileHash $WebHostTap -Algorithm SHA256).Hash.ToLowerInvariant();syntheticLocalOnly=$true;liveProviderCalls=0;realDeployment=$false}
$WebHostResult|ConvertTo-Json -Depth 8|Set-Content $WebHostSummary -Encoding utf8NoBOM
ConvertTo-Json -InputObject $WebHostBefore -Depth 5|Set-Content (Join-Path $env:PROJECT_REVIEW_RUN ('reports/'+$Label+'-test-inputs.json')) -Encoding utf8NoBOM
$WebHostResult|ConvertTo-Json -Depth 8
if(-not $WebHostSuccess){exit 1}
