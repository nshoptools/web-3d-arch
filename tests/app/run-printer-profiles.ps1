param([Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]{2,100}$')][string]$RunId)
$ErrorActionPreference='Stop'
# Find repository tooling, not a nested tests/AGENTS.md or a previous run.
$printerRepo=[IO.DirectoryInfo]$PSScriptRoot
while ($printerRepo -and -not (Test-Path -LiteralPath (Join-Path $printerRepo.FullName 'tools/project-env.ps1'))) { $printerRepo=$printerRepo.Parent }
if (-not $printerRepo) {throw 'Repository tools/project-env.ps1 required'}
. (Join-Path $printerRepo.FullName 'tools/project-env.ps1') -Seat codex -RunId $RunId
$printerTarget=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$printerNode=Join-Path $printerRepo.FullName '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
if (-not (Test-Path -LiteralPath $printerNode)) {throw 'Read-only repository Node 24.19.0 required'}
$printerStamp=[Guid]::NewGuid().ToString('N')
$printerEvidence=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/printer-library-'+$printerStamp)
New-Item -ItemType Directory -Path $printerEvidence | Out-Null
$printerTests=@(Join-Path $printerTarget 'tests/app/printer-profiles.test.mjs')
$printerTests+=Join-Path $printerTarget 'tests/app/printer-messages.test.mjs'
$printerTests+=Join-Path $printerTarget 'tests/server/printer-profile-http.test.mjs'
$printerTests+=Join-Path $printerTarget 'tests/server/printer-profile-boundary.test.mjs'
$printerController=Join-Path $printerTarget 'tests/app/printer-controller-http.test.mjs'
if (Test-Path -LiteralPath $printerController) {$printerTests+=$printerController}
& $printerNode --test --test-concurrency=1 @printerTests *> (Join-Path $printerEvidence 'node.tap')
$printerExit=$LASTEXITCODE
[ordered]@{schemaVersion=1;exitCode=$printerExit;node=& $printerNode --version;sourceRoot=$printerTarget;tests=$printerTests;scope='implementation self-tests; local synthetic OIDC, real backend HTTP and SQLite; no external providers'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $printerEvidence 'result.json') -Encoding utf8
Get-Content -LiteralPath (Join-Path $printerEvidence 'node.tap')
Write-Output ('Evidence: '+$printerEvidence)
exit $printerExit
