[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[ValidateSet('codex','opus','grok')][string]$Seat='codex',[ValidateSet('node','browser','types','manifest','all')][string]$Suite='all')
$ErrorActionPreference='Stop'
$EditorRoot = [IO.Path]::GetFullPath($PSScriptRoot)
while (-not (Test-Path -LiteralPath (Join-Path $EditorRoot 'tools/project-env.ps1'))) {
  $EditorParent = Split-Path -Parent $EditorRoot
  if (-not $EditorParent -or $EditorParent -eq $EditorRoot) { throw 'Cannot locate project AGENTS.md' }
  $EditorRoot = $EditorParent
}
. (Join-Path $EditorRoot 'tools/project-env.ps1') -Seat $Seat -RunId $RunId
$EditorCandidate = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if ($EditorCandidate -ne [IO.Path]::GetFullPath($EditorRoot)) { throw 'Runner must use integrated project sources' }
$EditorEvidence = Join-Path $env:PROJECT_REVIEW_RUN 'evidence'
$EditorSelected = if ($Suite -eq 'all') { @('node','types','browser','manifest') } else { @($Suite) }
foreach ($EditorSuite in $EditorSelected) {
  $EditorArguments = switch ($EditorSuite) {
    'node' { @('--test','--test-concurrency=1','--test-reporter=tap',(Join-Path $PSScriptRoot 'core.test.mjs')) }
    'browser' { @('--test','--test-concurrency=1','--test-reporter=tap',(Join-Path $PSScriptRoot 'browser.test.mjs')) }
    'types' { @((Join-Path $EditorRoot '.toolchain/app-runtime/node_modules/typescript/bin/tsc'),'--project',(Join-Path $PSScriptRoot 'tsconfig.json')) }
    'manifest' { @((Join-Path $PSScriptRoot 'manifest.mjs'),'--check') }
  }
  & node @EditorArguments 2>&1 | Tee-Object -FilePath (Join-Path $EditorEvidence ('run-'+$EditorSuite+'.log'))
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
exit 0
