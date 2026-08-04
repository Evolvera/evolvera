# TILL-DO Task 08

## Authority / baseline — PASS
- Authority: `.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_08_builder.md` and `SCHEDULE.md`.
- Dependencies verified present: session bootstrap/ledger/cycles, project search/store/migrate, scheduler, OM recall precedent, Pi extension docs.
- Existing worktree has unrelated dirty/untracked files; target write set is new-only and will be reviewed narrowly.

## Contract / scope — PASS
- Create only session recall/backfill, injectable runtime tools/commands, and the named smoke test.
- Preserve raw honest recall semantics, branch-local folded evidence, explicit/idempotent proposal/migration authority, and scheduler retry semantics.
- No root registration, hooks/coordinator/provider execution, real session/project mutation, sidecar storage, dependency/config/docs changes, or bare `recall` registration.

## Validation / resources — PASS
- Planned validation: `node extensions/test/plastic-memory-surfaces.smoke.mjs` and focused `git diff --check`.
- Smoke test uses only in-memory fake API/session data and uniquely owned temporary project roots; no provider/network/auth/real session/project/migration resources.
- No stateful repository command or destructive hook will be run.

## Recovery / stop gates — PASS
- Recovery snapshot not required because all five targets are new and test writes are temp-owned.
- Stop if required honest recall needs off-branch access, backfill exceeds one current-branch window, host schemas require an unavailable dependency, or scope expands.
- No source mutation is authorized until these gates are all PASS.
