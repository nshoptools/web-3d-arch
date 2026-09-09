# Synthetic loopback certificate for the development server (dev-serve.mjs).
# Same shape as tests/product-acceptance/generate-tls.ps1 (localhost, 127.0.0.1,
# ::1; seven days; not a CA) but reusable across runs and never installed in any
# trust store. Development only; never a release input.
param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$devOut=[IO.Path]::GetFullPath($OutputDirectory)
$devRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if(-not $devOut.StartsWith($devRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'TLS output must stay inside the repository'}
[IO.Directory]::CreateDirectory($devOut)|Out-Null
$devKeyFile=Join-Path $devOut 'synthetic-key.pem'
$devCertFile=Join-Path $devOut 'synthetic-cert.pem'
if((Test-Path -LiteralPath $devKeyFile) -and (Test-Path -LiteralPath $devCertFile)){
  $devExisting=[Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPemFile($devCertFile,$devKeyFile)
  try{ if($devExisting.NotAfter.ToUniversalTime() -gt [DateTime]::UtcNow.AddHours(1)){ Write-Output 'reused'; exit 0 } } finally { $devExisting.Dispose() }
}
$devRsa=[Security.Cryptography.RSA]::Create(2048)
try {
  $devRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=localhost, O=web-3d-arch synthetic development server',
    $devRsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $devSan=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  $devSan.AddDnsName('localhost');$devSan.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'));$devSan.AddIpAddress([Net.IPAddress]::Parse('::1'))
  $devRequest.CertificateExtensions.Add($devSan.Build())
  $devRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
  $devRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,$true))
  $devEkus=[Security.Cryptography.OidCollection]::new();$null=$devEkus.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
  $devRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($devEkus,$false))
  $devCert=$devRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(7))
  try {
    [IO.File]::WriteAllText($devKeyFile,$devRsa.ExportPkcs8PrivateKeyPem(),[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($devCertFile,$devCert.ExportCertificatePem(),[Text.UTF8Encoding]::new($false))
    @{synthetic=$true;development=$true;certificateSha256=(Get-FileHash $devCertFile -Algorithm SHA256).Hash.ToLowerInvariant();notAfter=$devCert.NotAfter.ToUniversalTime().ToString('o');trustStoreInstalled=$false}|ConvertTo-Json|Set-Content (Join-Path $devOut 'tls-fixture.json') -Encoding utf8NoBOM
  } finally { $devCert.Dispose() }
} finally { $devRsa.Dispose() }
Write-Output 'generated'
