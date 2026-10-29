import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Uses only in-memory fake timers and UI events.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const require = createRequire(import.meta.url);
const jitiPath = path.join(resolvePiSdkRoot(import.meta.url), "node_modules/jiti/lib/jiti.cjs");
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
const intervals = [];
const cleared = [];
const runtime = {
  now: () => now,
  setInterval(callback, intervalMs) {
    assert.equal(intervalMs, 1_000);
    const timer = { callback, unrefCalled: false, unref() { this.unrefCalled = true; } };
    intervals.push(timer);
    return timer;
  },
  clearInterval(handle) {
    cleared.push(handle);
  },
};
mod.registerWorkingTime(fakePi, runtime);

assert.ok(handlers.has("turn_start"));
assert.ok(handlers.has("turn_end"));
assert.ok(handlers.has("session_shutdown"));
// agent_start only marks the start of the request for the progress suffix; the timer itself still resets per turn.
assert.ok(handlers.has("agent_start"));
assert.equal(handlers.has("agent_settled"), false);

// Progress suffix from the todo list: nothing without a list, items done/total, estimate after the first item.
assert.equal(mod.progressSuffix([], 0, [], 60_000), "");
assert.equal(mod.progressSuffix([{ id: 1, status: "pending" }, { id: 2, status: "pending" }], 0, [], 30_000), " · pedido 30s · 0/2 itens");
assert.equal(mod.progressSuffix([{ id: 1, status: "completed" }, { id: 2, status: "in_progress" }, { id: 3, status: "pending" }], 0, [120_000], 150_000),
  " · pedido 2m 30s · 1/3 itens · faltam ≈ 4 min");
assert.equal(mod.progressSuffix([{ id: 1, status: "completed" }], 0, [60_000], 90_000), " · pedido 1m 30s · 1/1 itens · lista concluída");

const messages = [];
const ctx = {
  mode: "tui",
  hasUI: true,
  ui: {
    setWorkingMessage(message) {
      messages.push(message);
    },
  },
};

await handlers.get("turn_start")({ turnIndex: 1, timestamp: now }, ctx);
assert.equal(messages.at(-1), "Working for 0s");
assert.equal(intervals.length, 1);
assert.equal(intervals[0].unrefCalled, true);

now += 3_661_000;
intervals[0].callback();
assert.equal(messages.at(-1), "Working for 1h 1m 1s");

await handlers.get("turn_end")({ turnIndex: 1, message: {}, toolResults: [] }, ctx);
assert.deepEqual(cleared, [intervals[0]]);
assert.equal(messages.at(-1), undefined);

// A new assistant response starts a fresh zeroed timer.
now = 20_000;
await handlers.get("turn_start")({ turnIndex: 2, timestamp: now }, ctx);
assert.equal(intervals.length, 2);
assert.equal(messages.at(-1), "Working for 0s");
now += 1_000;
intervals[1].callback();
assert.equal(messages.at(-1), "Working for 1s");

// A defensive duplicate turn_start clears the previous interval and resets elapsed time.
now = 30_000;
await handlers.get("turn_start")({ turnIndex: 3, timestamp: now }, ctx);
assert.equal(intervals.length, 3);
assert.deepEqual(cleared, [intervals[0], intervals[1]]);
assert.equal(messages.at(-1), "Working for 0s");

await handlers.get("session_shutdown")({}, ctx);
assert.deepEqual(cleared, [intervals[0], intervals[1], intervals[2]]);
assert.equal(messages.at(-1), undefined);

const headlessMessages = [];
const headlessCtx = {
  ...ctx,
  mode: "print",
  hasUI: false,
  ui: { setWorkingMessage: (message) => headlessMessages.push(message) },
};
await handlers.get("turn_start")({ turnIndex: 4, timestamp: now }, headlessCtx);
assert.deepEqual(headlessMessages, []);

console.log("working-time smoke: PASS");
