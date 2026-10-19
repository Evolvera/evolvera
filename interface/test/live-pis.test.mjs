// Tests for the pure process parsers and bounded process-list cache.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createProcessLister, parsePiProcesses, resolveSessions } from "../lib-server/live-pis.mjs";

const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-live-pis-"));
after(() => rm(tmp, { recursive: true, force: true }));
const row = (ProcessId, ParentProcessId, CommandLine, extra = {}) => ({ ProcessId, ParentProcessId, CommandLine, Name: "node.exe", CreationDate: "20250102120000.000000+000", ...extra });

// Parses only the PI CLI and preserves its exact session argument while handling WMI and ISO dates.
test("parsePiProcesses filters PI CLI and parses timestamps and argument flags", () => {
  const rows = [
    row(1, 0, 'node "C:\\pi\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js" --session "C:\\Users\\Zoë\\sess ion.jsonl" --continue', { CreationDate: "/Date(1735819200000)/" }),
    row(2, 1, "node @earendil-works/pi-coding-agent/dist/cli.js --session=C:/sessions/a.jsonl", { CreationDate: "2025-01-02T12:00:00.000Z" }),
    row(3, 0, "node other.js --session hidden"),
    row(4, 0, "node @earendil-works/pi-coding-agent/dist/cli.js", { CreationDate: "malformed" }),
    row(5, 0, null),
    row(6, 0, 'node @earendil-works/pi-coding-agent/dist/cli.js -s "C:\\temp\\escaped\\\\" name.jsonl"', { CreationDate: "20250102120000.000000+000" }),
    row(7, 0, "node @earendil-works/pi-coding-agent/dist/cli.js", { CreationDate: 1735819200000 }),
    row(8, 0, "node @earendil-works/pi-coding-agent/dist/cli.js", { CreationDate: "20250102120000.000000" }),
    row(9, 0, "node @earendil-works/pi-coding-agent/dist/cli.js", { CreationDate: {} }),
    row(10, 0, "node @earendil-works/pi-coding-agent/dist/cli.js", { CreationDate: NaN }),
    { ProcessId: 20, ParentProcessId: null, ppid: 21, CommandLine: "node @earendil-works/pi-coding-agent/dist/cli.js", CreationDate: "/Date(1735819200000)/" },
    row(21, 0, "Orca.exe", { Name: "node.exe", ParentProcessId: null, ppid: 22 }),
    row(22, 0, "Orca.exe", { Name: "Orca.exe" }),
    row(30, 31, "node @earendil-works/pi-coding-agent/dist/cli.js"),
    row(31, 0, "node.exe", { Name: "node.exe", ParentProcessId: null, ppid: 22 }),
  ];
  assert.deepEqual(parsePiProcesses(rows, { studioPids: new Set([1]), orcaPids: new Set([99]) }), [
    { pid: 1, ppid: 0, owner: "studio", startedAt: 1735819200000, sessionArg: "C:\\Users\\Zoë\\sess ion.jsonl", continueFlag: true },
    { pid: 2, ppid: 1, owner: "terminal", startedAt: Date.parse("2025-01-02T12:00:00.000Z"), sessionArg: "C:/sessions/a.jsonl", continueFlag: false },
    { pid: 4, ppid: 0, owner: "terminal", startedAt: 0, sessionArg: null, continueFlag: false },
    { pid: 6, ppid: 0, owner: "terminal", startedAt: Date.parse("2025-01-02T12:00:00Z"), sessionArg: 'C:\\temp\\escaped\\" name.jsonl', continueFlag: false },
    { pid: 7, ppid: 0, owner: "terminal", startedAt: 1735819200000, sessionArg: null, continueFlag: false },
    { pid: 8, ppid: 0, owner: "terminal", startedAt: 1735819200000, sessionArg: null, continueFlag: false },
    { pid: 9, ppid: 0, owner: "terminal", startedAt: 0, sessionArg: null, continueFlag: false },
    { pid: 10, ppid: 0, owner: "terminal", startedAt: 0, sessionArg: null, continueFlag: false },
    { pid: 20, ppid: 21, owner: "orca", startedAt: 1735819200000, sessionArg: null, continueFlag: false },
    { pid: 30, ppid: 31, owner: "orca", startedAt: 1735819200000, sessionArg: null, continueFlag: false },
  ]);
});

