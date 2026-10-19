#!/usr/bin/env node
// Deterministic stand-in for the process-table sampler (`ps -A -o pid=,ppid=,rss=,time=` / the PowerShell CIM query).
// Run as `node fake-ps.mjs` (PI_STUDIO_PS_BIN=node, PI_STUDIO_PS_BIN_ARGS=[this file]); never reads the real process table.
// FAKE_PS_STATE: JSON file { mode, format, delayMs, rows: [[pid, ppid, rssKb, cpuSeconds], ...] }, re-read on every call.
// Modes: normal | malformed | empty | exit | hang. Formats: ps (default) | csv (the Windows shape).
// FAKE_PS_COUNT_FILE: one line is appended per call (spawn counter). FAKE_PS_LIVE_DIR: file held during the call (concurrency probe).
import { appendFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

if (process.env.FAKE_PS_COUNT_FILE) appendFileSync(process.env.FAKE_PS_COUNT_FILE, `${process.pid}\n`);
const state = JSON.parse(readFileSync(process.env.FAKE_PS_STATE, "utf8"));
const live = process.env.FAKE_PS_LIVE_DIR ? path.join(process.env.FAKE_PS_LIVE_DIR, String(process.pid)) : null;
if (live) {
  writeFileSync(live, "");
  appendFileSync(path.join(process.env.FAKE_PS_LIVE_DIR, "..", "ps-live.log"), `${readdirSync(process.env.FAKE_PS_LIVE_DIR).length}\n`);
}
const finish = () => {
  if (live) rmSync(live, { force: true });
  const mode = state.mode || "normal";
  if (mode === "exit") {
    console.error("fake ps: unavailable");
    process.exit(3);
  }
  if (mode === "malformed") process.stdout.write("this is not\na process table\n\u0000\u0001\n");
  else if (mode === "empty") process.stdout.write("");
  else if (state.format === "csv") {
    const rows = state.rows.map(([pid, ppid, rssKb, cpu]) => `"${pid}","${ppid}","${rssKb * 1024}","${Math.round(cpu * 1e7)}","0"`);
    process.stdout.write(['"ProcessId","ParentProcessId","WorkingSetSize","KernelModeTime","UserModeTime"', ...rows].join("\r\n") + "\r\n");
  } else {
    process.stdout.write(state.rows.map(([pid, ppid, rssKb, cpu]) => `${pid} ${ppid} ${rssKb} ${cpu}`).join("\n") + "\n");
  }
};
if ((state.mode || "normal") === "hang") setInterval(() => {}, 1000);
else setTimeout(finish, state.delayMs || 0);
