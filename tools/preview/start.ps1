[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$')][string]$RunId,
 [Parameter(Mandatory)][string]$InputPath,
 [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]{1,28}$')][string]$Label,
 [switch]$Foreground
)
$ErrorActionPreference='Stop'
$previewRoot=$PSScriptRoot
while(-not (Test-Path -LiteralPath (Join-Path $previewRoot 'tools/project-env.ps1'))){
 $previewParent=Split-Path -Parent $previewRoot
 if(-not $previewParent -or $previewParent -eq $previewRoot){throw 'Repo root missing'}
 $previewRoot=$previewParent
}
. (Join-Path $previewRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
$previewInput=(Resolve-Path -LiteralPath $InputPath).Path
if(-not $previewInput.StartsWith($env:PROJECT_ROOT+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside repo'}
$previewAncestor=$previewInput
while($previewAncestor -ne $env:PROJECT_ROOT){
 if((Get-Item -LiteralPath $previewAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Input ancestor is a link'}
 $previewAncestor=Split-Path -Parent $previewAncestor
}
$previewInputDoc=Get-Content -LiteralPath $previewInput -Raw | ConvertFrom-Json
if($previewInputDoc.version -ne 'product-acceptance-input/2' -or $previewInputDoc.purpose -ne 'whole-product'){throw 'Exact whole-product input/2 pins required'}
if($previewInputDoc.releaseSHA256 -eq '1147ad94ad005ffdb5f2524e4d9e6ada71778f3cc84c1b3cf590b2165c3b621f'){throw 'Old baseline refused: supply the new final artifact pins'}
$previewScripts=Join-Path $previewRoot 'tests/product-acceptance'
$previewStatusPath=Join-Path $env:PROJECT_REVIEW_RUN ('reports/'+$Label+'-launcher.json')
if(-not $Foreground){
 if(Test-Path -LiteralPath $previewStatusPath){throw 'Choose a fresh Label; launcher record exists'}
 $previewArguments=@('-NoProfile','-File',('"'+$PSCommandPath+'"'),'-RunId',$RunId,'-InputPath',('"'+$previewInput+'"'),'-Label',$Label,'-Foreground')
 $previewProcess=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList $previewArguments -WorkingDirectory $previewRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'-launcher.stdout.log')) -RedirectStandardError (Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Label+'-launcher.stderr.log')) -PassThru
 [ordered]@{version='final-human-preview-launch/1';status='verifying-not-yet-ready';pid=$previewProcess.Id;inputSHA256=(Get-FileHash -LiteralPath $previewInput).Hash.ToLowerInvariant();readyRecord=('evidence/'+$Label+'-chromium/preview.json');identity='Local synthetic signed OIDC test member; not production authentication';scope='Human preview; no automatic whole-product verdict'} | ConvertTo-Json | Set-Content -LiteralPath $previewStatusPath -Encoding utf8NoBOM
 Get-Content -LiteralPath $previewStatusPath
 exit 0
}
$previewChildResult=0
try {
 # Verify before creating any browser or presenting the new artifact as ready.
 & (Join-Path $previewScripts 'run.ps1') -RunId $RunId -InputPath $previewInput -Label ($Label+'-verify') -Mode Verify
 if($LASTEXITCODE -ne 0){throw 'Final artifact integrity verification failed; preview not started'}
 . (Join-Path $previewRoot 'tools/development/env.ps1') -Seat codex -RunId $RunId
 $previewTLS=Join-Path $env:PROJECT_REVIEW_RUN 'temp/tls'
 if(-not (Test-Path -LiteralPath (Join-Path $previewTLS 'synthetic-cert.pem'))){
  & (Join-Path $previewScripts 'generate-tls.ps1') -RunId $RunId -OutputDirectory $previewTLS
  if($LASTEXITCODE -ne 0){throw 'Own-run TLS generation failed'}
 }
 & (Join-Path $previewScripts 'run.ps1') -RunId $RunId -InputPath $previewInput -Label $Label -Mode Preview -Engine chromium
 $previewChildResult=$LASTEXITCODE
} catch {
 $previewChildResult=1
 [Console]::Error.WriteLine($_.Exception.Message)
} finally {
 [ordered]@{version='final-human-preview-termination/1';at=[DateTime]::UtcNow.ToString('o');exit=$previewChildResult;readyRecord=('evidence/'+$Label+'-chromium/preview.json');note='Ready means actual UI loaded; functional smoke is separate. Inspect cleanup.json for completed service teardown.'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN ('reports/'+$Label+'-terminated.json')) -Encoding utf8NoBOM
}
exit $previewChildResult