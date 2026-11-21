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

// ---------------------------------------------------------------------------------------------
// Section 2 — run-job / stop-job (#84 #89 #90), Windows only, real Job Objects and processes.
// A long job must: outlive the Pi that launched it (timeout kill / process-reaper), run under a
// commit cap that covers the whole tree, keep no orphan after the root exits or after stop-job,
// get its environment explicitly (WMI-launched processes do not inherit the caller's), and leave
// a status file with PID, exit code and peak commit.
// ---------------------------------------------------------------------------------------------
const runJob = path.join(skillScripts, "run-job.ps1");
const stopJob = path.join(skillScripts, "stop-job.ps1");
const PS_ARGS = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"];

function ps(script, args, opts = {}) {
  return spawnSync("powershell.exe", [...PS_ARGS, script, ...args], { encoding: "utf8", timeout: 120_000, ...opts });
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, ms, label) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`);
    await sleep(200);
  }
}

function readStatus(logDir, name) {
  try {
    return JSON.parse(readFileSync(path.join(logDir, `${name}.status.json`), "utf8"));
  } catch {
    return null;
  }
}

const finished = (logDir, name) => () => {
  const s = readStatus(logDir, name);
  return s && ["exited", "failed", "stopped"].includes(s.state) ? s : null;
};
const running = (logDir, name) => () => {
  const s = readStatus(logDir, name);
  return s?.state === "running" ? s : null;
};
const lastLine = (file) => JSON.parse(readFileSync(file, "utf8").trim().split(/\r?\n/).at(-1));
const listDir = (dir) => { try { return readdirSync(dir); } catch { return []; } };

async function runJobSection() {
  if (process.platform !== "win32") {
    console.log("SKIP run-job: Windows only");
    return;
  }
  const logDir = path.join(scratch, "jobs");
  const kids = path.join(scratch, "kids");
  const node = process.execPath;
  write(path.join(kids, "echo.js"), `
let stdin = "";
process.stdin.on("data", (d) => { stdin += d; });
process.stdin.on("end", () => {
  const pick = (k) => process.env[k] ?? null;
  console.log(JSON.stringify({ args: process.argv.slice(2), env: {
    PI_TEST_VAR: pick("PI_TEST_VAR"), PI_CUDA_PIN_UUID: pick("PI_CUDA_PIN_UUID"), PI_CUDA_PIN_NAME: pick("PI_CUDA_PIN_NAME"),
    CUDA_DEVICE_ORDER: pick("CUDA_DEVICE_ORDER"), CUDA_VISIBLE_DEVICES: pick("CUDA_VISIBLE_DEVICES"),
    PYTHONPATH: pick("PYTHONPATH"), PATH_SET: Boolean(process.env.PATH || process.env.Path) }, stdin, cwd: process.cwd() }));
  process.exit(Number(process.env.PI_TEST_EXIT ?? 0));
});
`);
  write(path.join(kids, "hog.js"), `
const held = [];
try { for (;;) held.push(Buffer.alloc(64 * 1024 * 1024, 1)); }
catch (error) { console.log("alloc failed after", held.length * 64, "MiB:", error.message); process.exit(9); }
`);
  write(path.join(kids, "tree.js"), `
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
fs.writeFileSync(process.argv[2], String(child.pid));
if (process.argv[3] === "exit") setTimeout(() => process.exit(0), 500);
else setInterval(() => {}, 1000);
`);
  write(path.join(kids, "flood.js"), `
