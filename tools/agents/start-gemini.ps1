#requires -Version 7.0
<#
Launcher for the Gemini review seat (headless, non-interactive).

- Reads the seat's model from docs/reviews/seat-config.json and passes it with `-m`;
  the CLI never reads that JSON by itself.
- Isolates USERPROFILE/HOME/APPDATA into the run room and copies the credential,
  settings and trusted-folder files there: without trustedFolders.json the CLI treats
  the repository as untrusted, drops the approval mode back to `default`, skips the
  repository .gemini/.env (Vertex project) and exits 41 before any review runs.
- Records the launch request and, after the run, the model the CLI actually reports
  in its JSON `stats.models` block, so the report can cite the real model.

Usage (from the repository root):
  pwsh -NoProfile -File tools/agents/start-gemini.ps1 -RunId 20260909-gemini-r1 -PromptFile tmp/reviews/gemini/runs/20260909-gemini-r1/inputs/task.md
Options:
  -ApprovalMode default|auto_edit|yolo   default = read-only (no shell/file tools);
                                         yolo lets the seat run the app and tests.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
  [Parameter(Mandatory)][string]$PromptFile,
  [ValidateSet('default','auto_edit','yolo')][string]$ApprovalMode='yolo',
  [ValidateRange(0,86400)][int]$TimeoutSeconds=0,
  # Continue an earlier session of the same RunId ("latest" or a session index/id). The CLI
  # ends a headless run whenever the model answers a turn with neither text nor a tool
  # call; resuming with a short prompt lets the seat pick the task up where it stopped.
  [string]$Resume
)
$ErrorActionPreference = 'Stop'
$geminiOriginalProfile = $env:USERPROFILE
$geminiProgram = @(Get-Command gemini -CommandType Application -ErrorAction Stop)[0].Source

. (Join-Path $PSScriptRoot '../project-env.ps1') -Seat gemini -RunId $RunId
$geminiRoot = $env:PROJECT_ROOT
$geminiRun = $env:PROJECT_REVIEW_RUN

# Seat configuration: the model is a launch flag, never only a sentence in the prompt.
$geminiConfigPath = Join-Path $geminiRoot 'docs/reviews/seat-config.json'
$geminiConfig = Get-Content -LiteralPath $geminiConfigPath -Raw | ConvertFrom-Json
$geminiSeat = $geminiConfig.seats.gemini
if (-not $geminiSeat.model) { throw 'Missing Gemini model in docs/reviews/seat-config.json' }

# Profile isolation: everything the CLI writes lands in the run room.
$geminiProfile = Join-Path $geminiRun 'cache/profile'
$geminiGlobalDir = Join-Path $geminiProfile '.gemini'
New-Item -ItemType Directory -Path $geminiProfile, $geminiGlobalDir, (Join-Path $geminiProfile 'AppData/Roaming'), (Join-Path $geminiProfile 'AppData/Local') -Force | Out-Null
$originalGeminiDir = Join-Path $geminiOriginalProfile '.gemini'
foreach ($fileName in @('credentials.json', 'google_accounts.json', 'settings.json', 'GEMINI.md', 'trustedFolders.json', 'installation_id')) {
    $srcFile = Join-Path $originalGeminiDir $fileName
    if (Test-Path -LiteralPath $srcFile) { Copy-Item -LiteralPath $srcFile -Destination (Join-Path $geminiGlobalDir $fileName) }
}
# Vertex AI auth reads Application Default Credentials from %APPDATA%\gcloud. The
# profile is relocated below, so point the auth library at the original file
# instead of copying a credential into the repository.
$geminiAdc = Join-Path $env:APPDATA 'gcloud/application_default_credentials.json'
if (-not $env:GOOGLE_APPLICATION_CREDENTIALS -and (Test-Path -LiteralPath $geminiAdc)) { $env:GOOGLE_APPLICATION_CREDENTIALS = $geminiAdc }
if (-not $env:CLOUDSDK_CONFIG -and (Test-Path -LiteralPath (Join-Path $env:APPDATA 'gcloud'))) { $env:CLOUDSDK_CONFIG = Join-Path $env:APPDATA 'gcloud' }
$env:USERPROFILE = $geminiProfile
$env:HOME = $geminiProfile
$env:APPDATA = Join-Path $geminiProfile 'AppData/Roaming'
$env:LOCALAPPDATA = Join-Path $geminiProfile 'AppData/Local'
# Belt and braces: the copied trustedFolders.json normally covers the repository, but the
# per-process override keeps the run from silently degrading to read-only if the list changes.
$env:GEMINI_CLI_TRUST_WORKSPACE = 'true'
$env:NO_COLOR = '1'

