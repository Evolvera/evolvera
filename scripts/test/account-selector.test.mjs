import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import readline from "node:readline";
import { CREATE_ACCOUNT, renderAccountMenu, selectAccountMenu as openAccountMenu } from "../users/account-selector.mjs";
// Most lifecycle tests exercise static rendering without waiting for wall time.
const selectAccountMenu = (options) => openAccountMenu({ animate: false, ...options });
const plain = (text) => text.replace(/\u001b\[[0-9;]*m/gu, "");
const screenRows = (text) => {
  const cells = new Map();
  let row = 0;
  let column = 0;
  for (let i = 0; i < text.length;) {
    if (text[i] === "\u001b" && text[i + 1] === "[") {
      const end = text.indexOf("H", i);
      if (end >= 0 && /^[0-9;]*$/u.test(text.slice(i + 2, end))) {
        const [r = 1, c = 1] = text.slice(i + 2, end).split(";").map(Number);
        row = r - 1; column = c - 1; i = end + 1; continue;
      }
      const final = text.slice(i + 2).search(/[ -/]*[@-~]/u);
      if (final >= 0) { i += final + 3; continue; }
    }
    if (text[i] === "\r") { column = 0; i++; continue; }
    if (text[i] === "\n") { row++; column = 0; i++; continue; }
    const point = String.fromCodePoint(text.codePointAt(i));
    const line = cells.get(row) ?? [];
    for (const [offset, char] of [...point].entries()) line[column + offset] = char;
    cells.set(row, line); column += [...point].length; i += point.length;
  }
  return [...cells.values()].map((line) => line?.join("") ?? "");
};
const includesRows = (actual, expected) => expected.every((line, index) => actual[index]?.startsWith(plain(line)));
import { renderTerminalArt } from "../ui/terminal-art.mjs";

class FakeInput extends PassThrough {
  constructor() {
    super();
    this.isTTY = true;
    this.isRaw = false;
  }
  setRawMode(value) { this.isRaw = value; return this; }
}
class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.columns = 80;
    this.rows = 24;
    this.text = "";
  }
  write(chunk) { this.text += chunk; return true; }
  cursorTo() { return true; }
  clearLine() { return true; }
}
const users = [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }];
const baseline = (emitter) => new Map(emitter.eventNames().map((event) => [event, emitter.listeners(event)]));
const assertListeners = (emitter, before) => {
  assert.deepEqual(emitter.eventNames().sort(), [...before.keys()].sort());
  for (const [event, listeners] of before) assert.deepEqual(emitter.listeners(event), listeners, `${String(event)} listeners restored`);
};
const data = (input, value) => input.write(Buffer.from(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function choose(chunks, { users: choices = users, input = new FakeInput(), output = new FakeOutput() } = {}) {
  const before = baseline(input);
  const paused = input.isPaused();
  const raw = input.isRaw;
  const pending = selectAccountMenu({ users: choices, input, output });
  for (const chunk of chunks) data(input, chunk);
  const selected = await pending;
  assert.equal(input.isRaw, raw);
  assert.equal(input.isPaused(), paused);
  assertListeners(input, before);
  return { selected, input, output };
}

test("Buffer input selects saved accounts; default Enter chooses the first", async () => {
  const { selected, output } = await choose(["\r"]);
  assert.equal(selected, "alpha");
  assert.match(output.text, /SELECT YOUR PROFILE/u);
});

test("split ANSI/SS3 arrows and batched input navigate with wrapping", async () => {
  assert.equal((await choose(["\u001b", "[A", "\r"])).selected, CREATE_ACCOUNT);
  assert.equal((await choose(["\u001b[A\u001bOB\r"])).selected, "alpha");
  assert.equal((await choose(["\u001b[B\r\r"])).selected, "beta", "batched returns settle only the first selection");
  assert.equal((await choose(["\u001b[B\u001b[B\r"])).selected, CREATE_ACCOUNT);
});

test("empty users expose create; Escape and Ctrl-C cancel", async () => {
  const { selected, output } = await choose(["\r"], { users: [] });
  assert.equal(selected, CREATE_ACCOUNT);
  assert.match(output.text, /Create new account/u);
  assert.equal((await choose(["\u001b"])).selected, null);
  assert.equal((await choose(["\u0003"])).selected, null);
});

test("repeated menus on the same stream leave readline's shared decoder usable", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  assert.equal((await choose(["\u001b[B\r"], { input, output })).selected, "beta");
  assert.equal((await choose(["\r"], { input, output })).selected, "alpha");

  const lines = readline.createInterface({ input, output, terminal: true });
  const answer = new Promise((resolve) => lines.question("creation: ", resolve));
  await tick();
  data(input, "create alpha Created account\r");
  assert.equal(await answer, "create alpha Created account");
  lines.close();
});

test("listeners added by another owner while waiting are preserved", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const pending = selectAccountMenu({ users, input, output });
  const other = () => {};
  input.on("data", other);
  data(input, "\r");
  assert.equal(await pending, "alpha");
  assert.deepEqual(input.listeners("data"), [other]);
  input.off("data", other);
});

