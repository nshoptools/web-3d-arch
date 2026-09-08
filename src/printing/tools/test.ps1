#requires -Version 7.0
param([Parameter(Mandatory)][string]$RunId,[switch]$Browsers)
$ErrorActionPreference='Stop'
$printingRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
. (Join-Path $printingRepo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$printingPackage=Join-Path $printingRepo 'src/printing'
function Invoke-PrintingCheck([string]$Name,[string]$Exe,[object[]]$Arguments){
 $printingLog=Join-Path $env:PROJECT_REVIEW_RUN "evidence/$Name"
 & $Exe @Arguments *> $printingLog
 if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $printingLog -Tail 25;throw "$Name failed: $LASTEXITCODE"}
}
Invoke-PrintingCheck 'printing-source-verification.log' 'python' @('-B',"$printingPackage/tools/verify-unified-inputs.py")
Invoke-PrintingCheck 'printing-prepare-inputs.log' 'node' @("$printingPackage/tests/prepare-inputs.mjs",$printingRepo,"$env:PROJECT_REVIEW_RUN/inputs/printing")
$env:ARCH_NATIVE_BUILD=Join-Path $env:PROJECT_REVIEW_RUN 'work/unified-native-build'
$env:ARCH_PRINTING_ENABLED='1'
$env:RUSTFLAGS='';$env:EMCC_CFLAGS=''
Invoke-PrintingCheck 'printing-native-tests.log' "$printingRepo/.toolchain/cargo/bin/cargo.exe" @('+1.98.1','run','--manifest-path',"$printingRepo/src/kernel/Cargo.toml",'--release','--example','unified_printing','--features','printing-tests','--offline','--locked','--',"$env:PROJECT_REVIEW_RUN/evidence/unified-native")
$env:ARCH_WASM_MODULE=Join-Path $env:PROJECT_REVIEW_RUN 'work/module/arch-kernel.mjs'
$env:ARCH_PRINTING_TEST_MODULE=$env:ARCH_WASM_MODULE
Invoke-PrintingCheck 'printing-compatibility.tap' 'node' @('--test','--test-concurrency=1','--test-reporter=tap',"$printingPackage/tests/contracts.test.mjs","$printingPackage/tests/wasm-node.test.mjs")
Invoke-PrintingCheck 'printing-node.log' 'node' @("$printingPackage/tests/unified-node.mjs")
if($Browsers){Invoke-PrintingCheck 'printing-browser.log' 'node' @("$printingPackage/tests/unified-browser.mjs")}
$printingFiles=@()
$printingDirs=@('unified-native','unified-node')
if($Browsers){$printingDirs+='unified-browser'}
foreach($d in $printingDirs){$printingFiles+=Get-ChildItem -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN "evidence/$d") -Filter '*.3mf' | Select-Object -ExpandProperty FullName}
$printingCompatibility=@(Get-ChildItem -LiteralPath "$env:PROJECT_REVIEW_RUN/evidence/wasm" -Filter '*.3mf' | Select-Object -ExpandProperty FullName)
if(-not $printingFiles.Count -or -not $printingCompatibility.Count){throw 'No oracle artifacts'}
Invoke-PrintingCheck 'printing-unified-mesh-oracle.json' 'python' (@('-B',"$printingPackage/tests/unified-oracle.py")+$printingFiles)
Invoke-PrintingCheck 'printing-compatibility-mesh-oracle.json' 'python' (@('-B',"$printingPackage/tests/oracle.py")+$printingCompatibility)
& "$printingPackage/tests/verify-schema.ps1" -RepoRoot $printingRepo -RunId $RunId -Files @($printingFiles+$printingCompatibility) > "$env:PROJECT_REVIEW_RUN/evidence/printing-schema-oracle.json"
Invoke-PrintingCheck 'printing-production-build.log' 'node' @("$printingPackage/tools/build-production.mjs")
$printingArtifactHashes=@()
foreach($printingRelative in @('work/module/arch-kernel.mjs','work/module/arch-kernel.wasm','work/unified-production/printing.mjs','work/rust-target/release/examples/unified_printing.exe')){
 $printingArtifactHashes+=@{path=$printingRelative;sha256=(Get-FileHash -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN $printingRelative)).Hash.ToLower()}
}
@{scope='integrated kernel printing implementation';selectedChecks='pass';browsersSelected=[bool]$Browsers;testedArtifacts=$printingArtifactHashes;
 unifiedOracleFiles=$printingFiles.Count;compatibilityOracleFiles=$printingCompatibility.Count;
 slicerCLI='not selected by this runner';u1CLI='unverified';physicalFit='unverified';fullG5='unverified'} |
 ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$env:PROJECT_REVIEW_RUN/reports/printing-test-run.json" -Encoding utf8
Write-Output 'Selected integrated printing checks passed.'
