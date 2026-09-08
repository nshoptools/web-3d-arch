#requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
  [Parameter(Mandatory)][string]$PromptFile
)
$ErrorActionPreference='Stop'
$codexOriginalProfile=$env:USERPROFILE
$codexProgram=@(Get-Command codex -CommandType Application -ErrorAction Stop)[0].Source
. (Join-Path $PSScriptRoot '../project-env.ps1') -Seat codex -RunId $RunId
$codexRoot=$env:PROJECT_ROOT
$codexRun=$env:PROJECT_REVIEW_RUN
$codexConfig=Get-Content -LiteralPath (Join-Path $codexRoot 'docs/reviews/seat-config.json') -Raw | ConvertFrom-Json
Get-Content -LiteralPath (Join-Path $codexRoot 'docs/reviews/SEAT-CONFIG.md') -Raw | Out-Null
$codexPrompt=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathFullyQualified($PromptFile)){$PromptFile}else{Join-Path $codexRoot $PromptFile}))
if(-not $codexPrompt.StartsWith($codexRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Prompt must be inside repository'}
$codexEvidence=Join-Path $codexRun 'evidence/events.jsonl'
if(Test-Path -LiteralPath $codexEvidence){throw 'Use a fresh RunId to preserve earlier evidence'}
$codexProfile=Join-Path $codexRun 'cache/profile'
$env:CODEX_HOME=Join-Path $codexRun 'cache/codex-home'
New-Item -ItemType Directory -Path $codexProfile,$env:CODEX_HOME -Force | Out-Null
$codexAuth=Join-Path $codexOriginalProfile '.codex/auth.json'
if(Test-Path -LiteralPath $codexAuth){Copy-Item -LiteralPath $codexAuth -Destination (Join-Path $env:CODEX_HOME 'auth.json')}
$env:USERPROFILE=$codexProfile
$env:HOME=$codexProfile
$env:APPDATA=Join-Path $codexProfile 'AppData/Roaming'
$env:LOCALAPPDATA=Join-Path $codexProfile 'AppData/Local'
New-Item -ItemType Directory -Path $env:APPDATA,$env:LOCALAPPDATA -Force | Out-Null
$codexFeaturePath=Join-Path $codexRun 'evidence/effective-features.txt'
& $codexProgram -c 'features.fast_mode=false' -c 'service_tier="default"' features list > $codexFeaturePath
if($LASTEXITCODE -ne 0 -or -not (Select-String -LiteralPath $codexFeaturePath -Pattern '^fast_mode\s+\S+\s+false\s*$' -Quiet)){throw 'Could not verify effective Fast mode off'}
$codexArgs=@('exec','--ignore-user-config','--color','never','-C',$codexRoot,'-m',$codexConfig.seats.codex.model,'-c',('model_reasoning_effort="'+$codexConfig.seats.codex.effort+'"'),'-c','service_tier="default"','-c','features.fast_mode=false','-c','approval_policy="never"','-s','danger-full-access','--json','-o',(Join-Path $codexRun 'reports/response.md'),'-')
[ordered]@{model=$codexConfig.seats.codex.model;effort=$codexConfig.seats.codex.effort;fast=$false;version=(& $codexProgram --version);binarySha256=(Get-FileHash -LiteralPath $codexProgram -Algorithm SHA256).Hash;args=$codexArgs;status='requested; verify actual session metadata'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $codexRun 'evidence/launch.json') -Encoding utf8
Push-Location $codexRoot
try {Get-Content -LiteralPath $codexPrompt -Raw | & $codexProgram @codexArgs > $codexEvidence 2> (Join-Path $codexRun 'evidence/stderr.log');$codexExit=$LASTEXITCODE}finally{Pop-Location}
[ordered]@{exitCode=$codexExit;finishedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $codexRun 'reports/completion.json') -Encoding utf8
Write-Output "Codex run $RunId exited $codexExit"
exit $codexExit
