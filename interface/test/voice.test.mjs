import assert from "node:assert/strict";
import { test } from "node:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVoiceService, resolveWorkerCommand } from "../lib-server/voice.mjs";

const worker = (transcribe = async () => ({ text: "olá", device: "fake" })) => ({ device: "fake", model: "tiny", transcribe, stop: async () => {} });

// Worker command resolution distinguishes injected fakes, explicit interpreters, and platform defaults.
test("resolves worker executable and arguments for each supported launch mode", () => {
  assert.deepEqual(resolveWorkerCommand({ PI_STUDIO_VOICE_WORKER_CMD: '["fake.mjs"]' }, "win32", "worker.py"), { command: process.execPath, args: ["fake.mjs"] });
  assert.deepEqual(resolveWorkerCommand({ PI_STUDIO_PYTHON: "python-custom" }, "win32", "worker.py"), { command: "python-custom", args: ["worker.py"] });
  assert.deepEqual(resolveWorkerCommand({}, "win32", "worker.py"), { command: "py", args: ["-3.14", "worker.py"] });
  assert.deepEqual(resolveWorkerCommand({}, "linux", "worker.py"), { command: "python3", args: ["worker.py"] });
});

// Lazy startup keeps a successful worker warm until explicitly stopped.
test("starts lazily, stays warm, transcribes, and stops", async () => {
  let spawns = 0;
  const service = createVoiceService({ spawnWorker: async () => { spawns++; return worker(); }, idleMs: 100000 });
  assert.equal(service.status().state, "off");
  assert.equal(spawns, 0);
  assert.equal((await service.transcribe("a.wav")).text, "olá");
  assert.equal((await service.transcribe("b.wav")).text, "olá");
  assert.equal(spawns, 1);
  assert.equal(service.status().state, "ready");
  await service.stop();
  assert.equal(service.status().state, "off");
});

// A full three-request queue rejects additional work with the API's 429 status.
test("bounds queue length", async () => {
  const releases = [];
  const service = createVoiceService({ spawnWorker: async () => worker(() => new Promise((resolve) => { releases.push(() => resolve({ text: "ok" })); })), idleMs: 100000 });
  const requests = [service.transcribe("1"), service.transcribe("2"), service.transcribe("3")];
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(service.transcribe("4"), { status: 429 });
  for (const release of releases) release();
  await Promise.all(requests);
  await service.stop();
});

// Loading remains observable and requests wait for the worker readiness handshake.
test("reports loading while startup is pending and waits for readiness", async () => {
  let release;
  const service = createVoiceService({ spawnWorker: async () => new Promise((resolve) => { release = () => resolve(worker()); }), idleMs: 100000 });
  const pending = service.transcribe("during-load");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.status().state, "loading");
  release();
  assert.equal((await pending).text, "olá");
  await service.stop();
});

// Startup failures restore the off state and can be retried.
test("clears loading state after startup failure", async () => {
  let attempts = 0;
  const service = createVoiceService({ spawnWorker: async () => { attempts++; if (attempts === 1) throw new Error("boot failed"); return worker(); }, idleMs: 100000 });
  await assert.rejects(service.transcribe("fail"), /boot failed/);
  assert.equal(service.status().state, "off");
  assert.equal((await service.transcribe("retry")).text, "olá");
  await service.stop();
});

// stop waits for in-progress startup, then releases the newly ready worker.
test("stops a worker that finishes starting during shutdown", async () => {
  let release;
  let stopped = false;
  const service = createVoiceService({ spawnWorker: async () => new Promise((resolve) => { release = () => resolve({ ...worker(), stop: async () => { stopped = true; } }); }), idleMs: 100000 });
  const pending = service.transcribe("load");
  await new Promise((resolve) => setImmediate(resolve));
  const stopping = service.stop();
  release();
  await pending;
  await stopping;
  assert.equal(stopped, true);
});

// Missing worker and response device metadata falls back safely without inventing a device.
test("keeps device metadata absent when neither worker nor response reports it", async () => {
  const service = createVoiceService({ spawnWorker: async () => ({ transcribe: async () => ({ text: "ok" }), stop: async () => {} }), idleMs: 100000 });
  assert.deepEqual(await service.transcribe("missing-metadata"), { text: "ok" });
  assert.equal(service.status().device, null);
  await service.stop();
});

// Worker cleanup failures do not mask a transcription error or leave the service ready.
test("contains worker cleanup errors after a failed transcription", async () => {
  const service = createVoiceService({ spawnWorker: async () => ({ device: "fake", transcribe: async () => { throw new Error("decode failed"); }, stop: async () => { throw new Error("cleanup failed"); } }) });
  await assert.rejects(service.transcribe("bad-audio"), /decode failed/);
  assert.equal(service.status().state, "off");
});

