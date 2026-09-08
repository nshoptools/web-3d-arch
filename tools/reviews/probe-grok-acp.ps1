# A real Grok session/new probe; deliberately never sends session/prompt.
function Invoke-GrokAcpProbe($Context, [string]$Executable) {
    $authSource = if ($env:GROK_AUTH_PATH) { $env:GROK_AUTH_PATH }
        elseif ($env:GROK_HOME) { Join-Path $env:GROK_HOME 'auth.json' }
        else { Join-Path $env:USERPROFILE '.grok/auth.json' }
    $authTarget = Assert-GrokProjectPath (Join-Path $Context.GrokHome 'auth.json') $Context.Repo
    $authHash = if (Test-Path -LiteralPath $authSource) { (Get-FileHash -LiteralPath $authSource).Hash } else { $null }
    if (-not (Test-Path -LiteralPath $authTarget) -and $authHash) {
        Copy-Item -LiteralPath $authSource -Destination $authTarget
    }
    $seat = (Get-Content -Raw -LiteralPath (Join-Path $Context.Repo 'docs/reviews/seat-config.json') | ConvertFrom-Json).seats.grok
    $info = New-GrokProcessInfo $Context $Executable @('-m',$seat.model,'--effort',$seat.effort,'--no-subagents','agent','stdio')
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    $started = $false
    $errorTask = $null
    try {
        if (-not $process.Start()) { throw 'Grok ACP start failed.' }
        $started = $true
        [ProjectGrok.Native]::Attach($Context.Job, $process.Handle)
        $errorTask = $process.StandardError.ReadToEndAsync()
        function Read-AcpReply([int]$Id) {
            $deadline = [DateTime]::UtcNow.AddSeconds(30)
            while ([DateTime]::UtcNow -lt $deadline) {
                $read = $process.StandardOutput.ReadLineAsync()
                $remaining = [Math]::Max(1, [int]($deadline - [DateTime]::UtcNow).TotalMilliseconds)
                if (-not $read.Wait($remaining)) { throw 'Grok ACP reply timeout.' }
                $line = $read.GetAwaiter().GetResult()
                if ($null -eq $line) { throw 'Grok ACP closed output before reply.' }
                $reply = $line | ConvertFrom-Json
                if ($reply.PSObject.Properties['id'] -and $reply.id -eq $Id) {
                    if ($reply.PSObject.Properties['error']) { throw "Grok ACP error $($reply.error.code): $($reply.error.message)" }
                    return $reply.result
                }
            }
            throw 'Grok ACP reply timeout.'
        }
        $init = @{jsonrpc='2.0';id=1;method='initialize';params=@{protocolVersion=1;clientCapabilities=@{};clientInfo=@{name='web-3d-arch-isolation-check';version='1'}}}
        $process.StandardInput.WriteLine(($init | ConvertTo-Json -Depth 6 -Compress))
        $null = Read-AcpReply 1
        $new = @{jsonrpc='2.0';id=2;method='session/new';params=@{cwd=$Context.Workspace;mcpServers=@()}}
        $process.StandardInput.WriteLine(($new | ConvertTo-Json -Depth 6 -Compress))
        $session = Read-AcpReply 2
        $id = $session.sessionId
        if ($id -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { throw 'Unexpected native session ID.' }
        $expected = Join-Path $Context.DriveRoot "tmp/sessions/$id"
        if (-not (Test-Path -LiteralPath $expected)) { throw 'Grok did not create its session folder in the mapped run.' }
        foreach ($drive in @('C:','D:',[IO.Path]::GetPathRoot($Context.Repo).TrimEnd('\'))) {
            if (Test-Path -LiteralPath "$drive\tmp\sessions\$id") { throw "Native Grok session escaped to $drive\tmp." }
        }
        if ($authHash -and (Get-FileHash -LiteralPath $authSource).Hash -ne $authHash) { throw 'Original login file changed.' }
        $evidence = [ordered]@{
            executable_sha256=(Get-FileHash -LiteralPath $Executable).Hash.ToLowerInvariant()
            session_id=$id; process_cwd=$Context.Workspace; expected_temp_folder=$expected
            native_session_folder_verified=$true; original_auth_unchanged=$true
            inference_requested=$false; model_requested=$seat.model; effort_requested=$seat.effort
        }
        $path = Assert-GrokProjectPath (Join-Path $Context.Run 'evidence/grok-native-acp.json') $Context.Repo
        $evidence | ConvertTo-Json | Set-Content -LiteralPath $path -Encoding utf8
        return $evidence
    } finally {
        if ($started -and -not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
        if ($errorTask) {
            $log = Assert-GrokProjectPath (Join-Path $Context.Run 'evidence/grok-native-acp.stderr.log') $Context.Repo
            $errorTask.GetAwaiter().GetResult() | Set-Content -LiteralPath $log -Encoding utf8
        }
        $process.Dispose()
    }
}
