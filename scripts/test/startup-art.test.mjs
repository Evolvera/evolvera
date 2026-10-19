import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { createStartupArtFactory } from "../users/startup-art.mjs";
import { isEvolveraLabel, renderTerminalArt } from "../ui/terminal-art.mjs";
import { main as previewMain } from "../preview-terminal-art.mjs";

const handlersFor = (factory) => {
  const handlers = new Map();
  factory({ on(name, handler) { handlers.set(name, handler); } });
  return handlers;
};
const terminal = (rows = 30, extras = {}) => ({ terminal: { rows }, ...extras });
const fakeClock = () => {
  let time = 0;
  let callback;
  let clears = 0;
  return { clock: { now: () => time, setInterval(fn) { callback = fn; return 1; }, clearInterval() { callback = undefined; clears++; } },
    tick(ms) { time += ms; callback?.(); }, get active() { return Boolean(callback); }, get clears() { return clears; } };
};
const context = (manager, { mode = "tui", hasUI = true } = {}) => {
  const calls = [];
  const ui = { setWidget(...args) { calls.push(args); } };
  return { ctx: { mode, hasUI, sessionManager: manager, ui }, calls };
};

test("startup art appears once only for the managed root TUI startup and clears on input/agent start", () => {
  const manager = {};
  const handlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: false, animate: false }));
  const startup = context(manager);
  handlers.get("session_start")({ reason: "startup" }, startup.ctx);
  assert.equal(startup.calls.length, 1);
  assert.equal(startup.calls[0][0], "startup-art-managed");
  assert.deepEqual(startup.calls[0][2], { placement: "aboveEditor" });
  const tui = terminal(24);
  const component = startup.calls[0][1](tui);
  assert.deepEqual(component.render(80), renderTerminalArt({ width: 80, height: 12, label: "Evolvera", color: false, progress: 1 }));
  assert.deepEqual(component.render(60), renderTerminalArt({ width: 60, height: 12, label: "Evolvera", color: false, progress: 1 }), "render follows width changes");
  tui.terminal.rows = 40;
  assert.deepEqual(component.render(80), renderTerminalArt({ width: 80, height: 20, label: "Evolvera", color: false, progress: 1 }), "40-row terminals reserve half the viewport");
  tui.terminal.rows = 18;
  assert.deepEqual(component.render(80), renderTerminalArt({ width: 80, height: 8, label: "Evolvera", color: false, progress: 1 }), "render follows terminal row changes");
  assert.deepEqual(startup.calls[0][1](terminal(11)).render(80), [], "tiny root terminals omit startup art");

  handlers.get("input")({ text: "hello" }, startup.ctx);
  assert.deepEqual(startup.calls.at(-1), ["startup-art-managed", undefined]);
  handlers.get("input")({}, startup.ctx);
  assert.equal(startup.calls.length, 2, "subsequent input does not clear other widgets");
  handlers.get("session_start")({ reason: "new" }, startup.ctx);
  handlers.get("session_start")({ reason: "startup" }, startup.ctx);
  assert.equal(startup.calls.length, 2, "startup art is one-shot for this process");

  const beforeAgent = handlersFor(createStartupArtFactory({ label: "Personal", sessionManager: manager, color: false, animate: false }));
  const second = context(manager);
  beforeAgent.get("session_start")({ reason: "startup" }, second.ctx);
  beforeAgent.get("before_agent_start")({}, second.ctx);
  assert.deepEqual(second.calls.at(-1), ["startup-art-managed", undefined]);
});