// Timed-out work kills its worker so the next request can create a fresh one.
test("times out and respawns after a worker hang", async () => {
  let spawns = 0;
  const service = createVoiceService({ spawnWorker: async () => { spawns++; return worker(spawns === 1 ? () => new Promise(() => {}) : async () => ({ text: "recuperado" })); }, timeoutMs: 5, idleMs: 100000 });
  await assert.rejects(service.transcribe("hang"), /Tempo limite/);
  assert.equal((await service.transcribe("next")).text, "recuperado");
  assert.equal(spawns, 2);
  await service.stop();
});

// The HTTP-facing buffer helper removes its unique temporary audio after completion.
test("removes the temporary audio file after transcription", async () => {
  let file;
  const service = createVoiceService({ spawnWorker: async () => worker(async (path) => { file = path; return { text: "ok" }; }), idleMs: 100000 });
  await service.transcribeBuffer(Buffer.from("audio"));
  await assert.rejects(access(file));
  await service.stop();
});

// Idle shutdown releases the long-lived model without leaving a child running.
test("shuts down after the idle interval", async () => {
  let stopped = false;
  const service = createVoiceService({ spawnWorker: async () => ({ ...worker(), stop: async () => { stopped = true; } }), idleMs: 5 });
  await service.transcribe("audio");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(stopped, true);
  assert.equal(service.status().state, "off");
});

// A real protocol child exercises startup timeout and early process exit without model downloads.
test("worker startup timeout and startup crash fail cleanly", async () => {
  const oldCommand = process.env.PI_STUDIO_VOICE_WORKER_CMD;
  const oldMode = process.env.PI_STUDIO_FAKE_VOICE_MODE;
  const oldDelay = process.env.PI_STUDIO_FAKE_VOICE_DELAY;
  process.env.PI_STUDIO_VOICE_WORKER_CMD = JSON.stringify([path.resolve("voice/fake_worker.mjs")]);
  try {
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "slow-load";
    process.env.PI_STUDIO_FAKE_VOICE_DELAY = "250";
    const slow = createVoiceService({ startupTimeoutMs: 20, idleMs: 100000 });
    await assert.rejects(slow.transcribe("slow"), /limite de inicialização/);
    assert.equal(slow.status().state, "off");
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "load-error";
    const rejected = createVoiceService({ startupTimeoutMs: 1000, idleMs: 100000 });
    await assert.rejects(rejected.transcribe("unavailable"), /não está disponível/);
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "crash";
    const crashing = createVoiceService({ startupTimeoutMs: 1000, idleMs: 100000 });
    await assert.rejects(crashing.transcribe("crash"), /encerrou/);
    assert.equal(crashing.status().state, "off");
  } finally {
    if (oldCommand === undefined) delete process.env.PI_STUDIO_VOICE_WORKER_CMD; else process.env.PI_STUDIO_VOICE_WORKER_CMD = oldCommand;
    if (oldMode === undefined) delete process.env.PI_STUDIO_FAKE_VOICE_MODE; else process.env.PI_STUDIO_FAKE_VOICE_MODE = oldMode;
    if (oldDelay === undefined) delete process.env.PI_STUDIO_FAKE_VOICE_DELAY; else process.env.PI_STUDIO_FAKE_VOICE_DELAY = oldDelay;
  }
});

// Protocol errors, malformed output, missing metadata, and child crashes are isolated to the worker.
test("handles worker protocol errors and crash-after-ready without leaving it live", async () => {
  const oldCommand = process.env.PI_STUDIO_VOICE_WORKER_CMD;
  const oldMode = process.env.PI_STUDIO_FAKE_VOICE_MODE;
  process.env.PI_STUDIO_VOICE_WORKER_CMD = JSON.stringify([path.resolve("voice/fake_worker.mjs")]);
  try {
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "malformed";
    const malformed = createVoiceService({ idleMs: 100000 });
    assert.equal((await malformed.transcribe("malformed")).text, "olá");
    await malformed.stop();
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "response-error";
    const responseError = createVoiceService({ idleMs: 100000 });
    await assert.rejects(responseError.transcribe("error"), /transcription failed/);
    assert.equal(responseError.status().state, "off");
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "crash-request";
    const crash = createVoiceService({ idleMs: 100000 });
    await assert.rejects(crash.transcribe("crash"), /encerrou/);
    assert.equal(crash.status().state, "off");
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "metadata-empty";
    const metadata = createVoiceService({ idleMs: 100000 });
    assert.equal((await metadata.transcribe("fallback")).device, undefined);
    await metadata.stop();
  } finally {
    if (oldCommand === undefined) delete process.env.PI_STUDIO_VOICE_WORKER_CMD; else process.env.PI_STUDIO_VOICE_WORKER_CMD = oldCommand;
    if (oldMode === undefined) delete process.env.PI_STUDIO_FAKE_VOICE_MODE; else process.env.PI_STUDIO_FAKE_VOICE_MODE = oldMode;
  }
});

