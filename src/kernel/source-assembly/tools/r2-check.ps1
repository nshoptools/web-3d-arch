#requires -Version 7
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$RunId,
 [Parameter(Mandatory)][string]$PreimageRoot,
 [ValidateSet('native','wasm')][string]$Target='native',
 [switch]$BuildOnly
)
$ErrorActionPreference='Stop'
$taskPackage=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCandidate=[IO.Path]::GetFullPath((Join-Path $taskPackage '../../..'))
$taskRepo=$taskPackage
while(-not(Test-Path -LiteralPath (Join-Path $taskRepo 'tools/development/env.ps1'))){
 $taskRepo=Split-Path -Parent $taskRepo
 if(-not $taskRepo){throw 'Repository not found'}
}
. (Join-Path $taskRepo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
$env:CARGO_NET_OFFLINE='true'
$taskPreimage=(Resolve-Path -LiteralPath $PreimageRoot).Path
foreach($taskPath in @($taskPackage,$taskCandidate,$taskPreimage,$env:PROJECT_REVIEW_RUN)){
 if(-not $taskPath.StartsWith($taskRepo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and $taskPath -ne $taskRepo){throw "Path outside repo: $taskPath"}
 $taskAncestor=$taskPath
 while($taskAncestor -ne $taskRepo){
  if((Get-Item -LiteralPath $taskAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Linked input/output path: $taskAncestor"}
  $taskAncestor=Split-Path -Parent $taskAncestor
 }
}
if($taskCandidate -eq $taskPreimage){throw 'Preimage cannot be candidate'}
& node (Join-Path $taskPackage '../mechanics/tools/verify-pins.mjs')
if($LASTEXITCODE){throw 'Dependency pins'}
if((git -C "$taskRepo/.toolchain/manifold" rev-parse HEAD).Trim() -ne '0edd9d54876f3135e431575214dd6d8a72866fee'){throw 'Manifold pin'}
git --no-optional-locks -c core.fsmonitor=false -C "$taskRepo/.toolchain/manifold" diff --quiet HEAD --
if($LASTEXITCODE){throw 'Manifold tracked source differs from pinned HEAD'}
$taskExpected=Get-Content -Raw (Join-Path $taskPackage 'docs/r2-preimage-manifest.json') | ConvertFrom-Json
foreach($taskFile in $taskExpected.files){
 $taskInput=Join-Path $taskPreimage $taskFile.path
 if((Get-FileHash -LiteralPath $taskInput -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskFile.sha256){throw "Preimage mismatch $($taskFile.path)"}
}
$taskBuild=Join-Path $env:PROJECT_REVIEW_RUN "work/r2-portable-$Target"
New-Item -ItemType Directory -Force -Path $taskBuild | Out-Null
$taskArgs=@('-S',"$taskPackage/tests/r2",'-B',$taskBuild,"-DCANDIDATE=$taskCandidate","-DPREIMAGE=$taskPreimage","-DARCH_MANIFOLD_SOURCE=$taskRepo/.toolchain/manifold","-DARCH_CLIPPER2_SOURCE=$taskRepo/.toolchain/clipper2-derived",'-DCMAKE_BUILD_TYPE=Release')
if($Target -eq 'native'){$taskArgs+=@('-G','Visual Studio 18 2026')}
else{
 '{"type":"commonjs"}' | Set-Content -LiteralPath "$taskBuild/package.json" -Encoding utf8
 $taskArgs+=@('-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$taskRepo/.toolchain/ninja/bin/ninja.exe","-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake")
}
& $env:CMAKE @taskArgs *> "$env:PROJECT_REVIEW_RUN/evidence/r2-$Target-configure.log"
if($LASTEXITCODE){throw "Configure failed: evidence/r2-$Target-configure.log"}
& $env:CMAKE --build $taskBuild --config Release --parallel 4 *> "$env:PROJECT_REVIEW_RUN/evidence/r2-$Target-build.log"
if($LASTEXITCODE){throw "Build failed: evidence/r2-$Target-build.log"}
if($BuildOnly){return}
$env:ARCH_R2_BUILD=$taskBuild
$env:ARCH_SOURCE_TEST_ID='r2-new-source-regression'
if($Target -eq 'native'){
 $env:ARCH_SOURCE_FIXTURE="$taskBuild/Release/source_new.exe"
 $env:ARCH_MECHANICS_FIXTURE="$taskBuild/Release/mechanics_new.exe"
}else{
 $env:ARCH_SOURCE_FIXTURE="$taskBuild/source_new.js"
 $env:ARCH_MECHANICS_FIXTURE="$taskBuild/mechanics_new.js"
}
foreach($taskTest in @("$taskPackage/tests/r2.mjs","$taskPackage/tests/run.mjs","$taskPackage/../mechanics/tests/remediation.mjs","$taskPackage/../mechanics/tests/run.mjs")){
 & node $taskTest $Target
 if($LASTEXITCODE){throw "Failed $taskTest ($Target)"}
}
