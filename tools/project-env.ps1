# Dot-source: . ./tools/project-env.ps1 -Seat codex -RunId 20260905-font-assets
[CmdletBinding()]
param(
    [ValidateSet('grok', 'opus', 'codex', 'gemini')][string]$Seat,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')]
    [string]$RunId = ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
)
$ErrorActionPreference = 'Stop'
if (-not $Seat) { throw 'Specify -Seat grok, opus, codex or gemini; a review room must never be selected implicitly.' }
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ProjectRun = Join-Path $ProjectRoot "tmp/reviews/$Seat/runs/$RunId"
$ProjectDirs = @('inputs', 'work', 'evidence', 'reports', 'cache', 'temp')
$ProjectCachePaths = @('npm', 'pip', 'python', 'uv', 'huggingface', 'torch', 'matplotlib',
    'config', 'data', 'state', 'dotnet') | ForEach-Object { Join-Path $ProjectRun "cache/$_" }
$ProjectToolPaths = @('python', 'npm', 'playwright', 'venv') |
    ForEach-Object { Join-Path $ProjectRoot ".toolchain/$_" }
# Refuse existing junctions/symlinks in every destination ancestor.
foreach ($ProjectTarget in (@($ProjectRun) + $ProjectCachePaths + $ProjectToolPaths)) {
    $ProjectTarget = [IO.Path]::GetFullPath($ProjectTarget)
    if (-not $ProjectTarget.StartsWith($ProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Output path escapes project: $ProjectTarget"
    }
    $ProjectAncestor = $ProjectTarget
    while ($ProjectAncestor -and $ProjectAncestor -ne $ProjectRoot) {
        if (Test-Path -LiteralPath $ProjectAncestor) {
            $ProjectItem = Get-Item -LiteralPath $ProjectAncestor -Force
            if ($ProjectItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Output path contains a junction/symlink: $ProjectAncestor"
            }
        }
        $ProjectAncestor = Split-Path -Parent $ProjectAncestor
    }
}
foreach ($ProjectDir in $ProjectDirs) {
    $ProjectPath = Join-Path $ProjectRun $ProjectDir
    if ((Test-Path -LiteralPath $ProjectPath) -and
        ((Get-Item -LiteralPath $ProjectPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Output path contains a junction/symlink: $ProjectPath"
    }
    New-Item -ItemType Directory -Path $ProjectPath -Force | Out-Null
}
$env:PROJECT_ROOT = $ProjectRoot
$env:PROJECT_REVIEW_RUN = $ProjectRun
$env:TEMP = Join-Path $ProjectRun 'temp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:XDG_CACHE_HOME = Join-Path $ProjectRun 'cache'
$env:XDG_CONFIG_HOME = Join-Path $ProjectRun 'cache/config'
$env:XDG_DATA_HOME = Join-Path $ProjectRun 'cache/data'
$env:XDG_STATE_HOME = Join-Path $ProjectRun 'cache/state'
$env:npm_config_cache = Join-Path $ProjectRun 'cache/npm'
$env:npm_config_prefix = Join-Path $ProjectRoot '.toolchain/npm'
$env:npm_config_update_notifier = 'false'
$env:PIP_CACHE_DIR = Join-Path $ProjectRun 'cache/pip'
$env:PIP_TARGET = Join-Path $ProjectRoot '.toolchain/python'
$env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
$env:PYTHONPYCACHEPREFIX = Join-Path $ProjectRun 'cache/python'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONNOUSERSITE = '1'
$env:PYTHONUTF8 = '1'
$env:PYTHONPATH = Join-Path $ProjectRoot '.toolchain/python'
$env:UV_CACHE_DIR = Join-Path $ProjectRun 'cache/uv'
$env:UV_PROJECT_ENVIRONMENT = Join-Path $ProjectRoot '.toolchain/venv'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $ProjectRoot '.toolchain/playwright'
$env:HF_HOME = Join-Path $ProjectRun 'cache/huggingface'
$env:TORCH_HOME = Join-Path $ProjectRun 'cache/torch'
$env:MPLCONFIGDIR = Join-Path $ProjectRun 'cache/matplotlib'
$env:DOTNET_CLI_HOME = Join-Path $ProjectRun 'cache/dotnet'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
