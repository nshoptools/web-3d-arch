param(
 [Parameter(Mandatory)][string]$RunId,
 [Parameter(Mandatory)][string]$InputPath,
 [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{1,40}$')][string]$Label,
 [ValidateSet('Verify','Pilot','Campaign','Focused','Interactions','Navigation','Downloads','Preview','Node')][string]$Mode='Campaign',
 [ValidateSet('chromium','firefox','webkit','all')][string]$Engine='all',
 [string]$CaseFilter=''
)
$ErrorActionPreference='Stop'
$AcceptanceRoot=$PSScriptRoot
while(-not (Test-Path -LiteralPath (Join-Path $AcceptanceRoot 'tools/project-env.ps1'))) {
 $AcceptanceParent=Split-Path -Parent $AcceptanceRoot
 if($AcceptanceParent -eq $AcceptanceRoot){throw 'Repo root not found'}
 $AcceptanceRoot=$AcceptanceParent
}
. (Join-Path $AcceptanceRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
$AcceptanceInput=(Resolve-Path -LiteralPath $InputPath).Path
if(-not $AcceptanceInput.StartsWith($env:PROJECT_ROOT+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside repo'}
$AcceptanceStage=Join-Path $env:PROJECT_REVIEW_RUN ('work/harness/'+$Label)
if(Test-Path -LiteralPath $AcceptanceStage){throw 'Refuse stage overwrite'}
[IO.Directory]::CreateDirectory($AcceptanceStage)|Out-Null
$AcceptancePins=@(Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object {$_.Extension -in '.mjs','.ps1'} | ForEach-Object {
 Copy-Item -LiteralPath $_.FullName -Destination $AcceptanceStage
 [pscustomobject]@{file=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$_.Length}
})
Copy-Item -LiteralPath $AcceptanceInput -Destination (Join-Path $AcceptanceStage 'input.json')
$AcceptancePins+= [pscustomobject]@{file='input.json';sha256=(Get-FileHash -LiteralPath $AcceptanceInput -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $AcceptanceInput).Length}
$AcceptancePins | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $AcceptanceStage 'source-pins.json') -Encoding utf8NoBOM
$AcceptanceNode=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
$env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $env:PROJECT_ROOT '.toolchain/playwright'
$AcceptanceCodes=@()
$AcceptanceEngines=if($Mode -in 'Node','Verify'){@('node')}elseif($Engine -eq 'all'){@('chromium','firefox','webkit')}else{@($Engine)}
foreach($AcceptanceBrowser in $AcceptanceEngines){
 . (Join-Path $AcceptanceRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
 $AcceptanceLog=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'-'+$AcceptanceBrowser+'.log')
 if(Test-Path -LiteralPath $AcceptanceLog){throw 'Refuse log overwrite'}
 if($Mode -eq 'Verify'){& $AcceptanceNode (Join-Path $AcceptanceStage 'verify.mjs') (Join-Path $AcceptanceStage 'input.json') *> $AcceptanceLog}
 elseif($Mode -eq 'Node'){& $AcceptanceNode --test (Join-Path $AcceptanceStage 'readback.test.mjs') *> $AcceptanceLog}
 else {
  $AcceptanceScript=switch($Mode){'Pilot'{'pilot.mjs'} 'Focused'{'focused.mjs'} 'Interactions'{'interactions.mjs'} 'Navigation'{'firefox-navigation.mjs'} 'Downloads'{'downloads.mjs'} 'Preview'{'preview.mjs'} default{'campaign.mjs'}}
  & $AcceptanceNode (Join-Path $AcceptanceStage $AcceptanceScript) (Join-Path $AcceptanceStage 'input.json') $AcceptanceBrowser $Label $CaseFilter *> $AcceptanceLog
 }
 $AcceptanceCodes+= [pscustomobject]@{engine=$AcceptanceBrowser;mode=$Mode;exit=$LASTEXITCODE;log=$AcceptanceLog}
}
foreach($AcceptancePin in $AcceptancePins){
 if((Get-FileHash -LiteralPath (Join-Path $AcceptanceStage $AcceptancePin.file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $AcceptancePin.sha256){throw 'Harness changed during test'}
}
$AcceptanceCodes | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'-exit.json')) -Encoding utf8NoBOM
if($AcceptanceCodes.exit -contains 1){exit 1}
if($AcceptanceCodes.exit | Where-Object {$_ -ne 0}){exit 2}
exit 0

