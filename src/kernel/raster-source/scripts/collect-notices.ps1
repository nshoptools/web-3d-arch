# Run after dot-sourcing tools/development/env.ps1 for the raster run and setting its CARGO_HOME.
$ErrorActionPreference='Stop'
if (-not $env:PROJECT_REVIEW_RUN.EndsWith('20260908-raster-wave2')) {throw 'Wrong run'}
$rasterCrate=Join-Path $env:PROJECT_REVIEW_RUN 'work/raster-source'
$metadata=Get-Content -LiteralPath (Join-Path $env:PROJECT_REVIEW_RUN 'evidence/cargo-metadata.json') -Raw | ConvertFrom-Json
$lockText=Get-Content -LiteralPath (Join-Path $rasterCrate 'Cargo.lock') -Raw
$lockHashes=@{}
foreach ($block in ($lockText -split '\[\[package\]\]')) {
    $m=[regex]::Match($block,'(?m)^name = "([^"]+)"')
    $v=[regex]::Match($block,'(?m)^version = "([^"]+)"')
    $h=[regex]::Match($block,'(?m)^checksum = "([^"]+)"')
    if ($m.Success -and $v.Success -and $h.Success) {$lockHashes[$m.Groups[1].Value+'@'+$v.Groups[1].Value]=$h.Groups[1].Value}
}
$inventory=@()
foreach ($package in ($metadata.packages | Where-Object { $_.source -like 'registry+*' } | Sort-Object name,version)) {
    $key=$package.name+'@'+$package.version
    $sourceRoot=[IO.Path]::GetFullPath((Split-Path -Parent $package.manifest_path))
    if (-not $sourceRoot.StartsWith($env:CARGO_HOME+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'Dependency source outside own Cargo home'}
    $ancestor=$sourceRoot
    while ($ancestor -ne $env:CARGO_HOME) {
        if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'Linked dependency path'}
        $ancestor=Split-Path -Parent $ancestor
    }
    $registryName=Split-Path -Leaf (Split-Path -Parent $sourceRoot)
    $archive=Join-Path $env:CARGO_HOME "registry/cache/$registryName/$($package.name)-$($package.version).crate"
    $archiveHash=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($archiveHash -ne $lockHashes[$key]) {throw "Archive checksum does not match lock: $key"}
    $vcsFile=Join-Path $sourceRoot '.cargo_vcs_info.json'
    $vcs=if(Test-Path -LiteralPath $vcsFile) {Get-Content -LiteralPath $vcsFile -Raw | ConvertFrom-Json} else {$null}
    $notices=@()
    foreach ($file in (Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE|UNLICENSE)([._-].*)?$' } | Sort-Object FullName)) {
        $relative=[IO.Path]::GetRelativePath($sourceRoot,$file.FullName)
        $destination=Join-Path $rasterCrate "docs/licenses/$($package.name)-$($package.version)/$relative"
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination
        $notices+= [pscustomobject]@{path=[IO.Path]::GetRelativePath($rasterCrate,$destination).Replace('\','/');sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$file.Length}
    }
    if ($key -eq 'rstar@0.13.0' -and $notices.Count -eq 0) {
        # Crate lives in a workspace subdirectory; root notices were not packaged.
        if ($vcs.git.sha1 -ne '82c969d4677a6f624900056e044d7e7ec8439c18') {throw 'Unexpected rstar VCS revision'}
        foreach ($name in @('LICENSE-MIT','LICENSE-APACHE')) {
            $sourceUrl="https://raw.githubusercontent.com/georust/rstar/82c969d4677a6f624900056e044d7e7ec8439c18/$name"
            $destination=Join-Path $rasterCrate "docs/licenses/rstar-0.13.0/$name"
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            if(-not(Test-Path -LiteralPath $destination)) {Invoke-WebRequest -Uri $sourceUrl -OutFile $destination}
            $notices+=[pscustomobject]@{path=[IO.Path]::GetRelativePath($rasterCrate,$destination).Replace('\','/');
                sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
                bytes=(Get-Item -LiteralPath $destination).Length;sourceUrl=$sourceUrl;note='Byte-exact root notice at crate VCS revision; not included in .crate archive'}
        }
    }
    if ($notices.Count -eq 0) {throw "No original license notice found: $key"}
    $inventory+=[pscustomobject]@{
        name=$package.name;version=$package.version;license=$package.license;repository=$package.repository
        registry=$package.source;archiveSource="https://static.crates.io/crates/$($package.name)/$($package.name)-$($package.version).crate"
        archiveSha256=$archiveHash;archiveBytes=(Get-Item -LiteralPath $archive).Length
        vcs=$vcs;notices=$notices
    }
}
[pscustomobject]@{
    schemaVersion=1;generatedFor='20260908-raster-wave2';licenseScope='All locked registry packages, including target/build dependencies; original notices copied without edits'
    lockSha256=(Get-FileHash -LiteralPath (Join-Path $rasterCrate 'Cargo.lock') -Algorithm SHA256).Hash.ToLowerInvariant()
    dependencies=$inventory
} | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $rasterCrate 'docs/dependencies.json') -Encoding utf8NoBOM
[pscustomobject]@{dependencyPackages=$inventory.Count;licenseNotices=($inventory.notices | Measure-Object).Count;verifiedArchives=$inventory.Count} | ConvertTo-Json


