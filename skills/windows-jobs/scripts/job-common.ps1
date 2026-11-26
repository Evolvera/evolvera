# Shared by run-job.ps1, stop-job.ps1 and job-supervisor.ps1: argument parsing, validation and
# the status file. Dot-source it; it defines functions only.

$script:JobNamePattern = '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
$script:GpuUuidPattern = '^GPU-[0-9a-fA-F]{4,}(-[0-9a-fA-F]+)*$'
$script:ActiveStates = @('starting', 'running')

function Stop-WithUsage([string]$Message) {
    [Console]::Error.WriteLine("windows-jobs: $Message")
    exit 2
}

# PowerShell 5.1 does not honour "--" with -File, so options are read by hand from $args:
# "-Option value" pairs until "--"; everything after "--" is returned as Command, untouched.
function Read-JobArguments([object[]]$Arguments, [string[]]$ValueOptions, [string[]]$SwitchOptions) {
    $options = @{}
    $command = $null
    for ($i = 0; $i -lt $Arguments.Count; $i++) {
        $token = [string]$Arguments[$i]
        if ($token -eq '--') { $command = @($Arguments[($i + 1)..($Arguments.Count)] | Where-Object { $null -ne $_ } | ForEach-Object { [string]$_ }); break }
        $name = $token.TrimStart('-')
        if (-not $token.StartsWith('-') -or $name -eq '') { Stop-WithUsage "unexpected argument '$token' (put the command after --)" }
        if ($SwitchOptions -contains $name) { $options[$name] = $true; continue }
        if ($ValueOptions -notcontains $name) { Stop-WithUsage "unknown option -$name" }
        if ($i + 1 -ge $Arguments.Count) { Stop-WithUsage "option -$name needs a value" }
        $options[$name] = [string]$Arguments[++$i]
    }
    return @{ Options = $options; Command = $command }
}

function Assert-JobName([string]$Name) {
    if (-not $Name) { Stop-WithUsage '-Name is required' }
    if ($Name -notmatch $script:JobNamePattern -or $Name.Contains('..')) {
        Stop-WithUsage "-Name must match $script:JobNamePattern"
    }
}

function Get-StatusPath([string]$LogDir, [string]$Name) { Join-Path $LogDir "$Name.status.json" }

# Readers open the status with FileShare.Delete so the supervisor can replace it at any moment
# (Get-Content does not, and a reader at the wrong instant made the replace fail). A replace that
# lands between our open attempts is retried.
function Read-JobStatus([string]$Path) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (-not (Test-Path -LiteralPath $Path)) { return $null }
        try {
            $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]'ReadWrite, Delete')
            try { $text = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8).ReadToEnd() } finally { $stream.Dispose() }
        } catch [IO.IOException] { Start-Sleep -Milliseconds 25; continue }
        try { return $text | ConvertFrom-Json } catch { Stop-WithUsage "status file is corrupt: $Path" }
    }
    throw "could not read $Path"
}

# Write to a temp file, then rename over the target, so readers never see a half-written file.
# The rename is retried while another process briefly holds the target without FileShare.Delete.
function Write-JobStatus([string]$Path, [hashtable]$Status) {
    $tmp = "$Path.$PID.tmp"
    [IO.File]::WriteAllText($tmp, ($Status | ConvertTo-Json -Depth 5 -Compress), [Text.UTF8Encoding]::new($false))
    for ($attempt = 0; ; $attempt++) {
        try { Move-Item -LiteralPath $tmp -Destination $Path -Force; return }
        catch { if ($attempt -ge 40) { throw }; Start-Sleep -Milliseconds 25 }
    }
}

function Test-ProcessAlive($ProcessId) {
    if (-not $ProcessId) { return $false }
    return $null -ne (Get-Process -Id ([int]$ProcessId) -ErrorAction SilentlyContinue)
}

function Get-ProcessStartTicks($ProcessId) {
    $process = Get-Process -Id ([int]$ProcessId) -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    try { return $process.StartTime.ToUniversalTime().Ticks } catch { return $null }
}

# The supervisor of this status is alive only if its PID exists AND started at the recorded time:
# after a crash Windows can give the PID to an unrelated process, which must never be touched.
function Test-SupervisorAlive($Status) {
    if (-not $Status.supervisor_pid -or -not $Status.supervisor_start_ticks) { return $false }
    return (Get-ProcessStartTicks $Status.supervisor_pid) -eq [int64]$Status.supervisor_start_ticks
}

function ConvertTo-StatusTable($Status) {
    $table = @{}
    foreach ($property in $Status.PSObject.Properties) { $table[$property.Name] = $property.Value }
    return $table
}
