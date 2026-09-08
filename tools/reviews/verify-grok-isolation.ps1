#requires -Version 7.0
[CmdletBinding()]
param([switch]$NativeGrok)
$ErrorActionPreference = 'Stop'
if (-not $env:PROJECT_REVIEW_RUN) { throw 'Dot-source project-env.ps1 for your own seat before verification.' }
. (Join-Path $PSScriptRoot 'grok-isolation.ps1')
$auditRepo = $env:PROJECT_ROOT
$auditRun = $env:PROJECT_REVIEW_RUN
$auditContext = $null
$auditDrive = $null
$auditOutside = @{}
foreach ($path in @('C:\tmp','D:\tmp')) { $auditOutside[$path] = Test-Path -LiteralPath $path }
$auditProbe = Assert-GrokProjectPath (Join-Path $auditRun 'work/grok-path-probe.py') $auditRepo
@'
import json, os, pathlib, sys, time
output = pathlib.Path(sys.argv[1])
marker = pathlib.Path('/tmp/sessions/project-isolation-probe')
marker.mkdir(parents=True, exist_ok=True)
(marker / 'proof.txt').write_text('inside repository', encoding='utf-8')
result = {'cwd':os.getcwd(), 'root_tmp':str(marker.resolve()),
          'repo':str(pathlib.Path('AGENTS.md').resolve()),
          'temp':os.environ['TEMP'], 'grok_home':os.environ['GROK_HOME']}
output.write_text(json.dumps(result, indent=2), encoding='utf-8')
time.sleep(0.2)
'@ | Set-Content -LiteralPath $auditProbe -Encoding utf8
$auditResult = Assert-GrokProjectPath (Join-Path $auditRun 'evidence/grok-path-probe.json') $auditRepo
try {
    $auditContext = New-GrokIsolation $auditRepo $auditRun
    $auditDrive = $auditContext.Drive
    $auditPython = @(Get-Command python -CommandType Application)[0].Source
    $auditInfo = New-GrokProcessInfo $auditContext $auditPython @('-B',$auditProbe,$auditResult)
    $auditProcessResult = Invoke-GrokProcess $auditContext $auditInfo 15
    if ($auditProcessResult.ExitCode -ne 0) { throw "Native path probe failed: $($auditProcessResult.Stderr)" }
    $auditObserved = Get-Content -Raw -LiteralPath $auditResult | ConvertFrom-Json
    $auditExpected = Join-Path $auditContext.DriveRoot 'tmp/sessions/project-isolation-probe'
    if ($auditObserved.root_tmp -ne $auditExpected) { throw '/tmp escaped its mapped review room.' }
    if ($auditObserved.repo -ne (Join-Path $auditRepo 'AGENTS.md')) { throw 'Workspace alias does not reach repository.' }
    if (-not (Test-Path -LiteralPath (Join-Path $auditExpected 'proof.txt'))) { throw 'Probe did not write its marker.' }
    $rejected = $false
    try { $null = New-GrokIsolation $auditRepo $auditRun } catch { $rejected = $true }
    if (-not $rejected) { throw 'Concurrent reuse of the same run was not rejected.' }
    if ($NativeGrok) {
        . (Join-Path $PSScriptRoot 'probe-grok-acp.ps1')
        $auditGrok = @(Get-Command grok -CommandType Application -ErrorAction Stop)[0].Source
        $auditNative = Invoke-GrokAcpProbe $auditContext $auditGrok
        Write-Output "PASS: native Grok session $($auditNative.session_id) created its /tmp folder inside the run; no inference requested."
    }
    $auditFailure = New-GrokProcessInfo $auditContext $auditPython @('-B','-c','import sys; sys.exit(7)')
    if ((Invoke-GrokProcess $auditContext $auditFailure 15).ExitCode -ne 7) { throw 'Child exit code was not preserved.' }
    $auditDescendant = New-GrokProcessInfo $auditContext $auditPython @('-B','-c',
        'import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-B","-c","import time; time.sleep(30)"]); print(p.pid); time.sleep(0.2)')
    $auditTimer = [Diagnostics.Stopwatch]::StartNew()
    $auditDescendantResult = Invoke-GrokProcess $auditContext $auditDescendant 15
    if ($auditDescendantResult.ExitCode -ne 0 -or $auditTimer.Elapsed.TotalSeconds -gt 10) { throw 'Descendant kept the parent output pipe open.' }
    $auditChildId = [int]$auditDescendantResult.Stdout.Trim()
    if (Get-Process -Id $auditChildId -ErrorAction SilentlyContinue) { throw 'A descendant survived its parent job.' }
    $auditTimeout = New-GrokProcessInfo $auditContext $auditPython @('-B','-c','import time; time.sleep(30)')
    $rejected = $false
    try { $null = Invoke-GrokProcess $auditContext $auditTimeout 1 }
    catch { if ($_.Exception.Message -notmatch 'timeout|exceeded') { throw }; $rejected = $true }
    if (-not $rejected) { throw 'Child timeout was not enforced.' }
} finally {
    if ($auditContext) { Remove-GrokIsolation $auditContext }
}
if ([ProjectGrok.Native]::Mapping($auditDrive)) { throw 'Temporary drive was not removed.' }
if (Test-Path -LiteralPath (Join-Path $auditRun 'work/grok-drive/project')) { throw 'Workspace alias was not removed.' }
foreach ($path in $auditOutside.Keys) {
    if ((Test-Path -LiteralPath $path) -ne $auditOutside[$path]) { throw "Unexpected change outside repository: $path" }
}
foreach ($bad in @((Join-Path $auditRepo '../outside'), (Join-Path $auditRepo 'docs/../../outside'))) {
    $rejected = $false
    try { $null = Assert-GrokProjectPath $bad $auditRepo } catch { $rejected = $true }
    if (-not $rejected) { throw 'Path traversal was not rejected.' }
}
$auditGuardLink = Assert-GrokProjectPath (Join-Path $auditRun 'work/grok-reparse-guard') $auditRepo
New-Item -ItemType Junction -Path $auditGuardLink -Target (Join-Path $auditRun 'inputs') | Out-Null
try {
    $rejected = $false
    try { $null = Assert-GrokProjectPath (Join-Path $auditGuardLink 'new-output') $auditRepo } catch { $rejected = $true }
    if (-not $rejected) { throw 'Unexpected output junction was not rejected.' }
} finally { [IO.Directory]::Delete($auditGuardLink) }
# Simulate the on-disk mapping left after the previous launcher's job has closed.
$auditStale = New-GrokIsolation $auditRepo $auditRun
$null = [ProjectGrok.Native]::CloseHandle($auditStale.Job)
$auditStale.Job = [IntPtr]::Zero
$auditStale.Lock.Dispose(); $auditStale.Lock = $null
$auditRecovered = $null
try { $auditRecovered = New-GrokIsolation $auditRepo $auditRun }
finally {
    if ($auditRecovered) { Remove-GrokIsolation $auditRecovered }
    elseif ([ProjectGrok.Native]::Mapping($auditStale.Drive)) { Remove-GrokIsolation $auditStale }
}
if ([ProjectGrok.Native]::Mapping($auditDrive)) { throw 'Recovered drive was not removed.' }
Write-Output 'PASS: native /tmp write stays in run; repo alias, concurrency, exit-code/timeout, descendant cleanup, stale-run recovery, junction and traversal checks pass.'
