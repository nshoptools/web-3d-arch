[CmdletBinding()]
param(
 [ValidateSet('codex','opus','grok')][string]$Seat='codex',
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
 [Parameter(Mandatory)][ValidateSet('prepare','verify','package')][string]$Action,
 [Parameter(Mandatory)][string]$InputPath,
 [string]$OutputPath,
 [string]$SHA256
)
$ErrorActionPreference='Stop'
$ApplicationRoot=$PSScriptRoot
while($ApplicationRoot -and -not(Test-Path -LiteralPath (Join-Path $ApplicationRoot 'AGENTS.md'))){$ApplicationRoot=Split-Path -Parent $ApplicationRoot}
if(-not $ApplicationRoot){throw 'PROJECT_ROOT_REQUIRED'}
. (Join-Path $ApplicationRoot 'tools/project-env.ps1') -Seat $Seat -RunId $RunId
$ApplicationCLI=Join-Path $PSScriptRoot 'cli.mjs'
switch($Action){
 'prepare' {if(-not $OutputPath -or $SHA256){throw 'CLI_ARGUMENTS'}; & node $ApplicationCLI prepare $InputPath $OutputPath}
 'verify' {if(-not $SHA256 -or $OutputPath){throw 'CLI_ARGUMENTS'}; & node $ApplicationCLI verify $InputPath $SHA256}
 'package' {if(-not $SHA256 -or -not $OutputPath){throw 'CLI_ARGUMENTS'}; & node $ApplicationCLI package $InputPath $SHA256 $OutputPath}
}
if($LASTEXITCODE -ne 0){throw "APPLICATION_BUILD_FAILED_EXIT_$LASTEXITCODE"}
