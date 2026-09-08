param(
 [Parameter(Mandatory)][string]$RunId,
 [Parameter(Mandatory)][ValidateSet('pin-runtime','build','verify','configure')][string]$Action,
 [Parameter(Mandatory)][string]$InputValue,
 [Parameter(Mandatory)][string]$OutputOrHash
)
$ErrorActionPreference='Stop'
$ReleaseProject=$PSScriptRoot
while(-not (Test-Path -LiteralPath (Join-Path $ReleaseProject 'tools/project-env.ps1'))){
 $ReleaseParent=Split-Path -Parent $ReleaseProject
 if(-not $ReleaseParent -or $ReleaseParent -eq $ReleaseProject){throw 'Repository not found'}
 $ReleaseProject=$ReleaseParent
}
. (Join-Path $ReleaseProject 'tools/project-env.ps1') -Seat codex -RunId $RunId
& node (Join-Path $PSScriptRoot 'cli.mjs') $Action $InputValue $OutputOrHash
exit $LASTEXITCODE
