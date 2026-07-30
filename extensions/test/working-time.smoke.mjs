import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Uses only in-memory fake timers and UI events.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const require = createRequire(import.meta.url);
const jitiPath = path.resolve(
  root,
  "../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs",
);
const { createJiti } = require(jitiPath);
const jiti = createJiti(import.meta.url);
const mod = await jiti.import(path.join(root, "extensions/working-time.ts"));

assert.equal(mod.formatWorkingDuration(-1), "0s");
assert.equal(mod.formatWorkingDuration(999), "0s");
assert.equal(mod.formatWorkingDuration(1_000), "1s");
assert.equal(mod.formatWorkingDuration(61_000), "1m 1s");
assert.equal(mod.formatWorkingDuration(3_661_000), "1h 1m 1s");

const handlers = new Map();
const fakePi = {
  on(name, handler) {
    handlers.set(name, handler);
  },
};
let now = 10_000;
let intervalCount = 0;
let clearCount = 0;
let intervalCallback;
const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
const runtime = {
  now: () => now,
  setInterval(callback, intervalMs) {
    assert.equal(intervalMs, 1_000);
    intervalCount += 1;
    intervalCallback = callback;
    return timer;
  },
  clearInterval(handle) {
    assert.equal(handle, timer);
    clearCount += 1;
  },
};
mod.registerWorkingTime(fakePi, runtime);

assert.ok(handlers.has("agent_start"));
assert.ok(handlers.has("agent_settled"));
assert.ok(handlers.has("session_shutdown"));

const messages = [];
let idle = false;
const ctx = {
  mode: "tui",
  hasUI: true,
  isIdle: () => idle,
  ui: {
    setWorkingMessage(message) {
      messages.push(message);
    },
  },
};

await handlers.get("agent_start")({}, ctx);
assert.equal(messages.at(-1), "Working for 0s");
assert.equal(intervalCount, 1);
assert.equal(timer.unrefCalled, true);

now += 3_661_000;
intervalCallback();
assert.equal(messages.at(-1), "Working for 1h 1m 1s");

// Low-level retries emit another agent_start; the continuous timer must not reset.
await handlers.get("agent_start")({}, ctx);
assert.equal(intervalCount, 1);
now += 1_000;
intervalCallback();
assert.equal(messages.at(-1), "Working for 1h 1m 2s");

// Do not stop if another run was started before the settled hook executes.
await handlers.get("agent_settled")({}, ctx);
assert.equal(clearCount, 0);

idle = true;
await handlers.get("agent_settled")({}, ctx);
assert.equal(clearCount, 1);
assert.equal(messages.at(-1), undefined);

// A later independent task starts a fresh timer.
now = 20_000;
idle = false;
await handlers.get("agent_start")({}, ctx);
assert.equal(intervalCount, 2);
assert.equal(messages.at(-1), "Working for 0s");
await handlers.get("session_shutdown")({}, ctx);
assert.equal(clearCount, 2);
assert.equal(messages.at(-1), undefined);

const headlessMessages = [];
const headlessCtx = {
  ...ctx,
  mode: "print",
  hasUI: false,
  ui: { setWorkingMessage: (message) => headlessMessages.push(message) },
};
await handlers.get("agent_start")({}, headlessCtx);
assert.deepEqual(headlessMessages, []);

console.log("working-time smoke: PASS");
