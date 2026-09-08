param([Parameter(Mandatory)][string]$OutputDirectory,[Parameter(Mandatory)][string]$RunId)
$ErrorActionPreference='Stop'
$WebHostRoot=$PSScriptRoot
while(-not (Test-Path (Join-Path $WebHostRoot 'tools/project-env.ps1'))) {
  $WebHostParent=Split-Path -Parent $WebHostRoot
  if($WebHostParent -eq $WebHostRoot){throw 'Project not found'}
  $WebHostRoot=$WebHostParent
}
. (Join-Path $WebHostRoot 'tools/project-env.ps1') -Seat codex -RunId $RunId
$WebHostOut=[IO.Path]::GetFullPath($OutputDirectory)
if(-not $WebHostOut.StartsWith($env:PROJECT_REVIEW_RUN+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Output outside run'}
$WebHostAncestor=$WebHostOut
while($WebHostAncestor -ne $env:PROJECT_REVIEW_RUN) {
  if((Test-Path -LiteralPath $WebHostAncestor) -and ((Get-Item -LiteralPath $WebHostAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse rejected'}
  $WebHostAncestor=Split-Path -Parent $WebHostAncestor
}
[IO.Directory]::CreateDirectory($WebHostOut)|Out-Null
$WebHostKeyFile=Join-Path $WebHostOut 'synthetic-key.pem'
$WebHostCertFile=Join-Path $WebHostOut 'synthetic-cert.pem'
if((Test-Path $WebHostKeyFile) -or (Test-Path $WebHostCertFile)){throw 'Refuse fixture overwrite'}
$WebHostRsa=[Security.Cryptography.RSA]::Create(2048)
try {
  $WebHostRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=localhost, O=web-3d-arch synthetic host test',
    $WebHostRsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $WebHostSan=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  $WebHostSan.AddDnsName('localhost')
  $WebHostSan.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'))
  $WebHostSan.AddIpAddress([Net.IPAddress]::Parse('::1'))
  $WebHostRequest.CertificateExtensions.Add($WebHostSan.Build())
  $WebHostRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
  $WebHostRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,$true))
  $WebHostEkus=[Security.Cryptography.OidCollection]::new()
  $null=$WebHostEkus.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
  $WebHostRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($WebHostEkus,$false))
  $WebHostCert=$WebHostRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(7))
  try {
    [IO.File]::WriteAllText($WebHostKeyFile,$WebHostRsa.ExportPkcs8PrivateKeyPem(),[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($WebHostCertFile,$WebHostCert.ExportCertificatePem(),[Text.UTF8Encoding]::new($false))
    @{synthetic=$true;certificateSha256=(Get-FileHash $WebHostCertFile -Algorithm SHA256).Hash.ToLowerInvariant();notAfter=$WebHostCert.NotAfter.ToUniversalTime().ToString('o');trustStoreInstalled=$false}|ConvertTo-Json|Set-Content (Join-Path $WebHostOut 'tls-fixture.json') -Encoding utf8NoBOM
  }finally{$WebHostCert.Dispose()}
}finally{$WebHostRsa.Dispose()}
