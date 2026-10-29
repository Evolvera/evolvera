// Unified process-table parsing and sampling contract shared by the live-PIs and resource consumers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { createPersistentSampler, createProcessTable, parseProcessTable, resolveProcessTableCommand, sampleProcessTable } from "../lib-server/process-table.mjs";

// Parses Windows CSV with escaped commas, quotes, embedded newlines, Unicode, and all resource columns.
test("Windows CSV parsing normalizes quoted command lines and resource values", () => {
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const fields = ["ProcessId", "ParentProcessId", "Name", "CreationDate", "CommandLine", "WorkingSetSize", "KernelModeTime", "UserModeTime"];
  const csv = fields.map(quote).join(",") + "\r\n" + [20, 3, "node.exe", "20250102120000.000000+000", 'node.exe --x "a,b" "quoted" Zoë\r\nnext', 1048576, 10000000, 5000000].map(quote).join(",") + "\r\n";
  const rows = parseProcessTable(csv, { platform: "win32" });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { pid: 20, ppid: 3, name: "node.exe", startedAt: Date.parse("2025-01-02T12:00:00Z"), commandLine: 'node.exe --x "a,b" "quoted" Zoë\r\nnext', rssBytes: 1048576, cpuSeconds: 1.5 });
});

// Parses the POSIX ps columns without losing spaces in command arguments or start time.
test("POSIX parser retains full command line and maps rss and CPU time", () => {
  const rows = parseProcessTable(" 20 3 1024 00:01:02 Thu Jan  2 12:00:00 2025 node --arg 'a b'\n", { platform: "linux" });
  assert.deepEqual(rows, [{ pid: 20, ppid: 3, name: "node", startedAt: Date.parse("Thu Jan  2 12:00:00 2025"), commandLine: "node --arg 'a b'", rssBytes: 1024 * 1024, cpuSeconds: 62 }]);
});

// Bounds malformed/oversized snapshots while tolerating a process vanishing from an otherwise valid sample.
test("parser skips malformed rows and caps large process tables", () => {
  const lines = ["garbage", ...Array.from({ length: 2001 }, (_, i) => `${i + 1} 1 1 00:01:00 Thu Jan  2 12:00:00 2025 proc ${i}`)];
  const rows = parseProcessTable(lines.join("\n"), { platform: "linux" });
  assert.equal(rows.length, 2001);
  assert.equal(rows[0].pid, 1);
  assert.deepEqual(parseProcessTable('"wrong","header"\r\n"7","1"', { platform: "win32" }), []);
  assert.deepEqual(parseProcessTable("-1 2 3 00:01:00 Thu Jan  2 12:00:00 2025 proc\n1 2 3 99:99:xx Thu Jan  2 12:00:00 2025 proc", { platform: "linux" }), []);
  const emptyCommand = parseProcessTable("20 3 1024 00:01:02 Thu Jan  2 12:00:00 2025 \n", { platform: "linux" });
  assert.equal(emptyCommand[0].name, "");
  assert.deepEqual(parseProcessTable('"ProcessId","Name"\r\n"1","node"', { platform: "win32" }), []);
});