test("startup animation redraws via TUI, stops on input/dispose, and never schedules for tiny or rejected roots", () => {
  const manager = {};
  const fake = fakeClock();
  const handlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: false, animationClock: fake.clock }));
  const root = context(manager);
  handlers.get("session_start")({ reason: "startup" }, root.ctx);
  const requests = { count: 0 };
  const tui = terminal(44, { requestRender() { requests.count++; } });
  const component = root.calls[0][1](tui);
  assert.equal(fake.active, true);
  fake.tick(750);
  assert.equal(requests.count, 2, "initial and timed frames request TUI redraws");
  component.render(80);
  handlers.get("input")({}, root.ctx);
  assert.equal(fake.active, false);
  assert.equal(fake.clears, 1);
  component.dispose();
  assert.equal(fake.clears, 1);

  const tinyClock = fakeClock();
  const tiny = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: false, animationClock: tinyClock.clock }));
  const tinyRoot = context(manager);
  tiny.get("session_start")({ reason: "startup" }, tinyRoot.ctx);
  const tinyTui = terminal(11);
  const tinyComponent = tinyRoot.calls[0][1](tinyTui);
  assert.deepEqual(tinyComponent.render(80), []);
  assert.equal(tinyClock.active, false);
  tinyTui.terminal.rows = 40;
  assert.deepEqual(tinyComponent.render(80), renderTerminalArt({ width: 80, height: 20, label: "Evolvera", color: false, progress: 1 }));

  const failingClock = fakeClock();
  const failingHandlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: false, animationClock: failingClock.clock }));
  const failingRoot = context(manager);
  failingHandlers.get("session_start")({ reason: "startup" }, failingRoot.ctx);
  const failingComponent = failingRoot.calls[0][1](terminal(44, { requestRender() { throw new Error("redraw failed"); } }));
  failingClock.tick(750);
  assert.equal(failingClock.active, false);
  assert.deepEqual(failingComponent.render(80), renderTerminalArt({ width: 80, height: 22, label: "Evolvera", color: false, progress: 1 }));
});

test("startup handler ignores RPC, headless, non-TUI, other roots, and non-start session switches", () => {
  const manager = {};
  const handlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: false, animate: false }));
  for (const reason of ["reload", "new", "resume", "fork"]) {
    const { ctx, calls } = context(manager);
    handlers.get("session_start")({ reason }, ctx);
    assert.equal(calls.length, 0, reason);
  }
  for (const options of [{ mode: "rpc" }, { mode: "tui", hasUI: false }, { mode: "tui", other: true }]) {
    const otherManager = options.other ? {} : manager;
    const { ctx, calls } = context(otherManager, options);
    handlers.get("session_start")({ reason: "startup" }, ctx);
    assert.equal(calls.length, 0);
  }
  const noUi = context(manager, { mode: "tui", hasUI: false });
  handlers.get("session_start")({ reason: "startup" }, noUi.ctx);
  assert.equal(noUi.calls.length, 0);
  const { ctx, calls } = context(manager, { mode: "rpc", hasUI: true });
  handlers.get("session_start")({ reason: "startup" }, ctx);
  assert.equal(calls.length, 0, "hasUI alone does not identify interactive TUI");
  const rootStartup = context(manager);
  handlers.get("session_start")({ reason: "startup" }, rootStartup.ctx);
  assert.equal(rootStartup.calls.length, 1, "rejected non-root events do not consume startup eligibility");
});

test("label policy is exact, trimmed, and case-insensitive only for Evolvera", () => {
  assert.equal(isEvolveraLabel("eVolVeRa"), true);
  assert.equal(isEvolveraLabel(" Evolvera "), true);
  assert.equal(isEvolveraLabel("Evolvera!"), false);
  assert.equal(isEvolveraLabel("Personal"), false, "account identity does not supply a label fallback");
  const ordinary = renderTerminalArt({ width: 80, height: 12, label: "Evolvera!", color: false });
  const evolvera = renderTerminalArt({ width: 80, height: 12, label: "Evolvera", color: false });
  assert.notDeepEqual(ordinary, evolvera);
  assert.notDeepEqual(renderTerminalArt({ width: 80, height: 12, label: "Personal", color: false }), evolvera);
  const manager = {};
  const colorHandlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: true, animate: false }));
  const coloredRoot = context(manager);
  colorHandlers.get("session_start")({ reason: "startup" }, coloredRoot.ctx);
  assert.deepEqual(coloredRoot.calls[0][1](terminal(30)).render(80), renderTerminalArt({ width: 80, height: 15, label: "Evolvera", color: true, progress: 1 }));
});

