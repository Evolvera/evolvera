---
name: windows-jobs
description: Use on Windows when a Python/CUDA job must run on one specific GPU of a multi-GPU machine (pin by UUID, safe with Ultralytics), or when a long job (training, runner, benchmark) must outlive this Pi run with a memory cap. Not needed for short commands or single-GPU work.
---

# Windows jobs

## Run a long job that outlives this Pi run (run-job)

A job started inside a bash call dies with that call's timeout, and in headless runs `process-reaper` ends Pi's descendants at exit. `Start-Process`, WMI or `cmd start` escape both but are untracked (the `detach-guard` extension refuses them in headless runs). Use:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File ~/.pi/agent/skills/windows-jobs/scripts/run-job.ps1 \
  -Name <name> -CommitLimitGB <gb> [-LogDir <dir>] [-WorkDir <dir>] \
  [-GpuUuid GPU-xxxx [-GpuName 5070] | -CpuOnly] [-SetEnv KEY=VALUE] -- <program.exe> [args...]
```

- Everything after `--` is passed to the program untouched. The program must be an `.exe` (`python.exe`, `node.exe`): run scripts through their interpreter.
- `-CommitLimitGB` caps committed memory for the whole job tree. On Windows/WDDM, GPU allocations count too: size it as host + GPU memory + about 4 GB for CUDA libraries.
- Prints one JSON line (`supervisor_pid`, `child_pid`, `status`, `log`) and returns. Exit codes: `0` started, `2` bad input or the name is already running, `3` failed to start.
- `<LogDir>/<name>.status.json` (default `%TEMP%\pi-jobs`) holds `state` (`running`, `exited`, `stopped`, `failed`, or `lost` when the supervisor is gone without a final status), `exit_code`, `peak_job_commit_bytes` and `memory_limit_reached`. Poll it with short commands. Output goes to `log`.
- stdin is closed. When the root process exits, anything it left running is killed.
- Stop: `stop-job.ps1 -Name <name> [-LogDir <dir>]` ends the whole tree.

## Pin a job to one GPU (cuda-pin)

`CUDA_VISIBLE_DEVICES` alone does not hold on Windows multi-GPU machines:

- An index (`1`) depends on `CUDA_DEVICE_ORDER`. CUDA defaults to fastest-first while `nvidia-smi` numbers by PCI bus, so the same number can mean another card.
- Ultralytics `select_device(device="0")` rewrites `CUDA_VISIBLE_DEVICES` to `"0"` before CUDA starts. With `PCI_BUS_ID` that is physical GPU 0, whatever the launcher pinned, and children inherit `"0"`.

`scripts/cuda-pin/sitecustomize.py` fixes both for every Python process that has its directory first on `PYTHONPATH`:

| Variable | Meaning |
| :--- | :--- |
| `PI_CUDA_PIN_UUID` | Required to activate. One GPU UUID (`GPU-xxxx…`, from `nvidia-smi -L`). An index is refused. |
| `PI_CUDA_PIN_NAME` | Optional. Text the card name must contain (e.g. `5070`); otherwise the process stops. |

With the pin set it forces `CUDA_DEVICE_ORDER=PCI_BUS_ID` and `CUDA_VISIBLE_DEVICES=<uuid>` at start, initialises CUDA under the pin before Ultralytics can move it, stops with `cuda-pin:` when the pinned card is missing or has the wrong name, and restores the pin afterwards so children keep it. Without `PI_CUDA_PIN_UUID` it does nothing.

Hardware video decode (D3D11VA/DXVA2, Media Foundation, DirectML) picks a DXGI adapter and ignores CUDA masks: decode on the CPU, or select the adapter explicitly.
