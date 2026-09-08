# Windows path redirection for Grok's hard-coded /tmp; not an OS sandbox.
# Dot-source project-env.ps1 before calling these helpers.
Set-StrictMode -Version Latest

function Assert-GrokProjectPath([string]$Path, [string]$Root) {
    $full = [IO.Path]::GetFullPath($Path)
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    if ($full -ne $base -and -not $full.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes repository: $full"
    }
    $ancestor = $full
    while ($ancestor) {
        $item = Get-Item -LiteralPath $ancestor -Force -ErrorAction SilentlyContinue
        if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Unexpected junction/symlink: $ancestor"
        }
        $ancestor = Split-Path -Parent $ancestor
    }
    $full
}

function Initialize-GrokNative {
    if ('ProjectGrok.Native' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
namespace ProjectGrok {
  public static class Native {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint QueryDosDevice(string name, StringBuilder target, int size);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool DefineDosDevice(uint flags, string name, string target);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint size, uint flags);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int info, ref ExtendedLimit limit, uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimit {
      public long ProcessTime, JobTime;
      public uint Flags;
      public UIntPtr MinWorkingSet, MaxWorkingSet;
      public uint ActiveProcesses;
      public UIntPtr Affinity;
      public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters { public ulong A, B, C, D, E, F; }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimit {
      public BasicLimit Basic;
      public IoCounters Io;
      public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    public static string Mapping(string drive) {
      var result = new StringBuilder(32768);
      if (QueryDosDevice(drive, result, result.Capacity) != 0) return result.ToString();
      int error = Marshal.GetLastWin32Error();
      if (error == 2) return null;
      throw new Win32Exception(error);
    }
    public static void Map(string drive, string target) {
      if (Mapping(drive) != null) throw new InvalidOperationException("Drive already in use: " + drive);
      // Per-logon DOS device only: no registry, persistent mount or shell broadcast.
      if (!DefineDosDevice(8, drive, target)) throw new Win32Exception();
    }
    public static void Unmap(string drive, string exactRawTarget) {
      if (Mapping(drive) != exactRawTarget) throw new InvalidOperationException("Drive mapping changed; refusing removal: " + drive);
      // RAW_TARGET | REMOVE | EXACT_MATCH | NO_BROADCAST; never pop someone else's mapping.
      if (!DefineDosDevice(15, drive, exactRawTarget)) throw new Win32Exception();
    }
    public static string FinalPath(string path) {
      using (var h = CreateFile(path, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero)) {
        if (h.IsInvalid) throw new Win32Exception();
        var result = new StringBuilder(32768);
        uint n = GetFinalPathNameByHandle(h, result, (uint)result.Capacity, 0);
        if (n == 0 || n >= result.Capacity) throw new Win32Exception();
        string value = result.ToString();
        return value.StartsWith(@"\\?\") ? value.Substring(4) : value;
      }
    }
    public static IntPtr Job() {
      IntPtr h = CreateJobObject(IntPtr.Zero, null);
      if (h == IntPtr.Zero) throw new Win32Exception();
      var limit = new ExtendedLimit();
      limit.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE, including remaining descendants.
      if (!SetInformationJobObject(h, 9, ref limit, (uint)Marshal.SizeOf(limit))) {
        CloseHandle(h); throw new Win32Exception();
      }
      return h;
    }
    public static void Attach(IntPtr job, IntPtr process) {
      if (!AssignProcessToJobObject(job, process)) throw new Win32Exception();
    }
  }
}
'@
}

function New-GrokIsolation([string]$RepoRoot, [string]$RunRoot) {
    if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) { throw 'Use PowerShell 7 on Windows.' }
    $repo = Assert-GrokProjectPath $RepoRoot $RepoRoot
    $run = Assert-GrokProjectPath $RunRoot $repo
    if ($run -notmatch '\\tmp\\reviews\\(grok|codex|opus)\\runs\\[^\\]+$') { throw 'Use a review run directory.' }
    Initialize-GrokNative
    $context = [pscustomobject]@{
        Repo=$repo; Run=$run; Drive=$null; Mapping=$null; Lock=$null; Job=[IntPtr]::Zero
        DriveRoot=(Join-Path $run 'work/grok-drive'); Workspace=$null
        Link=(Join-Path $run 'work/grok-drive/project'); LinkCreated=$false
        GrokHome=(Join-Path $run 'cache/grok/home'); Profile=(Join-Path $run 'cache/grok/profile')
    }
    try {
        foreach ($path in @($context.DriveRoot, $context.GrokHome, $context.Profile,
                (Join-Path $context.DriveRoot 'tmp'), (Join-Path $context.DriveRoot 'var/tmp'))) {
            $null = Assert-GrokProjectPath $path $repo
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
        $lockPath = Assert-GrokProjectPath (Join-Path $run 'work/grok-launch.lock') $repo
        $context.Lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
        $driveState = Assert-GrokProjectPath (Join-Path $run 'work/grok-drive.json') $repo
        $letters = @('Z:', 'Y:', 'X:', 'W:', 'V:', 'U:', 'T:', 'S:', 'R:', 'Q:')
        if (Test-Path -LiteralPath $driveState) {
            $saved = Get-Content -Raw -LiteralPath $driveState | ConvertFrom-Json
            if ($saved.drive -notmatch '^[Q-Z]:$' -or $saved.root -ne $context.DriveRoot) { throw 'Invalid saved drive mapping.' }
            $letters = @($saved.drive)
        }
        $mutex = [Threading.Mutex]::new($false, 'Local\web-3d-arch-grok-drive-allocation')
        $held = $false
        try {
            try { $held = $mutex.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $held = $true }
            if (-not $held) { throw 'Another Grok launcher is allocating a drive.' }
            if (Test-Path -LiteralPath $driveState) {
                $existing = [ProjectGrok.Native]::Mapping($saved.drive)
                $expected = '\??\' + $context.DriveRoot
                if ($existing -eq $expected) {
                    # The exclusive run lock proves that its previous launcher is gone.
                    # Its non-inherited KILL_ON_JOB_CLOSE handle terminates its children.
                    [ProjectGrok.Native]::Unmap($saved.drive, $existing)
                }
                $staleLink = Get-Item -LiteralPath $context.Link -Force -ErrorAction SilentlyContinue
                if ($staleLink) {
                    if ($staleLink.LinkType -ne 'Junction' -or [ProjectGrok.Native]::FinalPath($context.Link) -ne $repo) {
                        throw 'Unexpected stale workspace path; refusing removal.'
                    }
                    [IO.Directory]::Delete($context.Link)
                }
            }
            foreach ($letter in $letters) {
                if ($null -eq [ProjectGrok.Native]::Mapping($letter)) {
                    [ProjectGrok.Native]::Map($letter, $context.DriveRoot)
                    $context.Drive = $letter
                    $context.Mapping = [ProjectGrok.Native]::Mapping($letter)
                    break
                }
            }
        } finally {
            if ($held) { $mutex.ReleaseMutex() }
            $mutex.Dispose()
        }
        if (-not $context.Drive) { throw 'No free drive for this run. Close its earlier launcher; do not remove unrelated drives.' }
        if ([ProjectGrok.Native]::FinalPath($context.Drive + '\') -ne $context.DriveRoot) { throw 'Drive target mismatch.' }
        $null = Assert-GrokProjectPath $context.Link $repo
        if (Test-Path -LiteralPath $context.Link) { throw 'Workspace alias already exists; inspect stale run before reuse.' }
        New-Item -ItemType Junction -Path $context.Link -Target $repo | Out-Null
        $context.LinkCreated = $true
        $context.Workspace = $context.Drive + '\project'
        if ([ProjectGrok.Native]::FinalPath($context.Workspace) -ne $repo) { throw 'Workspace alias target mismatch.' }
        if ([ProjectGrok.Native]::FinalPath($context.Drive + '\tmp') -ne (Join-Path $context.DriveRoot 'tmp')) { throw '/tmp mapping mismatch.' }
        @{drive=$context.Drive;root=$context.DriveRoot} | ConvertTo-Json | Set-Content -LiteralPath $driveState -Encoding utf8
        $context.Job = [ProjectGrok.Native]::Job()
        return $context
    } catch {
        Remove-GrokIsolation $context
        throw
    }
}

function Remove-GrokIsolation($Context) {
    # Stop remaining children before the alias can disappear.
    if ($Context.Job -ne [IntPtr]::Zero) {
        $null = [ProjectGrok.Native]::CloseHandle($Context.Job)
        $Context.Job = [IntPtr]::Zero
    }
    try {
        if ($Context.LinkCreated) {
            $item = Get-Item -LiteralPath $Context.Link -Force -ErrorAction Stop
            if ($item.LinkType -ne 'Junction' -or [ProjectGrok.Native]::FinalPath($Context.Link) -ne $Context.Repo) {
                throw 'Workspace alias changed; refusing cleanup.'
            }
            [IO.Directory]::Delete($Context.Link) # Only the junction, never its target.
            $Context.LinkCreated = $false
        }
    } finally {
        try {
            if ($Context.Drive) {
                [ProjectGrok.Native]::Unmap($Context.Drive, $Context.Mapping)
                $Context.Drive = $null
            }
        } finally {
            if ($Context.Lock) { $Context.Lock.Dispose(); $Context.Lock = $null }
        }
    }
}

function New-GrokProcessInfo($Context, [string]$Executable, [string[]]$Arguments) {
    if ($Context.Job -eq [IntPtr]::Zero) { $Context.Job = [ProjectGrok.Native]::Job() }
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $Executable
    $info.WorkingDirectory = $Context.Workspace
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardInput = $true
    foreach ($arg in $Arguments) { $info.ArgumentList.Add($arg) }
    $paths = @{
        GROK_HOME=$Context.GrokHome; GROK_AUTH_PATH=(Join-Path $Context.GrokHome 'auth.json')
        GROK_WORKSPACE_HOME=(Join-Path $Context.Run 'cache/grok/workspace')
        GROK_LOG_FILE=(Join-Path $Context.Run 'evidence/grok.log')
        USERPROFILE=$Context.Profile; HOME=$Context.Profile
        APPDATA=(Join-Path $Context.Profile 'AppData/Roaming')
        LOCALAPPDATA=(Join-Path $Context.Profile 'AppData/Local')
        TEMP=(Join-Path $Context.Run 'temp'); TMP=(Join-Path $Context.Run 'temp'); TMPDIR=(Join-Path $Context.Run 'temp')
    }
    foreach ($name in $paths.Keys) {
        $path = Assert-GrokProjectPath $paths[$name] $Context.Repo
        $info.Environment[$name] = $path
        if ($name -notin @('GROK_AUTH_PATH','GROK_LOG_FILE')) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
    }
    # These inherited overrides can execute helpers or relocate tool output before a prompt.
    foreach ($name in @('GROK_CONFIG','GROK_CONFIG_PATH','GROK_AUTH_PROVIDER_COMMAND','GROK_BIN_DIR','GROK_DEPLOYMENT_KEY')) {
        $null = $info.Environment.Remove($name)
    }
    $info.Environment['GROK_DISABLE_AUTOUPDATER'] = '1'
    $info.Environment['GROK_SUBAGENTS'] = '0'
    return $info
}

function Invoke-GrokProcess($Context, [Diagnostics.ProcessStartInfo]$Info, [int]$TimeoutSeconds = 0) {
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $Info
    $started = $false
    try {
        if (-not $process.Start()) { throw 'Unable to start isolated process.' }
        $started = $true
        $stdoutTask = if ($Info.RedirectStandardOutput) { $process.StandardOutput.ReadToEndAsync() } else { $null }
        $stderrTask = if ($Info.RedirectStandardError) { $process.StandardError.ReadToEndAsync() } else { $null }
        if ($Info.RedirectStandardInput) { $process.StandardInput.Close() }
        try { [ProjectGrok.Native]::Attach($Context.Job, $process.Handle) }
        catch {
            if (-not $process.HasExited) { $process.Kill($true); throw }
            # An early command such as --version may already have exited.
        }
        if ($TimeoutSeconds -gt 0) {
            if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
                $process.Kill($true); $process.WaitForExit()
                throw 'Grok exceeded the requested timeout.'
            }
        } else { $process.WaitForExit() }
        # A descendant may retain the output pipe after its parent exits.
        # End the job before draining those pipes, otherwise cleanup cannot run.
        $null = [ProjectGrok.Native]::CloseHandle($Context.Job)
        $Context.Job = [IntPtr]::Zero
        return [pscustomobject]@{
            ExitCode=$process.ExitCode
            Stdout=$(if ($stdoutTask) { $stdoutTask.GetAwaiter().GetResult() } else { '' })
            Stderr=$(if ($stderrTask) { $stderrTask.GetAwaiter().GetResult() } else { '' })
        }
    } finally {
        if ($started -and -not $process.HasExited) { $process.Kill($true) }
        if ($Context.Job -ne [IntPtr]::Zero) {
            $null = [ProjectGrok.Native]::CloseHandle($Context.Job)
            $Context.Job = [IntPtr]::Zero
        }
        $process.Dispose()
    }
}
