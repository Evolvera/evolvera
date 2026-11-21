"""Pin every Python process of a job to one GPU, by UUID, even through Ultralytics.

Active only when PI_CUDA_PIN_UUID is set (run-job.ps1 sets it and puts this directory first on
PYTHONPATH). Ultralytics `select_device` writes CUDA_VISIBLE_DEVICES=<device> ("0") before CUDA
initialises; with CUDA_DEVICE_ORDER=PCI_BUS_ID that is physical GPU 0, so a job pinned to another
card silently lands on GPU 0 and its children inherit "0". Here we:
  1. refuse a pin that is not a single GPU UUID (an index depends on CUDA_DEVICE_ORDER);
  2. force CUDA_DEVICE_ORDER=PCI_BUS_ID and CUDA_VISIBLE_DEVICES=<uuid> at interpreter start;
  3. wrap `select_device`: initialise CUDA under the pin first (later mask changes no longer move
     this process), check the card name (PI_CUDA_PIN_NAME), then restore the pin for children.
Torch is imported only inside the wrapper, so CPU-only processes pay nothing.
"""

import functools
import importlib.abc
import importlib.machinery
import importlib.util
import os
import re
import sys
import threading

_UUID = re.compile(r"^GPU-[0-9a-fA-F]{4,}(?:-[0-9a-fA-F]+)*$")
_TARGET = "ultralytics.utils.torch_utils"
_lock = threading.Lock()


def _fail(message):
    raise SystemExit(f"cuda-pin: {message}")


def _pin():
    value = os.environ.get("PI_CUDA_PIN_UUID")
    if value is None:
        return None
    if not _UUID.match(value):
        _fail(f"PI_CUDA_PIN_UUID must be one GPU UUID (GPU-xxxx...), got {value!r}")
    return value


def _lock_cuda(pin):
    """Initialise CUDA under the pinned mask and check it is the expected card."""
    import torch

    if not torch.cuda.is_initialized():
        os.environ["CUDA_VISIBLE_DEVICES"] = pin
    if not torch.cuda.is_available() or torch.cuda.device_count() < 1:
        _fail(f"pinned GPU {pin} is not visible to CUDA; refusing to fall back to another GPU")
    name = torch.cuda.get_device_name(0)
    expected = os.environ.get("PI_CUDA_PIN_NAME")
    if expected and expected.lower() not in name.lower():
        _fail(f"pinned GPU is {name!r}, expected a name containing {expected!r}")


def _guard(select_device, pin):
    @functools.wraps(select_device)
    def guarded(device="", *args, **kwargs):
        with _lock:
            wants_cuda = str(device).strip().lower() not in ("cpu", "mps", "mps:0")
            try:
                if wants_cuda:
                    _lock_cuda(pin)
                return select_device(device, *args, **kwargs)
            finally:
                os.environ["CUDA_VISIBLE_DEVICES"] = pin

    guarded.__cuda_pin__ = True
    return guarded


class _PatchLoader(importlib.abc.Loader):
    def __init__(self, loader, pin):
        self._loader = loader
        self._pin = pin

    def create_module(self, spec):
        return self._loader.create_module(spec)

    def exec_module(self, module):
        self._loader.exec_module(module)
        original = getattr(module, "select_device", None)
        if callable(original) and not getattr(original, "__cuda_pin__", False):
            module.select_device = _guard(original, self._pin)


class _PatchFinder(importlib.abc.MetaPathFinder):
    def __init__(self, pin):
        self._pin = pin

    def find_spec(self, name, path, target=None):
        if name != _TARGET:
            return None
        spec = importlib.machinery.PathFinder.find_spec(name, path)
        if spec is not None and spec.loader is not None:
            spec.loader = _PatchLoader(spec.loader, self._pin)
        return spec


def _chain_next_sitecustomize():
    """Run the next sitecustomize on sys.path (venv/conda ones), which ours shadows."""
    here = os.path.dirname(os.path.abspath(__file__))
    rest = [p for p in sys.path if os.path.abspath(p or os.getcwd()) != here]
    spec = importlib.machinery.PathFinder.find_spec("sitecustomize", rest)
    if spec is not None and spec.loader is not None:
        spec.loader.exec_module(importlib.util.module_from_spec(spec))


def _install():
    pin = _pin()
    if pin is not None:
        os.environ["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"
        os.environ["CUDA_VISIBLE_DEVICES"] = pin
        sys.meta_path.insert(0, _PatchFinder(pin))
    _chain_next_sitecustomize()


_install()
