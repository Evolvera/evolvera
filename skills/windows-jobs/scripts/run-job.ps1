# Starts a long job that outlives this Pi run, inside a Job Object with a commit cap.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File run-job.ps1 -Name <name> -CommitLimitGB <gb>
#       [-LogDir <dir>] [-WorkDir <dir>] [-GpuUuid GPU-xxxx [-GpuName <text>] | -CpuOnly]
#       [-SetEnv KEY=VALUE] -- <program.exe> [args...]
#
# The supervisor is created through WMI (Win32_Process.Create), so it is not a descendant of the
# Pi: a bash timeout (taskkill /T) or process-reaper at exit does not reach it. WMI processes do not
# inherit the caller's environment, so the caller's environment is passed explicitly in a spec file
# that the supervisor deletes as soon as it has read it.
# Exit codes: 0 started (prints one JSON line), 2 bad input, 3 the supervisor failed to start.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'job-common.ps1')

$parsed = Read-JobArguments $args @('Name', 'CommitLimitGB', 'LogDir', 'WorkDir', 'GpuUuid', 'GpuName', 'SetEnv') @('CpuOnly')
$o = $parsed.Options
Assert-JobName $o.Name
if (-not $parsed.Command -or $parsed.Command.Count -eq 0 -or -not $parsed.Command[0]) { Stop-WithUsage 'a command is required after --' }

$limitGb = 0.0
if (-not [double]::TryParse([string]$o.CommitLimitGB, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$limitGb) -or $limitGb -le 0) {
    Stop-WithUsage '-CommitLimitGB must be a positive number (GB of committed memory for the whole job, GPU memory included)'
}
$limitBytes = [uint64]($limitGb * 1GB)
$machineCommit = [uint64](Get-CimInstance Win32_OperatingSystem).TotalVirtualMemorySize * 1KB
if ($limitBytes -gt $machineCommit) { Stop-WithUsage ("-CommitLimitGB {0} is above this machine's commit limit ({1:N1} GB)" -f $limitGb, ($machineCommit / 1GB)) }

if ($o.GpuUuid -and $o.CpuOnly) { Stop-WithUsage 'use -GpuUuid or -CpuOnly, not both' }
if ($o.GpuUuid -and $o.GpuUuid -notmatch $script:GpuUuidPattern) { Stop-WithUsage '-GpuUuid must be one GPU UUID from nvidia-smi -L (an index depends on CUDA_DEVICE_ORDER)' }
if ($o.GpuName -and -not $o.GpuUuid) { Stop-WithUsage '-GpuName needs -GpuUuid' }

