[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../project-env.ps1') -Seat codex -RunId $RunId
$reviewSnapshot=Join-Path $env:PROJECT_REVIEW_RUN 'inputs/snapshot'
if(Test-Path -LiteralPath $reviewSnapshot){throw 'Use a new review snapshot; never replace frozen input'}
$reviewFiles=@('src/server','tests/server','docs/backend') | ForEach-Object {
  Get-ChildItem -LiteralPath (Join-Path $env:PROJECT_ROOT $_) -Recurse -File | ForEach-Object FullName
}
$reviewFiles+=@('src/contracts/app-bridge.ts','docs/specs/07-nguoi-dung-va-ai.md','docs/specs/03-ky-thuat.md','docs/specs/08-mo-rong-va-lo-trinh.md','.node-version') | ForEach-Object {Join-Path $env:PROJECT_ROOT $_}
$reviewManifest=foreach($reviewFile in $reviewFiles){
  $reviewRelative=[IO.Path]::GetRelativePath($env:PROJECT_ROOT,$reviewFile)
  $reviewDestination=[IO.Path]::GetFullPath((Join-Path $reviewSnapshot $reviewRelative))
  if(-not $reviewDestination.StartsWith($reviewSnapshot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Snapshot path escaped'}
  New-Item -ItemType Directory -Path (Split-Path -Parent $reviewDestination) -Force | Out-Null
  Copy-Item -LiteralPath $reviewFile -Destination $reviewDestination
  $reviewHash=(Get-FileHash -LiteralPath $reviewDestination -Algorithm SHA256).Hash
  if($reviewHash -ne (Get-FileHash -LiteralPath $reviewFile -Algorithm SHA256).Hash){throw 'Source changed during snapshot'}
  [ordered]@{path=$reviewRelative.Replace('\','/');sha256=$reviewHash}
}
$reviewManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'inputs/manifest.json') -Encoding utf8
Write-Output "Frozen $($reviewManifest.Count) files"