test("managed runtime wiring uses the selected label and exact root session manager", () => {
  const source = readFileSync(new URL("../users/runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /\{ name: "startup-art-managed", builtin: true, factory: createStartupArtFactory\(\{ label: account\.label, sessionManager: request\.sessionManager \}\) \}/u);
});

test("empty NO_COLOR disables startup and standalone preview color and restores the environment", async () => {
  const hadNoColor = Object.hasOwn(process.env, "NO_COLOR");
  const previousNoColor = process.env.NO_COLOR;
  const previousTerm = process.env.TERM;
  try {
    process.env.NO_COLOR = "";
    process.env.TERM = "xterm-256color";
    const manager = {};
    const handlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, animate: false }));
    const root = context(manager);
    handlers.get("session_start")({ reason: "startup" }, root.ctx);
    assert.deepEqual(root.calls[0][1](terminal(30)).render(80), renderTerminalArt({ width: 80, height: 15, label: "Evolvera", color: false, progress: 1 }));
    const output = { text: "", write(value) { this.text += value; } };
    assert.equal(await previewMain(["--label", "Evolvera"], { output }), 0);
    assert.deepEqual(output.text.trimEnd().split("\n"), renderTerminalArt({ width: 80, height: 16, label: "Evolvera", color: false, progress: 1 }));
  } finally {
    if (hadNoColor) process.env.NO_COLOR = previousNoColor;
    else delete process.env.NO_COLOR;
    if (previousTerm === undefined) delete process.env.TERM;
    else process.env.TERM = previousTerm;
  }
});

