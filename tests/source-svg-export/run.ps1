[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,59}$')][string]$Label,
 [string]$ModulePath,[string]$WasmPath,[string]$ModuleSHA256,[string]$WasmSHA256,
 [switch]$Prepared,[switch]$NoBrowser
)
$ErrorActionPreference='Stop'
$SourceSVGRoot=(& git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
if($LASTEXITCODE -ne 0){throw 'Resolve the repository root before writing.'}
. (Join-Path $SourceSVGRoot 'tools/project-env.ps1') -Seat codex -RunId $RunId
$env:SOURCE_SVG_LABEL=$Label
Remove-Item Env:SOURCE_SVG_ENGINE -ErrorAction SilentlyContinue
if(-not $Prepared){
 foreach($SourceSVGRequired in @($ModulePath,$WasmPath,$ModuleSHA256,$WasmSHA256)){if(-not $SourceSVGRequired){throw 'Supply exact production module pair paths and both SHA256 values.'}}
 & node (Join-Path $PSScriptRoot 'prepare.mjs') --source (Join-Path $PSScriptRoot '../..') --module $ModulePath --wasm $WasmPath --mjs-sha $ModuleSHA256 --wasm-sha $WasmSHA256
 if($LASTEXITCODE -ne 0){throw 'Source SVG preparation failed.'}
}
$SourceSVGCandidate=Join-Path $env:PROJECT_REVIEW_RUN 'work/source-svg-export'
$SourceSVGTests=Join-Path $SourceSVGCandidate 'tests/source-svg-export'
$SourceSVGResult=Join-Path $env:PROJECT_REVIEW_RUN "evidence/run-$Label.json"
if(Test-Path -LiteralPath $SourceSVGResult){throw 'Use a fresh evidence label.'}
foreach($SourceSVGStage in @('node','browser','types','readback')){if(Test-Path -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN "evidence/$SourceSVGStage-$Label.txt")){throw 'Evidence label already used.'}}
& node (Join-Path $SourceSVGTests 'record.mjs') before $Label
if($LASTEXITCODE -ne 0){throw 'Input capture failed.'}
try {
 & node --test --test-reporter=tap --test-concurrency=1 (Join-Path $SourceSVGTests 'initial.test.mjs') (Join-Path $SourceSVGTests 'cases.test.mjs') | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN "evidence/node-$Label.txt")
 if($LASTEXITCODE -ne 0){throw 'Node source SVG tests failed; evidence retained.'}
 & node (Join-Path $SourceSVGRoot '.toolchain/app-runtime/node_modules/typescript/bin/tsc') --ignoreConfig --noEmit --strict --skipLibCheck --module nodenext --moduleResolution nodenext --target es2023 --lib es2023,dom (Join-Path $SourceSVGTests 'types.test.mts') | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN "evidence/types-$Label.txt")
 if($LASTEXITCODE -ne 0){throw 'Source SVG types failed.'}
 if(-not $NoBrowser){
  & node --test --test-reporter=tap --test-concurrency=1 (Join-Path $SourceSVGTests 'browser.test.mjs') | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN "evidence/browser-$Label.txt")
  if($LASTEXITCODE -ne 0){throw 'Browser source SVG tests failed; evidence retained.'}
 }
 & python (Join-Path $SourceSVGTests 'readback.py') --run $env:PROJECT_REVIEW_RUN --label $Label --output (Join-Path $env:PROJECT_REVIEW_RUN "evidence/readback-$Label.json") | Tee-Object -FilePath (Join-Path $env:PROJECT_REVIEW_RUN "evidence/readback-$Label.txt")
 if($LASTEXITCODE -ne 0){throw 'Independent SVG readback failed.'}
} finally {
 & node (Join-Path $SourceSVGTests 'record.mjs') after $Label
 if($LASTEXITCODE -ne 0){throw 'Source/test hash invariants changed.'}
}
