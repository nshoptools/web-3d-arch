# Dot-source with actual operator inputs. This template contains no identities or keys.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$')][string]$RunId,
 [Parameter(Mandatory)][string]$DataDirectory,
 [Parameter(Mandatory)][string]$KeysFile,
 [Parameter(Mandatory)][string]$RuntimeFile,
 [Parameter(Mandatory)][string]$OidcFile,
 [Parameter(Mandatory)][string]$Origin,
 [Parameter(Mandatory)][ValidateRange(1,65535)][int]$BackendPort
)
$RuntimeProject = $PSScriptRoot
while ($RuntimeProject -and -not (Test-Path -LiteralPath (Join-Path $RuntimeProject 'tools/project-env.ps1'))) {
 $RuntimeProject = Split-Path -Parent $RuntimeProject
}
if (-not $RuntimeProject) { throw 'Repository not found' }
. (Join-Path $RuntimeProject 'tools/project-env.ps1') -Seat codex -RunId $RunId
$env:BACKEND_DATA_DIR = [IO.Path]::GetFullPath($DataDirectory)
$env:BACKEND_KEYS_FILE = [IO.Path]::GetFullPath($KeysFile)
$env:BACKEND_RUNTIME_FILE = [IO.Path]::GetFullPath($RuntimeFile)
$env:BACKEND_OIDC_FILE = [IO.Path]::GetFullPath($OidcFile)
$env:BACKEND_ORIGIN = $Origin
$env:BACKEND_PORT = [string]$BackendPort
$env:BACKEND_AI_ADAPTERS = ''
# Explicit AI opt-in, if separately approved, remains BACKEND_AI_ADAPTERS=xai-imagine.
# Each member supplies their own provider credential through the existing authenticated API.
# Supply OIDC client authentication by the existing approved secret mechanism if required.
# This file does not generate keys, bootstrap owner, start a server, or configure a service.
