# Schedule — Plastic Memory 20k Queue and Host Continuity

**Plan path**: `/Users/j.henrique/.pi/agent/.pi/plans/20260806_195144Z_plastic_20k_queue_continuity`  
**Generated**: 2026-08-06T19:51:44Z  
**Status**: deterministic implementation complete; live host/provider evidence unverified

| ID | Task File | Agent | Depends | Parallel Group | Write Set | Validation | Recovery | Gate | Status |
|---:|---|---|---|---|---|---|---|---|---|
| 01 | `TASKS/task_01_builder.md` | builder | — | PG-A | `extensions/plastic-memory/session/types.ts`; `extensions/plastic-memory/session/cycles.ts`; `extensions/plastic-memory/session/ledger.ts`; `extensions/test/plastic-memory-queue.smoke.mjs` | Queue smoke + full Plastic loop + scoped diff check | required | `7017943` | complete |
| 02 | `TASKS/task_02_builder.md` | builder | 01 | — | `extensions/plastic-memory/session/cycles.ts`; `extensions/plastic-memory/workers/scheduler.ts`; `extensions/plastic-memory/workers/runner.ts`; `extensions/test/plastic-memory-workers.smoke.mjs`; `extensions/test/plastic-memory-model-fallback.smoke.mjs`; `extensions/test/plastic-memory-emergency-queue.smoke.mjs`; `extensions/test/plastic-memory-chunking.smoke.mjs`; `extensions/test/plastic-memory-stride.smoke.mjs`; `extensions/test/plastic-memory-fresh-session.smoke.mjs` | FIFO/fallback/chunking/stride focused smokes + full Plastic loop + scoped diff check | required | `416963a` | complete |
| 03 | `TASKS/task_03_builder-heavy.md` | builder-heavy | 02 | — | `extensions/plastic-memory/runtime/coordinator.ts`; `extensions/plastic-memory/workers/scheduler.ts`; `extensions/test/plastic-memory-{integration,emergency-hook,workers,emergency-queue,chunking}.smoke.mjs` | Coordinator/direct-scheduler queue-restart smokes + full Plastic loop + scoped diff check | required | `2397e4c` | complete after closure repair |
| 04 | `TASKS/task_04_builder-heavy.md` | builder-heavy | 03 | — | `extensions/plastic-memory/runtime/coordinator.ts`; `extensions/plastic-memory/compaction/engine.ts`; `extensions/test/plastic-memory-apply-cut.smoke.mjs`; `extensions/test/plastic-memory-acknowledge.smoke.mjs`; `extensions/test/plastic-memory-emergency-hook.smoke.mjs`; `extensions/test/plastic-memory-integration.smoke.mjs`; `extensions/test/plastic-memory-compaction.smoke.mjs`; `extensions/test/plastic-memory-stride.smoke.mjs`; `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs`; `extensions/test/plastic-memory-emergency-selection.smoke.mjs`; `extensions/test/plastic-memory-worker-contract.smoke.mjs` | Passive hook/ack/eligibility smokes + removed-path grep + full Plastic loop + scoped diff check | required | `7ded8fe` | complete after closure repair |
| 05 | `TASKS/task_05_builder.md` | builder | — | PG-A | `scripts/patch-pi-083-threshold-cancel.mjs`; `scripts/test/patch-pi-083-threshold-cancel.smoke.mjs`; `install.sh`; `install.ps1`; `README.md` | Disposable patch smoke + `bash -n` + scoped diff check; PowerShell parse if available | required | `7359dd1` | complete; PowerShell parse unverified |
| 06 | `TASKS/task_06_validator.md` | validator | 03, 04, 05 | — | none | Full Plastic loop + disposable patch smoke + removed-path grep + baseline-to-final diff check/review | not required | `PASS` at `7ded8fe` | complete |

**PG-A disjointness**: Task 01 writes only Plastic session/kernel and queue-test paths; Task 05 writes only installer/patch-script/README paths. Their full write sets, fake-runtime validation, and disposable patch fixture do not overlap.

## Orchestrator Rules

- Start a task only after every listed dependency is `complete`; each writing dependency must also have its selective checkpoint hash recorded. Task 06 additionally requires the exact reviewed hashes and records `PASS | BLOCKED` rather than a commit.
- Record status transitions and checkpoint hashes/verdicts in this file; agents do not update schedule state.
- Before each writing task, create the required recovery snapshot only for its declared shared/large/preservation-critical files. Keep recovery artifacts out of the selective product commit unless explicitly tracked and relevant.
- After focused validation and diff review, commit only the task's exact write set. Never stage/revert unrelated dirty `SYSTEM.md`, `agents/`, `skills/`, `config/`, or `.pi/` content.
- A `BLOCKED` validator verdict pauses completion. Return findings to the owning builder for a bounded repair checkpoint, then rerun the same validator gate; do not pre-create a speculative repair task.
- Completion requires checkpoint hashes for Tasks 01–05 and a recorded `PASS` for Task 06. Live global patch application, restart, and provider/manual/threshold/overflow campaigns are not schedule tasks and remain subject to fresh consequential confirmation.
