// Tests for the pure process parsers and bounded process-list cache.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parsePiProcesses, resolveSessions } from "../lib-server/live-pis.mjs";

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

// Keeps surviving rows when a process disappears while the operating-system snapshot is being read.
test("parsePiProcesses skips vanished and malformed process rows without losing survivors", () => {
  const rows = [row(1, 0, "node @earendil-works/pi-coding-agent/dist/cli.js"), null, row("gone", 0, "node @earendil-works/pi-coding-agent/dist/cli.js"), row(2, 0, "node @earendil-works/pi-coding-agent/dist/cli.js", { CreationDate: "not a date" })];
  assert.deepEqual(parsePiProcesses(rows).map(({ pid, startedAt }) => ({ pid, startedAt })), [{ pid: 1, startedAt: Date.parse("2025-01-02T12:00:00Z") }, { pid: 2, startedAt: 0 }]);
});