$environment = @{}
foreach ($item in Get-ChildItem env:) { $environment[$item.Name] = $item.Value }
if ($o.SetEnv) {
    if ($o.SetEnv -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { Stop-WithUsage '-SetEnv must be KEY=VALUE' }
    $environment[$Matches[1]] = $Matches[2]
}
if ($o.GpuUuid) {
    $cudaPin = Join-Path $PSScriptRoot 'cuda-pin'
    $environment['PI_CUDA_PIN_UUID'] = $o.GpuUuid
    $environment['CUDA_DEVICE_ORDER'] = 'PCI_BUS_ID'
    $environment['CUDA_VISIBLE_DEVICES'] = $o.GpuUuid
    if ($o.GpuName) { $environment['PI_CUDA_PIN_NAME'] = $o.GpuName }
    $environment['PYTHONPATH'] = (@($cudaPin, $environment['PYTHONPATH']) | Where-Object { $_ }) -join [IO.Path]::PathSeparator
}
if ($o.CpuOnly) {
    $environment['CUDA_VISIBLE_DEVICES'] = ''
    $environment.Remove('PI_CUDA_PIN_UUID')
    $environment.Remove('PI_CUDA_PIN_NAME')
}

# An existing path is taken literally (Get-Command would read [ ] as wildcards); bare names use PATH.
$programPath = if (Test-Path -LiteralPath $parsed.Command[0] -PathType Leaf) {
    (Get-Item -LiteralPath $parsed.Command[0]).FullName
} else {
    (Get-Command -Name $parsed.Command[0] -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
}
if (-not $programPath) { Stop-WithUsage "program not found: $($parsed.Command[0])" }
if ([IO.Path]::GetExtension($programPath) -notin @('.exe', '.com')) {
    Stop-WithUsage "program must be an .exe (got $programPath); run scripts through their interpreter, e.g. node cli.js"
}

$logDir = if ($o.LogDir) { $o.LogDir } else { Join-Path $env:TEMP 'pi-jobs' }
$workDir = if ($o.WorkDir) { $o.WorkDir } else { (Get-Location).ProviderPath }
if (-not (Test-Path -LiteralPath $workDir -PathType Container)) { Stop-WithUsage "-WorkDir does not exist: $workDir" }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logDir = (Resolve-Path -LiteralPath $logDir).ProviderPath
$workDir = (Resolve-Path -LiteralPath $workDir).ProviderPath

$statusPath = Get-StatusPath $logDir $o.Name
# Serialise check-and-start per name: the claim file exists only while this run-job holds it open,
# and Windows deletes it when the handle closes, even if this process is killed.
try {
    $claim = [IO.FileStream]::new((Join-Path $logDir "$($o.Name).claim"), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write,
        [IO.FileShare]::None, 1, [IO.FileOptions]::DeleteOnClose)
} catch [IO.IOException] {
    Stop-WithUsage "job '$($o.Name)' is being started by another run-job right now"
}
$previous = Read-JobStatus $statusPath
if ($previous -and $script:ActiveStates -contains $previous.state -and (Test-SupervisorAlive $previous)) {
    Stop-WithUsage "job '$($o.Name)' is still running (supervisor $($previous.supervisor_pid)); stop it with stop-job.ps1 or use another name"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$logPath = Join-Path $logDir "$($o.Name).$stamp.log"
$specPath = Join-Path $logDir "$($o.Name).spec.json"
$status = @{
    name = $o.Name; state = 'starting'; supervisor_pid = $null; child_pid = $null
    command = @($programPath) + @($parsed.Command | Select-Object -Skip 1)
    work_dir = $workDir; log = $logPath; commit_limit_bytes = $limitBytes
    peak_job_commit_bytes = 0; memory_limit_reached = $false; exit_code = $null
    started_at = (Get-Date).ToString('o'); ended_at = $null; error = $null
}
Write-JobStatus $statusPath $status
$spec = @{
    status_path = $statusPath; status = $status; exe = $programPath
    args = @($parsed.Command | Select-Object -Skip 1)
    environment = @($environment.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })
}
[IO.File]::WriteAllText($specPath, ($spec | ConvertTo-Json -Depth 6 -Compress), [Text.UTF8Encoding]::new($false))

$powershell = Join-Path $PSHOME 'powershell.exe'
$supervisor = Join-Path $PSScriptRoot 'job-supervisor.ps1'
$commandLine = "`"$powershell`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`" -SpecPath `"$specPath`""

# CREATE_BREAKAWAY_FROM_JOB keeps the supervisor out of the WMI provider job (and its quotas)
# when that job allows it; otherwise launch without the flag.
function Start-Supervisor([uint32]$Flags) {
    $startup = New-CimInstance -ClassName Win32_ProcessStartup -Namespace root/cimv2 -ClientOnly -Property @{ ShowWindow = [uint16]0; CreateFlags = $Flags }
    return Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = $commandLine; CurrentDirectory = $workDir; ProcessStartupInformation = $startup
    }
}
$created = Start-Supervisor 0x01000000
if ($created.ReturnValue -ne 0) { $created = Start-Supervisor 0 }
if ($created.ReturnValue -ne 0) {
    Remove-Item -LiteralPath $specPath -Force -ErrorAction SilentlyContinue
    $status.state = 'failed'; $status.error = "Win32_Process.Create returned $($created.ReturnValue)"
    Write-JobStatus $statusPath $status
    [Console]::Error.WriteLine("windows-jobs: could not start the supervisor ($($status.error))")
    exit 3
}

$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Milliseconds 100
    $current = Read-JobStatus $statusPath
} while ($current.state -eq 'starting' -and (Get-Date) -lt $deadline -and (Test-ProcessAlive $created.ProcessId))

if ($current.state -eq 'starting') {
    # A supervisor that is still alive could start the job after we report failure: end it first.
    if (Test-ProcessAlive $created.ProcessId) { & taskkill.exe /T /F /PID $created.ProcessId 2>&1 | Out-Null }
    Remove-Item -LiteralPath $specPath -Force -ErrorAction SilentlyContinue
    $status.state = 'failed'; $status.error = 'supervisor did not start the job within 30 s'
    Write-JobStatus $statusPath $status
}
$result = Read-JobStatus $statusPath
[ordered]@{
    name = $result.name; state = $result.state; supervisor_pid = $result.supervisor_pid; child_pid = $result.child_pid
    status = $statusPath; log = $result.log; error = $result.error
} | ConvertTo-Json -Compress
$claim.Dispose()
if ($result.state -eq 'failed') { exit 3 }
exit 0