const line = "x".repeat(1023) + "\\n";
let n = 0;
function pump() { while (n < 20 * 1024) { n++; if (!process.stdout.write(line)) return process.stdout.once("drain", pump); } }
pump();
`);
  const base = (name, extra = []) => ["-Name", name, "-CommitLimitGB", "2", "-LogDir", logDir, ...extra];
  const readPid = (file) => () => { try { return Number(readFileSync(file, "utf8")) || null; } catch { return null; } };

  // 2.1 Bad input is refused before anything starts (exit 2, no status file): missing name or
  // limit, path-like or overlong names, non-positive or non-numeric limits, index instead of GPU
  // UUID, GPU and CPU-only together, no command, malformed -SetEnv.
  const invalid = [
    [["-CommitLimitGB", "2", "-LogDir", logDir, "--", node, "-v"], "missing name"],
    [["-Name", "v1", "-LogDir", logDir, "--", node, "-v"], "missing limit"],
    [base("..\\evil", ["--", node, "-v"]), "path name"],
    [base("a".repeat(80), ["--", node, "-v"]), "long name"],
    [["-Name", "v2", "-CommitLimitGB", "0", "-LogDir", logDir, "--", node, "-v"], "zero limit"],
    [["-Name", "v3", "-CommitLimitGB", "-4", "-LogDir", logDir, "--", node, "-v"], "negative limit"],
    [["-Name", "v4", "-CommitLimitGB", "abc", "-LogDir", logDir, "--", node, "-v"], "text limit"],
    [["-Name", "v5", "-CommitLimitGB", "99999", "-LogDir", logDir, "--", node, "-v"], "limit above machine commit"],
    [base("v6", ["-GpuUuid", "1", "--", node, "-v"]), "index as gpu"],
    [base("v7", ["-GpuUuid", UUID_5070, "-CpuOnly", "--", node, "-v"]), "gpu and cpu"],
    [base("v8"), "no command"],
    [base("v8b", [node, "-v"]), "command without --"],
    [base("v8c", ["-Bogus", "1", "--", node, "-v"]), "unknown option"],
    [base("v8d", ["--", "definitely-not-a-program-xyz"]), "program not found"],
    [base("v9", ["-SetEnv", "1BAD=x", "--", node, "-v"]), "bad env key"],
    [base("v10", ["-SetEnv", "NOEQUALS", "--", node, "-v"]), "env without ="],
  ];
  for (const [args, label] of invalid) {
    const r = ps(runJob, args);
    assert.equal(r.status, 2, `${label}: ${r.stdout}${r.stderr}`);
  }
  assert.equal(listDir(logDir).some((f) => f.endsWith(".status.json")), false);

  // 2.2 Happy path: arguments with spaces and quotes reach the child intact, -SetEnv and the
  // caller's PATH arrive (explicit env block), stdin is closed (immediate EOF instead of a hang),
  // the working directory is honoured, and the status ends "exited" with exit code 0.
  {
    const r = ps(runJob, base("happy", ["-WorkDir", kids, "-SetEnv", "PI_TEST_VAR=hello world", "--", node, path.join(kids, "echo.js"), "--flag", "-v", "a b", 'say "hi"', "back\\slash\\", ""]));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const launched = JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
    assert.ok(launched.child_pid > 0 && launched.supervisor_pid > 0, r.stdout);
    const s = await waitFor(finished(logDir, "happy"), 30_000, "happy exit");
    assert.equal(s.state, "exited");
    assert.equal(s.exit_code, 0);
    const out = lastLine(s.log);
    assert.deepEqual(out.args, ["--flag", "-v", "a b", 'say "hi"', "back\\slash\\", ""]);
    assert.equal(out.env.PI_TEST_VAR, "hello world");
    assert.equal(out.env.PATH_SET, true);
    assert.equal(out.stdin, "");
    assert.equal(path.resolve(out.cwd).toLowerCase(), path.resolve(kids).toLowerCase());
    // 2.10 The spec (holds the caller's environment, possibly secrets) is gone once the job started.
    assert.equal(listDir(logDir).some((f) => f.endsWith(".spec.json")), false);
  }

  // 2.3 A failing job keeps its own exit code in the status file (supervisors decide on it).
  {
    assert.equal(ps(runJob, base("exit7", ["-SetEnv", "PI_TEST_EXIT=7", "--", node, path.join(kids, "echo.js")])).status, 0);
    assert.equal((await waitFor(finished(logDir, "exit7"), 30_000, "exit7")).exit_code, 7);
  }

  // 2.4 Commit cap: a job that keeps allocating is stopped by the Job Object at the cap instead
  // of draining the machine's commit; the status says the memory limit was reached.
  {
    assert.equal(ps(runJob, ["-Name", "hog", "-CommitLimitGB", "0.5", "-LogDir", logDir, "--", node, path.join(kids, "hog.js")]).status, 0);
    const s = await waitFor(finished(logDir, "hog"), 60_000, "hog");
    assert.notEqual(s.exit_code, 0);
    assert.equal(s.memory_limit_reached, true, JSON.stringify(s));
    // Windows enforces the cap on new commits; the recorded peak may overshoot it a little (~5%
    // observed), never by the amount a runaway job would take from the machine.
    const overshoot = s.peak_job_commit_bytes / (0.5 * 2 ** 30) - 1;
    console.log(`bench run-job cap 512 MiB: peak ${(s.peak_job_commit_bytes / 2 ** 20).toFixed(0)} MiB (${(overshoot * 100).toFixed(1)}% over)`);
    assert.ok(overshoot < 0.1, `peak ${s.peak_job_commit_bytes}`);
  }

  // 2.5 + 2.6 The job survives the death of whoever launched it: the launcher stays alive inside a
  // cmd tree that we kill with taskkill /T /F, exactly what a Pi bash timeout does (process-reaper
  // does the same at exit). Then stop-job ends the whole job tree, grandchild included.
  {
    const pidFile = path.join(scratch, "tree.pid");
    const { spawn } = await import("node:child_process");
    const cmdLine = `powershell.exe ${PS_ARGS.join(" ")} "${runJob}" -Name tree -CommitLimitGB 2 -LogDir "${logDir}" -- "${node}" "${path.join(kids, "tree.js")}" "${pidFile}" & ping -n 120 127.0.0.1 >nul`;
    const launcher = spawn("cmd.exe", ["/d", "/s", "/c", `"${cmdLine}"`], { windowsVerbatimArguments: true, stdio: "ignore" });
    const s = await waitFor(running(logDir, "tree"), 30_000, "tree running");
    const grandchild = await waitFor(readPid(pidFile), 30_000, "grandchild pid");
    spawnSync("taskkill", ["/T", "/F", "/PID", String(launcher.pid)], { encoding: "utf8" });
    await waitFor(() => !alive(launcher.pid), 10_000, "launcher killed");
    await sleep(1000);
    assert.ok(alive(s.child_pid), "job root must outlive its launcher tree");
    assert.ok(alive(grandchild), "grandchild still inside the running job");
    const stop = ps(stopJob, ["-Name", "tree", "-LogDir", logDir]);
    assert.equal(stop.status, 0, stop.stdout + stop.stderr);
    await waitFor(() => !alive(s.child_pid) && !alive(grandchild) && !alive(s.supervisor_pid), 15_000, "tree gone");
    assert.equal(readStatus(logDir, "tree").state, "stopped");
    // stop-job on a job that is no longer running is a clean no-op (exit 0).
    assert.equal(ps(stopJob, ["-Name", "tree", "-LogDir", logDir]).status, 0);
    // stop-job for an unknown or malformed name is an error (exit 2), never a guess.
    assert.equal(ps(stopJob, ["-Name", "nope", "-LogDir", logDir]).status, 2);
    assert.equal(ps(stopJob, ["-Name", "..\\x", "-LogDir", logDir]).status, 2);
  }

  // 2.7 No orphans: when the root exits, anything it left running in the job is killed with it.
  {
    const pidFile = path.join(scratch, "leftover.pid");
    assert.equal(ps(runJob, base("leftover", ["--", node, path.join(kids, "tree.js"), pidFile, "exit"])).status, 0);
    assert.equal((await waitFor(finished(logDir, "leftover"), 30_000, "leftover exit")).exit_code, 0);
    const grandchild = await waitFor(readPid(pidFile), 5_000, "leftover pid");
    await waitFor(() => !alive(grandchild), 10_000, "leftover grandchild killed");
  }

  // 2.8 GPU and CPU-only environments reach the child: -GpuUuid sets the cuda-pin variables and
  // puts cuda-pin first on PYTHONPATH; -CpuOnly hides every GPU with an empty mask.
  {
    assert.equal(ps(runJob, base("gpu", ["-GpuUuid", UUID_5070, "-GpuName", "5070", "--", node, path.join(kids, "echo.js")])).status, 0);
    const g = lastLine((await waitFor(finished(logDir, "gpu"), 30_000, "gpu")).log);
    assert.equal(g.env.PI_CUDA_PIN_UUID, UUID_5070);
    assert.equal(g.env.PI_CUDA_PIN_NAME, "5070");
    assert.equal(g.env.CUDA_DEVICE_ORDER, "PCI_BUS_ID");
    assert.equal(g.env.CUDA_VISIBLE_DEVICES, UUID_5070);
    assert.equal(path.resolve(g.env.PYTHONPATH.split(path.delimiter)[0]).toLowerCase(), path.resolve(cudaPinDir).toLowerCase());
    assert.equal(ps(runJob, base("cpu", ["-CpuOnly", "--", node, path.join(kids, "echo.js")])).status, 0);
    const c = lastLine((await waitFor(finished(logDir, "cpu"), 30_000, "cpu")).log);
    assert.equal(c.env.CUDA_VISIBLE_DEVICES, "");
    assert.equal(c.env.PI_CUDA_PIN_UUID, null);
  }

  // 2.9 A name that is still running is refused (two supervisors would fight over one status).
  {
    const pidFile = path.join(scratch, "dup.pid");
    assert.equal(ps(runJob, base("dup", ["--", node, path.join(kids, "tree.js"), pidFile])).status, 0);
    await waitFor(running(logDir, "dup"), 30_000, "dup running");
    assert.equal(ps(runJob, base("dup", ["--", node, path.join(kids, "echo.js")])).status, 2);
    assert.equal(ps(stopJob, ["-Name", "dup", "-LogDir", logDir]).status, 0);
  }

  // 2.9b Prova de fogo on the same check: 4 run-job calls with one name at the same instant. The
  // check-and-start window is serialised, so exactly one starts and the others are refused (exit 2).
  {
    const { spawn } = await import("node:child_process");
    const pidFile = path.join(scratch, "race.pid");
    const codes = await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve) => {
      const p = spawn("powershell.exe", [...PS_ARGS, runJob, ...base("race", ["--", node, path.join(kids, "tree.js"), pidFile])], { stdio: "ignore" });
      p.on("exit", resolve);
    })));
    assert.deepEqual(codes.sort(), [0, 2, 2, 2], `race exit codes ${codes}`);
    assert.equal(ps(stopJob, ["-Name", "race", "-LogDir", logDir]).status, 0);
    assert.equal(listDir(logDir).some((f) => f.endsWith(".claim")), false, "the claim is released");
  }

  // 2.11 Prova de fogo: 6 jobs launched at once stay distinct and all finish, and a job writing
  // 20 MiB of output gets every byte into its log (no pipe stall, no truncation).
  {
    const { spawn } = await import("node:child_process");
    const names = Array.from({ length: 6 }, (_, i) => `par${i}`);
    await Promise.all(names.map((name) => new Promise((resolve, reject) => {
      const p = spawn("powershell.exe", [...PS_ARGS, runJob, ...base(name, ["--", node, path.join(kids, "echo.js")])], { stdio: "ignore" });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${name} exit ${code}`))));
    })));
    const statuses = await Promise.all(names.map((name) => waitFor(finished(logDir, name), 60_000, name)));
    assert.equal(new Set(statuses.map((s) => s.child_pid)).size, 6);
    assert.ok(statuses.every((s) => s.exit_code === 0));
    assert.equal(ps(runJob, base("flood", ["--", node, path.join(kids, "flood.js")])).status, 0);
    const f = await waitFor(finished(logDir, "flood"), 60_000, "flood");
    assert.equal(statSync(f.log).size, 20 * 1024 * 1024);
  }

  // 2.12 Benchmark: time from run-job call to "running" status (median of 3) and the supervisor's
  // own commit, which counts against the machine while the job runs.
  {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      assert.equal(ps(runJob, base(`bench${i}`, ["--", node, path.join(kids, "tree.js"), path.join(scratch, `bench${i}.pid`)])).status, 0);
      const s = await waitFor(running(logDir, `bench${i}`), 30_000, "bench");
      samples.push(Date.now() - t0);
      if (i === 0) {
        const mem = spawnSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${s.supervisor_pid}).PrivateMemorySize64`], { encoding: "utf8" });
        console.log(`bench run-job supervisor commit: ${(Number(mem.stdout.trim()) / 2 ** 20).toFixed(0)} MiB`);
      }
      assert.equal(ps(stopJob, ["-Name", `bench${i}`, "-LogDir", logDir]).status, 0);
    }
    console.log(`bench run-job launch-to-running: median ${samples.sort((a, b) => a - b)[1]} ms`);
  }
  console.log("ok run-job");
}

// ---------------------------------------------------------------------------------------------
// Section 3 — real CUDA + real Ultralytics (optional). Runs only when PI_TEST_REAL_CUDA_PYTHON
// points to a Python with torch (CUDA) and ultralytics, plus PI_TEST_REAL_CUDA_UUID / _NAME of a
// GPU present on this machine. It proves on real software what Section 1 proves on stubs.
// ---------------------------------------------------------------------------------------------
async function realCudaSection() {
  const py = process.env.PI_TEST_REAL_CUDA_PYTHON;
  const uuid = process.env.PI_TEST_REAL_CUDA_UUID;
  const name = process.env.PI_TEST_REAL_CUDA_NAME;
  if (!py || !uuid || !name || process.platform !== "win32") {
    console.log("SKIP real-cuda: set PI_TEST_REAL_CUDA_PYTHON, PI_TEST_REAL_CUDA_UUID and PI_TEST_REAL_CUDA_NAME");
    return;
  }
  const yoloDir = path.join(scratch, "yolo-config");
  mkdirSync(yoloDir, { recursive: true });
  const probe = path.join(scratch, "real_probe.py");
  write(probe, `
import json, os, subprocess, sys
import torch
from ultralytics.utils.torch_utils import select_device
device = select_device("0", verbose=False)
child = subprocess.run([sys.executable, "-c", "import os; print(os.environ.get('CUDA_VISIBLE_DEVICES', '<unset>'))"],
                       capture_output=True, text=True)
print(json.dumps({"device": str(device), "name": torch.cuda.get_device_name(0),
                  "env_after": os.environ.get("CUDA_VISIBLE_DEVICES"), "child_env": child.stdout.strip()}))
`);
  const absent = "GPU-00000000-0000-0000-0000-000000000000";
  const env = { ...process.env, YOLO_CONFIG_DIR: yoloDir, YOLO_OFFLINE: "True", PYTHONDONTWRITEBYTECODE: "1" };
  delete env.PI_CUDA_PIN_UUID;
  delete env.PI_CUDA_PIN_NAME;

  // 3.1 Control on real Ultralytics 8.4.x without cuda-pin: the launcher pins the GPU by UUID and
  // select_device("0") leaves CUDA_VISIBLE_DEVICES="0" in the process and in every child. On a
  // single-GPU machine "0" is the same card, so the jump itself is only visible on a multi-GPU box
  // (dense: ITEM446_stage1.stdout.log shows CUDA:0 = RTX 3060); the rewrite is what we prove here.
  {
    const r = spawnSync(py, [probe], { encoding: "utf8", timeout: 180_000,
      env: { ...env, CUDA_DEVICE_ORDER: "PCI_BUS_ID", CUDA_VISIBLE_DEVICES: uuid } });
    assert.equal(r.status, 0, r.stderr);
    const out = lastJson(r.stdout);
    assert.equal(out.env_after, "0");
    assert.equal(out.child_env, "0");
    console.log(`real-cuda control: launcher pinned ${uuid.slice(0, 12)}..., Ultralytics left CUDA_VISIBLE_DEVICES="0" (child too)`);
  }

  // 3.2 A pin to a GPU that is not on this machine, through run-job -GpuUuid (cuda-pin active):
  // the job stops with a cuda-pin message naming the problem.
  const logDir = path.join(scratch, "real-jobs");
  {
    assert.equal(ps(runJob, ["-Name", "real-absent", "-CommitLimitGB", "12", "-LogDir", logDir, "-GpuUuid", absent,
      "-SetEnv", `YOLO_CONFIG_DIR=${yoloDir}`, "--", py, probe]).status, 0);
    const s = await waitFor(finished(logDir, "real-absent"), 180_000, "real-absent");
    assert.notEqual(s.exit_code, 0);
    assert.match(readFileSync(s.log, "utf8"), /cuda-pin/);
  }

  // 3.3 Pinned to the real GPU by UUID with the expected name: runs on it, and the mask stays the
  // UUID after select_device, also in a child process.
  {
    assert.equal(ps(runJob, ["-Name", "real-ok", "-CommitLimitGB", "12", "-LogDir", logDir, "-GpuUuid", uuid, "-GpuName", name,
      "-SetEnv", `YOLO_CONFIG_DIR=${yoloDir}`, "--", py, probe]).status, 0);
    const s = await waitFor(finished(logDir, "real-ok"), 180_000, "real-ok");
    assert.equal(s.exit_code, 0, readFileSync(s.log, "utf8"));
    const out = lastJson(readFileSync(s.log, "utf8"));
    assert.ok(out.name.includes(name));
    assert.equal(out.env_after, uuid);
    assert.equal(out.child_env, uuid);
    console.log(`real-cuda pinned: ran on "${out.name}", peak job commit ${(s.peak_job_commit_bytes / 2 ** 30).toFixed(2)} GiB`);
  }

  // 3.4 Wrong expected name for the real GPU: stops with a cuda-pin error before any model work.
  {
    assert.equal(ps(runJob, ["-Name", "real-name", "-CommitLimitGB", "12", "-LogDir", logDir, "-GpuUuid", uuid, "-GpuName", "5070",
      "-SetEnv", `YOLO_CONFIG_DIR=${yoloDir}`, "--", py, probe]).status, 0);
    const s = await waitFor(finished(logDir, "real-name"), 180_000, "real-name");
    assert.notEqual(s.exit_code, 0);
    assert.match(readFileSync(s.log, "utf8"), /cuda-pin.*expected a name containing '5070'/);
  }
  console.log("ok real-cuda");
}

try {
  await cudaPinSection();
  await runJobSection();
  await realCudaSection();
} finally {
  // Cleanup of only what this test created: stop every job it left running (a failed assertion can
  // leave one), then remove the owned mkdtemp.
  if (process.platform === "win32") {
    for (const dir of ["jobs", "real-jobs"].map((name) => path.join(scratch, name))) {
      for (const file of listDir(dir).filter((f) => f.endsWith(".status.json"))) {
        const name = file.slice(0, -".status.json".length);
        if (["starting", "running"].includes(readStatus(dir, name)?.state)) ps(stopJob, ["-Name", name, "-LogDir", dir]);
      }
    }
  }
  try {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch (error) {
    // Never let a cleanup error hide the assertion that failed.
    console.error(`cleanup: could not remove ${scratch}: ${error.message}`);
  }
}
