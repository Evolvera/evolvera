# TILL-DO task_03_builder-light

## Authority / baseline
- PASS — Task brief loaded: `.pi/plans/20260806_150243Z_plastic_emergency_compaction/TASKS/task_03_builder-light.md`.
- PASS — Task 02 checkpoint `d2867e2` acknowledged and relevant module ownership confirmed.
- PASS — Scope for this task is limited to `extensions/plastic-memory/session/render-summary.ts` and `extensions/test/plastic-memory-emergency-summary.smoke.mjs` plus required in-task recovery artifacts under `.pi/build`.

## Contract / scope
- PASS — Write set is exactly `extensions/plastic-memory/session/render-summary.ts` and `extensions/test/plastic-memory-emergency-summary.smoke.mjs`.
- PASS — No plan to modify compaction/ledger/recall/scheduler or coordinator/pipeline behavior in this task.
- PASS — Validation required by task: new emergency summary smoke plus existing session and compaction smoke suites and `git diff --check`.

## Resource / state gates
- PASS — `NO_STATEFUL_RESOURCES` requirement accepted; all requested tests are in-process fake runtime smokes.
- PASS — No live network/provider/db calls needed; only local test harness and existing in-repo fixtures.

## Recovery / stop gates
- PASS — Recovery snapshot required and created for `extensions/plastic-memory/session/render-summary.ts` under `.pi/build/recovery/task_03/before/`.
- PASS — Stop if recovery snapshot cannot be created or scope requires out-of-contract edits.
