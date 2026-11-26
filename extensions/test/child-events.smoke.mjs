import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const sandbox = mkdtempSync(path.join(os.tmpdir(), "child-events-smoke-"));
const oldEnv = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR, TMPDIR: process.env.TMPDIR, PI_REPORT_RUN: process.env.PI_REPORT_RUN };
process.env.HOME = path.join(sandbox, "home");
process.env.PI_CODING_AGENT_DIR = path.join(sandbox, "agent");
process.env.TMPDIR = sandbox;
process.env.PI_REPORT_RUN = "run_test-123";
mkdirSync(process.env.HOME, { recursive: true });
if (process.platform !== "linux") {
  for (const [key, value] of Object.entries(oldEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
  rmSync(sandbox, { recursive: true, force: true });
  console.log("child-events smoke: SKIP (Linux /proc lifecycle only)");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = (await import("node:module")).createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const extension = await jiti.import(path.join(root, "extensions/child-events.ts"));
const handlers = new Map();
const signalHandler = () => {};
process.on("SIGTERM", signalHandler);
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
let nextTimer = 0;
const timers = new Map();
globalThis.setTimeout = (fn, delay, ...args) => { const id = ++nextTimer; timers.set(id, { fn: () => fn(...args), delay }); return id; };
globalThis.clearTimeout = (id) => timers.delete(id);
const ctx = { cwd: "/synthetic/child-project", isIdle: () => true, hasPendingMessages: () => false, sessionManager: { getBranch: () => [] } };
const fire = (delay) => {
  const timer = [...timers].find(([, value]) => value.delay === delay);
  assert.ok(timer, `timer ${delay}ms exists`);
  timers.delete(timer[0]);
  timer[1].fn();
};

try {
  extension.default({ on: (name, handler) => handlers.set(name, handler) });
  handlers.get("session_start")({}, ctx);
  const childFile = path.join(process.env.PI_CODING_AGENT_DIR, "child-events", "children", `${process.pid}.json`);
  const registration = JSON.parse(readFileSync(childFile, "utf8"));
  assert.deepEqual(Object.keys(registration).sort(), ["child", "clean", "cwd", "pid", "runId", "startTime"].sort());
  const procStat = readFileSync(`/proc/${process.pid}/stat`, "utf8");
  assert.equal(registration.startTime, procStat.slice(procStat.lastIndexOf(") ") + 2).trim().split(/\s+/)[19]);
  assert.equal(registration.clean, false);

  const activeCtx = { ...ctx, sessionManager: { getBranch: () => [{ type: "custom", customType: "goal-state", data: { goal: { id: "g1", status: "active" } } }] } };
  handlers.get("agent_settled")({}, activeCtx);
  fire(4_000);
  const queuePath = path.join(process.env.PI_CODING_AGENT_DIR, "child-events", "queue");
  assert.equal(existsSync(queuePath) ? readdirSync(queuePath).length : 0, 0, "active Goal suppresses idle event");

  handlers.get("agent_settled")({}, ctx);
  handlers.get("agent_start")({}, ctx);
  assert.equal(timers.size, 0, "agent_start cancels pending idle timer");
  handlers.get("agent_settled")({ aborted: true }, ctx);
  fire(4_000);
  const queue = path.join(process.env.PI_CODING_AGENT_DIR, "child-events", "queue");
  let events = readdirSync(queue).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(path.join(queue, name), "utf8")));
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0]).sort(), ["child", "cwd", "id", "kind", "pid", "runId", "text", "ts"].sort());
  assert.equal(events[0].kind, "idle");
  assert.match(events[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(events[0].text, "Worker stopped; session is idle.");

  handlers.get("ui_prompt_start")({ kind: "confirm", title: "secret title must not be retained" }, ctx);
  assert.equal(readdirSync(queue).filter((name) => name.endsWith(".json")).length, 1, "prompt is not reported before 15 seconds");
  fire(15_000);
  events = readdirSync(queue).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(path.join(queue, name), "utf8")));
  assert.equal(events.length, 2);
  const promptEvent = events.find((event) => event.kind === "prompt");
  assert.ok(promptEvent);
  assert.doesNotMatch(promptEvent.text, /secret title/);
  handlers.get("ui_prompt_start")({ kind: "confirm", title: "second" }, ctx);
  handlers.get("ui_prompt_end")({ kind: "confirm" }, ctx);
  assert.equal(timers.size, 0, "prompt end cancels its timer");

  handlers.get("session_shutdown")({ reason: "new" }, ctx);
  assert.equal(timers.size, 0);
  handlers.get("session_start")({}, ctx);
  handlers.get("session_shutdown")({ reason: "quit" }, ctx);
  events = readdirSync(queue).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(path.join(queue, name), "utf8")));
  assert.equal(events.filter((event) => event.kind === "quit").length, 1);
  assert.equal(JSON.parse(readFileSync(childFile, "utf8")).clean, true, "quit records clean only after the terminal event is spooled");

  handlers.get("session_start")({}, ctx);
  process.emit("SIGTERM");
  handlers.get("session_shutdown")({ reason: "quit" }, ctx);
  events = readdirSync(queue).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(path.join(queue, name), "utf8")));
  assert.equal(events.filter((event) => event.kind === "killed").length, 1);
  assert.equal(JSON.parse(readFileSync(childFile, "utf8")).clean, true);
  assert.equal(process.listeners("SIGTERM").includes(signalHandler), true, "the original runtime SIGTERM listener remains installed");
  assert.equal(timers.size, 0);

  const failedRoot = path.join(sandbox, "failed-agent");
  const failedQueue = path.join(failedRoot, "child-events", "queue");
  process.env.PI_CODING_AGENT_DIR = failedRoot;
  mkdirSync(path.join(failedRoot, "child-events", "children"), { recursive: true });
  const failedHandlers = new Map();
  extension.default({ on: (name, handler) => failedHandlers.set(name, handler) });
  failedHandlers.get("session_start")({}, ctx);
  writeFileSync(failedQueue, "not a directory");
  failedHandlers.get("session_shutdown")({ reason: "quit" }, ctx);
  const failedRegistration = JSON.parse(readFileSync(path.join(failedRoot, "child-events", "children", `${process.pid}.json`), "utf8"));
  assert.equal(failedRegistration.clean, false, "failed terminal spool leaves the registry unclean so the relay can report death");
  console.log("child-events smoke: PASS");
} finally {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  process.removeListener("SIGTERM", signalHandler);
  for (const [key, value] of Object.entries(oldEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
  rmSync(sandbox, { recursive: true, force: true });
}
