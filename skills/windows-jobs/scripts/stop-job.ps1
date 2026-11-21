# Stops a job started by run-job.ps1: kills its supervisor, which closes the Job Object and so
# ends every process of the job tree, then marks the status "stopped".
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File stop-job.ps1 -Name <name> [-LogDir <dir>]
#
# Exit codes: 0 stopped, already finished or lost, 2 bad input or unknown job, 3 the tree did not stop.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'job-common.ps1')

$o = (Read-JobArguments $args @('Name', 'LogDir') @()).Options
Assert-JobName $o.Name
$logDir = if ($o.LogDir) { $o.LogDir } else { Join-Path $env:TEMP 'pi-jobs' }
$statusPath = Get-StatusPath $logDir $o.Name
$current = Read-JobStatus $statusPath
if (-not $current) { Stop-WithUsage "no job named '$($o.Name)' in $logDir" }
if ($script:ActiveStates -notcontains $current.state) { exit 0 }
$status = ConvertTo-StatusTable $current
$status.ended_at = (Get-Date).ToString('o')

# Supervisor gone (or its PID now belongs to another process): its Job Object closed with it, so the
# tree is already dead. Record that and touch nothing.
if (-not (Test-SupervisorAlive $current)) {
    $status.state = 'lost'
    Write-JobStatus $statusPath $status
    exit 0
}

& taskkill.exe /T /F /PID $current.supervisor_pid 2>&1 | Out-Null
$deadline = (Get-Date).AddSeconds(10)
while (((Test-SupervisorAlive $current) -or (Test-ProcessAlive $current.child_pid)) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 100
}
if (Test-SupervisorAlive $current) {
    [Console]::Error.WriteLine("windows-jobs: job '$($o.Name)' did not stop within 10 s")
    exit 3
}
$status.state = 'stopped'
Write-JobStatus $statusPath $status
exit 0
