# Dot-source before compiler, build, test or browser commands.
[CmdletBinding()]
param([ValidateSet('codex','opus','grok')][string]$Seat,[string]$RunId)
. (Join-Path $PSScriptRoot '../project-env.ps1') -Seat $Seat -RunId $RunId
$devPaths=@{
  RUSTUP_HOME=(Join-Path $env:PROJECT_ROOT '.toolchain/rustup')
  CARGO_HOME=(Join-Path $env:PROJECT_ROOT '.toolchain/cargo')
  CARGO_TARGET_DIR=(Join-Path $env:PROJECT_REVIEW_RUN 'work/rust-target')
  EM_CONFIG=(Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/.emscripten')
  EM_CACHE=(Join-Path $env:PROJECT_REVIEW_RUN 'cache/emscripten')
  EMCC_TEMP_DIR=(Join-Path $env:PROJECT_REVIEW_RUN 'temp/emscripten')
  EMSDK=(Join-Path $env:PROJECT_ROOT '.toolchain/emsdk')
}
foreach($devName in $devPaths.Keys) {
  $devTarget=[IO.Path]::GetFullPath($devPaths[$devName])
  if(-not $devTarget.StartsWith($env:PROJECT_ROOT+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Development path escapes repo'}
  $devAncestor=$devTarget
  while($devAncestor -ne $env:PROJECT_ROOT) {
    if((Test-Path -LiteralPath $devAncestor) -and ((Get-Item -LiteralPath $devAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw "Development path contains a link: $devAncestor"}
    $devAncestor=Split-Path -Parent $devAncestor
  }
  [Environment]::SetEnvironmentVariable($devName,$devTarget,'Process')
}
$env:CARGO_INCREMENTAL='0'
$env:RUSTUP_NO_UPDATE_CHECK='1'
$devCmake=Join-Path $env:PROJECT_ROOT '.toolchain/cmake/cmake/data/bin/cmake.exe'
if(Test-Path -LiteralPath $devCmake){$env:CMAKE=$devCmake}
New-Item -ItemType Directory -Path $env:EMCC_TEMP_DIR -Force | Out-Null
