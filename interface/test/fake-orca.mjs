#!/usr/bin/env node
// Deterministic stand-in for `orca worktree ps --json` (read-only; never touches a real Orca).
// Run as `node fake-orca.mjs worktree ps --json` (PI_STUDIO_ORCA_BIN=node, PI_STUDIO_ORCA_BIN_ARGS=[this file]).
// FAKE_ORCA_STATE: JSON file { mode, active, worktrees: [{ path, displayName?, branch?, status?, unread?, linkedIssue?, linkedPR?, agents? }] },
// re-read on every call so a test or browser session can change the answer. Modes: normal | malformed | exit | hang | shape.
// FAKE_ORCA_COUNT_FILE counts `worktree ps`; FAKE_ORCA_ARGV_FILE records every argv array.
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
// FAKE_ORCA_LIVE_DIR: each call holds a file there for FAKE_ORCA_HOLD_MS and logs how many were alive (concurrency probe).
if (process.env.FAKE_ORCA_LIVE_DIR) {
  const mine = path.join(process.env.FAKE_ORCA_LIVE_DIR, `${process.pid}`);
  writeFileSync(mine, "");
  appendFileSync(path.join(process.env.FAKE_ORCA_LIVE_DIR, "..", "orca-live.log"), `${readdirSync(process.env.FAKE_ORCA_LIVE_DIR).length}\n`);
  const until = Date.now() + Number(process.env.FAKE_ORCA_HOLD_MS || 150);
  while (Date.now() < until) { /* hold the slot */ }
  rmSync(mine, { force: true });
}
if (process.env.FAKE_ORCA_ARGV_FILE) appendFileSync(process.env.FAKE_ORCA_ARGV_FILE, `${JSON.stringify(argv)}\n`);
const state = JSON.parse(readFileSync(process.env.FAKE_ORCA_STATE, "utf8"));
const command = argv.slice(0, 2).join(" ");
// Same flag grammar as Orca's cli/args.js: --k=v is verbatim; "--k v" takes v unless v starts with "--" (then --k is boolean).
const BOOLEAN = new Set(["json", "enter"]);
const flags = {};
for (let i = 2; i < argv.length; i += 1) {
  const token = argv[i];
  if (!token.startsWith("--")) { flags._positional = true; continue; }
  const body = token.slice(2);
  const eq = body.indexOf("=");
  if (eq !== -1) flags[body.slice(0, eq)] = body.slice(eq + 1);
  else if (BOOLEAN.has(body) || i + 1 >= argv.length || argv[i + 1].startsWith("--")) flags[body] = true;
  else flags[body] = argv[++i];
}
if (process.env.FAKE_ORCA_COUNT_FILE && command === "worktree ps") appendFileSync(process.env.FAKE_ORCA_COUNT_FILE, `${process.pid}\n`);
// FAKE_ORCA_PS_AFTER_CREATE=<mode>: once a create ran, later `worktree ps` calls use <mode> (re-read failure after a timeout).
const createdMark = `${process.env.FAKE_ORCA_STATE}.created`;
if (process.env.FAKE_ORCA_PS_AFTER_CREATE && command === "worktree create") writeFileSync(createdMark, "1");
const afterCreate = process.env.FAKE_ORCA_PS_AFTER_CREATE && command === "worktree ps" && existsSync(createdMark) ? process.env.FAKE_ORCA_PS_AFTER_CREATE : null;
const mode = afterCreate || process.env[`FAKE_ORCA_${command === "worktree create" ? "CREATE" : command === "terminal send" ? "SEND" : "PS"}_MODE`] || state[command === "worktree create" ? "createMode" : command === "terminal send" ? "sendMode" : "psMode"] || state.mode || "normal";
const text = (name) => typeof flags[name] === "string" && flags[name] !== "";
const valid = !flags._positional && flags.json === true && (
  command === "worktree ps" && argv.length === 3 ||
  command === "worktree create" && text("name") && text("repo") && flags.agent === "pi" && text("prompt") && text("parent-worktree") && text("comment") ||
  command === "terminal send" && text("terminal") && text("text") && flags.enter === true);
if (!valid) {
  console.error(`fake orca: unsupported arguments: ${argv.join(" ")}`);
  process.exit(2);
}

if (mode === "hang" || mode === "timeout") setInterval(() => {}, 1000);
else if (mode === "exit" || mode === "failure") {
  console.error("fake orca: runtime unavailable");
  process.exit(3);
} else if (mode === "malformed") process.stdout.write("{not json");
else if (mode === "shape") process.stdout.write(JSON.stringify({ ok: true, result: { worktrees: "nope" } }));
else if (command === "worktree create") {
  const name = flags.name;
  process.stdout.write(JSON.stringify(state.createResponse ?? { ok: true, result: { path: `${process.env.FAKE_ORCA_WORKTREE_ROOT || "/tmp/fake-worktrees"}/${name}`, agentTerminalHandle: `fake-terminal-${name}` } }));
} else if (command === "terminal send") process.stdout.write(JSON.stringify({ ok: true, result: {} }));
else if (command === "worktree ps" && state.psResponse) process.stdout.write(JSON.stringify(state.psResponse));
else {
  const worktrees = state.worktrees.map((worktree, index) => ({
    worktreeId: `fake-repo::${worktree.path}`,
    repoId: worktree.repoId ?? "fake-repo",
    repo: "fake-repo",
    path: worktree.path,
    branch: worktree.branch === undefined ? `refs/heads/wt-${index}` : worktree.branch,
    displayName: worktree.displayName ?? `wt-${index}`,
    name: worktree.name,
    isActive: worktree.path === state.active,
    status: worktree.status ?? "inactive",
    unread: worktree.unread === true,
    linkedIssue: worktree.linkedIssue ?? null,
    linkedPR: worktree.linkedPR ?? null,
    comment: worktree.comment ?? "",
    agentTerminalHandle: worktree.agentTerminalHandle ?? worktree.terminalHandle,
    liveTerminalCount: worktree.liveTerminalCount ?? 0,
    lastActivityAt: 1_700_000_000_000 + index,
    agents: worktree.agents ?? [],
  }));
  process.stdout.write(JSON.stringify({ id: "fake", ok: true, result: { worktrees, hostScope: { hostIds: ["local"] }, totalCount: worktrees.length, truncated: false } }));
}