test("close, error, and setup/write failures settle once and clean owned lifecycle state", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const before = baseline(input);
  const wasPaused = input.isPaused();
  const pending = selectAccountMenu({ users, input, output });
  input.destroy();
  assert.equal(await pending, null);
  assert.equal(input.isRaw, false);
  assert.equal(input.isPaused(), wasPaused);
  assertListeners(input, before);

  const errored = new FakeInput();
  const errorOutput = new FakeOutput();
  const erroredWasPaused = errored.isPaused();
  const failed = selectAccountMenu({ users, input: errored, output: errorOutput });
  const error = new Error("synthetic input error");
  errored.emit("error", error);
  await assert.rejects(failed, (actual) => actual === error);
  assert.equal(errored.isRaw, false);
  assert.equal(errored.isPaused(), erroredWasPaused);

  const writeFailed = new FakeInput();
  const writeFailedWasPaused = writeFailed.isPaused();
  const badOutput = new FakeOutput();
  badOutput.write = () => { throw new Error("synthetic output write failure"); };
  await assert.rejects(selectAccountMenu({ users, input: writeFailed, output: badOutput }), /synthetic output write failure/u);
  assert.equal(writeFailed.isRaw, false);
  assert.equal(writeFailed.isPaused(), writeFailedWasPaused);

  const outputErrored = new FakeInput();
  const outputErrorStream = new FakeOutput();
  const outputWasPaused = outputErrored.isPaused();
  const outputFailure = selectAccountMenu({ users, input: outputErrored, output: outputErrorStream });
  const outputError = new Error("synthetic output stream error");
  outputErrorStream.emit("error", outputError);
  await assert.rejects(outputFailure, (actual) => actual === outputError);
  assert.equal(outputErrored.isRaw, false);
  assert.equal(outputErrored.isPaused(), outputWasPaused);
});

test("non-TTY streams retain the headless selection error", async () => {
  await assert.rejects(selectAccountMenu({ users, input: new EventEmitter(), output: new FakeOutput() }), { code: "ACCOUNT_SELECTION_REQUIRED" });
});

test("account picker redraws label-responsive art, resizes, and preserves tiny viewports", async () => {
  const output = new FakeOutput();
  const input = new FakeInput();
  const pending = selectAccountMenu({ users, input, output, color: false });
  const firstArt = renderTerminalArt({ width: 79, height: 17, label: "Alpha", color: false }).join("\n");
  assert.ok(includesRows(screenRows(output.text), firstArt.split("\n")));
  data(input, "\u001b[B");
  const secondArt = renderTerminalArt({ width: 79, height: 17, label: "Beta", color: false }).join("\n");
  assert.ok(includesRows(screenRows(output.text), secondArt.split("\n")), "highlight changes the art label");
  const listenersBeforeResize = output.listenerCount("resize");
  output.rows = 14;
  output.emit("resize");
  assert.ok(includesRows(screenRows(output.text), renderTerminalArt({ width: 79, height: 7, label: "Beta", color: false })));
  data(input, "\r");
  assert.equal(await pending, "beta");
  assert.equal(output.listenerCount("resize"), listenersBeforeResize - 1, "owned resize listener is removed");

  for (const height of [1, 2, 3, 4, 9]) {
    const rendered = renderAccountMenu(users, { width: 80, height, selected: 0, color: false });
    assert.ok(rendered.split("\n").length <= height);
    assert.match(rendered, /SELECT YOUR PROFILE|Alpha/u);
    assert.doesNotMatch(rendered, /Acid Shellscape/u, "small viewports omit art");
  }
});

