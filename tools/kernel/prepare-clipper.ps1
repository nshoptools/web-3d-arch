#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RunId,[ValidateSet('codex','opus','grok')][string]$Seat='codex')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../development/env.ps1') -Seat $Seat -RunId $RunId
$clipperCommit='46f639177fe418f9689e8ddb74f08a870c71f5b4'
$clipperExpected='73F5783E0C88299976334F48E3E356C756B96212C652ECC8BCEEC3BD99455BCB'
$clipperArchive=Join-Path $env:PROJECT_ROOT ".toolchain/archives/clipper2-$clipperCommit.tar.gz"
$clipperOriginal=Join-Path $env:PROJECT_ROOT '.toolchain/clipper2-original'
$clipperDerived=Join-Path $env:PROJECT_ROOT '.toolchain/clipper2-derived'
foreach($clipperTarget in @($clipperArchive,$clipperOriginal,$clipperDerived)){
  $clipperAncestor=[IO.Path]::GetFullPath($clipperTarget)
  if(-not $clipperAncestor.StartsWith($env:PROJECT_ROOT+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Dependency path escaped'}
  while($clipperAncestor -ne $env:PROJECT_ROOT){
    if((Test-Path -LiteralPath $clipperAncestor) -and ((Get-Item -LiteralPath $clipperAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Dependency path contains a link'}
    $clipperAncestor=Split-Path -Parent $clipperAncestor
  }
}
if(-not (Test-Path -LiteralPath $clipperArchive)){
  New-Item -ItemType Directory -Path (Split-Path -Parent $clipperArchive) -Force | Out-Null
  Invoke-WebRequest -Uri "https://codeload.github.com/AngusJohnson/Clipper2/tar.gz/$clipperCommit" -OutFile $clipperArchive
}
if((Get-FileHash -LiteralPath $clipperArchive -Algorithm SHA256).Hash -ne $clipperExpected){throw 'Clipper2 archive hash mismatch'}
$clipperPrefix="Clipper2-$clipperCommit/"
$clipperMembers=@(& tar -tzf $clipperArchive)
if($LASTEXITCODE -ne 0){throw 'Cannot inspect Clipper2 archive'}
foreach($clipperMember in $clipperMembers){
  if(-not $clipperMember.StartsWith($clipperPrefix,[StringComparison]::Ordinal) -or $clipperMember -match '(^|/)\.\.(/|$)|:|\\'){throw 'Unsafe source archive member'}
}
if(-not (Test-Path -LiteralPath $clipperOriginal)){
  New-Item -ItemType Directory -Path $clipperOriginal -Force | Out-Null
  & tar -xzf $clipperArchive --strip-components=1 -C $clipperOriginal
  if($LASTEXITCODE -ne 0){throw 'Clipper2 extraction failed'}
}
$clipperLinks=Get-ChildItem -LiteralPath $clipperOriginal -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}
if($clipperLinks){throw 'Source tree contains a link'}
$clipperPatch=Join-Path $env:PROJECT_ROOT '.toolchain/manifold/cmake/patches/0001-clipper2-no-iostream.patch'
if(-not (Test-Path -LiteralPath $clipperDerived)){
  Copy-Item -LiteralPath $clipperOriginal -Destination $clipperDerived -Recurse
  & git -C $clipperDerived apply --check $clipperPatch
  if($LASTEXITCODE -ne 0){throw 'Carry patch check failed'}
  & git -C $clipperDerived apply $clipperPatch
  if($LASTEXITCODE -ne 0){throw 'Carry patch failed'}
}
& git -C $clipperDerived apply --reverse --check $clipperPatch
if($LASTEXITCODE -ne 0){throw 'Derived source does not contain the pinned carry patch'}
$clipperFiles=Get-ChildItem -LiteralPath $clipperDerived -Recurse -File | Sort-Object FullName | ForEach-Object {
  [ordered]@{path=[IO.Path]::GetRelativePath($clipperDerived,$_.FullName).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
}
$clipperRows=[string[]]@($clipperFiles | ForEach-Object {$_.path+':'+$_.sha256})
[Array]::Sort($clipperRows,[StringComparer]::Ordinal)
$clipperTreeHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($clipperRows -join "`n")+"`n")))
if($clipperTreeHash -ne '6316DC4C346683B329F362B78D9D2C324AD628175716F1CCD280C12D305A62CB'){throw 'Clipper2 derived tree differs from the pinned source and carry patch'}
[ordered]@{commit=$clipperCommit;archiveSha256=$clipperExpected;patchSha256=(Get-FileHash -LiteralPath $clipperPatch -Algorithm SHA256).Hash;derivation='tar --strip-components=1; copy into separate tree; git apply pinned Manifold carry patch';files=$clipperFiles} |
  ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/clipper2-derived.json') -Encoding utf8
Write-Output $clipperDerived
