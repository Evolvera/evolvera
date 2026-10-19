#!/usr/bin/env node
// Unified deterministic stand-in for both live-PI discovery and RAM/CPU sampling; never reads the real process table.
// FAKE_PS_STATE is { mode, format, delayMs, rows }; resource tuples [pid,ppid,rssKb,cpuSeconds] are normalized.
// Formats: csv (Windows), json (Windows compatibility), ps (POSIX). FAKE_PS_COUNT_FILE records exactly one spawn per sample.
import { appendFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

if (process.env.FAKE_PS_COUNT_FILE) appendFileSync(process.env.FAKE_PS_COUNT_FILE, `${process.pid}\n`);
const statePath = process.env.FAKE_PS_STATE;
const state = statePath ? JSON.parse(readFileSync(statePath, "utf8")) : null;
const live = process.env.FAKE_PS_LIVE_DIR ? path.join(process.env.FAKE_PS_LIVE_DIR, String(process.pid)) : null;
if (live) {
  writeFileSync(live, "");
  appendFileSync(path.join(process.env.FAKE_PS_LIVE_DIR, "..", "ps-live.log"), `${readdirSync(process.env.FAKE_PS_LIVE_DIR).length}\n`);
}
const finish = () => {
  if (live) rmSync(live, { force: true });
  const mode = state?.mode || process.env.FAKE_PS_MODE || "normal";
  if (mode === "exit" || mode === "fail") { console.error("fake ps: unavailable"); process.exit(3); }
  if (mode === "malformed") { process.stdout.write("this is not\na process table\n\u0000\u0001\n"); return; }
  if (mode === "empty") { process.stdout.write(""); return; }
  if (mode === "large") { process.stdout.write("x".repeat(17 * 1024 * 1024)); return; }
  let rows = state?.rows || [];
  rows = rows.map((row) => Array.isArray(row)
    ? { pid: row[0], ppid: row[1], rssBytes: row[2] * 1024, cpuSeconds: row[3], name: "node.exe", startedAt: 1735819200000, commandLine: "node @earendil-works/pi-coding-agent/dist/cli.js" }
    : ({ ...row, pid: row.pid ?? row.ProcessId, ppid: row.ppid ?? row.ParentProcessId, name: row.name ?? row.Name ?? "node.exe", startedAt: row.startedAt ?? row.CreationDate ?? 1735819200000, commandLine: row.commandLine ?? row.CommandLine ?? "", rssBytes: row.rssBytes ?? Number(row.WorkingSetSize ?? 0), cpuSeconds: row.cpuSeconds ?? 0 }));
  const format = state?.format || "csv";
  if (format === "json") {
    process.stdout.write(JSON.stringify(rows.map((r) => ({ ProcessId: r.pid, ParentProcessId: r.ppid, Name: r.name, CreationDate: `/Date(${r.startedAt})/`, CommandLine: r.commandLine, WorkingSetSize: r.rssBytes, KernelModeTime: Math.round(r.cpuSeconds * 1e7), UserModeTime: 0 }))));
  } else if (format === "ps") {
    process.stdout.write(rows.map((r) => `${r.pid} ${r.ppid} ${Math.round(r.rssBytes / 1024)} ${r.cpuSeconds} Thu Jan  2 12:00:00 2025 ${r.commandLine || r.name}`).join("\n") + "\n");
  } else {
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const cells = rows.map((r) => [r.pid, r.ppid, r.name, typeof r.startedAt === "number" ? new Date(r.startedAt).toISOString() : r.startedAt, r.commandLine, r.rssBytes, Math.round(r.cpuSeconds * 1e7), 0].map(quote).join(","));
    process.stdout.write([["ProcessId", "ParentProcessId", "Name", "CreationDate", "CommandLine", "WorkingSetSize", "KernelModeTime", "UserModeTime"].map(quote).join(","), ...cells].join("\r\n") + "\r\n");
  }
};
if ((state?.mode || process.env.FAKE_PS_MODE) === "hang") setInterval(() => {}, 1000);
else setTimeout(finish, state?.delayMs || 0);