// The routes enforce auth, accept bounded raw audio, and report the local worker status.
test("GET status and POST raw audio routes validate auth, media type, and return text", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-voice-route-"));
  Object.assign(process.env, { PI_AGENT_DIR: path.join(tmp, "agent"), PI_PROJECT_ROOTS: tmp, PI_WEB_HOST: "127.0.0.1", PI_WEB_PORT: "0", PI_STUDIO_VOICE_WORKER_CMD: JSON.stringify([path.resolve("voice/fake_worker.mjs")]) });
  const serverModule = await import("../server.mjs?voice-routes");
  try {
    const server = await serverModule.startServer(0, "127.0.0.1");
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    const page = await fetch(origin);
    const token = (await page.text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
    const unauthorized = await fetch(`${origin}/api/voice/status`);
    assert.equal(unauthorized.status, 401);
    const status = await fetch(`${origin}/api/voice/status`, { headers: { "x-pi-studio-token": token } });
    assert.deepEqual(await status.json(), { available: false, device: null, model: "small", state: "off" });
    const foreignOrigin = await fetch(`${origin}/api/voice/status`, { headers: { "x-pi-studio-token": token, origin: "https://attacker.example" } });
    assert.equal(foreignOrigin.status, 403);
    const badType = await fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "application/json" }, body: "x" });
    assert.equal(badType.status, 400);
    const empty = await fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "audio/webm" }, body: Buffer.alloc(0) });
    assert.equal(empty.status, 400);
    const oversized = await fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "audio/webm" }, body: Buffer.alloc(10 * 1024 * 1024 + 1) });
    assert.equal(oversized.status, 413);
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "slow-load";
    process.env.PI_STUDIO_FAKE_VOICE_DELAY = "250";
    const pending = fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "audio/webm" }, body: Buffer.from("wait for startup") });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const loading = await fetch(`${origin}/api/voice/status`, { headers: { "x-pi-studio-token": token } });
    assert.equal((await loading.json()).state, "loading");
    const response = await pending;
    assert.deepEqual(await response.json(), { text: "olá" });
    const { voice } = await import("../lib-server/voice.mjs");
    await voice.stop();
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "slow";
    process.env.PI_STUDIO_FAKE_VOICE_DELAY = "200";
    const burst = await Promise.all(Array.from({ length: 4 }, () => fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "audio/webm" }, body: Buffer.from("queue") })));
    assert.equal(burst.filter((item) => item.status === 429).length, 1);
    await voice.stop();
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "response-timeout";
    const timeout = await fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "audio/webm" }, body: Buffer.from("timeout") });
    assert.equal(timeout.status, 503);
    assert.match((await timeout.json()).error, /tempo limite/);
    await voice.stop();
    process.env.PI_STUDIO_FAKE_VOICE_MODE = "response-error";
    const unavailable = await fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "audio/webm" }, body: Buffer.from("error") });
    assert.equal(unavailable.status, 503);
    assert.match((await unavailable.json()).error, /indisponível/);
    await voice.stop();
    delete process.env.PI_STUDIO_FAKE_VOICE_MODE;
    delete process.env.PI_STUDIO_FAKE_VOICE_DELAY;
    await serverModule.stopServer();
    const originalExit = process.exit;
    let exitRequested = false;
    process.exit = () => { exitRequested = true; return undefined; };
    try {
      serverModule.shutdown();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(exitRequested, true);
    } finally {
      process.exit = originalExit;
    }
  } finally {
    await serverModule.stopServer();
    await rm(tmp, { recursive: true, force: true });
    for (const name of ["PI_AGENT_DIR", "PI_PROJECT_ROOTS", "PI_WEB_HOST", "PI_WEB_PORT", "PI_STUDIO_VOICE_WORKER_CMD", "PI_STUDIO_FAKE_VOICE_MODE", "PI_STUDIO_FAKE_VOICE_DELAY"]) delete process.env[name];
  }
});
