#requires -Version 7.0
[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')]
    [string]$RunId = ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-grok'),
    [ValidateSet('Interactive','Print','Version','Help','Inspect','Models')][string]$Mode = 'Interactive',
    [string]$Prompt,
    [string]$PromptFile,
    [string]$Resume,
    [ValidateRange(1,100000)][int]$MaxTurns = 100,
    [ValidateRange(0,86400)][int]$TimeoutSeconds = 0,
    [switch]$ApproveTools,
    [switch]$NoAuthImport
)
$ErrorActionPreference = 'Stop'
$grokExecutable = @(Get-Command grok -CommandType Application -ErrorAction Stop)[0].Source
# Resolve the existing login before the child's profile is relocated. Never print credentials.
$grokAuthSource = $env:GROK_AUTH_PATH
if (-not $grokAuthSource) {
    $grokPreviousHome = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $env:USERPROFILE '.grok' }
    $grokAuthSource = Join-Path $grokPreviousHome 'auth.json'
}
. (Join-Path $PSScriptRoot '../project-env.ps1') -Seat grok -RunId $RunId
. (Join-Path $PSScriptRoot 'grok-isolation.ps1')
$grokRepo = $env:PROJECT_ROOT
$grokRun = $env:PROJECT_REVIEW_RUN
$grokRuntime = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'grok-runtime.json') | ConvertFrom-Json
$grokHash = (Get-FileHash -LiteralPath $grokExecutable -Algorithm SHA256).Hash.ToLowerInvariant()
if ($grokHash -notin @($grokRuntime.windows_verified_builds.sha256)) {
    throw 'Unverified Grok binary. Inspect the upstream changes first, then follow docs/reviews/GROK-WINDOWS-ISOLATION.md before testing and updating grok-runtime.json.'
}
$grokConfig = Get-Content -Raw -LiteralPath (Join-Path $grokRepo 'docs/reviews/seat-config.json') | ConvertFrom-Json
$grokSeat = $grokConfig.seats.grok
if (-not $grokSeat.model -or -not $grokSeat.effort) { throw 'Missing Grok model/effort policy.' }
if ($Prompt -and $PromptFile) { throw 'Use Prompt or PromptFile, not both.' }
if ($PromptFile) {
    $grokPromptPath = if ([IO.Path]::IsPathFullyQualified($PromptFile)) { $PromptFile } else { Join-Path $grokRepo $PromptFile }
    $grokPromptPath = Assert-GrokProjectPath $grokPromptPath $grokRepo
    $Prompt = [IO.File]::ReadAllText($grokPromptPath)
}
if ($Mode -eq 'Print' -and -not $Prompt) { throw 'Print mode requires Prompt or PromptFile.' }
if ($ApproveTools -and $Mode -notin @('Interactive','Print')) { throw 'ApproveTools applies only to an authorized task, not metadata commands.' }
if ($Resume -and $Resume -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid resume session id.' }
$grokContext = $null
try {
    $grokContext = New-GrokIsolation $grokRepo $grokRun
    $grokAuthTarget = Assert-GrokProjectPath (Join-Path $grokContext.GrokHome 'auth.json') $grokRepo
    if (-not $NoAuthImport -and -not (Test-Path -LiteralPath $grokAuthTarget) -and (Test-Path -LiteralPath $grokAuthSource)) {
        Copy-Item -LiteralPath $grokAuthSource -Destination $grokAuthTarget
    }
    $grokRules = @"
Project root: $grokRepo. Read AGENTS.md and GROK.md there before working.
This process uses $($grokContext.Workspace), an alias of the same repository.
All generated review artifacts belong in $grokRun.
Do not launch grok.exe directly or use /tmp, /var/tmp, a drive root, or a home directory in shell commands.
Use the absolute PROJECT_ROOT and PROJECT_REVIEW_RUN paths for shell tools and project-env.ps1.
This launcher disables native subagents and does not expose worktree mode, to preserve the process path mapping.
"@
    $grokArgs = @('-m', $grokSeat.model, '--effort', $grokSeat.effort, '--no-subagents')
    switch ($Mode) {
        'Version' { $grokArgs = @('--version') }
        'Help' { $grokArgs = @('--help') }
        'Inspect' { $grokArgs = @('inspect','--json') }
        'Models' { $grokArgs = @('models') }
        default {
            $grokArgs += @('--rules', $grokRules)
            if ($ApproveTools) { $grokArgs += '--always-approve' }
            if ($Resume) { $grokArgs += @('--resume', $Resume) }
            if ($Mode -eq 'Print') { $grokArgs += @('-p', $Prompt, '--output-format', 'json', '--max-turns', "$MaxTurns") }
            elseif ($Prompt) { $grokArgs += @($Prompt) }
        }
    }
    $grokInfo = New-GrokProcessInfo $grokContext $grokExecutable $grokArgs
    if ($Mode -eq 'Interactive') {
        if ([Console]::IsInputRedirected) { throw 'Interactive Grok needs a terminal. Use -Mode Print with a prompt in automation.' }
        $grokInfo.CreateNoWindow = $false
        $grokInfo.RedirectStandardInput = $false
        $grokInfo.RedirectStandardOutput = $false
        $grokInfo.RedirectStandardError = $false
    }
    $grokManifestPath = Assert-GrokProjectPath (Join-Path $grokRun 'reports/grok-launch.json') $grokRepo
    $grokManifest = [ordered]@{
        schema_version=1; started_at=(Get-Date).ToUniversalTime().ToString('o')
        model=$grokSeat.model; effort=$grokSeat.effort; mode=$Mode
        executable=$grokExecutable; executable_sha256=$grokHash
        repo=$grokRepo; run=$grokRun; process_cwd=$grokContext.Workspace
        root_temp=(Join-Path $grokContext.DriveRoot 'tmp'); grok_home=$grokContext.GrokHome
        subagents=$false; auto_update=$false; approve_tools=[bool]$ApproveTools; isolation='path redirection; not an OS sandbox'
    }
    $grokManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $grokManifestPath -Encoding utf8
    $grokResult = Invoke-GrokProcess $grokContext $grokInfo $TimeoutSeconds
    $grokExit = $grokResult.ExitCode
    if ($grokResult.Stdout) { Write-Output $grokResult.Stdout.TrimEnd() }
    if ($grokResult.Stderr) { [Console]::Error.Write($grokResult.Stderr) }
    $grokManifest['exit_code'] = $grokExit
    $grokManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $grokManifestPath -Encoding utf8
} finally {
    if ($grokContext) { Remove-GrokIsolation $grokContext }
}
exit $grokExit
