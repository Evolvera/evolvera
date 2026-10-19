// Unified process-table parsing and sampling contract shared by the live-PIs and resource consumers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createProcessTable, parseProcessTable, resolveProcessTableCommand, sampleProcessTable } from "../lib-server/process-table.mjs";

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
});
