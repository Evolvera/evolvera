# TILL-DO Task 08 Repair

## Authority / baseline — PASS
- Authority: user repair contract plus Task 08 contract at `.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_08_builder.md`.
- Baseline: inspect current untracked Task 08 targets; repair is limited to `backfill.ts` and `plastic-memory-surfaces.smoke.mjs`.

## Contract / scope — PASS
- Remove the total-history `>2,000` permanent conflict; retain current-branch ordered/source validation, explicit bootstrap IDs, report-first zero-write behavior, one-window cursor advancement, and retry/pause/idempotence.
- Add only a safe in-memory/temp fixture proving >2,000 safe historical source entries span bounded windows.
- No other source, plan, runtime, session, provider, project, or recovery files.

## Validation / resources — PASS
- Validation command: `node extensions/test/plastic-memory-surfaces.smoke.mjs`; static check: `git diff --check -- extensions/plastic-memory/session/backfill.ts extensions/test/plastic-memory-surfaces.smoke.mjs`.
- Smoke is in-memory plus uniquely owned temporary directory; no provider/network/auth/real session/project state. No stateful resources reachable.

## Recovery / stop gates — PASS
- No source snapshot required: the two targets are untracked Task 08 files and user explicitly forbids recovery artifacts.
- Stop if bounded cursor advancement requires sidecar/unbounded processing, or if total-history size cannot be distinguished from one unsafe incomplete/oversized turn.
