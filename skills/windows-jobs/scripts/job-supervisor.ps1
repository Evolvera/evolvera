# Internal: started by run-job.ps1 through WMI. Reads and deletes the spec, runs the command in a
# Job Object (JobHost.cs), keeps <name>.status.json current, and records exit code and peak commit.
# When the root process exits the job handle is closed, which kills anything it left behind.
# A status write that fails must never end this process: its death would kill the job.
param([Parameter(Mandatory = $true)][string]$SpecPath)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'job-common.ps1')

function Save-Status([hashtable]$Status, [int]$Attempts = 1) {
    for ($i = 0; $i -lt $Attempts; $i++) {
        try { Write-JobStatus $spec.status_path $Status; return } catch { Start-Sleep -Seconds 1 }
    }
}

$spec = Get-Content -LiteralPath $SpecPath -Raw | ConvertFrom-Json
Remove-Item -LiteralPath $SpecPath -Force
$status = ConvertTo-StatusTable $spec.status
$status.supervisor_pid = $PID
$status.supervisor_start_ticks = Get-ProcessStartTicks $PID

try {
    Add-Type -Path (Join-Path $PSScriptRoot 'JobHost.cs')
    $job = [PiJobs.JobHost]::Start($spec.exe, [string[]]@($spec.args), $status.work_dir, [string[]]@($spec.environment), $status.log, [uint64]$status.commit_limit_bytes)
} catch {
    $status.state = 'failed'; $status.error = $_.Exception.Message; $status.ended_at = (Get-Date).ToString('o')
    Save-Status $status 120
    exit 3
}

$status.state = 'running'; $status.child_pid = $job.ProcessId
Save-Status $status 120
$lastWrite = Get-Date
while (-not $job.WaitForExit(1000)) {
    if (((Get-Date) - $lastWrite).TotalSeconds -ge 5) {
        $status.peak_job_commit_bytes = $job.PeakJobCommitBytes
        $status.memory_limit_reached = $job.MemoryLimitReached
        Save-Status $status
        $lastWrite = Get-Date
    }
}
$status.peak_job_commit_bytes = $job.PeakJobCommitBytes
$status.memory_limit_reached = $job.MemoryLimitReached
$status.exit_code = $job.ExitCode
$status.state = 'exited'; $status.ended_at = (Get-Date).ToString('o')
$job.Dispose()
Save-Status $status 120
