$ErrorActionPreference='Stop'
$WebHostRoot=$PSScriptRoot
while(-not (Test-Path (Join-Path $WebHostRoot 'tools/project-env.ps1'))) {
  $WebHostRoot=Split-Path -Parent $WebHostRoot
  if(-not $WebHostRoot){throw 'Project not found'}
}
if(-not $env:HOST_TEST_RUN_ID){throw 'Explicit test run required'}
. (Join-Path $WebHostRoot 'tools/project-env.ps1') -Seat codex -RunId $env:HOST_TEST_RUN_ID
& node (Join-Path $PSScriptRoot 'child-entry.mjs')
exit $LASTEXITCODE
