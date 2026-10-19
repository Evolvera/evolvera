import assert from "node:assert/strict";
import { test } from "node:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVoiceService } from "../lib-server/voice.mjs";

const worker = (transcribe = async () => ({ text: "olá", device: "fake" })) => ({ device: "fake", model: "tiny", transcribe, stop: async () => {} });

// Lazy startup keeps a successful worker warm until explicitly stopped.
test("starts lazily, stays warm, transcribes, and stops", async () => {
  let spawns = 0;
  const service = createVoiceService({ spawnWorker: async () => { spawns++; return worker(); }, idleMs: 100000 });
  assert.equal(service.status().state, "off");
  assert.equal(spawns, 0);
  assert.equal((await service.transcribe("a.wav")).text, "olá");
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
    const badType = await fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "application/json" }, body: "x" });
    assert.equal(badType.status, 400);
    const response = await fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers: { "x-pi-studio-token": token, "content-type": "audio/webm" }, body: Buffer.from("audio") });
    assert.deepEqual(await response.json(), { text: "olá" });
    await serverModule.stopServer();
  } finally {
    await serverModule.stopServer();
    await rm(tmp, { recursive: true, force: true });
    for (const name of ["PI_AGENT_DIR", "PI_PROJECT_ROOTS", "PI_WEB_HOST", "PI_WEB_PORT", "PI_STUDIO_VOICE_WORKER_CMD"]) delete process.env[name];
  }
});
