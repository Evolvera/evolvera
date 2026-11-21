---
name: windows-jobs
description: Use on Windows when a Python/CUDA job must run on one specific GPU of a multi-GPU machine (pin by UUID, safe with Ultralytics). Not needed for short commands or single-GPU work.
---

# Windows jobs

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
