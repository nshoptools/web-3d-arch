#requires -Version 7.0
param([Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference='Stop'
$printingRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
. (Join-Path $printingRepo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$printingPackage=Join-Path $printingRepo 'src/printing'
$printingPins=Get-Content -LiteralPath (Join-Path $printingPackage 'docs/pins.json') -Raw|ConvertFrom-Json
$printingArchive=@($printingPins.core.archives|Where-Object name -Like '*source-with-submodules.zip')
if($printingArchive.Count -ne 1){throw 'Expected one pinned lib3MF source archive'}
$printingSource=Join-Path $env:PROJECT_REVIEW_RUN ('work/deps/'+$printingArchive[0].name)
New-Item -ItemType Directory -Path (Split-Path -Parent $printingSource) -Force|Out-Null
if(-not (Test-Path -LiteralPath $printingSource)){Invoke-WebRequest -Uri $printingArchive[0].url -OutFile $printingSource}
if((Get-FileHash -LiteralPath $printingSource).Hash.ToLower() -ne $printingArchive[0].sha256 -or (Get-Item -LiteralPath $printingSource).Length -ne $printingArchive[0].size){throw 'lib3MF source pin mismatch'}
$printingSchema=Join-Path $env:PROJECT_REVIEW_RUN 'inputs/xml.xsd'
if(-not (Test-Path -LiteralPath $printingSchema)){Invoke-WebRequest -Uri 'https://www.w3.org/2001/xml.xsd' -OutFile $printingSchema}
if((Get-FileHash -LiteralPath $printingSchema).Hash.ToLower() -ne '61960fb3131e38022caad5360e2f33a3382578ab3c80cd58bd74320ede61b20c' -or (Get-Item -LiteralPath $printingSchema).Length -ne 8836){throw 'W3C schema pin mismatch'}
python -B (Join-Path $PSScriptRoot 'prepare-dependencies.py') --archive $printingSource
if($LASTEXITCODE -ne 0){throw 'Pinned dependency preparation failed'}
