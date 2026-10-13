import assert from "node:assert/strict";
import test from "node:test";
import { activityGrid, aggregateSessionUsage, formatSessionUsage, registerSessionUsage } from "../session-usage.ts";

const assistant = (provider, model, usage) => Object.freeze({
  type: "message",
  message: Object.freeze({ role: "assistant", provider, model, usage: Object.freeze(usage) }),
});

function makeHarness({ mode = "tui", hasUI = true, branch = [], existing = ["session"], customAvailable = true } = {}) {
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
  let component;
  const ui = { notify: (message, kind) => notifications.push({ message, kind }) };
  if (customAvailable) ui.custom = async (factory) => {
    component = factory({ width: 80 }, {
      style: (text, options) => `\u001b[${options.bold ? "1" : ""}m${text}\u001b[0m`,
      fg: (_color, text) => `\u001b[2m${text}\u001b[0m`,
    }, {}, () => { component.closed = true; });
    return undefined;
  };
  const ctx = { mode, hasUI, sessionManager: { getBranch: () => branch }, ui };
  return { pi, ctx, commands, sent, notifications, get component() { return component; } };
}

const visibleWidth = (value) => {
  const plain = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, "");
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(plain)].reduce((width, { segment }) => {
    if (/^\p{Mark}+$/u.test(segment)) return width;
    return width + (/[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u.test(segment) ? 2 : 1);
  }, 0);
};

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
    if (mode === "tui") {
      assert.ok(harness.component);
      assert.match(harness.component.render(100).join("\n"), /local-provider/);
      assert.equal(harness.notifications.length, 0);
      assert.equal(harness.sent.length, 0);
    } else {
      assert.match(harness.sent[0].message.content, /local-provider \/ local-model/);
      assert.equal(harness.sent[0].options.triggerTurn, false);
      assert.equal(harness.notifications.length, 0);
      assert.equal(harness.sent[0].message.display, true);
    }
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

test("opens a custom Usage panel, closes on Enter/Escape, and remains width-bounded", async () => {
  const branch = Object.freeze([
    Object.freeze({ ...assistant("p🚀", "m界", usage()), timestamp: "2025-01-05T23:59:00.000Z" }),
    Object.freeze({ ...assistant("p🚀", "m界", usage()), timestamp: "2025-01-06T00:00:00.000Z" }),
    Object.freeze({ ...assistant("provider-two", "model-two", usage()), timestamp: "2025-01-06T00:00:00.000Z" }),
  ]);
  const before = structuredClone(branch);
  const harness = makeHarness({ branch });
  registerSessionUsage(harness.pi);
  await harness.pi.registered.handler("", harness.ctx);
  assert.ok(harness.component);
  for (const width of [1, 2, 3, 6, 20, 40, 80, 120, 160]) {
    const lines = harness.component.render(width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width), `all ANSI/Unicode lines fit ${width} columns`);
    const text = lines.join("\n").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replaceAll("│", " ").replace(/\s+/g, " ");
    if (width >= 20) {
      assert.match(text, /Cotas dos provedores: não consultadas/);
      assert.match(text, /Atividade desta branch — não é histórico global/);
    }
    const plainLines = lines.map((line) => line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ""));
    if (width === 1 || width === 2) assert.ok(plainLines.every((line) => visibleWidth(line) <= width));
    if (width === 3) assert.equal(plainLines[0], "┌─┐");
    if (width >= 3) {
      assert.ok(plainLines.every((line) => visibleWidth(line) === width), `frame rows align at ${width} columns`);
      assert.ok(plainLines.slice(1, -1).every((line) => line.startsWith("│") && line.endsWith("│")));
      for (const line of lines.filter((line) => line.includes("\x1b["))) {
        assert.ok(line.lastIndexOf("\x1b[0m") < line.lastIndexOf("│"), "ANSI styles reset before the right frame edge");
      }
    }
    if (width === 6) assert.equal(plainLines[0], "┌────┐");
    if (width === 80) assert.ok(lines.some((line) => line.includes("53-week calendar")));
    if (width === 20) assert.ok(lines.some((line) => line.includes("Narrow: last")));
    if (width >= 20) assert.ok(lines.some((line) => line.includes("p🚀")));
  }
  const wideRender = harness.component.render(80).join("\n");
  assert.match(wideRender, /Dated responses: 3/);
  assert.match(wideRender, /provider-two/);
  assert.match(wideRender, /Model: model-two/);
  assert.match(wideRender, /Cache tokens: read 30 · write 10/);
  assert.match(wideRender, /Cache cost USD: read \$0\.000300 · write \$0\.000400 · total \$0\.003700/);
  harness.component.handleInput("\x1b");
  assert.equal(harness.component.closed, true);
  harness.component.closed = false;
  harness.component.handleInput("\r");
  assert.equal(harness.component.closed, true);
  assert.deepEqual(branch, before, "calendar and panel leave the active branch immutable");
});

