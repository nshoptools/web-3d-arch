[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
if(-not $env:PROJECT_ROOT -or -not $env:PROJECT_REVIEW_RUN){throw 'Dot-source tools/development/env.ps1 with a seat and run before this writing process'}
$storageZipRun=[IO.Path]::GetFullPath($env:PROJECT_REVIEW_RUN)
if(-not $storageZipRun.StartsWith([IO.Path]::GetFullPath($env:PROJECT_ROOT)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Evidence run escapes the project'}
$storageZipEvidence=Join-Path $storageZipRun 'evidence'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$storageZipFiles=@(Get-ChildItem -LiteralPath $storageZipEvidence -Filter 'rescue-*.zip' -File)
if($storageZipFiles.Count -eq 0){throw 'No browser-produced ZIP found'}
$storageZipResults=@()
foreach($storageZipFile in $storageZipFiles){
  $storageZipPath=[IO.Path]::GetFullPath($storageZipFile.FullName)
  if(-not $storageZipPath.StartsWith($storageZipRun+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'ZIP path escaped run'}
  $storageZipArchive=[IO.Compression.ZipFile]::OpenRead($storageZipPath)
  try {
    $storageZipMetadataEntry=$storageZipArchive.GetEntry('package.json')
    if(-not $storageZipMetadataEntry){throw 'No package metadata'}
    $storageZipReader=[IO.StreamReader]::new($storageZipMetadataEntry.Open(),[Text.Encoding]::UTF8)
    try{$storageZipMetadata=$storageZipReader.ReadToEnd() | ConvertFrom-Json}finally{$storageZipReader.Dispose()}
    if($storageZipArchive.Entries.Count -ne $storageZipMetadata.files.Count+1){throw 'Entry inventory mismatch'}
    $storageZipEntries=@()
    foreach($storageZipExpected in $storageZipMetadata.files){
      $storageZipEntry=$storageZipArchive.GetEntry($storageZipExpected.path)
      if(-not $storageZipEntry -or $storageZipEntry.Length -ne $storageZipExpected.byteLength){throw 'Entry missing/size mismatch'}
      $storageZipStream=$storageZipEntry.Open()
      $storageZipHasher=[Security.Cryptography.SHA256]::Create()
      try{$storageZipHash=[Convert]::ToHexString($storageZipHasher.ComputeHash($storageZipStream)).ToLowerInvariant()}
      finally{$storageZipStream.Dispose();$storageZipHasher.Dispose()}
      if($storageZipHash -ne $storageZipExpected.hash){throw "SHA mismatch: $($storageZipExpected.path)"}
      $storageZipEntries+=@{path=$storageZipExpected.path;sha256=$storageZipHash;byteLength=$storageZipEntry.Length}
    }
    $storageZipResults+=@{file=$storageZipFile.Name;sha256=(Get-FileHash -LiteralPath $storageZipPath -Algorithm SHA256).Hash.ToLowerInvariant();entries=$storageZipEntries;status='pass';reader='System.IO.Compression.ZipArchive';extractedFiles=0}
  } finally {$storageZipArchive.Dispose()}
}
$storageZipReport=@{status='pass';powershell=$PSVersionTable.PSVersion.ToString();runtime=[System.Runtime.InteropServices.RuntimeInformation]::FrameworkDescription;archives=$storageZipResults}
[IO.File]::WriteAllText((Join-Path $storageZipEvidence 'zip-independent-dotnet.json'),($storageZipReport | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
Write-Output ("Independent .NET ZIP/SHA verification: {0} archives PASS; no extraction" -f $storageZipResults.Count)
