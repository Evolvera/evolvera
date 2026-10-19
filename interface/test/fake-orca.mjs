#!/usr/bin/env node
// Deterministic stand-in for `orca worktree ps --json` (read-only; never touches a real Orca).
// Run as `node fake-orca.mjs worktree ps --json` (PI_STUDIO_ORCA_BIN=node, PI_STUDIO_ORCA_BIN_ARGS=[this file]).
// FAKE_ORCA_STATE: JSON file { mode, active, worktrees: [{ path, displayName?, branch?, status?, unread?, linkedIssue?, linkedPR?, agents? }] },
// re-read on every call so a test or browser session can change the answer. Modes: normal | malformed | exit | hang | shape.
// FAKE_ORCA_COUNT_FILE counts `worktree ps`; FAKE_ORCA_ARGV_FILE records every argv array.
import { appendFileSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
if (process.env.FAKE_ORCA_ARGV_FILE) appendFileSync(process.env.FAKE_ORCA_ARGV_FILE, `${JSON.stringify(argv)}\n`);
const state = JSON.parse(readFileSync(process.env.FAKE_ORCA_STATE, "utf8"));
const command = argv.slice(0, 2).join(" ");
if (process.env.FAKE_ORCA_COUNT_FILE && command === "worktree ps") appendFileSync(process.env.FAKE_ORCA_COUNT_FILE, `${process.pid}\n`);
const mode = process.env[`FAKE_ORCA_${command === "worktree create" ? "CREATE" : command === "terminal send" ? "SEND" : "PS"}_MODE`] || state[command === "worktree create" ? "createMode" : command === "terminal send" ? "sendMode" : "psMode"] || state.mode || "normal";
const valid = command === "worktree ps" && argv.slice(2).join(" ") === "--json" ||
  command === "worktree create" && argv.at(-1) === "--json" ||
  command === "terminal send" && argv.at(-2) === "--enter" && argv.at(-1) === "--json";
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
  const value = (flag) => argv[argv.indexOf(flag) + 1];
  const name = value("--name");
  process.stdout.write(JSON.stringify(state.createResponse ?? { ok: true, result: { path: `${process.env.FAKE_ORCA_WORKTREE_ROOT || "/tmp/fake-worktrees"}/${name}`, agentTerminalHandle: `fake-terminal-${name}` } }));
} else if (command === "terminal send") process.stdout.write(JSON.stringify({ ok: true, result: {} }));
else if (command === "worktree ps" && state.psResponse) process.stdout.write(JSON.stringify(state.psResponse));
else {
  const worktrees = state.worktrees.map((worktree, index) => ({
    worktreeId: `fake-repo::${worktree.path}`,
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
