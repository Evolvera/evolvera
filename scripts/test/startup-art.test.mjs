import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStartupArtFactory } from "../users/startup-art.mjs";
import { isEvolveraLabel, renderTerminalArt } from "../ui/terminal-art.mjs";
import { main as previewMain } from "../preview-terminal-art.mjs";

const handlersFor = (factory) => {
  const handlers = new Map();
  factory({ on(name, handler) { handlers.set(name, handler); } });
  return handlers;
};
const terminal = (rows = 30) => ({ terminal: { rows } });
const context = (manager, { mode = "tui", hasUI = true } = {}) => {
  const calls = [];
  const ui = { setWidget(...args) { calls.push(args); } };
  return { ctx: { mode, hasUI, sessionManager: manager, ui }, calls };
};

test("startup art appears once only for the managed root TUI startup and clears on input/agent start", () => {
  const manager = {};
  const handlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: false }));
  const startup = context(manager);
  handlers.get("session_start")({ reason: "startup" }, startup.ctx);
  assert.equal(startup.calls.length, 1);
  assert.equal(startup.calls[0][0], "startup-art-managed");
  assert.deepEqual(startup.calls[0][2], { placement: "aboveEditor" });
  const tui = terminal(24);
  const component = startup.calls[0][1](tui);
  assert.deepEqual(component.render(80), renderTerminalArt({ width: 80, height: 12, label: "Evolvera", color: false }));
  assert.deepEqual(component.render(60), renderTerminalArt({ width: 60, height: 12, label: "Evolvera", color: false }), "render follows width changes");
  tui.terminal.rows = 18;
  assert.deepEqual(component.render(80), renderTerminalArt({ width: 80, height: 8, label: "Evolvera", color: false }), "render follows terminal row changes");
  assert.deepEqual(startup.calls[0][1](terminal(13)).render(80), [], "tiny root terminals omit startup art");

  handlers.get("input")({ text: "hello" }, startup.ctx);
  assert.deepEqual(startup.calls.at(-1), ["startup-art-managed", undefined]);
  handlers.get("input")({}, startup.ctx);
  assert.equal(startup.calls.length, 2, "subsequent input does not clear other widgets");
  handlers.get("session_start")({ reason: "new" }, startup.ctx);
  handlers.get("session_start")({ reason: "startup" }, startup.ctx);
  assert.equal(startup.calls.length, 2, "startup art is one-shot for this process");

  const beforeAgent = handlersFor(createStartupArtFactory({ label: "Personal", sessionManager: manager, color: false }));
  const second = context(manager);
  beforeAgent.get("session_start")({ reason: "startup" }, second.ctx);
  beforeAgent.get("before_agent_start")({}, second.ctx);
  assert.deepEqual(second.calls.at(-1), ["startup-art-managed", undefined]);
});

test("startup handler ignores RPC, headless, non-TUI, other roots, and non-start session switches", () => {
  const manager = {};
  const handlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: false }));
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
  const colorHandlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager, color: true }));
  const coloredRoot = context(manager);
  colorHandlers.get("session_start")({ reason: "startup" }, coloredRoot.ctx);
  assert.deepEqual(coloredRoot.calls[0][1](terminal(30)).render(80), renderTerminalArt({ width: 80, height: 12, label: "Evolvera", color: true }));
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
    const handlers = handlersFor(createStartupArtFactory({ label: "Evolvera", sessionManager: manager }));
    const root = context(manager);
    handlers.get("session_start")({ reason: "startup" }, root.ctx);
    assert.deepEqual(root.calls[0][1](terminal(30)).render(80), renderTerminalArt({ width: 80, height: 12, label: "Evolvera", color: false }));
    const output = { text: "", write(value) { this.text += value; } };
    assert.equal(await previewMain(["--label", "Evolvera"], { output }), 0);
    assert.deepEqual(output.text.trimEnd().split("\n"), renderTerminalArt({ width: 80, height: 12, label: "Evolvera", color: false }));
  } finally {
    if (hadNoColor) process.env.NO_COLOR = previousNoColor;
    else delete process.env.NO_COLOR;
    if (previousTerm === undefined) delete process.env.TERM;
    else process.env.TERM = previousTerm;
  }
});

test("preview CLI is import-safe and validates bounded options without account access", async () => {
  const output = { text: "", isTTY: false, write(value) { this.text += value; } };
  assert.equal(await previewMain(["--label", "Evolvera", "--width", "72", "--height", "12", "--no-color"], { output }), 0);
  assert.deepEqual(output.text.trimEnd().split("\n"), renderTerminalArt({ width: 72, height: 12, label: "Evolvera", color: false }));
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

