// The fake PI's `clone` and `/fast` (what the Studio's ⋯ menu and Velocidade section talk to), exercised over its JSON-lines stdio.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { fastFromStatus } from "../public/lib.js";

const fakePi = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-pi-rpc.mjs");

// Starts the fake PI; `send` resolves with the command's response, `events` collects everything else.
function startFake(env = {}) {
  const child = spawn(process.execPath, [fakePi], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "inherit"] });
  const events = [];
  const waiting = new Map();
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (let index = buffer.indexOf("\n"); index !== -1; index = buffer.indexOf("\n")) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const payload = JSON.parse(line);
      if (payload.type === "response" && waiting.has(payload.id)) waiting.get(payload.id)(payload);
      else events.push(payload);
    }
  });
  let counter = 0;
  const send = (command) => new Promise((resolve) => {
    const id = `t${++counter}`;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
  const statuses = () => events.filter((event) => event.method === "setStatus" && event.statusKey === "codex-fast-mode").map((event) => event.statusText);
  const notices = () => events.filter((event) => event.method === "notify").map((event) => [event.notifyType, event.message]);
  return { send, settle, events, statuses, notices, stop: () => child.kill() };
}

describe("fake PI /fast", () => {
  test("is listed only when enabled", async () => {
    const plain = startFake();
    const fast = startFake({ FAKE_PI_FAST: "1" });
    try {
      const names = async (fake) => (await fake.send({ type: "get_commands" })).data.commands.map((command) => command.name);
      assert.equal((await names(plain)).includes("fast"), false);
      assert.equal((await names(fast)).includes("fast"), true);
    } finally {
      plain.stop();
      fast.stop();
    }
  });

  test("reports the extension's status strings for each flag, off removes it", async () => {
    const fake = startFake({ FAKE_PI_FAST: "1" });
    try {
      const modes = [];
      for (const flag of ["eco", "on", "ultra", "ultra-eco", "off"]) {
        assert.equal((await fake.send({ type: "prompt", message: `/fast ${flag}` })).success, true);
        await fake.settle();
        modes.push(fastFromStatus(fake.statuses().at(-1)).mode);
      }
      // The fake model is not an OpenAI Codex one: the main model stays standard (SUB).
      assert.deepEqual(fake.statuses(), ["⚡ECO", "⚡SUB", "🚀SUB", "🚀ECO", undefined]);
      assert.deepEqual(modes, ["subagents", "all", "ultra", "ultra-subagents", "off"]);
      assert.deepEqual(fake.notices().map(([type]) => type), ["warning", "warning", "warning", "warning", "info"]);
      assert.equal(fake.events.some((event) => event.type === "agent_start"), false, "an extension command is not an agent run");
    } finally {
      fake.stop();
    }
  });

  test("on an Astra model: 🟡 until a request goes out, then 🟢; ultra shows the rocket", async () => {
    const fake = startFake({ FAKE_PI_FAST: "1", FAKE_PI_MODEL: "openai-codex/gpt-6-astra" });
    try {
      assert.deepEqual((await fake.send({ type: "get_state" })).data.model, { provider: "openai-codex", id: "gpt-6-astra", name: "Fake Model", reasoning: true, contextWindow: 200000 });
      await fake.send({ type: "prompt", message: "/fast on" });
      await fake.send({ type: "prompt", message: "/fast ultra" });
      await fake.send({ type: "prompt", message: "ola" });
      await fake.settle();
      assert.deepEqual(fake.statuses(), ["⚡🟡", "🚀🟡", "🚀🟢"]);
      // Already accepted: another request changes nothing.
      await fake.send({ type: "prompt", message: "de novo" });
      await fake.settle();
      assert.equal(fake.statuses().length, 3);
    } finally {
      fake.stop();
    }
  });

  test("a bad flag only warns; a stuck extension warns without changing the status", async () => {
    const fake = startFake({ FAKE_PI_FAST: "1" });
    const stuck = startFake({ FAKE_PI_FAST: "1", FAKE_PI_FAST_STUCK: "1" });
    try {
      await fake.send({ type: "prompt", message: "/fast turbo" });
      await stuck.send({ type: "prompt", message: "/fast on" });
      await fake.settle();
      assert.deepEqual(fake.statuses(), []);
      assert.match(fake.notices()[0][1], /^Uso: \/fast on/);
      assert.deepEqual(stuck.statuses(), []);
      assert.deepEqual(stuck.notices(), [["warning", "Fast Mode indisponível nesta conta."]]);
    } finally {
      fake.stop();
      stuck.stop();
    }
  });

  test("without FAKE_PI_FAST the slash text is an ordinary prompt", async () => {
    const fake = startFake();
    try {
      await fake.send({ type: "prompt", message: "/fast on" });
      await fake.settle();
      assert.equal(fake.statuses().length, 0);
      assert.equal(fake.events.some((event) => event.type === "agent_start"), true);
    } finally {
      fake.stop();
    }
  });
});

describe("fake PI clone", () => {
  test("copies the session file under a new id and switches to the copy", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pi-fake-clone-"));
    const file = path.join(dir, "2026_s1.jsonl");
    await writeFile(file, `${JSON.stringify({ type: "session", id: "s1", cwd: "/p", timestamp: "2026-01-01T00:00:00.000Z" })}\n${JSON.stringify({ type: "message", id: "m1" })}\n`);
    const fake = startFake({ FAKE_PI_SESSION_FILE: file });
    try {
      const res = await fake.send({ type: "clone" });
      assert.deepEqual([res.success, res.data], [true, { cancelled: false }]);
      const state = (await fake.send({ type: "get_state" })).data;
      assert.equal(state.sessionId, "fake-session-fork-1");
      assert.notEqual(state.sessionFile, file);
      const files = await readdir(dir);
      assert.equal(files.length, 2);
      const [header, body] = (await readFile(state.sessionFile, "utf8")).split("\n");
      assert.equal(JSON.parse(header).id, "s1-clone-1");
      assert.equal(JSON.parse(header).cwd, "/p");
      assert.equal(JSON.parse(body).id, "m1");
      // The original is untouched.
      assert.equal(JSON.parse((await readFile(file, "utf8")).split("\n")[0]).id, "s1");
    } finally {
      fake.stop();
      await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  });

  test("without a session file it still switches; an extension can veto it", async () => {
    const fake = startFake();
    try {
      assert.deepEqual((await fake.send({ type: "clone" })).data, { cancelled: false });
      assert.equal((await fake.send({ type: "get_state" })).data.sessionId, "fake-session-fork-1");
      await fake.send({ type: "prompt", message: "cancel-clone" });
      assert.deepEqual((await fake.send({ type: "clone" })).data, { cancelled: true });
      assert.equal((await fake.send({ type: "get_state" })).data.sessionId, "fake-session-fork-1");
    } finally {
      fake.stop();
    }
  });
});
