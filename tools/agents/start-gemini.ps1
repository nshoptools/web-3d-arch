#requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
  [Parameter(Mandatory)][string]$PromptFile
)
$ErrorActionPreference = 'Stop'
$geminiOriginalProfile = $env:USERPROFILE

# Lấy đường dẫn CLI
$geminiProgram = @(Get-Command gemini -CommandType Application -ErrorAction Stop)[0].Source

# Thiết lập môi trường cách ly (temp, cache) cho thư mục phòng review
. (Join-Path $PSScriptRoot '../project-env.ps1') -Seat gemini -RunId $RunId

$geminiRoot = $env:PROJECT_ROOT
$geminiRun = $env:PROJECT_REVIEW_RUN

# Cô lập thư mục profile để chặn việc ghi log/cache ra ngoài repo
$geminiProfile = Join-Path $geminiRun 'cache/profile'
$geminiGlobalDir = Join-Path $geminiProfile '.gemini'
New-Item -ItemType Directory -Path $geminiProfile, $geminiGlobalDir, (Join-Path $geminiProfile 'AppData/Roaming'), (Join-Path $geminiProfile 'AppData/Local') -Force | Out-Null

$originalGeminiDir = Join-Path $geminiOriginalProfile '.gemini'
foreach ($fileName in @('credentials.json', 'settings.json', 'GEMINI.md')) {
    $srcFile = Join-Path $originalGeminiDir $fileName
    if (Test-Path -LiteralPath $srcFile) {
        Copy-Item -LiteralPath $srcFile -Destination (Join-Path $geminiGlobalDir $fileName)
    }
}

$env:USERPROFILE = $geminiProfile
$env:HOME = $geminiProfile
$env:APPDATA = Join-Path $geminiProfile 'AppData/Roaming'
$env:LOCALAPPDATA = Join-Path $geminiProfile 'AppData/Local'

# Đọc cấu hình theo dự án (nếu có, để lưu bằng chứng)
$geminiConfigPath = Join-Path $geminiRoot 'docs/reviews/seat-config.json'
if (Test-Path -LiteralPath $geminiConfigPath) {
    $geminiConfig = Get-Content -LiteralPath $geminiConfigPath -Raw | ConvertFrom-Json
}

# Resolve đường dẫn tệp prompt
$geminiPrompt = [IO.Path]::GetFullPath($(if([IO.Path]::IsPathFullyQualified($PromptFile)){$PromptFile}else{Join-Path $geminiRoot $PromptFile}))
if (-not $geminiPrompt.StartsWith($geminiRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Prompt must be inside repository'
}

# Chuẩn bị lưu bằng chứng
$geminiEvidence = Join-Path $geminiRun 'evidence/events.jsonl'
if (Test-Path -LiteralPath $geminiEvidence) {
    throw 'Use a fresh RunId to preserve earlier evidence'
}

# Cấu hình đối số cho Gemini CLI
# Sử dụng approval-mode yolo để Hub điều phối có thể tự động hóa hoàn toàn (headless automation)
$geminiArgs = @(
    '--approval-mode=yolo',
    '-p', ''
)

# Tắt màu console để log (events/evidence) sạch sẽ
$env:NO_COLOR = '1'

# Ghi nhận bằng chứng cấu hình khởi chạy
[ordered]@{
    version = (& $geminiProgram --version)
    binarySha256 = (Get-FileHash -LiteralPath $geminiProgram -Algorithm SHA256).Hash
    args = $geminiArgs
    status = 'requested; verify actual session metadata'
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $geminiRun 'evidence/launch.json') -Encoding utf8

# **QUAN TRỌNG:** Phải nhảy vào đúng thư mục gốc dự án để Gemini không bị nhận sai workspace
Push-Location $geminiRoot
try {
    Get-Content -LiteralPath $geminiPrompt -Raw | & $geminiProgram @geminiArgs > $geminiEvidence 2> (Join-Path $geminiRun 'evidence/stderr.log')
    $geminiExit = $LASTEXITCODE
} finally {
    Pop-Location
}

# Lưu báo cáo hoàn thành
[ordered]@{
    exitCode = $geminiExit
    finishedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $geminiRun 'reports/completion.json') -Encoding utf8

Write-Output "Gemini run $RunId exited $geminiExit"
exit $geminiExit
