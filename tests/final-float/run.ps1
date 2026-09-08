# Run prerequisites in order. The production Module intentionally omits private
# fixture/statistics exports; use Instrumented for those additional Node checks.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$RunId,
 [Parameter(Mandatory)][string]$ModulePath,
 [Parameter(Mandatory)][string]$NativeExecutable,
 [ValidateSet('Production','Instrumented')][string]$Mode='Production'
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../tools/development/env.ps1') -Seat codex -RunId $RunId
function Get-FloatInput([string]$FloatName){
 $FloatPath=[IO.Path]::GetFullPath($FloatName)
 if(-not $FloatPath.StartsWith($env:PROJECT_ROOT+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Input outside repository'}
 $FloatAncestor=$FloatPath
 while($FloatAncestor -ne $env:PROJECT_ROOT){
  if((Get-Item -LiteralPath $FloatAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked input'}
  $FloatAncestor=Split-Path -Parent $FloatAncestor
 }
 return $FloatPath
}
$FloatModule=Get-FloatInput $ModulePath
$FloatWasm=Get-FloatInput ($FloatModule -replace '\.mjs$','.wasm')
$FloatNative=Get-FloatInput $NativeExecutable
$FloatTarget=Join-Path $env:PROJECT_REVIEW_RUN 'work/module'
$FloatSummary=Join-Path $env:PROJECT_REVIEW_RUN 'reports/summary.json'
if((Test-Path -LiteralPath $FloatTarget) -or (Test-Path -LiteralPath $FloatSummary)){throw 'Use a fresh verification run'}
New-Item -ItemType Directory -Path $FloatTarget -Force | Out-Null
$FloatInputs=@()
foreach($FloatItem in @($FloatModule,$FloatWasm,$FloatNative)){
 $FloatInputs+=@{path=[IO.Path]::GetRelativePath($env:PROJECT_ROOT,$FloatItem).Replace('\','/');bytes=(Get-Item -LiteralPath $FloatItem).Length;sha256=(Get-FileHash -LiteralPath $FloatItem).Hash.ToLowerInvariant()}
}
[IO.File]::WriteAllBytes((Join-Path $FloatTarget 'arch-kernel.mjs'),[IO.File]::ReadAllBytes($FloatModule))
[IO.File]::WriteAllBytes((Join-Path $FloatTarget 'arch-kernel.wasm'),[IO.File]::ReadAllBytes($FloatWasm))
$FloatInputs | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'inputs/binaries.json') -Encoding utf8NoBOM
$env:ARCH_WASM_MODULE=Join-Path $FloatTarget 'arch-kernel.mjs'
& node (Join-Path $PSScriptRoot 'make-inputs.mjs') *> (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/prepare.log')
if($LASTEXITCODE -ne 0){throw 'Native fixture preparation failed'}
$FloatCase=Join-Path $env:PROJECT_REVIEW_RUN 'work/float-inputs'
& $FloatNative (Join-Path $FloatCase 'source.svg') (Join-Path $FloatCase 'clicky.aprq') (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/native-root') (Join-Path $FloatCase 'assembly.aprq') *> (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/native.log')
if($LASTEXITCODE -ne 0){throw 'Native root prerequisites failed'}
& node (Join-Path $PSScriptRoot 'file-oracle.mjs') *> (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/file-oracle.log')
if($LASTEXITCODE -ne 0){throw 'Independent file/correspondence oracle failed'}
$FloatTests=@((Join-Path $PSScriptRoot 'client-ready.test.mjs'),(Join-Path $PSScriptRoot 'worker.test.mjs'))
if($Mode -eq 'Instrumented'){$FloatTests+=(Join-Path $PSScriptRoot 'runtime.test.mjs')}
& node --test --test-reporter=tap --test-concurrency=1 @FloatTests *> (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/tests.tap')
$FloatExit=$LASTEXITCODE
$FloatText=Get-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/tests.tap') -Raw
$FloatCounts=@{}
foreach($FloatName in @('tests','pass','fail','cancelled','skipped','todo')){
 $FloatMatch=[regex]::Match($FloatText,'(?m)^# '+$FloatName+' (\d+)\s*$')
 if(-not $FloatMatch.Success){throw 'Missing test result count'}
 $FloatCounts[$FloatName]=[int]$FloatMatch.Groups[1].Value
}
$FloatExpected=if($Mode -eq 'Instrumented'){7}else{4}
$FloatPassed=$FloatExit -eq 0 -and $FloatCounts.pass -eq $FloatExpected -and $FloatCounts.tests -eq $FloatExpected -and $FloatCounts.fail -eq 0 -and $FloatCounts.cancelled -eq 0 -and $FloatCounts.skipped -eq 0
$FloatResult=@{version='arch-final-float-parent-tests/1';mode=$Mode;passed=$FloatPassed;counts=$FloatCounts;nativeProbe=$true;fileOracle=$true;binaryInputs=$FloatInputs;finishedAt=[DateTime]::UtcNow.ToString('o');independentSeatReview=$false;physicalFit='unqualified';wholePipelineBound='unverified';tapSha256=(Get-FileHash -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/tests.tap')).Hash.ToLowerInvariant()}
$FloatResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $FloatSummary -Encoding utf8NoBOM
$FloatResult | ConvertTo-Json -Depth 8
if(-not $FloatPassed){Get-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/tests.tap') -Tail 32;exit 1}
