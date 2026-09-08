param(
  [Parameter(Mandatory)][string]$RunId,
  [Parameter(Mandatory)][string]$ConfigFile,
  [Parameter(Mandatory)][string]$RuntimeDirectory
)
$ErrorActionPreference='Stop'
$WebHostProject=$PSScriptRoot
while(-not (Test-Path (Join-Path $WebHostProject 'tools/project-env.ps1'))) {
  $WebHostProject=Split-Path -Parent $WebHostProject
  if(-not $WebHostProject){throw 'Project root not found'}
}
. (Join-Path $WebHostProject 'tools/project-env.ps1') -Seat codex -RunId $RunId
$env:HOST_CONFIG_FILE=[IO.Path]::GetFullPath($ConfigFile)
$env:HOST_RUNTIME_DIR=[IO.Path]::GetFullPath($RuntimeDirectory)
$WebHostCandidate=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
& node (Join-Path $WebHostCandidate 'src/host/cli.mjs') serve
exit $LASTEXITCODE
