[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
 [ValidateSet('node','types','browser')][string]$Suite='node',
 [string]$RuntimeDirectory='work/module',[string]$InputOverlayDirectory='',
 [ValidateSet('complete','legacy','material-only')][string]$ExpectedQualification='complete')
$ErrorActionPreference='Stop'
$sceneSearch=$PSScriptRoot
while($sceneSearch -and -not(Test-Path -LiteralPath (Join-Path $sceneSearch 'tools/project-env.ps1'))){$sceneSearch=Split-Path -Parent $sceneSearch}
if(-not $sceneSearch){throw 'Cannot resolve repository tools/project-env.ps1'}
. (Join-Path $sceneSearch 'tools/development/env.ps1') -Seat codex -RunId $RunId
$sceneNode=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
$sceneEvidence=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/final-scene-'+$Suite+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $sceneEvidence -Force | Out-Null
$sceneLog=Join-Path $sceneEvidence 'output.log'
[IO.File]::WriteAllText($sceneLog,'',[Text.UTF8Encoding]::new($false))
if($Suite -eq 'node'){
 & $sceneNode --test (Join-Path $PSScriptRoot 'qualification.test.mjs') (Join-Path $PSScriptRoot 'provider.test.mjs') (Join-Path $PSScriptRoot 'provider-analysis.test.mjs') (Join-Path $PSScriptRoot 'material-ledger.test.mjs') (Join-Path $PSScriptRoot 'gates.test.mjs') *>&1 | Tee-Object -FilePath $sceneLog
}elseif($Suite -eq 'types'){
 & $sceneNode (Join-Path $env:PROJECT_ROOT '.toolchain/app-runtime/node_modules/typescript/bin/tsc') --ignoreConfig --noEmit --strict --module nodenext --target es2022 --lib es2022,dom --skipLibCheck (Join-Path $PSScriptRoot 'types.test.mts') *>&1 | Tee-Object -FilePath $sceneLog
}else{
 $sceneRuntime=[IO.Path]::GetFullPath((Join-Path $env:PROJECT_REVIEW_RUN $RuntimeDirectory))
 if(-not $sceneRuntime.StartsWith($env:PROJECT_REVIEW_RUN+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Runtime must be pinned inside the requested run'}
 if(-not(Test-Path -LiteralPath (Join-Path $sceneRuntime 'arch-kernel.wasm'))){throw 'Stage/pin the root pair and source fixtures in the requested run first; no prior-room fallback'}
 $env:SCENE_RUNTIME_DIRECTORY=$sceneRuntime
 $env:SCENE_EXPECTED_QUALIFICATION=$ExpectedQualification
 $env:SCENE_INPUT_OVERLAY=''
 if($InputOverlayDirectory){$env:SCENE_INPUT_OVERLAY=[IO.Path]::GetFullPath((Join-Path $env:PROJECT_REVIEW_RUN $InputOverlayDirectory))}
 & $sceneNode --test (Join-Path $PSScriptRoot 'browser.test.mjs') *>&1 | Tee-Object -FilePath $sceneLog
}
$sceneExit=$LASTEXITCODE
@{suite=$Suite;exit=$sceneExit;run=$RunId;log=$sceneLog;configuredIndependentReview=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $sceneEvidence 'summary.json') -Encoding utf8
exit $sceneExit