$geminiPrompt = [IO.Path]::GetFullPath($(if ([IO.Path]::IsPathFullyQualified($PromptFile)) { $PromptFile } else { Join-Path $geminiRoot $PromptFile }))
if (-not $geminiPrompt.StartsWith($geminiRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Prompt must be inside repository' }

$geminiEvidence = Join-Path $geminiRun 'evidence/response.json'
if ($Resume) {
    if (-not (Test-Path -LiteralPath $geminiEvidence)) { throw 'Nothing to resume in this RunId' }
    $geminiTurn = 1
    while (Test-Path -LiteralPath (Join-Path $geminiRun "evidence/response-resume$geminiTurn.json")) { $geminiTurn++ }
    $geminiEvidence = Join-Path $geminiRun "evidence/response-resume$geminiTurn.json"
    $geminiStderr = Join-Path $geminiRun "evidence/stderr-resume$geminiTurn.log"
    $geminiLaunch = Join-Path $geminiRun "evidence/launch-resume$geminiTurn.json"
} else {
    if (Test-Path -LiteralPath $geminiEvidence) { throw 'Use a fresh RunId to preserve earlier evidence' }
    $geminiStderr = Join-Path $geminiRun 'evidence/stderr.log'
    $geminiLaunch = Join-Path $geminiRun 'evidence/launch.json'
}

$geminiArgs = @('-m', $geminiSeat.model, "--approval-mode=$ApprovalMode", '-o', 'json')
if ($Resume) { $geminiArgs += @('--resume', $Resume) }
$geminiArgs += @('-p', (Get-Content -LiteralPath $geminiPrompt -Raw))
[ordered]@{
    schema_version = 1
    started_at = (Get-Date).ToUniversalTime().ToString('o')
    version = (& $geminiProgram --version)
    binarySha256 = (Get-FileHash -LiteralPath $geminiProgram -Algorithm SHA256).Hash
    model_requested = $geminiSeat.model
    effort_requested = $geminiSeat.effort
    approval_mode = $ApprovalMode
    resume = $Resume
    prompt_file = $geminiPrompt
    run = $geminiRun
    status = 'requested; the actual model is read from the JSON stats after the run'
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $geminiLaunch -Encoding utf8

Push-Location $geminiRoot
try {
    $geminiInfo = [Diagnostics.ProcessStartInfo]::new()
    $geminiInfo.FileName = $geminiProgram
    foreach ($a in $geminiArgs) { $geminiInfo.ArgumentList.Add($a) }
    $geminiInfo.WorkingDirectory = $geminiRoot
    $geminiInfo.UseShellExecute = $false
    $geminiInfo.RedirectStandardOutput = $true
    $geminiInfo.RedirectStandardError = $true
    $geminiInfo.RedirectStandardInput = $true
    $geminiProcess = [Diagnostics.Process]::Start($geminiInfo)
    $geminiProcess.StandardInput.Close()
    $stdoutTask = $geminiProcess.StandardOutput.ReadToEndAsync()
    $stderrTask = $geminiProcess.StandardError.ReadToEndAsync()
    if ($TimeoutSeconds -gt 0) {
        if (-not $geminiProcess.WaitForExit($TimeoutSeconds * 1000)) { try { $geminiProcess.Kill($true) } catch {}; $geminiTimedOut = $true }
    }
    $geminiProcess.WaitForExit()
    [IO.File]::WriteAllText($geminiEvidence, $stdoutTask.Result, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($geminiStderr, $stderrTask.Result, [Text.UTF8Encoding]::new($false))
    $geminiExit = $geminiProcess.ExitCode
} finally {
    Pop-Location
}

$geminiActual = @()
try {
    $parsed = Get-Content -LiteralPath $geminiEvidence -Raw | ConvertFrom-Json
    if ($parsed.stats.models) { $geminiActual = @($parsed.stats.models | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name) }
    if ($parsed.response) { [IO.File]::WriteAllText((Join-Path $geminiRun ($(if ($Resume) { "reports/response-resume$geminiTurn.md" } else { 'reports/response.md' }))), [string]$parsed.response, [Text.UTF8Encoding]::new($false)) }
} catch {}
[ordered]@{
    exitCode = $geminiExit
    resume = $Resume
    timedOut = [bool]$geminiTimedOut
    finishedAt = (Get-Date).ToUniversalTime().ToString('o')
    model_requested = $geminiSeat.model
    models_actual = $geminiActual
    model_verified = ($geminiActual.Count -gt 0 -and $geminiActual -contains $geminiSeat.model)
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $geminiRun ($(if ($Resume) { "reports/completion-resume$geminiTurn.json" } else { 'reports/completion.json' }))) -Encoding utf8

Write-Output "Gemini run $RunId exited $geminiExit; models actual: $($geminiActual -join ',')"
exit $geminiExit
