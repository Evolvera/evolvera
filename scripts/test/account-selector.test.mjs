import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import readline from "node:readline";
import { CREATE_ACCOUNT, renderAccountMenu, selectAccountMenu } from "../users/account-selector.mjs";

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
  assert.match(output.text, /Select an account/u);
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
  assert.match(narrow, /> gamma/u, "selected row remains in viewport");
  assert.match(narrow, /👩‍💻/u, "emoji joiner stays within one measured grapheme");
  assert.match(narrow, /中/u);
  assert.equal(narrow.includes("\u001b[31m"), false);
  const scrolled = renderAccountMenu(labels, { width: 32, height: 7, selected: 4, offset: 0 });
  assert.match(scrolled, /> Create new account/u, "viewport follows a selected item below its initial range");
  assert.equal(renderAccountMenu(labels, { width: 12, height: 1, selected: 2 }).split("\n").length, 1);
  assert.equal(renderAccountMenu(labels, { width: 12, height: 0, selected: 2 }).split("\n").length, 1);
  const twoRows = renderAccountMenu(labels, { width: 12, height: 2, selected: 2 }).split("\n");
  assert.equal(twoRows.length, 2);
  assert.match(twoRows[1], /> gamma/u);
  assert.equal(renderAccountMenu(labels, { width: 12, height: 3, selected: 3 }).split("\n").length, 3);
});
