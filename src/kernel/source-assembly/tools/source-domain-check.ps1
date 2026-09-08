#requires -Version 7
param([ValidateSet('native','wasm')][string]$Target='native', [Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference='Stop'
$child=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$repo=$child
while(-not(Test-Path -LiteralPath (Join-Path $repo 'tools/development/env.ps1'))){$repo=Split-Path -Parent $repo;if(-not $repo){throw 'Repository not found'}}
. (Join-Path $repo 'tools/development/env.ps1') -Seat codex -RunId $RunId
$env:CARGO_HOME=Join-Path $env:PROJECT_REVIEW_RUN 'cache/cargo'
function Check-Contained([string]$Path,[string]$Within){
 $resolved=[IO.Path]::GetFullPath($Path);$boundary=[IO.Path]::GetFullPath($Within)
 if(-not $resolved.StartsWith($boundary+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Path outside declared directory'}
 $current=$resolved
 while($current -and $current -ne $boundary){if((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse point not allowed'};$current=Split-Path -Parent $current}
 return $resolved
}
$build=Check-Contained (Join-Path $env:PROJECT_REVIEW_RUN "work/build-domain-canonical-$Target") $env:PROJECT_REVIEW_RUN
$reference=Check-Contained (Join-Path $env:PROJECT_REVIEW_RUN 'inputs/main/src/kernel') $env:PROJECT_REVIEW_RUN
# First invocation captures only borrowed bridge/mechanics dependencies in this
# run. Existing inputs are never overwritten. Source baseline is a checked test
# preimage, not a dependency on another worker's frozen room.
if(-not(Test-Path -LiteralPath (Join-Path $reference 'mechanics/CMakeLists.txt'))){
 New-Item -ItemType Directory -Path (Join-Path $reference 'mechanics') -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $repo 'src/kernel/mechanics/CMakeLists.txt') -Destination (Join-Path $reference 'mechanics/CMakeLists.txt')
 Copy-Item -LiteralPath (Join-Path $repo 'src/kernel/mechanics/src') -Destination (Join-Path $reference 'mechanics/src') -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $reference 'native') -Force | Out-Null
foreach($name in @('geometry.h','product-bridge.h','product-bridge.cpp')){if(-not(Test-Path -LiteralPath (Join-Path $reference "native/$name"))){Copy-Item -LiteralPath (Join-Path $repo "src/kernel/native/$name") -Destination (Join-Path $reference "native/$name")}}
# The bridge's generic header include remains local and byte-identical.
if(-not(Test-Path -LiteralPath (Join-Path $reference 'source-assembly/src/source_assembly.h'))){New-Item -ItemType Directory -Path (Join-Path $reference 'source-assembly/src') -Force | Out-Null;Copy-Item -LiteralPath (Join-Path $child 'src/source_assembly.h') -Destination (Join-Path $reference 'source-assembly/src/source_assembly.h')}
$clipper=Check-Contained (Join-Path $env:PROJECT_REVIEW_RUN 'work/dependencies/clipper2-canonical') $env:PROJECT_REVIEW_RUN
$archive=Join-Path $repo '.toolchain/archives/clipper2-46f639177fe418f9689e8ddb74f08a870c71f5b4.tar.gz'
$patch=Join-Path $repo 'docs/licenses/kernel/clipper2-no-iostream.patch'
if((Get-FileHash -LiteralPath $archive).Hash -ne '73F5783E0C88299976334F48E3E356C756B96212C652ECC8BCEEC3BD99455BCB'){throw 'Archive pin mismatch'}
if((Get-FileHash -LiteralPath $patch).Hash -ne '88763E9A0B2AD9EC036BAEAF00317090621AA98C9754869E856BA16080EA8039'){throw 'Carry patch pin mismatch'}
if(-not(Test-Path -LiteralPath $clipper)){
 $members=@(& tar -tzf $archive);if($LASTEXITCODE){throw 'Archive list failed'}
 foreach($m in $members){if(-not $m.StartsWith('Clipper2-46f639177fe418f9689e8ddb74f08a870c71f5b4/') -or $m -match '(^|/)\.\.(/|$)|:|\\'){throw 'Unsafe archive member'}}
 New-Item -ItemType Directory -Path $clipper -Force | Out-Null
 & tar -xzf $archive --strip-components=1 -C $clipper
 if($LASTEXITCODE){throw 'Archive extraction failed'}
 & git -C $clipper apply --check $patch
 if($LASTEXITCODE){throw 'Carry patch check failed'}
 & git -C $clipper apply $patch
 if($LASTEXITCODE){throw 'Carry patch failed'}
}
$files=Get-ChildItem -LiteralPath $clipper -Recurse -File -Force
if(Get-ChildItem -LiteralPath $clipper -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Linked dependency member'}
$rows=[string[]]@($files | ForEach-Object {[IO.Path]::GetRelativePath($clipper,$_.FullName).Replace('\','/')+':'+(Get-FileHash -LiteralPath $_.FullName).Hash})
[Array]::Sort($rows,[StringComparer]::Ordinal)
$tree=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($rows -join "`n")+"`n")))
if($tree -ne '6316DC4C346683B329F362B78D9D2C324AD628175716F1CCD280C12D305A62CB'){throw 'Canonical Clipper tree mismatch'}
$manifold=Join-Path $repo '.toolchain/manifold'
if((& git -C $manifold rev-parse HEAD) -ne '0edd9d54876f3135e431575214dd6d8a72866fee'){throw 'Manifold revision pin mismatch'}
if((& git -C $manifold status --porcelain)){throw 'Manifold source differs from pin'}
$a=@('-S',"$child/tests/source-domain",'-B',$build,"-DARCH_ROOT_NATIVE_SOURCE=$reference/native","-DARCH_MECHANICS_SOURCE=$reference/mechanics","-DARCH_MANIFOLD_SOURCE=$manifold","-DARCH_CLIPPER2_SOURCE=$clipper",'-DCMAKE_BUILD_TYPE=Release','-DCLIPPER2_TESTS=OFF','-DCLIPPER2_EXAMPLES=OFF','-DCLIPPER2_UTILS=OFF')
if($Target -eq 'native'){$a+=@('-G','Visual Studio 18 2026')}else{
 New-Item -ItemType Directory -Path $build -Force | Out-Null
 '{"type":"commonjs"}' | Set-Content -LiteralPath (Join-Path $build 'package.json') -Encoding utf8
 $a+=@('-G','Ninja',"-DCMAKE_MAKE_PROGRAM=$repo/.toolchain/ninja/bin/ninja.exe","-DCMAKE_TOOLCHAIN_FILE=$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake")
}
$log=Join-Path $env:PROJECT_REVIEW_RUN "evidence/domain-$Target-configure.log"
& $env:CMAKE @a *> $log
if($LASTEXITCODE){Get-Content -LiteralPath $log -Tail 35;throw 'Configure failed'}
$log=Join-Path $env:PROJECT_REVIEW_RUN "evidence/domain-$Target-build.log"
& $env:CMAKE --build $build --config Release --target replay_before replay_candidate replay_production support_paths --parallel 3 *> $log
if($LASTEXITCODE){Get-Content -LiteralPath $log -Tail 45;throw 'Build failed'}
[ordered]@{target=$Target;clipperTree=$tree;manifoldRevision='0edd9d54876f3135e431575214dd6d8a72866fee';canonicalFiles=$files.Count;downloads='OFF';dependencies=$reference} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN "evidence/build-$Target-pins.json") -Encoding utf8
Write-Output $build
