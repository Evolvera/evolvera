import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const pt = (error) => ({ error: error || "Falha ao transcrever o áudio." });

export function createVoiceService({ spawnWorker = startWorker, idleMs = 600000, timeoutMs = Number(process.env.PI_STUDIO_VOICE_REQUEST_TIMEOUT_MS) || 60000, startupTimeoutMs = Number(process.env.PI_STUDIO_VOICE_START_TIMEOUT_MS) || 120000, maxQueue = 3 } = {}) {
  let worker = null;
  let starting = null;
  let state = "off";
  let device = null;
  let model = process.env.PI_STUDIO_WHISPER_MODEL || "small";
  let queue = 0;
  let idleTimer = null;
  const status = () => ({ available: Boolean(worker && state !== "off"), device, model, state });
  function scheduleStop() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { void stop(); }, idleMs);
    idleTimer.unref?.();
  }
  async function ensureWorker() {
    if (worker) return worker;
    if (starting) return starting;
    state = "loading";
    starting = Promise.resolve().then(() => spawnWorker(startupTimeoutMs)).then((child) => {
      worker = child;
      device = child.device || device;
      model = child.model || model;
      state = "ready";
      scheduleStop();
      return child;
    }).catch((error) => { state = "off"; worker = null; throw error; }).finally(() => { starting = null; });
    return starting;
  }
  function finishRequest() {
    queue--;
    if (worker) state = queue ? "busy" : "ready";
    if (!queue && worker) scheduleStop();
  }
  async function transcribe(file) {
    if (queue >= maxQueue) { const error = new Error("O serviço de transcrição está ocupado."); error.status = 429; throw error; }
    queue++;
    clearTimeout(idleTimer);
    let result;
    try {
      const child = await ensureWorker();
      state = "busy";
      let timeout;
      result = await Promise.race([child.transcribe(file), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Tempo limite da transcrição excedido.")), timeoutMs); })]).finally(() => clearTimeout(timeout));
      device = result.device || child.device || device;
    } catch (error) {
      if (worker) { await worker.stop().catch(() => {}); worker = null; state = "off"; }
      finishRequest();
      throw error;
    }
    finishRequest();
    return result;
  }
  async function transcribeBuffer(buffer) {
    const file = path.join(os.tmpdir(), `pi-studio-voice-${randomUUID()}.webm`);
    const { writeFile } = await import("node:fs/promises");
    try { await writeFile(file, buffer, { flag: "wx" }); return await transcribe(file); }
    finally { await rm(file, { force: true }); }
  }
  async function stop() {
    clearTimeout(idleTimer);
    if (starting) await starting.catch(() => {});
    const child = worker;
    worker = null;
    state = "off";
    if (child) await child.stop();
  }
  return { status, transcribe, transcribeBuffer, stop, pt };
}

export function resolveWorkerCommand(env = process.env, platform = process.platform, scriptPath = path.resolve("voice/transcribe_worker.py")) {
  const fake = env.PI_STUDIO_VOICE_WORKER_CMD;
  return {
    command: fake ? process.execPath : env.PI_STUDIO_PYTHON || (platform === "win32" ? "py" : "python3"),
    args: fake ? JSON.parse(fake) : env.PI_STUDIO_PYTHON ? [scriptPath] : platform === "win32" ? ["-3.14", scriptPath] : [scriptPath],
  };
}

async function startWorker(startupTimeoutMs) {
  const launch = resolveWorkerCommand();
  const { command, args } = launch;
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const loadTimer = setTimeout(() => { readyReject(new Error("O modelo de voz não iniciou dentro do limite de inicialização.")); child.kill(); }, startupTimeoutMs);
  loadTimer.unref?.();
  let exited = false;
  lines.on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (Object.hasOwn(message, "ready")) { clearTimeout(loadTimer); message.ready ? readyResolve(message) : readyReject(new Error("O mecanismo local de voz não está disponível.")); return; }
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(message.error)) : waiter.resolve(message); }
  });
  child.once("error", (error) => { clearTimeout(loadTimer); readyReject(error); });
  child.once("exit", (code) => { exited = true; clearTimeout(loadTimer); readyReject(new Error(`Worker de voz encerrou (${code}).`)); for (const waiter of pending.values()) waiter.reject(new Error("Worker de voz encerrou.")); pending.clear(); });
  const metadata = await ready;
  const instance = {
    device: metadata.device || "unknown",
    model: metadata.model || process.env.PI_STUDIO_WHISPER_MODEL || "small",
    transcribe(file) {
      const id = randomUUID();
      const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      child.stdin.write(`${JSON.stringify({ id, path: file })}\n`);
      return promise;
    },
    async stop() { lines.close(); if (!exited) { child.kill(); await once(child, "exit").catch(() => {}); } },
  };
  instance.device = "unknown";
  return instance;
}

export const voice = createVoiceService();
export { pt as voiceError };
