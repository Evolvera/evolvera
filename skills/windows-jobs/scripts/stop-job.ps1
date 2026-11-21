# Stops a job started by run-job.ps1: kills its supervisor, which closes the Job Object and so
# ends every process of the job tree, then marks the status "stopped".
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File stop-job.ps1 -Name <name> [-LogDir <dir>]
#
# Exit codes: 0 stopped or already finished, 2 bad input or unknown job, 3 the tree did not stop.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'job-common.ps1')

$o = (Read-JobArguments $args @('Name', 'LogDir') @()).Options
Assert-JobName $o.Name
$logDir = if ($o.LogDir) { $o.LogDir } else { Join-Path $env:TEMP 'pi-jobs' }
$statusPath = Get-StatusPath $logDir $o.Name
$current = Read-JobStatus $statusPath
if (-not $current) { Stop-WithUsage "no job named '$($o.Name)' in $logDir" }
if ($script:ActiveStates -notcontains $current.state) { exit 0 }

if (Test-ProcessAlive $current.supervisor_pid) {
    & taskkill.exe /T /F /PID $current.supervisor_pid 2>&1 | Out-Null
}
$deadline = (Get-Date).AddSeconds(10)
while (((Test-ProcessAlive $current.supervisor_pid) -or (Test-ProcessAlive $current.child_pid)) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 100
}
if ((Test-ProcessAlive $current.supervisor_pid) -or (Test-ProcessAlive $current.child_pid)) {
    [Console]::Error.WriteLine("windows-jobs: job '$($o.Name)' did not stop within 10 s")
    exit 3
}
$status = ConvertTo-StatusTable $current
$status.state = 'stopped'; $status.ended_at = (Get-Date).ToString('o')
Write-JobStatus $statusPath $status
exit 0
