[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[Parameter(Mandatory)][string]$ModulePath)
$ErrorActionPreference='Stop'
$repository=(Get-Item $PSScriptRoot).FullName
while(-not (Test-Path -LiteralPath (Join-Path $repository 'tools/project-env.ps1'))){
 $parent=Split-Path -Parent $repository
 if(-not $parent -or $parent -eq $repository){throw 'Repository env tool required.'}
 $repository=$parent
}
. (Join-Path $repository 'tools/project-env.ps1') -Seat codex -RunId $RunId
$moduleResolved=(Resolve-Path -LiteralPath $ModulePath).Path
if(-not $moduleResolved.StartsWith($repository+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Module must stay inside repository.'}
$env:PRODUCT_APP_MODULE=$moduleResolved
if(-not (Test-Path -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'inputs/source-fixture-v2.json'))){
 & node (Join-Path $PSScriptRoot 'prepare.mjs')
 if($LASTEXITCODE){throw 'Source fixture preparation failed.'}
}
& node --test (Join-Path $PSScriptRoot 'node.test.mjs')
if($LASTEXITCODE){throw 'Generated-base tests failed.'}
& node (Join-Path $repository '.toolchain/app-runtime/node_modules/typescript/bin/tsc') --ignoreConfig --noEmit --strict --module nodenext --moduleResolution nodenext --target es2022 --lib es2022,dom (Join-Path $PSScriptRoot 'types.mts')
if($LASTEXITCODE){throw 'Generated-base types failed.'}