// Follows any ancestor chain for Orca ownership and tolerates malformed process records.
test("parsePiProcesses maps ancestor ownership and ignores malformed rows", () => {
  const rows = [row("11", "10", "node @earendil-works/pi-coding-agent/dist/cli.js"), row(10, 1, "Orca.exe"), null, {}, row(12, "oops", "node @earendil-works/pi-coding-agent/dist/cli.js")];
  assert.deepEqual(parsePiProcesses(rows, { orcaPids: new Set([10]) }).map(({ pid, owner, startedAt }) => ({ pid, owner, startedAt })), [
    { pid: 11, owner: "orca", startedAt: Date.parse("2025-01-02T12:00:00Z") },
    { pid: 12, owner: "terminal", startedAt: Date.parse("2025-01-02T12:00:00Z") },
  ]);
});

// Resolves explicit paths, then close timestamps, then newest cwd session for --continue.
test("resolveSessions applies explicit, timestamp, continue, and unresolved precedence", () => {
  const headers = [
    { path: "explicit", cwd: "C:/p", timestampMs: 10, mtimeMs: 1 },
    { path: "near", cwd: "C:/p", timestampMs: 100_500, mtimeMs: 2 },
    { path: "old", cwd: "C:/p", timestampMs: 90, mtimeMs: 3 },
    { path: "newest", cwd: "C:/p", timestampMs: 50, mtimeMs: 20 },
    { path: "other-cwd", cwd: "C:/q", timestampMs: 99_900, mtimeMs: 99 },
  ];
  const procs = [
    { pid: 1, ppid: 0, owner: "terminal", startedAt: 1, sessionArg: "explicit", continueFlag: false, cwd: "C:/q" },
    { pid: 2, ppid: 0, owner: "terminal", startedAt: 100_000, sessionArg: null, continueFlag: false, cwd: "C:/p" },
    { pid: 3, ppid: 0, owner: "terminal", startedAt: 999_999, sessionArg: null, continueFlag: true, cwd: "C:/p" },
    { pid: 4, ppid: 0, owner: "terminal", startedAt: 999_999, sessionArg: null, continueFlag: false, cwd: "C:/p" },
  ];
  assert.deepEqual(resolveSessions(procs, headers).map((item) => item.sessionPath), ["explicit", "near", "other-cwd", null]);
  assert.equal(resolveSessions([{ sessionArg: "explicit", startedAt: 1, continueFlag: true }], headers)[0].sessionPath, "explicit");
});

// Covers alternate ps field names and malformed/null inputs without leaking unmatched headers.
test("parsers accept alternate process fields and reject non-array or malformed session inputs", () => {
  assert.deepEqual(parsePiProcesses(null), []);
  const parsed = parsePiProcesses([{ pid: "7", ppid: "0", args: "node @earendil-works/pi-coding-agent/dist/cli.js -s", lstart: "bad", CreationDate: null }]);
  assert.equal(parsed[0].sessionArg, null);
  assert.equal(parsed[0].startedAt, 0);
  assert.deepEqual(resolveSessions(null, null), []);
  assert.deepEqual(resolveSessions([{ sessionArg: "not-indexed", startedAt: NaN, continueFlag: false }, { startedAt: NaN, continueFlag: true }], []).map((item) => item.sessionPath), ["not-indexed", null]);
  assert.equal(resolveSessions([{ sessionArg: "not-found", startedAt: NaN, continueFlag: false }], [{ path: "other" }])[0].sessionPath, "not-found");
  assert.equal(resolveSessions([{ startedAt: Infinity, continueFlag: true }], [{ path: "zero", mtimeMs: 0 }, { path: "missing" }, { path: "new", mtimeMs: 5 }])[0].sessionPath, "new");
  assert.deepEqual(resolveSessions([null, { sessionArg: "", startedAt: NaN, continueFlag: true }], [null, { path: 9 }]).map((item) => item.sessionPath), [null, null]);
});

