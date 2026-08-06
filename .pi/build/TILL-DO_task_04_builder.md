# TILL-DO Task 04

## Authority / baseline — PASS
- Task brief: `.pi/plans/20260806_150243Z_plastic_emergency_compaction/TASKS/task_04_builder.md` read first.
- Relevant PLAN_FULL sections read: outcome, material decisions, affected-artifact closure, scenarios/failure behavior, validation strategy.
- Baseline checkpoint: HEAD `d937a92`; dependencies Task 01 `588ffcd`, Task 02 `d2867e2`, Task 03 `d937a92` are supplied by task contract.
- Target paths are clean; unrelated dirty files are outside scope and will not be touched.

## Contract / scope — PASS
- Modify only `extensions/plastic-memory/compaction/emergency.ts` and `extensions/plastic-memory/compaction/engine.ts`; create only `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs`.
- Emergency is transient semantic-only: exact observer/reflector/compactor worker parsers, code-owned IDs, strict citations, overlay summary, verified render/pending; no cycle attempted/closed persistence or host side effects.
- Normal six/four path remains unchanged; no coordinator/scheduler/runtime resolution changes.
- Recovery snapshots required under `.pi/build/recovery/task_04/` and excluded from product scope.

## Validation / resources — PASS
- Declared validation uses fake/in-process smokes only under `NO_STATEFUL_RESOURCES`.
- Will run the task smoke, all `extensions/test/plastic-memory-*.smoke.mjs`, and `git diff --check`.
- No live Pi/provider/network/session credentials/servers/E2E.

## Recovery / stop gates — PASS
- Before source mutation, byte-for-byte snapshots of both existing targets will be created.
- Stop BLOCKED on undeclared write paths, weakened fail-closed guard, fake deterministic summary, persisted emergency cycle state, missing abort/deadline path, or unsafe validation resources.
- Focused diff review required before completion; no staging/commit.
