[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
 [Parameter(Mandatory=$true)][ValidateSet('codex','opus','grok')][string]$Seat,
 [ValidatePattern('^(chromium|firefox|webkit)(,(chromium|firefox|webkit))*$')][string]$Browsers='chromium,firefox,webkit',
 [string]$Cases=''
)
$ErrorActionPreference='Stop'
# Git locates the real root even when tests/AGENTS.md exists. No cwd/old-room assumption.
$controllerRepo=$null
try {
 $controllerRootLines=& git -C $PSScriptRoot rev-parse --show-toplevel 2>$null
 if($LASTEXITCODE -eq 0){
  $controllerGitRoot=[IO.Path]::GetFullPath(($controllerRootLines -join '').Trim())
  if((Test-Path -LiteralPath (Join-Path $controllerGitRoot 'tools/project-env.ps1')) -and (Test-Path -LiteralPath (Join-Path $controllerGitRoot 'tools/development/env.ps1'))){$controllerRepo=$controllerGitRoot}
 }
} catch {}
if(-not $controllerRepo){
 $controllerRepo=[IO.Path]::GetFullPath($PSScriptRoot)
 while(-not ((Test-Path -LiteralPath (Join-Path $controllerRepo 'tools/project-env.ps1')) -and (Test-Path -LiteralPath (Join-Path $controllerRepo 'tools/development/env.ps1')))){
  $controllerParent=Split-Path -Parent $controllerRepo
  if(-not $controllerParent -or $controllerParent -eq $controllerRepo){throw 'Repo environment script not found'}
  $controllerRepo=$controllerParent
 }
}
. (Join-Path $controllerRepo 'tools/development/env.ps1') -Seat $Seat -RunId $RunId
$controllerNode=(Get-Command node).Source
$controllerStageJSON=& $controllerNode (Join-Path $PSScriptRoot 'stage.mjs') --run-id $RunId
if($LASTEXITCODE){throw 'Stage current main failed'}
$controllerStage=$controllerStageJSON | ConvertFrom-Json
$controllerRuntime=$controllerStage.runtime
$controllerEvidence=$controllerStage.evidenceDirectory
$controllerCertPath=Join-Path $controllerStage.temporaryDirectory 'test-tls.pfx'
$controllerKey=[Security.Cryptography.RSA]::Create(2048)
try{
 $controllerRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=controller-loopback-test',$controllerKey,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $controllerCertificate=$controllerRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(2))
 try{[IO.File]::WriteAllBytes($controllerCertPath,$controllerCertificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,'controller-test-only'))}finally{$controllerCertificate.Dispose()}
}finally{$controllerKey.Dispose()}
$controllerExits=[ordered]@{kind='arch-app-test-exits';version=2;runId=$RunId;stageId=$controllerStage.stageId;status='running';node=$null;types=$null;browser=$null;nodeVersion=(& $controllerNode --version);browsers=$Browsers;cases=$Cases}
function Save-ControllerExits { [IO.File]::WriteAllText((Join-Path $controllerEvidence 'exits.json'),($controllerExits | ConvertTo-Json),[Text.UTF8Encoding]::new($false)) }
Save-ControllerExits
Write-Output ('Controller test stage: '+$controllerStage.stageId)
$controllerTestFiles=@('controller.node.test.mjs','boundaries.node.test.mjs','portability.node.test.mjs','online-policy.node.test.mjs','source-alignment.node.test.mjs','ui-contract.node.test.mjs','source-adoption.node.test.mjs') | ForEach-Object {Join-Path $controllerRuntime ('tests/app/'+$_)}
& $controllerNode --test @controllerTestFiles *> (Join-Path $controllerEvidence 'node.log')
$controllerExits.node=$LASTEXITCODE
Save-ControllerExits
& (Join-Path $env:PROJECT_ROOT '.toolchain/app-runtime/node_modules/.bin/tsc.cmd') --ignoreConfig --noEmit --strict --skipLibCheck --allowJs --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2023,DOM (Join-Path $controllerRuntime 'tests/app/contracts.typecheck.ts') (Join-Path $controllerRuntime 'tests/app/ui-contract.examples.ts') (Join-Path $controllerRuntime 'tests/app/source-adoption.examples.ts') *> (Join-Path $controllerEvidence 'types.log')
$controllerExits.types=$LASTEXITCODE
Save-ControllerExits
if($controllerExits.node -eq 0 -and $controllerExits.types -eq 0){
 $controllerBrowserArgs=@((Join-Path $controllerRuntime 'tests/app/run-browser.mjs'),'--run-id',$RunId,'--browsers',$Browsers)
 if($Cases){$controllerBrowserArgs+=@('--cases',$Cases)}
 & $controllerNode @controllerBrowserArgs *> (Join-Path $controllerEvidence 'browser.log')
 $controllerExits.browser=$LASTEXITCODE
}
$controllerExits.status='complete'
Save-ControllerExits
$controllerExits | ConvertTo-Json -Compress
if($controllerExits.node -ne 0 -or $controllerExits.types -ne 0 -or $controllerExits.browser -ne 0 -or $null -eq $controllerExits.browser){exit 1}
exit 0