// Handles large process snapshots without unsafe command execution and coalesces concurrent listings.
test("createProcessLister coalesces spawn, caches, refreshes, and tolerates malformed JSON", async () => {
  const rowsFile = path.join(tmp, "rows.json");
  const countFile = path.join(tmp, "count.txt");
  await writeFile(rowsFile, JSON.stringify(Array.from({ length: 2000 }, (_, index) => row(index + 1, 0, `node --session \"C:/s/${index} α.jsonl\" @earendil-works/pi-coding-agent/dist/cli.js`))));
  const fake = fileURLToPath(new URL("./fake-ps.mjs", import.meta.url));
  const command = { command: process.execPath, args: [fake], platform: process.platform };
  const previousRows = process.env.FAKE_PS_ROWS;
  const previousCount = process.env.FAKE_PS_COUNT;
  const previousMode = process.env.FAKE_PS_MODE;
  process.env.FAKE_PS_ROWS = rowsFile;
  process.env.FAKE_PS_COUNT = countFile;
  delete process.env.FAKE_PS_MODE;
  try {
    let clock = 10_000;
    const lister = createProcessLister({ ...command, timeoutMs: 2000, cacheMs: 3000, now: () => clock });
    const [a, b, c] = await Promise.all([lister.list(), lister.list(), lister.list()]);
    assert.deepEqual([a.length, b.length, c.length], [2000, 2000, 2000]);
    assert.equal((await readFile(countFile, "utf8")).trim().split("\n").length, 1);
    assert.equal((await lister.list()).length, 2000);
    clock += 3001;
    await lister.list();
    assert.equal((await readFile(countFile, "utf8")).trim().split("\n").length, 2);
  } finally {
    if (previousRows === undefined) delete process.env.FAKE_PS_ROWS; else process.env.FAKE_PS_ROWS = previousRows;
    if (previousCount === undefined) delete process.env.FAKE_PS_COUNT; else process.env.FAKE_PS_COUNT = previousCount;
    if (previousMode === undefined) delete process.env.FAKE_PS_MODE; else process.env.FAKE_PS_MODE = previousMode;
  }
});

// Rejects malformed command output and invalid rows as a safe empty snapshot.
test("createProcessLister returns empty rows for malformed process JSON", async () => {
  const fake = fileURLToPath(new URL("./fake-ps.mjs", import.meta.url));
  const previousMode = process.env.FAKE_PS_MODE;
  process.env.FAKE_PS_MODE = "malformed";
  try { assert.deepEqual(await createProcessLister({ command: process.execPath, args: [fake], platform: "win32", now: () => 1 }).list(), []); }
  finally { if (previousMode === undefined) delete process.env.FAKE_PS_MODE; else process.env.FAKE_PS_MODE = previousMode; }
});

// Parses the POSIX ps table and the single-object PowerShell JSON shape without shell interpretation.
test("createProcessLister uses safe platform defaults and parses both listing formats", async () => {
  const savedBin = process.env.PI_STUDIO_PS_BIN;
  const savedArgs = process.env.PI_STUDIO_PS_BIN_ARGS;
  delete process.env.PI_STUDIO_PS_BIN;
  delete process.env.PI_STUDIO_PS_BIN_ARGS;
  try {
    assert.equal(typeof createProcessLister({ platform: "win32" }).list, "function");
    assert.equal(typeof createProcessLister({ platform: "linux" }).list, "function");
  }
  finally {
    if (savedBin === undefined) delete process.env.PI_STUDIO_PS_BIN; else process.env.PI_STUDIO_PS_BIN = savedBin;
    if (savedArgs === undefined) delete process.env.PI_STUDIO_PS_BIN_ARGS; else process.env.PI_STUDIO_PS_BIN_ARGS = savedArgs;
  }
  const winOutput = JSON.stringify({ ProcessId: 8, ParentProcessId: 1, CreationDate: "/Date(1735819200000)/", CommandLine: "node @earendil-works/pi-coding-agent/dist/cli.js", Name: "node.exe" });
  const win = createProcessLister({ command: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(winOutput)})`], platform: "win32", now: () => 1 });
  assert.equal((await win.list()).length, 1);
  const posixOutput = "PID PPID STARTED COMMAND\n8 1 Thu Jan  2 12:00:00 2025 node @earendil-works/pi-coding-agent/dist/cli.js\nmalformed";
  const posix = createProcessLister({ command: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(posixOutput)})`], platform: "linux", now: () => 1 });
  const rows = await posix.list();
  assert.equal(rows[0].ProcessId, "8");
  assert.equal(rows.length, 1);
});