// Both Windows CSV layouts (full Win32_Process and the short resource-only header) must: treat empty CPU times as 0,
// drop rows with a bad pid/ppid/rss/CPU value, and stop at 50 000 rows. Expected: only valid rows, capped. Why: V8
// sometimes omitted these never-run blocks from coverage, so the gate passed or failed by timing while they were untested.
test("Windows CSV parsers default empty CPU times, skip invalid rows, and cap the table", () => {
  const full = (rows) => '"ProcessId","ParentProcessId","Name","CreationDate","CommandLine","WorkingSetSize","KernelModeTime","UserModeTime"\r\n' +
    rows.map((row) => row.map((value) => `"${value}"`).join(",")).join("\r\n");
  const valid = ["7", "1", "", "", "", "2048", "", ""];
  const invalid = [
    ["x", "1", "a", "", "", "1", "0", "0"], ["8", "y", "a", "", "", "1", "0", "0"],
    ["9", "1", "a", "", "", "big", "0", "0"], ["10", "1", "a", "", "", "-5", "0", "0"],
    ["11", "1", "a", "", "", "1", "k", "0"], ["12", "1", "a", "", "", "1", "0", "u"],
  ];
  assert.deepEqual(parseProcessTable(full([valid, ...invalid]), { platform: "win32" }),
    [{ pid: 7, ppid: 1, name: "", startedAt: null, commandLine: "", rssBytes: 2048, cpuSeconds: 0 }]);
  assert.equal(parseProcessTable(full(Array.from({ length: 50_001 }, (_, i) => [String(i + 1), "1", "p", "", "", "1", "0", "0"])), { platform: "win32" }).length, 50_000);

  // Real ConvertTo-Csv output quotes the header and every cell (parseProcessTable dispatches on `"ProcessId",`).
  const short = (rows) => '"ProcessId","ParentProcessId","WorkingSetSize","KernelModeTime","UserModeTime"\r\n' +
    rows.map((row) => row.map((value) => `"${value}"`).join(",")).join("\r\n");
  assert.deepEqual(parseProcessTable(short([["7", "1", "", "", ""], ["x", "1", "1", "0", "0"], ["8", "y", "1", "0", "0"], ["9", "1", "big", "0", "0"], ["10", "1", "1", "k", "0"], ["11", "1", "1", "0", "u"]]), { platform: "win32" }),
    [{ pid: 7, ppid: 1, name: "", startedAt: null, commandLine: "", rssBytes: 0, cpuSeconds: 0 }]);
  assert.equal(parseProcessTable(short(Array.from({ length: 50_001 }, (_, i) => [String(i + 1), "1", "1", "0", "0"])), { platform: "win32" }).length, 50_000);
});

// Resolves one platform command and shared override, including explicit timeout configuration.
test("command defaults include all process fields and the shared timeout override", () => {
  const win = resolveProcessTableCommand({ platform: "win32", env: {} });
  assert.equal(win.bin, "powershell.exe");
  assert.match(win.args.join(" "), /Get-CimInstance Win32_Process/);
  for (const field of ["Name", "CreationDate", "CommandLine", "WorkingSetSize", "KernelModeTime", "UserModeTime"]) assert.ok(win.args.join(" ").includes(field));
  assert.deepEqual(resolveProcessTableCommand({ platform: "linux", env: {} }).args, ["-eo", "pid=,ppid=,rss=,time=,lstart=,args="]);
  assert.deepEqual(resolveProcessTableCommand({ platform: "linux", env: { PI_STUDIO_PS_BIN: "custom", PI_STUDIO_PS_BIN_ARGS: '["x"]', PI_STUDIO_PS_TIMEOUT_MS: "900" } }), { bin: "custom", args: ["x"], timeoutMs: 900 });
  assert.deepEqual(resolveProcessTableCommand({ platform: "linux", env: { PI_STUDIO_PS_BIN: "custom", PI_STUDIO_PS_BIN_ARGS: "[1]", PI_STUDIO_PS_TIMEOUT_MS: "-1" } }), { bin: "custom", args: [], timeoutMs: 4000 });
  assert.equal(resolveProcessTableCommand({ platform: "linux", env: { PI_STUDIO_PS_TIMEOUT_MS: "0" } }).timeoutMs, 4000);
});

