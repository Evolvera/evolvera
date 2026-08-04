# TILL-DO 02 — session cycle/bootstrap/legacy kernel

## Authority / baseline — PASS
- Authority: `.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_02_builder.md`; schedule records Task 01 complete at `c9b4b60`.
- Read evidence: Task 01 `common/ids.ts` and `common/safety.ts`; Pi 0.83.0 `SessionManager` branch/context semantics; legacy types/fold/progress/trigger; existing smoke patterns.
- Baseline: all six product targets are new files; unrelated pre-existing worktree changes are preserved and outside scope.

## Contract / scope — PASS
- Create only the five session kernel modules and one focused smoke named by the task.
- Preserve read-only `om.*`, raw lowercase 12-hex IDs, tombstones, append-only source evidence, and current-branch/active-context semantics; never write legacy records or add runtime/hooks/workers/state access.
- Exact closure is deterministic over contiguous completed-turn source IDs/spans/digests; historical bootstrap gaps are excluded from normal snapshots; retry and retention semantics remain append-only.

## Validation / resources — PASS
- Required commands are exactly `node extensions/test/plastic-memory-session.smoke.mjs` and `git diff --check -- extensions/plastic-memory/session extensions/test/plastic-memory-session.smoke.mjs`.
- Fixtures are in-memory branches/fakes only: `NO_STATEFUL_RESOURCES`; no filesystem/session/settings/provider/network access is used by the smoke.

## Recovery / stop gates — PASS
- New targets require no pre-edit byte snapshot; git history plus selective checkpoint is the rollback boundary, and no destructive transformation is planned.
- Stop without source mutation if safe bootstrap cannot use legacy markers plus compaction-aware entries, normal snapshots can cross historical gaps, or closure needs model prose/undeclared scope.
