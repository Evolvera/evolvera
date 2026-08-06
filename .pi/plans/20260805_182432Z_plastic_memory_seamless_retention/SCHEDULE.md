# Schedule — Plastic Memory Seamless Retention

**Plan path**: `/Users/j.henrique/.pi/agent/.pi/plans/20260805_182432Z_plastic_memory_seamless_retention`  
**Generated**: 2026-08-05 18:24:32 UTC  
**Status**: in_progress

Task 01 is already physically in progress but is **repair/resume required**: its eight-file partial delta is uncommitted and has no checkpoint. A task releases its dependent only after `complete`; a writing task additionally requires a recorded selective checkpoint hash, and a validator requires a recorded `PASS`. Builders never stage or commit. The orchestrator records hashes/verdicts and excludes all unrelated pre-existing dirty/untracked content.

| ID | Task File | Agent | Depends | Write Set | Validation | Recovery | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| 01 | `TASKS/task_01_builder.md` | builder | — | `extensions/plastic-memory/compaction/engine.ts`; `extensions/plastic-memory/runtime/coordinator.ts`; `extensions/plastic-memory/workers/compactor.ts`; `extensions/test/plastic-memory-compaction.smoke.mjs`; `extensions/test/plastic-memory-stride.smoke.mjs`; `extensions/test/plastic-memory-apply-cut.smoke.mjs`; `extensions/test/plastic-memory-acknowledge.smoke.mjs`; `extensions/test/plastic-memory-integration.smoke.mjs`; run-owned resume/final receipt artifacts under `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_01/`; transient `.pi/build/TILL-DO_task-01.md` and `TODO_task-01.md` | compaction, stride, apply-cut, acknowledge, integration, session, and host smokes; scoped diff/receipt/hash review | required — preserved original/recovery/resume/repair evidence | `152d4e7` (baseline `7d0a06b`) | complete |
| 02 | `TASKS/task_02_builder.md` | builder | 01 | `extensions/plastic-memory/session/cycles.ts`; `extensions/plastic-memory/workers/observer.ts`; `extensions/plastic-memory/workers/reflector.ts`; `extensions/plastic-memory/workers/scheduler.ts`; `extensions/test/plastic-memory-worker-contract.smoke.mjs`; `extensions/test/plastic-memory-workers.smoke.mjs`; `extensions/test/plastic-memory-transport-integrity.smoke.mjs`; `extensions/test/plastic-memory-chunking.smoke.mjs`; `extensions/test/plastic-memory-stride.smoke.mjs`; `extensions/test/plastic-memory-integration.smoke.mjs`; run-owned receipt artifacts under `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/`; transient `.pi/build/TILL-DO_task-02.md` and `TODO_task-02.md` | six focused worker/chunk/integration smokes, session smoke, all-Plastic smoke loop, scoped diff/receipt review | required — before/repair evidence and receipt SHA verified | `37f8d2e` | complete |
| 03 | `TASKS/task_03_validator.md` | validator | 02 | none | 11-smoke critical suite; focused diff; both recovery/receipt/hash and shared-baseline bridge reviews | — | `PASS` at `37f8d2ec5f42915d14a8b8b8996aa8ce75b35942` | complete |

## DAG and Launch Policy

```text
01 (resume/repair) -> 02 -> 03 -> orchestrator-owned live PTY campaigns
```

**Parallel groups**: none. The writing tasks both own `extensions/test/plastic-memory-stride.smoke.mjs` and `extensions/test/plastic-memory-integration.smoke.mjs`; the later worker pipeline also consumes the earlier engine/compactor checkpoint. Their full write/validation sets are therefore not disjoint.

**Critical path**: repaired retention/application checkpoint → semantic chunk/retry checkpoint → independent `PASS` → three live campaigns.

## Checkpoint and Recovery Controls

- Before resuming 01, recompute `3cff8e488b2d9e9cccbd0c874fc2b69885c939e25518f175a1a18a78dbea4bfd`, preserve the original `before/` tree and partial patch, hash current targets, and capture `resume_before/`. Stale TILL-DO/TODO completion claims do not count as a checkpoint.
- After each writing task's deterministic validation and focused snapshot-to-current review, the orchestrator verifies its final receipt/patch SHA and creates one selective checkpoint containing only task-owned product hunks. Record the hash here before releasing the next row.
- Never stage an entire pre-existing dirty/untracked file merely because it is a target. If Git cannot encode only the owned hunks, pause and use the verified delta evidence to create a bounded selective checkpoint; do not absorb baseline content.
- Task 02 snapshots shared smokes only after their hashes match the recorded final receipt from 01.
- Validator `BLOCKED` pauses every live campaign. Findings return to the responsible producer for a bounded repair and selective checkpoint, then the same validator gate reruns. Do not pre-create a repair task.
- Completion requires writing checkpoint hashes for 01 and 02, validator `PASS`, and recorded results for all three orchestrator campaigns. A bounded unavailable external/runtime fact is recorded `TO VERIFY`, never silently marked pass.

## Orchestrator-Owned Live PTY Campaigns

These are post-validator orchestration gates, not agent tasks or DAG nodes. Run only after validator `PASS`, from fresh unique `/tmp` session/agent roots, with read-only tools, no subagents, no credential inspection, no source mutation, and no weakening of deterministic validation.

1. **Oversized completed-turn campaign** — produce one completed source turn over 160k; observe multiple bounded observer calls/chunk identifiers or equivalent diagnostics, exact full-source aggregation, any bounded fail-once immediate retry evidence available, one reflection, and exactly one closed cycle. Record call/token/record evidence and any unverified surface.
2. **Retention/application campaign** — at low usage reach C6 and observe prepared-but-not-applied deferral; grow to C8/high usage; observe exact C1..C4 semantic request/state and C5 cut, valid pending consumed by auto/internal host path, one current `fromHook` Plastic compaction, applied acknowledgement, and an intact incomplete suffix. Record host context entries and absence of warning/hot loop.
3. **Model-variance campaign** — repeat a bounded semantic observer/reflector case enough to seek output variance while keeping code-owned IDs, exact citation membership, scrubbing, aggregation, and closure fixed. Record natural variance if observed; if the model is deterministic/unavailable, record `TO VERIFY` rather than injecting malformed output or relaxing validation.

Campaign results are recorded by the orchestrator in this schedule or its run log; builders and validator do not execute them.