test("interactive scrolling uses the effective viewport at the HUD width boundary", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 44; output.rows = 12;
  const choices = Array.from({ length: 12 }, (_, index) => ({ id: `user${index}`, label: `User${index}` }));
  const pending = selectAccountMenu({ users: choices, input, output, color: false });
  try {
    for (let index = 0; index < 5; index++) data(input, "\u001b[B");
    const expected = renderAccountMenu(choices, { width: 43, height: 12, selected: 5, offset: 0, color: false });
    assert.ok(includesRows(screenRows(output.text), expected.split("\n")), "do not scroll before the visible list reaches its edge");
  } finally {
    data(input, "\r");
    await pending;
  }
});

test("slow output coalesces animation while keyboard selection remains immediate and latest at drain", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.writes = [];
  output.blocked = false;
  output.write = function (text, callback) { this.writes.push({ text, callback }); return !this.blocked; };
  output.drain = function () { this.blocked = false; this.emit("drain"); };
  const clock = new FakeClock();
  output.blocked = true;
  const pending = openAccountMenu({ users, input, output, color: false, animationClock: clock });
  assert.equal(output.writes.length, 1);
  clock.advance(1000);
  data(input, "\u001b[B");
  clock.advance(1084);
  data(input, "\u001b[B");
  assert.equal(output.writes.length, 1, "animation ticks and arrows do not enqueue frames while blocked");
  output.drain();
  assert.equal(output.writes.length, 2, "drain emits one current row diff");
  assert.match(output.writes[1].text, /> Create new account/u, "drain renders the latest selected profile");
  data(input, "\r");
  assert.equal(await pending, CREATE_ACCOUNT, "selection resolves without waiting for another drain");
  assert.equal(clock.timers.size, 0);
  assert.equal(output.listenerCount("drain"), 0);
});

test("real Writable EPIPE is handled without uncaught error after picker cleanup", async () => {
  const input = new FakeInput();
  const failure = Object.assign(new Error("synthetic picker EPIPE"), { code: "EPIPE" });
  const output = new Writable({ write(_chunk, _encoding, callback) { queueMicrotask(() => callback(failure)); } });
  Object.assign(output, { isTTY: true, columns: 80, rows: 24 });
  const seen = [];
  const otherErrorListener = (error) => seen.push(error);
  output.on("error", otherErrorListener);
  const clock = new FakeClock();
  await assert.rejects(openAccountMenu({ users, input, output, animationClock: clock }), (error) => error === failure);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [failure], "Writable emitted one handled error event");
  assert.deepEqual(output.listeners("error"), [otherErrorListener]);
  assert.equal(input.isRaw, false);
  assert.equal(clock.timers.size, 0);
});

test("resize write failures reject and clean up the picker lifecycle", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const before = baseline(input);
  const wasPaused = input.isPaused();
  const failure = new Error("synthetic resize write failure");
  const pending = selectAccountMenu({ users, input, output, color: false });
  output.write = () => { throw failure; };
  output.columns = 60;
  output.emit("resize");
  await assert.rejects(pending, (error) => error === failure);
  assert.equal(input.isRaw, false);
  assert.equal(input.isPaused(), wasPaused);
  assertListeners(input, before);
  assert.equal(output.listenerCount("resize"), 0);
});

