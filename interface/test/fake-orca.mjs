#!/usr/bin/env node
// Deterministic stand-in for `orca worktree ps --json` (read-only; never touches a real Orca).
// Run as `node fake-orca.mjs worktree ps --json` (PI_STUDIO_ORCA_BIN=node, PI_STUDIO_ORCA_BIN_ARGS=[this file]).
// FAKE_ORCA_STATE: JSON file { mode, active, worktrees: [{ path, displayName?, branch?, status?, unread?, linkedIssue?, linkedPR?, agents? }] },
// re-read on every call so a test or browser session can change the answer. Modes: normal | malformed | exit | hang | shape.
// FAKE_ORCA_COUNT_FILE: one line is appended per invocation (counts child processes).
import { appendFileSync, readFileSync } from "node:fs";

if (process.env.FAKE_ORCA_COUNT_FILE) appendFileSync(process.env.FAKE_ORCA_COUNT_FILE, `${process.pid}\n`);
if (process.argv.slice(2).join(" ") !== "worktree ps --json") {
  console.error(`fake orca: unsupported arguments: ${process.argv.slice(2).join(" ")}`);
  process.exit(2);
}

const state = JSON.parse(readFileSync(process.env.FAKE_ORCA_STATE, "utf8"));
const mode = state.mode || "normal";

if (mode === "hang") setInterval(() => {}, 1000);
else if (mode === "exit") {
  console.error("fake orca: runtime unavailable");
  process.exit(3);
} else if (mode === "malformed") process.stdout.write("{not json");
else if (mode === "shape") process.stdout.write(JSON.stringify({ ok: true, result: { worktrees: "nope" } }));
else {
  const worktrees = state.worktrees.map((worktree, index) => ({
    worktreeId: `fake-repo::${worktree.path}`,
    repo: "fake-repo",
    path: worktree.path,
    branch: worktree.branch === undefined ? `refs/heads/wt-${index}` : worktree.branch,
    displayName: worktree.displayName ?? `wt-${index}`,
    isActive: worktree.path === state.active,
    status: worktree.status ?? "inactive",
    unread: worktree.unread === true,
    linkedIssue: worktree.linkedIssue ?? null,
    linkedPR: worktree.linkedPR ?? null,
    comment: worktree.comment ?? "",
    liveTerminalCount: worktree.liveTerminalCount ?? 0,
    lastActivityAt: 1_700_000_000_000 + index,
    agents: worktree.agents ?? [],
  }));
  process.stdout.write(JSON.stringify({ id: "fake", ok: true, result: { worktrees, hostScope: { hostIds: ["local"] }, totalCount: worktrees.length, truncated: false } }));
}