// Accepts both PowerShell JSON cardinalities and safely rejects malformed or invalid process records.
test("Windows JSON parsing normalizes objects, arrays, and bad snapshots", () => {
  const row = { ProcessId: 7, ParentProcessId: 1, Name: "node.exe", CreationDate: "/Date(1735819200000)/", CommandLine: "node @earendil-works/pi-coding-agent/dist/cli.js", WorkingSetSize: 2048, KernelModeTime: 10000000, UserModeTime: 5000000 };
  assert.deepEqual(parseProcessTable(JSON.stringify(row), { platform: "win32" })[0], { pid: 7, ppid: 1, name: "node.exe", startedAt: 1735819200000, commandLine: row.CommandLine, rssBytes: 2048, cpuSeconds: 1.5 });
  assert.equal(parseProcessTable(JSON.stringify([row, { ...row, ProcessId: "bad" }]), { platform: "win32" }).length, 1);
  assert.deepEqual(parseProcessTable("{broken", { platform: "win32" }), []);
  assert.deepEqual(parseProcessTable("", { platform: "win32" }), []);
  assert.deepEqual(parseProcessTable("x".repeat(16 * 1024 * 1024 + 1), { platform: "win32" }), []);
  const base = { ProcessId: 9, ParentProcessId: 1, Name: "node.exe", WorkingSetSize: 12, KernelModeTime: 0, UserModeTime: 0, CommandLine: "node" };
  for (const CreationDate of [1735819200000, "", null, {}, "not a date"]) assert.equal(parseProcessTable(JSON.stringify({ ...base, CreationDate }), { platform: "win32" })[0].startedAt, typeof CreationDate === "number" ? CreationDate : null);
  const sparse = { ProcessId: 10, ParentProcessId: 1, WorkingSetSize: 0 };
  assert.deepEqual(parseProcessTable(JSON.stringify(sparse), { platform: "win32" })[0], { pid: 10, ppid: 1, name: "", startedAt: null, commandLine: "", rssBytes: 0, cpuSeconds: 0 });
});