// Honors JSON env overrides, with safe fallbacks when override JSON is malformed.
test("createProcessLister handles env overrides and invalid JSON args", async () => {
  const previousBin = process.env.PI_STUDIO_PS_BIN;
  const previousArgs = process.env.PI_STUDIO_PS_BIN_ARGS;
  try {
    process.env.PI_STUDIO_PS_BIN = process.execPath;
    process.env.PI_STUDIO_PS_BIN_ARGS = JSON.stringify(["-e", "process.stdout.write('[]')"]);
    const overridden = createProcessLister({ now: () => 1 });
    assert.deepEqual(await overridden.list(), []);
    process.env.PI_STUDIO_PS_BIN_ARGS = "{bad";
    const fallback = createProcessLister({ command: process.execPath, platform: "linux", now: () => 1 });
    assert.deepEqual(await fallback.list(), []);
    const fake = fileURLToPath(new URL("./fake-ps.mjs", import.meta.url));
    process.env.FAKE_PS_ROWS = path.join(tmp, "empty.json");
    await writeFile(process.env.FAKE_PS_ROWS, "[]");
    const emptyOutput = createProcessLister({ command: process.execPath, args: ["-e", "process.stdout.write('')"], platform: "win32", now: () => 1 });
    assert.deepEqual(await emptyOutput.list(), []);
    const nullRows = createProcessLister({ command: process.execPath, args: ["-e", "process.stdout.write('null')"], platform: "win32", now: () => 1 });
    assert.deepEqual(await nullRows.list(), []);
    const noStdout = createProcessLister({ command: process.execPath, args: [fake], platform: "win32", now: () => 1 });
    delete process.env.FAKE_PS_ROWS;
    assert.deepEqual(await noStdout.list(), []);
  } finally {
    if (previousBin === undefined) delete process.env.PI_STUDIO_PS_BIN; else process.env.PI_STUDIO_PS_BIN = previousBin;
    if (previousArgs === undefined) delete process.env.PI_STUDIO_PS_BIN_ARGS; else process.env.PI_STUDIO_PS_BIN_ARGS = previousArgs;
  }
});

// Keeps surviving rows when a process disappears while the operating-system snapshot is being read.
test("parsePiProcesses skips vanished and malformed process rows without losing survivors", () => {
  const rows = [row(1, 0, "node @earendil-works/pi-coding-agent/dist/cli.js"), null, row("gone", 0, "node @earendil-works/pi-coding-agent/dist/cli.js"), row(2, 0, "node @earendil-works/pi-coding-agent/dist/cli.js", { CreationDate: "not a date" })];
  assert.deepEqual(parsePiProcesses(rows).map(({ pid, startedAt }) => ({ pid, startedAt })), [{ pid: 1, startedAt: Date.parse("2025-01-02T12:00:00Z") }, { pid: 2, startedAt: 0 }]);
});

// Exercises the owned child-process path, including spawn errors, timeout cleanup, and output caps.
test("createProcessLister bounds and cleans up its spawned process", async () => {
  const previousRows = process.env.FAKE_PS_ROWS;
  const previousMode = process.env.FAKE_PS_MODE;
  const fake = fileURLToPath(new URL("./fake-ps.mjs", import.meta.url));
  const command = { command: process.execPath, args: [fake], platform: "win32" };
  try {
    process.env.FAKE_PS_ROWS = path.join(tmp, "empty-rows.json");
    await writeFile(process.env.FAKE_PS_ROWS, "[]");
    delete process.env.FAKE_PS_MODE;
    assert.deepEqual(await createProcessLister(command).list(), []);
    process.env.FAKE_PS_MODE = "fail";
    assert.deepEqual(await createProcessLister(command).list(), []);
    process.env.FAKE_PS_MODE = "hang";
    assert.deepEqual(await createProcessLister({ ...command, timeoutMs: 40 }).list(), []);
    process.env.FAKE_PS_MODE = "large";
    assert.deepEqual(await createProcessLister(command).list(), []);
    const missing = createProcessLister({ command: path.join(tmp, "missing-bin.exe"), args: [], platform: "win32" });
    assert.deepEqual(await missing.list(), []);
  } finally {
    if (previousRows === undefined) delete process.env.FAKE_PS_ROWS; else process.env.FAKE_PS_ROWS = previousRows;
    if (previousMode === undefined) delete process.env.FAKE_PS_MODE; else process.env.FAKE_PS_MODE = previousMode;
  }
});
