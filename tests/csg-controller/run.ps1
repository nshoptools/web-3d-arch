param(
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_-]{1,79}$')][string]$RunId,
 [Parameter(Mandatory)][string]$InputPath,
 [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{1,32}$')][string]$Label,
 [switch]$ResumeStage
)
$ErrorActionPreference='Stop'
$CsgRoot=$PSScriptRoot
while(-not (Test-Path -LiteralPath (Join-Path $CsgRoot 'tools/project-env.ps1'))) {
 $CsgParent=Split-Path -Parent $CsgRoot
 if($CsgParent -eq $CsgRoot){throw 'Repository root missing'}
 $CsgRoot=$CsgParent
}
. (Join-Path $CsgRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
$CsgInput=(Resolve-Path -LiteralPath $InputPath).Path
if(-not $CsgInput.StartsWith($env:PROJECT_ROOT+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside repo'}
$CsgLog=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'.log')
if(Test-Path -LiteralPath $CsgLog){throw 'Refuse evidence overwrite'}
$CsgTls=Join-Path $env:PROJECT_REVIEW_RUN 'temp/tls'
if(-not (Test-Path -LiteralPath (Join-Path $CsgTls 'synthetic-cert.pem'))){
 & (Join-Path $PSScriptRoot 'support/generate-tls.ps1') -RunId $RunId -OutputDirectory $CsgTls
}
. (Join-Path $CsgRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
$CsgNode=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
$CsgCaptured=Join-Path $env:PROJECT_REVIEW_RUN ('work/runner/'+$Label)
if(Test-Path -LiteralPath $CsgCaptured){throw 'Refuse runner overwrite'}
[IO.Directory]::CreateDirectory($CsgCaptured)|Out-Null
$CsgPins=@()
foreach($CsgFile in Get-ChildItem -LiteralPath $PSScriptRoot -File -Recurse) {
 $CsgRelative=[IO.Path]::GetRelativePath($PSScriptRoot,$CsgFile.FullName)
 $CsgDest=Join-Path $CsgCaptured $CsgRelative
 [IO.Directory]::CreateDirectory((Split-Path -Parent $CsgDest))|Out-Null
 Copy-Item -LiteralPath $CsgFile.FullName -Destination $CsgDest
 $CsgPins+=@{file=$CsgRelative;sha256=(Get-FileHash -LiteralPath $CsgDest).Hash.ToLowerInvariant()}
}
$CsgPins|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN ('inputs/'+$Label+'-runner-pins.json')) -Encoding utf8NoBOM
$CsgMode=if($ResumeStage){'resume-stage'}else{'run'}
& $CsgNode (Join-Path $CsgCaptured 'run.mjs') $CsgInput $Label $CsgMode *> $CsgLog
$CsgExit=$LASTEXITCODE
[pscustomobject]@{exit=$CsgExit;log=$CsgLog;label=$Label;scope='implementation-controller-test-only'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'-exit.json')) -Encoding utf8NoBOM
exit $CsgExit

