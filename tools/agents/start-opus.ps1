#requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
  [Parameter(Mandatory)][string]$PromptFile,
  [string]$Resume,
  [string]$CredentialSource
)
$ErrorActionPreference='Stop'
$opusOriginalProfile=$env:USERPROFILE
$opusProgram=@(Get-Command claude -CommandType Application -ErrorAction Stop)[0].Source
. (Join-Path $PSScriptRoot '../project-env.ps1') -Seat opus -RunId $RunId
$opusRoot=$env:PROJECT_ROOT
$opusRun=$env:PROJECT_REVIEW_RUN
$opusConfig=Get-Content -LiteralPath (Join-Path $opusRoot 'docs/reviews/seat-config.json') -Raw | ConvertFrom-Json
Get-Content -LiteralPath (Join-Path $opusRoot 'docs/reviews/SEAT-CONFIG.md') -Raw | Out-Null
if($opusConfig.seats.opus.invocations_enabled -isnot [bool] -or -not $opusConfig.seats.opus.invocations_enabled) {
  throw 'Opus is disabled by the project owner. Do not launch, resume, fork, or delegate to Opus; continue with Hub/Codex/Grok.'
}
# The project owner's explicit policy applies to new and resumed sessions alike.
if($opusConfig.seats.opus.effort -cne 'max' -or $opusConfig.seats.opus.fast_mode -isnot [bool] -or $opusConfig.seats.opus.fast_mode) {
  throw 'Project policy requires Opus effort max and fast_mode false for every invocation; refusing to launch.'
}
$opusPrompt=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathFullyQualified($PromptFile)){$PromptFile}else{Join-Path $opusRoot $PromptFile}))
if(-not $opusPrompt.StartsWith($opusRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Prompt must be inside repository' }
$opusProfile=Join-Path $opusRun 'cache/profile'
$env:CLAUDE_CONFIG_DIR=Join-Path $opusRun 'cache/claude'
New-Item -ItemType Directory -Path $opusProfile,$env:CLAUDE_CONFIG_DIR -Force | Out-Null
$opusAuth=Join-Path $opusOriginalProfile '.claude/.credentials.json'
if($CredentialSource){
  $opusAuth=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathFullyQualified($CredentialSource)){$CredentialSource}else{Join-Path $opusRoot $CredentialSource}))
  if(-not $opusAuth.StartsWith($opusRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Alternate credential copy must be inside repo'}
  $opusAuthAncestor=$opusAuth
  while($opusAuthAncestor -ne $opusRoot){
    if((Test-Path -LiteralPath $opusAuthAncestor) -and ((Get-Item -LiteralPath $opusAuthAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Credential path contains a link'}
    $opusAuthAncestor=Split-Path -Parent $opusAuthAncestor
  }
  if(-not (Test-Path -LiteralPath $opusAuth -PathType Leaf)){throw 'Credential copy missing'}
}
$opusLocalAuth=Join-Path $env:CLAUDE_CONFIG_DIR '.credentials.json'
if((Test-Path -LiteralPath $opusAuth) -and -not (Test-Path -LiteralPath $opusLocalAuth)) { Copy-Item -LiteralPath $opusAuth -Destination $opusLocalAuth }
$env:CLAUDE_CODE_DISABLE_FAST_MODE='1'
$env:CLAUDE_CODE_EFFORT_LEVEL='max'
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1'
$env:DISABLE_AUTOUPDATER='1'
$env:CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY='1'
$env:USERPROFILE=$opusProfile
$env:HOME=$opusProfile
$env:APPDATA=Join-Path $opusProfile 'AppData/Roaming'
$env:LOCALAPPDATA=Join-Path $opusProfile 'AppData/Local'
New-Item -ItemType Directory -Path $env:APPDATA,$env:LOCALAPPDATA -Force | Out-Null
$opusSettings=Join-Path $opusRun 'inputs/settings.json'
# Persisted settings do not accept effortLevel=max. Enforce it with both CLI and env.
'{"fastMode":false,"ultracode":false,"autoMemoryEnabled":false}' | Set-Content -LiteralPath $opusSettings -Encoding utf8
$opusMcp=Join-Path $opusRun 'inputs/mcp.json'
'{"mcpServers":{}}' | Set-Content -LiteralPath $opusMcp -Encoding utf8
$opusArgs=@('-p','--model',$opusConfig.seats.opus.model,'--effort',$opusConfig.seats.opus.effort,'--settings',$opusSettings,'--setting-sources','project','--strict-mcp-config','--mcp-config',$opusMcp,'--no-chrome','--permission-mode','bypassPermissions','--tools','default','--disallowedTools','EnterWorktree,ExitWorktree','--output-format','stream-json','--verbose','--debug-file',(Join-Path $opusRun 'evidence/debug.log'))
if($Resume){$opusArgs+=@('--resume',$Resume)}
[ordered]@{model=$opusConfig.seats.opus.model;effort=$opusConfig.seats.opus.effort;fast=$false;ultracode=$false;effortEnvironment=$env:CLAUDE_CODE_EFFORT_LEVEL;disableFastModeEnvironment=$env:CLAUDE_CODE_DISABLE_FAST_MODE;policyDate=$opusConfig.updated_at;version=(& $opusProgram --version);binarySha256=(Get-FileHash -LiteralPath $opusProgram -Algorithm SHA256).Hash;args=$opusArgs;status='requested; verify init and runtime before accepting review'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $opusRun 'evidence/launch.json') -Encoding utf8
Push-Location $opusRoot
try { Get-Content -LiteralPath $opusPrompt -Raw | & $opusProgram @opusArgs > (Join-Path $opusRun 'evidence/events.jsonl') 2> (Join-Path $opusRun 'evidence/stderr.log'); $opusExit=$LASTEXITCODE } finally { Pop-Location }
[ordered]@{exitCode=$opusExit;finishedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $opusRun 'reports/completion.json') -Encoding utf8
Write-Output "Opus run $RunId exited $opusExit"
exit $opusExit
