---
name: goal
description: Start or reuse native Goal mode in the requesting AI's own PI session when the user says to use Goal. This is not a worker handoff.
---

# Goal in this session

When the user tells this AI to use Goal, create or reuse the goal **here**, in this same PI session, and keep working toward the user's outcome. Do not interpret that instruction as permission to create another PI, worktree, or worker goal. Ordinary bounded delegation may still help the work; ownership of this goal stays here.

## Native owner

`@narumitw/pi-goal` owns the goal state and continuation. Read its installed README for the current command contract when needed; do not implement a parallel goal loop, state file, or timer.

- `/goal <objective>` starts a goal. Keep the objective within 4,000 characters and focused on the user's outcome; refer to the existing handoff/context instead of duplicating long instructions.
- `/goal status` reports the current state. Reuse an active goal for the same outcome. Use the native resume route for a stopped matching goal only when the user has authorized continuation and its blocker/budget permits it. Do not clear, replace, edit, or resume an unrelated goal to make room.
- `goal_complete` closes only a completed, verified goal, using its current `goal_id`.
- `goal_blocked` retains its native true-impasse requirement: concrete evidence and the same blocker across at least three consecutive goal turns.

## Starting it yourself

Use a supported control path targeting **this exact session**. The installed package exposes completion/blocking tools, not a `goal_start` tool; do not invent one or assume a shell invocation of `pi` controls the existing session.

In an Orca-managed PI terminal:

1. Load `orca-cli` and its version-matched guide.
2. Resolve this terminal from the caller's `ORCA_TERMINAL_HANDLE` and `ORCA_WORKTREE_ID`, then verify it with `terminal show`. Never select the target from the active UI tab or another worker's handle. If caller identity cannot be verified, report that capability blocker.
3. Check native Goal state as needed, then send `/goal <objective>` to that same terminal with `terminal send --text ... --enter`. Do not prepend ordinary shell commands, create another terminal, or invoke a new `pi` process.
4. Require a native `Goal started:`/matching status receipt before claiming activation. An accepted keystroke receipt alone is not proof. Goal may queue its kickoff behind the current turn: finish that turn coherently and let the native lifecycle continue; do not create a second continuation mechanism or poll indefinitely.

Outside Orca, use another verified, supported same-session control only if actually available. The package's optional trusted-extension managed-run protocol is disabled by default; do not enable it, bypass it, or call private controllers just to satisfy this instruction. If no supported self-start path exists, state the exact capability blocker rather than silently delegating or pretending a goal exists.

Retrying or resuming your own interrupted job inside the goal's approved limits is goal work, never a blocker; `goal_blocked` never covers a permission question that no quoted rule requires. Goal does not broaden scope or authorize consequential operations. Preserve all existing safety gates, user pauses, budgets, stale-id guards, and explicit worker-specific Goal instructions.
