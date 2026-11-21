// Windows headless runs: GPU pinning (#85), long jobs in a Job Object (#84 #89 #90),
// untracked detach guard (#89) and the bash-timeout guidance that points to them.
// Every section says what it tests, what it expects and why, so a failure can be fixed in place.
// All files and processes created here live under one owned mkdtemp, removed in `finally`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const skillScripts = path.join(root, "skills", "windows-jobs", "scripts");
const cudaPinDir = path.join(skillScripts, "cuda-pin");
const scratch = mkdtempSync(path.join(os.tmpdir(), "pi-windows-headless-"));

function python() {
  for (const candidate of ["python", "python3"]) {
    const probe = spawnSync(candidate, ["-c", "print(1)"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function write(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// ---------------------------------------------------------------------------------------------
// Section 1 — cuda-pin (#85)
// Stubs reproduce the dense layout: physical (PCI) GPU 0 = RTX 3060, GPU 1 = RTX 5070 Ti.
// The Ultralytics stub copies the 8.4.19 `select_device` behaviour that caused the incidents:
// it overwrites CUDA_VISIBLE_DEVICES with the requested device ("0") before CUDA initialises.
// ---------------------------------------------------------------------------------------------
const UUID_3060 = "GPU-13916c7e-aa3c-fa5e-48ef-7b8cca10ea99";
const UUID_5070 = "GPU-08055392-87d6-8287-947d-0bf94c711445";

function writeCudaStubs(dir) {
  write(path.join(dir, "torch", "__init__.py"), `
import os, threading
_PHYSICAL = [("${UUID_3060}", "NVIDIA GeForce RTX 3060"), ("${UUID_5070}", "NVIDIA GeForce RTX 5070 Ti")]

def _visible(mask):
    if mask is None:
        return list(_PHYSICAL)
    out = []
    for token in [t.strip() for t in mask.split(",") if t.strip()]:
        hit = None
        if token.isdigit() and int(token) < len(_PHYSICAL):
            hit = _PHYSICAL[int(token)]
        elif token.startswith("GPU-"):
            matches = [g for g in _PHYSICAL if g[0].startswith(token)]
            hit = matches[0] if len(matches) == 1 else None
        if hit is None:
            break  # CUDA hides every entry after an invalid one
        out.append(hit)
    return out

class _Cuda:
    def __init__(self):
        self._lock = threading.Lock()
        self.init_count = 0
        self.init_mask = None
        self._devices = None
    def init(self):
        with self._lock:
            if self._devices is None:
                self.init_count += 1
                self.init_mask = os.environ.get("CUDA_VISIBLE_DEVICES")
                self._devices = _visible(self.init_mask)
    def is_initialized(self):
        return self._devices is not None
    def is_available(self):
        self.init()
        return len(self._devices) > 0
    def device_count(self):
        self.init()
        return len(self._devices)
    def get_device_name(self, index=0):
        self.init()
        return self._devices[index][1]

cuda = _Cuda()
`);
  write(path.join(dir, "ultralytics", "__init__.py"), "");
  write(path.join(dir, "ultralytics", "utils", "__init__.py"), "");
  write(path.join(dir, "ultralytics", "utils", "torch_utils.py"), `
import os, torch

def select_device(device="", batch=0, newline=False, verbose=True):
    device = str(device).lower()
    for remove in "cuda:", "none", "(", ")", "[", "]", "'", " ":
        device = device.replace(remove, "")
    cpu = device == "cpu"
    if cpu:
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
    elif device:
        if device == "cuda":
            device = "0"
        os.environ["CUDA_VISIBLE_DEVICES"] = device
        if not (torch.cuda.is_available() and torch.cuda.device_count() >= len(device.split(","))):
            raise ValueError(f"Invalid CUDA 'device={device}' requested.")
    return "cpu" if cpu or not torch.cuda.is_available() else "cuda:0"
`);
}

// Runs `code` in a fresh interpreter. `pin` = PYTHONPATH gets cuda-pin first (as run-job does).
function runPython(py, stubs, code, env, pin = true) {
  const pythonPath = [pin ? cudaPinDir : null, stubs].filter(Boolean).join(path.delimiter);
  const childEnv = { ...process.env, PYTHONPATH: pythonPath, PYTHONDONTWRITEBYTECODE: "1", ...env };
  for (const [key, value] of Object.entries(childEnv)) if (value === undefined) delete childEnv[key];
  return spawnSync(py, ["-c", code], { encoding: "utf8", env: childEnv, timeout: 60_000 });
}

const REPORT = `
import json, os, subprocess, sys, torch
from ultralytics.utils.torch_utils import select_device
result = {"device": select_device(DEVICE)}
child = subprocess.run([sys.executable, "-c", "import os; print(os.environ.get('CUDA_VISIBLE_DEVICES', '<unset>'))"],
                       capture_output=True, text=True)
result.update(init_mask=torch.cuda.init_mask, init_count=torch.cuda.init_count,
              env_after=os.environ.get("CUDA_VISIBLE_DEVICES"), child_env=child.stdout.strip(),
              name=torch.cuda.get_device_name(0) if torch.cuda.is_initialized() and torch.cuda.device_count() else None)
print(json.dumps(result))
`;
const report = (device) => REPORT.replace("DEVICE", JSON.stringify(device));
const lastJson = (out) => JSON.parse(out.trim().split(/\r?\n/).at(-1));

async function cudaPinSection() {
  const py = python();
  if (!py) {
    console.log("SKIP cuda-pin: no python on PATH");
    return;
  }
  const stubs = path.join(scratch, "cuda-stubs");
  writeCudaStubs(stubs);
  const pinned = { CUDA_DEVICE_ORDER: "PCI_BUS_ID", CUDA_VISIBLE_DEVICES: UUID_5070, PI_CUDA_PIN_UUID: UUID_5070, PI_CUDA_PIN_NAME: "5070" };

  // 1.1 Control (no cuda-pin): reproduces the dense incident. Launcher pinned GPU 1 by PCI order,
  // Ultralytics rewrote the mask to "0", CUDA came up on the 3060. If this stops failing the stub
  // no longer reproduces the bug and every other cuda-pin assertion proves nothing.
  {
    const r = runPython(py, stubs, report("0"), { CUDA_DEVICE_ORDER: "PCI_BUS_ID", CUDA_VISIBLE_DEVICES: "1", PI_CUDA_PIN_UUID: undefined }, false);
    assert.equal(r.status, 0, r.stderr);
    const out = lastJson(r.stdout);
    assert.equal(out.init_mask, "0");
    assert.match(out.name, /3060/);
    assert.equal(out.child_env, "0", "children inherit the rewritten mask");
  }

  // 1.2 Pinned: CUDA must initialise under the pinned UUID (the 5070), the mask must be restored
  // after select_device, and a child process must inherit the UUID, never "0".
  {
    const r = runPython(py, stubs, report("0"), pinned);
    assert.equal(r.status, 0, r.stderr);
    const out = lastJson(r.stdout);
    assert.equal(out.init_mask, UUID_5070);
    assert.match(out.name, /5070/);
    assert.equal(out.env_after, UUID_5070);
    assert.equal(out.child_env, UUID_5070);
    assert.equal(out.device, "cuda:0");
  }

  // 1.3 Device spellings Ultralytics accepts ("cuda:0", "cuda", 0) take the same protected path.
  for (const device of ["cuda:0", "cuda", 0]) {
    const out = lastJson(runPython(py, stubs, report(device), pinned).stdout);
    assert.equal(out.init_mask, UUID_5070, `device ${device}`);
    assert.equal(out.env_after, UUID_5070, `device ${device}`);
  }

  // 1.4 CPU request: Ultralytics blanks the mask; we restore the pin so later children keep the
  // 5070, and CUDA is never initialised by the guard for a CPU run.
  {
    const out = lastJson(runPython(py, stubs, report("cpu"), pinned).stdout);
    assert.equal(out.device, "cpu");
    assert.equal(out.env_after, UUID_5070);
    assert.equal(out.init_count, 0);
  }

  // 1.5 Wrong card behind the pin (expected name 5070, UUID of the 3060): must stop before any
  // model work with a cuda-pin message, never silently continue on the wrong GPU.
  {
    const r = runPython(py, stubs, report("0"), { ...pinned, PI_CUDA_PIN_UUID: UUID_3060, CUDA_VISIBLE_DEVICES: UUID_3060 });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /cuda-pin/);
    assert.match(r.stderr, /3060/);
  }

  // 1.6 Pinned GPU absent (UUID not on this machine): fail closed instead of letting Ultralytics
  // fall back to physical GPU 0.
  {
    const r = runPython(py, stubs, report("0"), { ...pinned, PI_CUDA_PIN_UUID: "GPU-00000000-dead", CUDA_VISIBLE_DEVICES: "GPU-00000000-dead" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /cuda-pin/);
  }

  // 1.7 Malformed pin values (index instead of UUID, empty, injection-like text) are refused at
  // interpreter start: an index would depend on CUDA_DEVICE_ORDER, which is what broke 99 R8.
  for (const bad of ["1", "", "GPU-", "GPU-x; rm -rf /", "GPU-abc,GPU-def"]) {
    const r = runPython(py, stubs, "print('ran')", { ...pinned, PI_CUDA_PIN_UUID: bad });
    assert.notEqual(r.status, 0, `pin ${JSON.stringify(bad)} must be refused`);
    assert.doesNotMatch(r.stdout, /ran/);
    assert.match(r.stderr, /cuda-pin/);
  }

  // 1.8 Without PI_CUDA_PIN_UUID the module is inert: plain Python keeps the original behaviour
  // (no patch, no torch import), so installing it never changes unrelated runs.
  {
    const r = runPython(py, stubs, "import sys; print('torch' in sys.modules)", { PI_CUDA_PIN_UUID: undefined });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "False");
  }

  // 1.9 The pin is re-asserted at start even if the launcher left a different mask: what decides
  // the GPU is PI_CUDA_PIN_UUID, and CUDA_DEVICE_ORDER is forced to PCI_BUS_ID.
  {
    const code = "import os; print(os.environ['CUDA_VISIBLE_DEVICES'], os.environ['CUDA_DEVICE_ORDER'])";
    const r = runPython(py, stubs, code, { ...pinned, CUDA_VISIBLE_DEVICES: "0", CUDA_DEVICE_ORDER: "FASTEST_FIRST" });
    assert.equal(r.stdout.trim(), `${UUID_5070} PCI_BUS_ID`);
  }

  // 1.10 Another sitecustomize later on the path (venv/conda ship one) still runs: ours chains it.
  {
    const other = path.join(scratch, "other-site");
    write(path.join(other, "sitecustomize.py"), "import os\nos.environ['OTHER_SITE_RAN'] = '1'\n");
    const childEnv = { ...process.env, ...pinned, PYTHONPATH: [cudaPinDir, stubs, other].join(path.delimiter) };
    const r = spawnSync(py, ["-c", "import os; print(os.environ.get('OTHER_SITE_RAN'))"], { encoding: "utf8", env: childEnv });
    assert.equal(r.stdout.trim(), "1", r.stderr);
  }

  // 1.11 torch already initialised before select_device (runner verified the card first): the
  // mask Ultralytics wrote must still be undone, or children inherit "0".
  {
    const code = `import torch\ntorch.cuda.init()\n${report("0")}`;
    const out = lastJson(runPython(py, stubs, code, pinned).stdout);
    assert.equal(out.env_after, UUID_5070);
    assert.equal(out.child_env, UUID_5070);
    assert.equal(out.init_count, 1);
  }

  // 1.12 Prova de fogo: 8 threads x 250 select_device calls. CUDA initialises once, under the
  // pin, and the mask is the pin at the end (no thread can leave "0" behind).
  {
    const code = `
import json, os, threading, torch
from ultralytics.utils.torch_utils import select_device
errors = []
def worker():
    try:
        for _ in range(250):
            select_device("0")
    except Exception as exc:
        errors.append(repr(exc))
threads = [threading.Thread(target=worker) for _ in range(8)]
[t.start() for t in threads]; [t.join() for t in threads]
print(json.dumps({"errors": errors, "init_count": torch.cuda.init_count, "init_mask": torch.cuda.init_mask,
                  "env": os.environ.get("CUDA_VISIBLE_DEVICES")}))
`;
    const r = runPython(py, stubs, code, pinned);
    assert.equal(r.status, 0, r.stderr);
    const out = lastJson(r.stdout);
    assert.deepEqual(out.errors, []);
    assert.equal(out.init_count, 1);
    assert.equal(out.init_mask, UUID_5070);
    assert.equal(out.env, UUID_5070);
  }

  // 1.13 Benchmark: startup cost of the guard when active but unused (median of 7 runs). It runs
  // in every Python process of a pinned job, so it must stay small (no torch import at start).
  {
    const time = (env, pin) => {
      const samples = [];
      for (let i = 0; i < 7; i++) {
        const t0 = process.hrtime.bigint();
        runPython(py, stubs, "pass", env, pin);
        samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      return samples.sort((a, b) => a - b)[3];
    };
    const base = time({ PI_CUDA_PIN_UUID: undefined }, false);
    const guarded = time(pinned, true);
    console.log(`bench cuda-pin startup: base ${base.toFixed(0)} ms, guarded ${guarded.toFixed(0)} ms`);
    assert.ok(guarded - base < 150, `guard adds ${(guarded - base).toFixed(0)} ms at startup`);
  }
  console.log("ok cuda-pin");
}

try {
  await cudaPinSection();
} finally {
  try {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch (error) {
    // Never let a cleanup error hide the assertion that failed.
    console.error(`cleanup: could not remove ${scratch}: ${error.message}`);
  }
}
