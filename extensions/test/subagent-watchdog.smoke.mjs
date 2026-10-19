import assert from "node:assert/strict";
import { resolvePiSdkRoot, loadJiti } from "./lib/pi-sdk.mjs";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createTestSymlink } from "./lib/test-symlink.mjs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The watchdog applies the configured hard limit to ordinary agents and keeps the planner's existing limit.
const dir = mkdtempSync(path.join(tmpdir(), "watchdog-smoke-"));
try {
  const { createJiti } = await loadJiti(import.meta.url);
  const jiti = createJiti(import.meta.url);
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(testDir, "../..");
  const scope = path.join(dir, "node_modules", "@earendil-works");
  mkdirSync(scope, { recursive: true });
  createTestSymlink(resolvePiSdkRoot(import.meta.url), path.join(scope, "pi-coding-agent"), "dir");
  const { copyFileSync } = await import("node:fs");
  const isolatedSource = path.join(dir, "subagent-watchdog.ts");
  copyFileSync(path.join(root, "extensions/subagent-watchdog.ts"), isolatedSource);
  const mod = await jiti.import(isolatedSource);
  assert.equal(typeof mod.default, "function");
  assert.equal(resolvePiSdkRoot(import.meta.url).length > 0, true);
  // Missing configuration uses a bounded 120-minute ordinary-agent default for legitimate long builds.
  assert.equal(mod.subagentTimeoutMs(undefined), 120 * 60_000);
  // An in-range integer override is converted from minutes to milliseconds.
  assert.equal(mod.subagentTimeoutMs("5"), 5 * 60_000);
  // Out-of-range and non-integer values fall back to the new default rather than bypassing limits.
  assert.equal(mod.subagentTimeoutMs("4"), 120 * 60_000);
  assert.equal(mod.subagentTimeoutMs("5.5"), 120 * 60_000);
  // The exact plan-heavy planner identity remains separately recognizable and unchanged.
  assert.equal(mod.isPlanHeavyPlanner("planner", "Plan-heavy final synthesis"), true);
  assert.equal(mod.isPlanHeavyPlanner("planner", "other planner"), false);
  // Planner retains its existing 45-minute default and dedicated override.
  assert.equal(mod.planHeavyTimeoutMs(), 45 * 60_000);

  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => { if (timer) timer.cleared = true; };
  try {
    const listeners = new Map();
    const notifications = [];
    let rpcReply = { success: true };
    const emit = (name, ...args) => { for (const fn of listeners.get(name) ?? []) fn(...args); };
    const pi = {
      events: {
        on(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list); return () => {}; },
        emit(name, event) { emit(name, event); },
      },
      on(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list); }, appendEntry() {},
    };
    const extension = mod.default(pi);
    pi.events.on("subagents:rpc:stop", ({ requestId, agentId }) => {
      if (rpcReply !== null) emit(`subagents:rpc:stop:reply:${requestId}`, rpcReply);
      assert.match(agentId, /agent-/);
    });
    listeners.get("session_start");
    emit("session_start", {}, { hasUI: true, ui: { notify: (message) => notifications.push(message) } });
    // A normal agent receives the 120-minute default and its warning at exactly two-thirds.
    emit("subagents:started", { id: "agent-1", type: "builder", description: "Build task" });
    assert.equal(extension.guards.get("agent-1").timeoutMs, 120 * 60_000);
    assert.ok(timers.some((timer) => timer.delay === 80 * 60_000));
    // Completion clears both scheduled timers and removes the agent guard.
    const active = timers.filter((timer) => !timer.cleared);
    emit("subagents:completed", { id: "agent-1" });
    assert.equal(extension.guards.size, 0);
    assert.ok(active.every((timer) => timer.cleared));
    // Hard limit uses the RPC stop path and a successful reply is reported in Portuguese.
    emit("subagents:started", { id: "agent-1", type: "builder", description: "Build task" });
    const stopTimer = timers.find((timer) => timer.delay === 120 * 60_000 && !timer.cleared);
    stopTimer.callback();
    assert.equal(extension.guards.size, 0);
    assert.ok(notifications.some((message) => /foi interrompido.*120m/.test(message)));
    // A negative RPC result is surfaced and still releases its stop-response timer.
    rpcReply = { success: false, error: "denied" };
    emit("subagents:started", { id: "agent-2", type: "builder", description: "Build task" });
    timers.find((timer) => timer.delay === 120 * 60_000 && !timer.cleared).callback();
    assert.ok(notifications.some((message) => /Falha ao interromper.*denied/.test(message)));
    // Missing RPC reply reaches its bounded deadline and reports that stop was unconfirmed.
    rpcReply = null;
    emit("subagents:started", { id: "agent-3", type: "builder", description: "Build task" });
    timers.find((timer) => timer.delay === 120 * 60_000 && !timer.cleared).callback();
    timers.find((timer) => timer.delay === 5_000 && !timer.cleared).callback();
    assert.ok(notifications.some((message) => /não conseguiu confirmar/.test(message)));
    // The exact planner remains on its original limit, irrespective of the general setting.
    emit("subagents:started", { id: "planner-1", type: "planner", description: "Plan-heavy final synthesis" });
    assert.equal(extension.guards.get("planner-1").timeoutMs, 45 * 60_000);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