test("empty NO_COLOR suppresses picker colors and restores the environment", async () => {
  const hadNoColor = Object.hasOwn(process.env, "NO_COLOR");
  const previousNoColor = process.env.NO_COLOR;
  const previousTerm = process.env.TERM;
  try {
    process.env.NO_COLOR = "";
    process.env.TERM = "xterm-256color";
    const input = new FakeInput();
    const output = new FakeOutput();
    const pending = selectAccountMenu({ users, input, output });
    assert.doesNotMatch(output.text, /\u001b\[(?!0m)[0-9;]*m/u);
    data(input, "\r");
    assert.equal(await pending, "alpha");
  } finally {
    if (hadNoColor) process.env.NO_COLOR = previousNoColor;
    else delete process.env.NO_COLOR;
    if (previousTerm === undefined) delete process.env.TERM;
    else process.env.TERM = previousTerm;
  }
});

test("renderer handles display-cell widths, viewport scrolling, and tiny heights", () => {
  const labels = [
    { id: "alpha", label: "中文 account" },
    { id: "beta", label: "👩‍💻 account" },
    { id: "gamma", label: "e\u0301 account" },
    { id: "delta", label: "Name\u001b[31m\nInjected" },
  ];
  const narrow = renderAccountMenu(labels, { width: 12, height: 7, selected: 2 });
  assert.equal(narrow.split("\n").length, 7);
  const widthOf = (line) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line)]
    .reduce((width, part) => width + (/\p{Extended_Pictographic}|[\u{1f1e6}-\u{1f1ff}]/u.test(part.segment) || /[\u1100-\u115f\u2329\u232a\u2e80-\u303e\u3040-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(part.segment) ? 2 : 1), 0);
  assert.ok(narrow.split("\n").every((line) => widthOf(line) <= 12));
  assert.match(narrow, /> e\u0301 account/u, "selected friendly label remains in viewport");
  assert.match(narrow, /👩‍💻/u, "emoji joiner stays within one measured grapheme");
  assert.match(narrow, /中/u);
  assert.equal(narrow.includes("\u001b[31m"), false);
  const scrolled = renderAccountMenu(labels, { width: 32, height: 7, selected: 4, offset: 0 });
  assert.match(scrolled, /> Create new account/u, "viewport follows a selected item below its initial range");
  assert.equal(renderAccountMenu(labels, { width: 12, height: 1, selected: 2 }).split("\n").length, 1);
  assert.equal(renderAccountMenu(labels, { width: 12, height: 0, selected: 2 }).split("\n").length, 1);
  const twoRows = renderAccountMenu(labels, { width: 12, height: 2, selected: 2 }).split("\n");
  assert.equal(twoRows.length, 2);
  assert.match(twoRows[1], /> e\u0301 account/u);
  assert.equal(renderAccountMenu(labels, { width: 12, height: 3, selected: 3 }).split("\n").length, 3);
});

class FakeClock {
  value = 0;
  timers = new Map();
  starts = 0;
  now = () => this.value;
  setInterval = (fn) => { const handle = ++this.starts; this.timers.set(handle, fn); return handle; };
  clearInterval = (handle) => { this.timers.delete(handle); };
  advance(value) { this.value = value; for (const fn of [...this.timers.values()]) fn(); }
}

test("profile HUD is centered, highlighted, deduplicated, and budgets all remaining scene rows", () => {
  const choices = [{ id: "evolvera", label: "Evolvera" }, { id: "personal", label: "Personal" }];
  for (const [height, sceneRows] of [[24, 17], [36, 29]]) {
    const frame = renderAccountMenu(choices, { width: 120, height, color: true });
    const lines = plain(frame).split("\n");
    assert.equal(lines.length, height);
    assert.deepEqual(lines.slice(0, sceneRows), renderTerminalArt({ width: 120, height: sceneRows, label: "Evolvera" }).map(plain));
    assert.equal(lines[sceneRows], "", "one blank row separates the unchanged scene from the login box");
    assert.ok(lines[sceneRows + 1].startsWith(" ".repeat(32) + "+- SELECT YOUR PROFILE"));
    assert.match(frame, /48;2;233;196;255m> Evolvera/u, "active profile has a filled highlight");
    assert.doesNotMatch(frame, /evolvera \(Evolvera\)|Evolvera \/ evolvera/u);
    assert.match(frame, /Create new account/u);
    assert.match(frame, /↑\/↓ select · ENTER start · ESC back/u);
    assert.ok(lines.every((line) => [...line].length <= 120));
  }
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `profile${i}`, label: `Profile ${i}` }));
  for (let selected = 0; selected <= many.length; selected++) {
    const frame = renderAccountMenu(many, { width: 80, height: 36, selected });
    assert.equal(frame.split("\n").length, 36);
    assert.match(frame, new RegExp(`> ${selected === 20 ? "Create new account" : `Profile ${selected} / profile${selected}`}`, "u"));
  }
  for (const [width, height] of [[1, 1], [20, 3], [40, 8], [44, 12], [240, 80], [1e10, 1e10]]) {
    const frame = plain(renderAccountMenu(choices, { width, height, selected: NaN, offset: Infinity }));
    assert.ok(frame.split("\n").length <= Math.min(height, 80));
    assert.ok(frame.split("\n").every((line) => [...line].length <= Math.min(width, 240)));
  }
});

