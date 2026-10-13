import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSessionUsage, formatSessionUsage, registerSessionUsage } from "../session-usage.ts";

const assistant = (provider, model, usage) => Object.freeze({
  type: "message",
  message: Object.freeze({ role: "assistant", provider, model, usage: Object.freeze(usage) }),
});

function makeHarness({ mode = "tui", hasUI = true, branch = [], existing = ["session"] } = {}) {
  const commands = existing.map((name) => ({ name }));
  const sent = [];
  const notifications = [];
  const pi = {
    getCommands: () => commands,
    registerCommand(name, options) {
      commands.push({ name });
      this.registered = { name, ...options };
    },
    sendMessage(message, options) { sent.push({ message, options }); },
  };
  const ctx = {
    mode,
    hasUI,
    sessionManager: { getBranch: () => branch },
    ui: { notify: (message, kind) => notifications.push({ message, kind }) },
  };
  return { pi, ctx, commands, sent, notifications };
}

const usage = (fields = {}) => ({
  input: 100,
  output: 20,
  cacheRead: 30,
  cacheWrite: 10,
  totalTokens: 160,
  cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0.0004, total: 0.0037 },
  ...fields,
});

test("aggregates assistant usage by provider/model using only native token and cost fields", () => {
  const branch = Object.freeze([
    assistant("p1", "m1", usage()),
    assistant("p1", "m1", usage({ input: 5, output: 2, cacheRead: 3, cacheWrite: 1,
      cost: { input: 0.0001, output: 0.0002, cacheRead: 0.00003, cacheWrite: 0.00004, total: 0.00037 } })),
    assistant("p2", "m1", usage()),
    Object.freeze({ type: "message", message: { role: "user", provider: "p1", model: "m1", usage: usage() } }),
    Object.freeze({ type: "usage", kind: "cache_warm", provider: "p1", model: "m1", usage: usage() }),
    Object.freeze({ type: "compaction", usage: usage() }),
  ]);
  const before = structuredClone(branch);
  const rows = aggregateSessionUsage(branch);
  assert.deepEqual(branch, before, "branch fixture is immutable");
  assert.deepEqual(rows, [
    { provider: "p1", model: "m1", input: 105, output: 22, cacheRead: 33, cacheWrite: 11, totalTokens: 171,
      cost: { input: 0.0011, output: 0.0022, cacheRead: 0.00033, cacheWrite: 0.00044, total: 0.00407 } },
    { provider: "p2", model: "m1", input: 100, output: 20, cacheRead: 30, cacheWrite: 10, totalTokens: 160,
      cost: { input: 0.001, output: 0.002, cacheRead: 0.0003, cacheWrite: 0.0004, total: 0.0037 } },
  ]);
});

test("empty branches and unusable assistant entries yield finite zero-safe output", () => {
  assert.deepEqual(aggregateSessionUsage([]), []);
  const rows = aggregateSessionUsage([
    assistant("provider", "model", usage({ input: -1, output: Infinity, cacheRead: NaN, cacheWrite: 4,
      cost: { input: -1, output: Infinity, cacheRead: NaN, cacheWrite: 2, total: -3 }, arbitraryField: 1000 })),
    assistant("provider", "missing-cost", { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, totalTokens: 999, arbitraryField: 999 }),
    assistant("", "bad-provider", usage()),
  ]);
  assert.deepEqual(rows, [
    { provider: "provider", model: "model", input: 0, output: 0, cacheRead: 0, cacheWrite: 4, totalTokens: 4,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 2, total: 0 } },
    { provider: "provider", model: "missing-cost", input: 2, output: 3, cacheRead: 4, cacheWrite: 5, totalTokens: 14,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  ]);
  assert.doesNotMatch(formatSessionUsage(rows), /NaN|Infinity|\u001b/);
});

test("formatted output labels current branch, strips terminal controls, and avoids exact billing claims", () => {
  const text = formatSessionUsage(aggregateSessionUsage([assistant("\u001b[31mp\u001b[0m", "m\u0007", usage())]));
  assert.match(text, /Current session\/branch; not provider quotas or billing balance/);
  assert.match(text, /Estimated SDK cost total: \$0\.003700 USD/);
  assert.match(text, /p \/ m/);
  assert.doesNotMatch(text, /\u001b|\u0007/);
  assert.match(formatSessionUsage([]), /No assistant usage recorded on this branch/);
});

test("registers once, leaves /session alone, and displays synchronously in each command mode", async () => {
  const branch = [assistant("local-provider", "local-model", usage())];
  for (const mode of ["tui", "rpc", "print"]) {
    const harness = makeHarness({ mode, hasUI: mode === "tui", branch });
    registerSessionUsage(harness.pi);
    assert.equal(harness.commands.filter((command) => command.name === "usage").length, 1);
    assert.ok(harness.commands.some((command) => command.name === "session"));
    await harness.pi.registered.handler("ignored args", harness.ctx);
    const text = mode === "tui" ? harness.notifications[0]?.message : harness.sent[0]?.message.content;
    assert.match(text, /local-provider \/ local-model/);
    if (mode !== "tui") assert.equal(harness.sent[0].options.triggerTurn, false);
    assert.equal(harness.notifications.length, mode === "tui" ? 1 : 0);
    assert.equal(harness.sent.length, mode === "tui" ? 0 : 1);
    if (mode !== "tui") assert.equal(harness.sent[0].message.display, true);
  }
});

test("loads against SDK 1.2's pre-bind runtime and propagates unrelated failures", () => {
  const harness = makeHarness();
  harness.pi.getCommands = () => { throw new Error("Extension runtime not initialized. Action methods cannot be called during extension loading."); };
  registerSessionUsage(harness.pi);
  assert.equal(harness.pi.registered.name, "usage");
  const broken = makeHarness();
  broken.pi.getCommands = () => { throw new Error("unrelated command failure"); };
  assert.throws(() => registerSessionUsage(broken.pi), /unrelated command failure/);
  assert.equal(broken.pi.registered, undefined);
});

test("does not replace a command named usage", () => {
  const harness = makeHarness({ existing: ["session", "usage"] });
  registerSessionUsage(harness.pi);
  assert.equal(harness.pi.registered, undefined);
  assert.deepEqual(harness.commands.map((command) => command.name), ["session", "usage"]);
});
