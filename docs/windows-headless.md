# Headless PI on Windows

How to run `pi -p` unattended on a Windows machine (for example a shared GPU server) without
stuck processes, lost jobs, exhausted memory or work landing on the wrong GPU.

## Launching PI

- `pi` resolves to the npm shim `pi.ps1`, which Windows cannot start as a program
  (`Start-Process pi` fails with "not a valid Win32 application"). Launch `cmd.exe /c pi.cmd -p "..."`,
  or better `node.exe "<npm root>\@earendil-works\pi-coding-agent\dist\bundle\cli.js" -p "..."`:
  no cmd wrapper, and the PID you hold is the real PI process.
- Close stdin (`< NUL` in cmd, `< /dev/null` in bash) so nothing waits for input.
- To keep a headless PI alive after the SSH session that started it ends, start it with
  `skills/windows-jobs/scripts/run-job.ps1` (below) instead of WMI by hand: you also get a status
  file and a clean stop.

## Exit codes a supervisor must check

| Code | Meaning | Supervisor action |
| :--- | :--- | :--- |
| `0` | Finished. | Read the result. |
| `1` | Ended on an error (provider error, abort, length). | Inspect the log before relaunching. |
| `75` | Provider quota or credits exhausted (`quota-exit` extension). | Do not relaunch until the quota resets. |

`--mode json` exits `0` on provider errors other than quota: read the final `stopReason` instead.
Relaunching on every exit without checking the code is how a quota error turned into a loop of
sessions dying every 13 s.

## Long jobs: `run-job.ps1`

A job started inside a bash call dies with that call's timeout (`taskkill /T` on the call's tree),
and anything left among PI's descendants is ended by `process-reaper` when a headless run finishes.
For training, runners and benchmarks that must outlive the run, use the `windows-jobs` skill:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File ~/.pi/agent/skills/windows-jobs/scripts/run-job.ps1 \
  -Name t1z-r11 -CommitLimitGB 24 -GpuUuid GPU-08055392-87d6-8287-947d-0bf94c711445 -GpuName 5070 \
  -- D:/venv/Scripts/python.exe train.py --epochs 30
```

It prints one JSON line (`supervisor_pid`, `child_pid`, `status`, `log`) and returns. The job runs
inside a Job Object: one commit cap for the whole tree, stdin closed, output in the log, and every
leftover process killed when the root exits. `<name>.status.json` in the log directory
(default `%TEMP%\pi-jobs`) holds the state (`running`, `exited`, `stopped`, `failed`), exit code,
peak commit and `memory_limit_reached`. Stop it with `stop-job.ps1 -Name <name>`.

In headless runs on Windows the `detach-guard` extension refuses the untracked ways to detach
(WMI `Win32_Process.Create`, `Start-Process` without `-Wait`, `cmd /c start` without `/wait`,
`schtasks /create`, `-EncodedCommand`) and points to `run-job.ps1`.

## Memory: measure commit, not working set

Windows refuses allocations when the **commit charge** (memory promised to processes) reaches the
commit limit (RAM + page file), even with physical RAM free. GPU processes commit far more than they
touch: under WDDM, CUDA allocations, the CUDA context and the CUDA DLLs are charged to the process,
and every `spawn` DataLoader worker re-imports torch (about 1.4 GB each on the dense server).

- Watch commit (`PrivateMemorySize64`, `Win32_OperatingSystem.FreeVirtualMemory`, or the job's
  `peak_job_commit_bytes`), not `WorkingSet64`/RSS: those undercount GPU jobs by 2–3.5×.
- Size `-CommitLimitGB` as host memory + GPU memory the job allocates + about 4 GB for CUDA
  libraries. A cap that ignores the GPU share fails with "CUDA out of memory" while VRAM is mostly
  free. The recorded peak can overshoot the cap by a few percent.
- Prefer one short-lived process per video or unit of work: the allocator and CUDA caches are
  returned to Windows only when the process exits.

## GPU selection

On multi-GPU machines pin by UUID with `-GpuUuid` (and `-GpuName` as a check), never by index:
`nvidia-smi` numbers by PCI bus, CUDA defaults to fastest-first, and Ultralytics `select_device`
rewrites `CUDA_VISIBLE_DEVICES`. The skill's `cuda-pin` keeps every Python process of the job on
the pinned card and stops it if that card is missing. Hardware video decode (D3D11VA/DXVA2, Media
Foundation) and DirectML choose a DXGI adapter and ignore CUDA masks: decode on the CPU.