test("one layered animation accepts immediate input, branding follows current progress, resize never restarts", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const clock = new FakeClock();
  const choices = [{ id: "personal", label: "Personal" }, { id: "evolvera", label: "Evolvera" }];
  const pending = openAccountMenu({ users: choices, input, output, color: true, animationClock: clock });
  assert.equal(clock.starts, 1);
  assert.equal(clock.timers.size, 1);
  clock.advance(1350);
  let from = output.text.length;
  data(input, "\u001b[B");
  assert.ok(includesRows(screenRows(output.text), renderTerminalArt({ width: 79, height: 17, label: "Evolvera", color: true, progress: .9, timeMs: 1350 })));
  assert.match(output.text.slice(from), /172;119;125/u, "the revealed ship body uses timber coloring");
  assert.doesNotMatch(output.text.slice(from), /33;148;208/u, "the flag has not yet been revealed at intro progress .9");
  from = output.text.length;
  data(input, "\u001b[A");
  assert.doesNotMatch(output.text.slice(from), /33;148;208|18;75;133/u);
  assert.equal(output.text.match(/\u001b\[2J/gu).length, 1, "ticks and input redraw owned lines without full clear");
  output.rows = 36;
  output.columns = 120;
  output.emit("resize");
  assert.equal(output.text.match(/\u001b\[2J/gu).length, 1, "resize redraws owned coordinates without clearing the alternate screen");
  assert.equal(clock.starts, 1);
  clock.advance(1500);
  assert.equal(clock.timers.size, 1, "ambient animation continues after the intro");
  const beforeAmbient = output.text.length;
  clock.advance(2850);
  assert.ok(output.text.length > beforeAmbient, "ambient ticks redraw while awaiting input");
  clock.advance(3350);
  from = output.text.length;
  data(input, "\u001b[B");
  assert.ok(includesRows(screenRows(output.text), renderTerminalArt({ width: 119, height: 29, label: "Evolvera", color: true, progress: 1, timeMs: 3350 })), "continuous elapsed time reaches the rendered ambient frame");
  assert.match(output.text.slice(from), /33;148;208/u, "the fully revealed Evolvera flag is blue");
  data(input, "\u001b[A");
  data(input, "\r");
  assert.equal(await pending, "personal");
  assert.equal(output.listenerCount("resize"), 0);
});

test("animation timers and all owned listeners stop on early selection, cancellation, end, close and errors", async () => {
  for (const action of ["enter", "ctrl-c", "escape", "end", "close", "output-close", "input-error", "output-error"]) {
    const input = new FakeInput();
    const output = new FakeOutput();
    const clock = new FakeClock();
    const inputBefore = baseline(input);
    const outputBefore = baseline(output);
    const pending = openAccountMenu({ users, input, output, animationClock: clock });
    const error = new Error(`synthetic ${action}`);
    if (action === "enter") data(input, "\r");
    if (action === "ctrl-c") data(input, "\u0003");
    if (action === "escape") data(input, "\u001b");
    if (action === "end") input.emit("end");
    if (action === "close") input.emit("close");
    if (action === "output-close") output.emit("close");
    if (action === "input-error") input.emit("error", error);
    if (action === "output-error") output.emit("error", error);
    if (action.endsWith("error")) await assert.rejects(pending, (actual) => actual === error);
    else assert.equal(await pending, action === "enter" ? "alpha" : null);
    assert.equal(clock.timers.size, 0, action);
    assert.equal(input.isRaw, false);
    assertListeners(input, inputBefore);
    assertListeners(output, outputBefore);
  }
});

test("animation write callback failures reject rather than throwing from the timer", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const clock = new FakeClock();
  const error = new Error("synthetic asynchronous write failure");
  const pending = openAccountMenu({ users, input, output, animationClock: clock });
  output.write = (text, callback) => { queueMicrotask(() => callback?.(error)); return false; };
  assert.doesNotThrow(() => clock.advance(200));
  await assert.rejects(pending, (actual) => actual === error);
  assert.equal(clock.timers.size, 0);
  assert.equal(input.isRaw, false);
  assert.equal(output.listenerCount("resize"), 0);
});

test("animate false and dumb terminals render final art without allocating an interval", async () => {
  const previous = process.env.TERM;
  try {
    for (const dumb of [false, true]) {
      process.env.TERM = dumb ? "dumb" : "xterm-256color";
      const clock = new FakeClock();
      const input = new FakeInput();
      const output = new FakeOutput();
      const pending = openAccountMenu({ users, input, output, animate: dumb, animationClock: clock, color: false });
      assert.equal(clock.starts, 0);
      assert.ok(includesRows(screenRows(output.text), renderTerminalArt({ width: 79, height: 17, color: false })));
      data(input, "\r");
      assert.equal(await pending, "alpha");
    }
  } finally {
    if (previous === undefined) delete process.env.TERM;
    else process.env.TERM = previous;
  }
});
