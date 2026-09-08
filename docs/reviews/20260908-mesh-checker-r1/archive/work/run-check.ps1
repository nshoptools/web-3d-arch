param([Parameter(Mandatory=$true)][string]$Name,[Parameter(Mandatory=$true)][string]$Script,[string[]]$Arguments=@())
$ErrorActionPreference='Stop'
$reviewRepo=git rev-parse --show-toplevel
. (Join-Path $reviewRepo 'tools/development/env.ps1') -Seat codex -RunId 20260908-mesh-checker-review-r1
if($Name -notmatch '^[a-z0-9-]+$'){throw 'Invalid evidence name'}
$dest=Join-Path $env:PROJECT_REVIEW_RUN ('evidence/'+$Name)
if(Test-Path -LiteralPath $dest){throw 'Preserve previous attempt'}
New-Item -ItemType Directory -Path $dest | Out-Null
$node=Join-Path $env:PROJECT_ROOT '.toolchain/emsdk/node/24.19.0_64bit/node.exe'
$resolved=(Resolve-Path -LiteralPath $Script).Path
if(-not $resolved.StartsWith($env:PROJECT_REVIEW_RUN+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Script must be in run'}
$start=Get-Date -AsUTC -Format o
& $node $resolved @Arguments *>&1 | Tee-Object -FilePath (Join-Path $dest 'output.log')
$code=$LASTEXITCODE
[ordered]@{start=$start;end=(Get-Date -AsUTC -Format o);executable=$node;arguments=@($resolved)+$Arguments;scriptSha256=(Get-FileHash -LiteralPath $resolved).Hash.ToLower();exit=$code} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $dest 'command.json')
exit $code