// Exercises bounded spawn behavior with run-owned children, including malformed args, output overflow, and the default timeout.
test("sampler contains spawn failures and oversized output", async () => {
  assert.equal(await sampleProcessTable({ bin: process.execPath, args: null }, "win32"), null);
  assert.equal(await sampleProcessTable({ bin: "bad\\0bin", args: [] }, "win32"), null);
  assert.equal(await sampleProcessTable({ bin: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(17*1024*1024))"], timeoutMs: 3000 }, "win32"), null);
  const json = JSON.stringify({ ProcessId: 9, ParentProcessId: 1, Name: "node.exe", CreationDate: "/Date(1735819200000)/", CommandLine: "node", WorkingSetSize: 12, KernelModeTime: 0, UserModeTime: 0 });
  const rows = await sampleProcessTable({ bin: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(json)})`] }, "win32");
  assert.equal(rows[0].pid, 9);
});

// Shares in-flight sampling across concurrent consumers and applies 5-second success/1-second failure caching.
test("coalesces concurrent sampling and uses short failure cache", async () => {
  let now = 10_000;
  let calls = 0;
  const sampler = createProcessTable({ platform: "linux", now: () => now, sample: async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return [{ pid: calls, ppid: 0, name: "x", startedAt: null, commandLine: "x", rssBytes: 0, cpuSeconds: 0 }]; } });
  assert.deepEqual((await Promise.all(Array.from({ length: 50 }, () => sampler.list()))).map((rows) => rows.length), Array(50).fill(1));
  assert.equal(calls, 1);
  await sampler.list();
  assert.equal(calls, 1);
  now += 5001;
  await sampler.list();
  assert.equal(calls, 2);
  const failing = createProcessTable({ platform: "linux", now: () => now, sample: async () => { calls++; return null; } });
  await failing.list();
  await failing.list();
  assert.equal(calls, 3);
  now += 1001;
  await failing.list();
  assert.equal(calls, 4);
  // A caller that accepts older data (the sidebar tree, 15 s) reuses a sample the default 5 s caller would refresh.
  now += 6000;
  await sampler.list({ maxAgeMs: 15_000 });
  assert.equal(calls, 4);
  await sampler.list();
  assert.equal(calls, 5);
});

// Windows keeps one PowerShell for every sample: a fake child speaks the same line protocol (request = marker line,
// answer = CSV then the echoed marker). Covers reuse, a stale marker inside an answer, idle exit, and the fallback.
function fakePowerShell({ answer = () => "", hang = false } = {}) {
  const spawned = [];
  const spawnImpl = (bin, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stdin = new EventEmitter();
    child.killed = false;
    child.kill = () => { child.killed = true; };
    child.stdin.write = (line) => {
      const marker = line.trim();
      if (!hang) setImmediate(() => child.stdout.emit("data", `${answer(spawned.length)}\r\n${marker}\r\n`));
    };
    spawned.push({ bin, args, child });
    return child;
  };
  return { spawned, spawnImpl };
}
const csvRow = (pid, commandLine = "node") => '"ProcessId","ParentProcessId","Name","CreationDate","CommandLine","WorkingSetSize","KernelModeTime","UserModeTime"\r\n' +
  [pid, 1, "node.exe", "", commandLine, 1024, 0, 0].map((value) => `"${value}"`).join(",");

test("persistent sampler reuses one PowerShell and never takes a marker from the data for its own", async () => {
  const fake = fakePowerShell({ answer: () => csvRow(7, "powershell __PI_STUDIO_END_0123456789abcdef0123456789abcdef__") });
  const sampler = createPersistentSampler({ bin: "powershell.exe", query: "Q", timeoutMs: 1000 }, { spawnImpl: fake.spawnImpl, idleMs: 60_000 });
  const first = await sampler.sample();
  const second = await sampler.sample();
  assert.equal(fake.spawned.length, 1);
  assert.equal(first[0].pid, 7);
  assert.match(first[0].commandLine, /__PI_STUDIO_END_/);
  assert.equal(second[0].pid, 7);
  // The script reads markers from stdin and echoes them; no marker is ever in its own command line.
  assert.doesNotMatch(fake.spawned[0].args.join(" "), /__PI_STUDIO_END_/);
  assert.match(fake.spawned[0].args.join(" "), /\[Console\]::In\.ReadLine\(\)/);
  sampler.stop();
  assert.equal(fake.spawned[0].child.killed, true);
});

test("persistent sampler exits when idle and starts again on the next sample", async () => {
  const fake = fakePowerShell({ answer: () => csvRow(8) });
  const sampler = createPersistentSampler({ bin: "powershell.exe", query: "Q", timeoutMs: 1000 }, { spawnImpl: fake.spawnImpl, idleMs: 20 });
  await sampler.sample();
  assert.equal(sampler.running, true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(sampler.running, false);
  assert.equal(fake.spawned[0].child.killed, true);
  assert.equal((await sampler.sample())[0].pid, 8);
  assert.equal(fake.spawned.length, 2);
  sampler.stop();
});

test("persistent sampler falls back to a one-shot spawn after a timeout or exit, then retries later", async () => {
  let clock = 0;
  const fake = fakePowerShell({ hang: true });
  // The fallback bin is node printing one CSV row, so the one-shot path is observable.
  const oneShot = { bin: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(csvRow(9))})`], query: "Q", timeoutMs: 2000 };
  const sampler = createPersistentSampler(oneShot, { spawnImpl: fake.spawnImpl, retryAfterMs: 1000, now: () => clock });
  assert.equal((await sampler.sample())[0].pid, 9);
  assert.equal(fake.spawned[0].child.killed, true);
  assert.equal(sampler.running, false);
  clock = 500;
  assert.equal((await sampler.sample())[0].pid, 9);
  assert.equal(fake.spawned.length, 1, "inside the retry window only the one-shot path runs");
  clock = 1000;
  const exiting = sampler.sample();
  fake.spawned[1].child.emit("exit", 1);
  assert.equal((await exiting)[0].pid, 9);
  assert.equal(fake.spawned.length, 2);
});

test("createProcessTable uses the persistent sampler only for the default Windows query", () => {
  assert.ok(resolveProcessTableCommand({ platform: "win32", env: {} }).query);
  assert.equal(resolveProcessTableCommand({ platform: "win32", env: { PI_STUDIO_PS_BIN: "custom" } }).query, undefined);
  assert.equal(resolveProcessTableCommand({ platform: "linux", env: {} }).query, undefined);
});

test("real PowerShell: the persistent sampler answers repeatedly and lists this process", { skip: process.platform !== "win32" && "Windows only" }, async () => {
  const sampler = createPersistentSampler(resolveProcessTableCommand({ platform: "win32", env: { PI_STUDIO_PS_TIMEOUT_MS: "20000" } }));
  try {
    for (let i = 0; i < 3; i++) {
      const rows = await sampler.sample();
      assert.ok(rows.length > 10, `sample ${i} returned ${rows.length} rows`);
      assert.ok(rows.some((row) => row.pid === process.pid));
    }
    assert.equal(sampler.running, true);
  } finally { sampler.stop(); }
});