test("empty branch calendar explicitly reports no dated responses", async () => {
  const harness = makeHarness({ branch: [] });
  registerSessionUsage(harness.pi);
  await harness.pi.registered.handler("", harness.ctx);
  assert.match(harness.component.render(80).join("\n"), /No dated assistant responses for this branch/);
});

test("activity grid uses a fixed 53-week UTC window, exact weekday cells, and honest excluded counts", () => {
  const now = Date.parse("2026-10-09T12:00:00.000Z");
  const entries = [
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2026-10-04T23:59:00.000Z" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2026-10-05T00:00:00.000Z" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2025-10-06T00:00:00.000Z" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2025-10-05T23:59:00.000Z" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2026-10-10T00:00:00.000Z" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "invalid" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2025-02-30T00:00:00.000Z" }),
    assistant("p", "m", usage()),
  ];
  const grid = activityGrid(entries, now);
  assert.equal(grid.startWeek, Date.parse("2025-10-06T00:00:00.000Z"));
  assert.equal(grid.endWeek, Date.parse("2026-10-05T00:00:00.000Z"));
  assert.equal(grid.dated, 4);
  assert.equal(grid.inWindow, 3);
  assert.equal(grid.excluded, 4);
  assert.deepEqual(grid.weeks[0], [1, 0, 0, 0, 0, 0, 0], "first window Monday is included");
  assert.deepEqual(grid.weeks[51], [0, 0, 0, 0, 0, 0, 1], "Sunday remains in its UTC week/day cell");
  assert.deepEqual(grid.weeks[52], [1, 0, 0, 0, 0, 0, 0], "following Monday starts the next UTC week");
  assert.ok(grid.months.includes("Oct"));

  const oldOnly = activityGrid([Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2025-10-05T23:59:00.000Z" })], now);
  assert.equal(oldOnly.dated, 1);
  assert.equal(oldOnly.inWindow, 0);
  assert.ok(oldOnly.weeks.every((week) => week.every((count) => count === 0)));
});

test("calendar counts branch assistant responses across UTC week boundaries and labels unusable dates", async () => {
  const branch = [
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2025-01-05T23:59:00.000Z" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2025-01-06T00:00:00.000Z" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2025-01-12T23:59:00.000Z" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "2025-01-13T00:00:00.000Z" }),
    assistant("p", "m", usage()),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: "not-a-date" }),
    Object.freeze({ ...assistant("p", "m", usage()), timestamp: new Date(Date.now() + 86400000).toISOString() }),
  ];
  const harness = makeHarness({ branch });
  registerSessionUsage(harness.pi);
  await harness.pi.registered.handler("", harness.ctx);
  const rendered = harness.component.render(120).join("\n");
  assert.match(rendered, /Dated responses: 4/);
  assert.match(rendered, /No date used for 3 assistant responses/);
  assert.match(rendered, /assistant responses/);
  assert.doesNotMatch(rendered, /\d+\s*%|reset|credit|expiry/i);
});

test("falls back to plain TUI notification when custom UI is unavailable", async () => {
  const harness = makeHarness({ customAvailable: false });
  registerSessionUsage(harness.pi);
  await harness.pi.registered.handler("", harness.ctx);
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message, /Estimated SDK cost/);
});

test("does not replace a command named usage", () => {
  const harness = makeHarness({ existing: ["session", "usage"] });
  registerSessionUsage(harness.pi);
  assert.equal(harness.pi.registered, undefined);
  assert.deepEqual(harness.commands.map((command) => command.name), ["session", "usage"]);
});
