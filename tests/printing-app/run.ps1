param(
 [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$')][string]$RunId,
 [Parameter(Mandatory)][string]$ModulePath,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ModuleSha256,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$WasmSha256,
 [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$')][string]$Label='printing'
)
$ErrorActionPreference='Stop'
$PrintingRepo=$PSScriptRoot
while(-not (Test-Path -LiteralPath (Join-Path $PrintingRepo 'tools/project-env.ps1'))){
 $PrintingParent=Split-Path -Parent $PrintingRepo
 if(-not $PrintingParent -or $PrintingParent -eq $PrintingRepo){throw 'Repository not found'}
 $PrintingRepo=$PrintingParent
}
. (Join-Path $PrintingRepo 'tools/project-env.ps1') -Seat codex -RunId $RunId
$PrintingCandidate=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$PrintingTap=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'.tap')
$PrintingSummary=Join-Path $env:PROJECT_REVIEW_RUN ('reports/'+$Label+'-summary.json')
if((Test-Path -LiteralPath $PrintingTap) -or (Test-Path -LiteralPath $PrintingSummary)){throw 'Evidence label exists'}
& node (Join-Path $PSScriptRoot 'prepare.mjs') ([IO.Path]::GetFullPath($ModulePath)) $ModuleSha256 $WasmSha256
if($LASTEXITCODE -ne 0){throw 'Offline test preparation failed'}
$env:PRINTING_MODULE=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
$env:PRINTING_EVIDENCE_LABEL=$Label
function Get-PrintingSnapshot {
 $PrintingFiles=@()
 $PrintingInventory=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'test-inputs.json') -Raw | ConvertFrom-Json
 if($PrintingInventory.version -ne 'arch-printing-test-inputs/1'){throw 'Unknown test input inventory'}
 foreach($PrintingRelative in $PrintingInventory.paths){
  $PrintingPath=[IO.Path]::GetFullPath((Join-Path $PrintingCandidate $PrintingRelative))
  if(-not $PrintingPath.StartsWith($PrintingCandidate+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Test input outside candidate'}
  $PrintingAncestor=$PrintingPath
  while($PrintingAncestor -ne $PrintingCandidate){
   if((Get-Item -LiteralPath $PrintingAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked test input'}
   $PrintingAncestor=Split-Path -Parent $PrintingAncestor
  }
  $PrintingFiles+=Get-Item -LiteralPath $PrintingPath
 }
 $PrintingFiles+=Get-ChildItem -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'work/module') -File
 $PrintingFiles+=Get-ChildItem -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'work/node_modules') -File -Recurse
 @($PrintingFiles | Sort-Object FullName | ForEach-Object{
  @{path=[IO.Path]::GetRelativePath($PrintingRepo,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()}
 })
}
$PrintingBefore=Get-PrintingSnapshot
foreach($PrintingFile in (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '.') -File -Filter '*.mjs')){
 & node --check $PrintingFile.FullName
 if($LASTEXITCODE -ne 0){throw 'Test syntax failed'}
}
& node --check (Join-Path $PrintingCandidate 'src/integration/printing-adapters.mjs')
if($LASTEXITCODE -ne 0){throw 'Adapter syntax failed'}
& node (Join-Path $PrintingRepo '.toolchain/app-runtime/node_modules/typescript/bin/tsc') --ignoreConfig --noEmit --strict --module NodeNext --target ES2022 --lib ES2023,DOM --skipLibCheck (Join-Path $PSScriptRoot 'types.mts') 2>&1 | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'-types.log'))
if($LASTEXITCODE -ne 0){throw 'Adapter type compatibility failed'}
$PrintingStarted=[DateTime]::UtcNow
Push-Location $env:PROJECT_REVIEW_RUN
try{
 & node --test --test-reporter=tap --test-concurrency=1 (Join-Path $PSScriptRoot '*.test.mjs') 2>&1 | Tee-Object -FilePath $PrintingTap
 $PrintingExit=$LASTEXITCODE
}finally{Pop-Location}
$PrintingOracle=$false
$PrintingOracleFile=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'-readback.json')
if($PrintingExit -eq 0){
 $PrintingOutputs=@(Get-ChildItem -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN ('evidence/runtime-'+$Label)),(Join-Path $env:PROJECT_REVIEW_RUN ('evidence/browser-'+$Label)) -File -Recurse | Where-Object Extension -In '.3mf','.stl' | ForEach-Object FullName)
 if($PrintingOutputs.Count -ne 12){throw 'Expected twelve real output files'}
 & python (Join-Path $PSScriptRoot 'readback.py') @PrintingOutputs 2>&1 | Tee-Object -FilePath $PrintingOracleFile
 $PrintingOracle=$LASTEXITCODE -eq 0
}
$PrintingAfter=Get-PrintingSnapshot
$PrintingStable=(ConvertTo-Json -InputObject $PrintingBefore -Depth 6 -Compress) -eq (ConvertTo-Json -InputObject $PrintingAfter -Depth 6 -Compress)
$PrintingText=Get-Content -LiteralPath $PrintingTap -Raw
$PrintingCounts=@{}
foreach($PrintingName in @('tests','pass','fail','cancelled','skipped','todo')){
 $PrintingMatch=[regex]::Match($PrintingText,'(?m)^# '+$PrintingName+' (\d+)\s*$')
 if(-not $PrintingMatch.Success){throw 'Missing TAP count'}
 $PrintingCounts[$PrintingName]=[int]$PrintingMatch.Groups[1].Value
}
$PrintingPassed=$PrintingExit -eq 0 -and $PrintingCounts.tests -eq 33 -and $PrintingCounts.pass -eq 33 -and $PrintingCounts.fail -eq 0 -and $PrintingCounts.skipped -eq 0 -and $PrintingCounts.cancelled -eq 0 -and $PrintingCounts.todo -eq 0 -and $PrintingStable -and $PrintingOracle
$PrintingResult=@{
 version='arch-printing-app-tests/1';status=if($PrintingPassed){'passed'}else{'failed'};counts=$PrintingCounts;syntax=$true;types=$true;codeStableDuringRun=$PrintingStable;
 independentReadback=$PrintingOracle;readbackFiles=12;negativeReaderControls=1;startedUtc=$PrintingStarted.ToString('o');finishedUtc=[DateTime]::UtcNow.ToString('o');
 node='24.19.0';playwright='1.63.0';browserConcurrency=1;actualParentRPC=$true;actualUnifiedModule=$true;rootPrintingCapabilityBitAbsent=$true;
 moduleSha256=$ModuleSha256;wasmSha256=$WasmSha256;tapSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $PrintingTap).Hash.ToLowerInvariant();
 implementationOnly=$true;independentReview=$false;actualModelEffortFastNotAttested=$true;physicalFit='unqualified';targetSlicer='unverified';network='explicit loopback whitelist';syntheticSceneAuthority=$true
}
ConvertTo-Json -InputObject $PrintingBefore -Depth 6 | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN ('reports/'+$Label+'-test-inputs.json')) -Encoding utf8NoBOM
$PrintingResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $PrintingSummary -Encoding utf8NoBOM
$PrintingResult | ConvertTo-Json -Depth 8
if(-not $PrintingPassed){exit 1}