test("preview animates only on TTY and prints one clean final frame otherwise or when opted out", async () => {
  const nonTty = { text: "", isTTY: false, write(value) { this.text += value; } };
  assert.equal(await previewMain(["--label", "Evolvera"], { output: nonTty }), 0);
  assert.equal(nonTty.text.trimEnd().split("\n").length, 16);
  assert.doesNotMatch(nonTty.text, /\u001b\[(?:2J|H|s|u)/u);

  const optedOut = { text: "", isTTY: true, rows: 24, columns: 80, write(value) { this.text += value; } };
  assert.equal(await previewMain(["--label", "Evolvera", "--no-animation", "--no-color"], { output: optedOut }), 0);
  assert.doesNotMatch(optedOut.text, /\u001b\[(?:2J|H|s|u)/u);
  const cramped = { text: "", isTTY: true, rows: 4, columns: 10, write(value) { this.text += value; } };
  assert.equal(await previewMain(["--label", "Evolvera", "--no-animation", "--width", "200", "--height", "40", "--no-color"], { output: cramped }), 0);
  assert.equal(cramped.text.trimEnd().split("\n").length, 3, "real TTY dimensions bound explicit scene height");

  const fake = fakeClock();
  const tty = { text: "", isTTY: true, rows: 24, columns: 80, write(value) { this.text += value; } };
  const pending = previewMain(["--label", "Evolvera", "--no-color"], { output: tty, animationClock: fake.clock });
  assert.doesNotMatch(tty.text, /\u001b\[(?:H|s|u|2J)/u);
  fake.tick(1500);
  assert.equal(await pending, 0);
  assert.equal(fake.active, false);
  assert.match(tty.text, /\u001b\[16A\r/u);
  assert.doesNotMatch(tty.text, /\u001b\[(?:H|s|u|2J)/u);
});

test("preview write failures reject after cleanup and remove timer and signal listeners", async () => {
  const fake = fakeClock();
  const baseline = { int: process.listenerCount("SIGINT"), term: process.listenerCount("SIGTERM") };
  let writes = 0;
  const output = { isTTY: true, rows: 24, columns: 80, write() { writes++; if (writes === 18) throw new Error("terminal write failed"); } };
  const pending = previewMain(["--label", "Evolvera", "--no-color"], { output, animationClock: fake.clock });
  assert.equal(writes, 16, "initial frame is drawn inline");
  fake.tick(100);
  await assert.rejects(pending, /terminal write failed/u);
  assert.equal(fake.active, false);
  assert.equal(process.listenerCount("SIGINT"), baseline.int);
  assert.equal(process.listenerCount("SIGTERM"), baseline.term);
});

test("preview output failure on the deadline frame also settles and removes owned listeners", async () => {
  const fake = fakeClock();
  const baseline = { int: process.listenerCount("SIGINT"), term: process.listenerCount("SIGTERM") };
  let writes = 0;
  const output = { isTTY: true, rows: 24, columns: 80, write() { if (++writes === 17) throw new Error("final frame write failed"); } };
  const pending = previewMain(["--label", "Evolvera", "--no-color"], { output, animationClock: fake.clock });
  fake.tick(1500);
  await assert.rejects(pending, /final frame write failed/u);
  assert.equal(fake.active, false);
  assert.equal(process.listenerCount("SIGINT"), baseline.int);
  assert.equal(process.listenerCount("SIGTERM"), baseline.term);
});

test("preview stream errors and close cancel animation and remove only owned listeners", async () => {
  const previousTerm = process.env.TERM;
  process.env.TERM = "xterm-256color";
  try {
    for (const event of ["error", "close", "initial-error"]) {
      const fake = fakeClock();
      const output = new EventEmitter();
      Object.assign(output, { isTTY: true, rows: 24, columns: 80 });
      const failure = Object.assign(new Error("synthetic broken output"), { code: "EPIPE" });
      const other = () => {};
      output.on("error", other);
      output.on("close", other);
      output.write = () => {
        if (event === "initial-error") output.emit("error", failure);
        return true;
      };
      const beforeInterrupt = process.listeners("SIGINT");
      const beforeTerminate = process.listeners("SIGTERM");
      const pending = previewMain(["--label", "Evolvera"], { output, animationClock: fake.clock });
      const rejected = assert.rejects(pending, event === "close" ? /output closed/u : (error) => error === failure);
      if (event !== "initial-error") {
        assert.equal(fake.active, true);
        output.emit(event, failure);
      }
      await rejected;
      assert.equal(fake.active, false, event);
      assert.deepEqual(output.listeners("error"), [other]);
      assert.deepEqual(output.listeners("close"), [other]);
      assert.deepEqual(process.listeners("SIGINT"), beforeInterrupt);
      assert.deepEqual(process.listeners("SIGTERM"), beforeTerminate);
    }
  } finally {
    if (previousTerm === undefined) delete process.env.TERM;
    else process.env.TERM = previousTerm;
  }
});

test("preview CLI is import-safe and validates bounded options without account access", async () => {
  const output = { text: "", isTTY: false, write(value) { this.text += value; } };
  assert.equal(await previewMain(["--label", "Evolvera", "--width", "72", "--height", "12", "--no-color"], { output }), 0);
  assert.deepEqual(output.text.trimEnd().split("\n"), renderTerminalArt({ width: 72, height: 12, label: "Evolvera", color: false, progress: 1 }));
  output.text = "";
  assert.equal(await previewMain(["--width", "0", "--label", "Personal"], { output }), 2);
  assert.match(output.text, /positive integer/u);
  output.text = "";
  assert.equal(await previewMain(["--select"], { input: { isTTY: false }, output }), 2);
  assert.match(output.text, /requires an interactive TTY/u);
  output.text = "";
  assert.equal(await previewMain(["--help"], { output }), 0);
  assert.match(output.text, /synthetic Evolvera\/Pessoal/u);
});

