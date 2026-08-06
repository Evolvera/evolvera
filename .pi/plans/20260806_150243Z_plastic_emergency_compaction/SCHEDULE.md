# Schedule — Plastic Emergency Compaction Ownership

**Plan**: `/Users/j.henrique/.pi/agent/.pi/plans/20260806_150243Z_plastic_emergency_compaction`  
**Generated**: 2026-08-06 15:02:43 UTC  
**Status**: implementation complete; live provider campaign unverified

| ID | Task File | Agent | Depends | Write Set | Validation | Recovery | Gate | Status |
|---|---|---|---|---|---|---|---|---|
| 01 | `TASKS/task_01_builder.md` | builder | — | `extensions/plastic-memory/workers/runner.ts`; `extensions/plastic-memory/runtime/runner-runtime.ts`; `extensions/plastic-memory/workers/observer.ts`; `extensions/plastic-memory/workers/reflector.ts`; `extensions/plastic-memory/workers/compactor.ts`; `extensions/test/plastic-memory-model-fallback.smoke.mjs` | model-fallback, workers, worker-contract, transport-integrity smokes | required | checkpoint `588ffcd` | complete |
| 02 | `TASKS/task_02_builder.md` | builder | 01 | `extensions/plastic-memory/compaction/engine.ts`; `extensions/plastic-memory/compaction/extract.ts`; `extensions/plastic-memory/compaction/emergency.ts`; `extensions/test/plastic-memory-emergency-selection.smoke.mjs`; `extensions/test/plastic-memory-compaction.smoke.mjs`; `extensions/test/plastic-memory-stride.smoke.mjs`; `extensions/test/plastic-memory-apply-cut.smoke.mjs` | emergency-selection, compaction, stride, apply-cut, chunking smokes | required | checkpoint `d2867e2` | complete |
| 03 | `TASKS/task_03_builder-light.md` | builder-light | 02 | `extensions/plastic-memory/session/render-summary.ts`; `extensions/test/plastic-memory-emergency-summary.smoke.mjs` | emergency-summary, session, compaction smokes | required | checkpoint `d937a92` | complete |
| 04 | `TASKS/task_04_builder.md` | builder | 03 | `extensions/plastic-memory/compaction/emergency.ts`; `extensions/plastic-memory/compaction/engine.ts`; `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs` | emergency-pipeline plus feeder smokes | required | checkpoint `a7c4c56` | complete |
| 05 | `TASKS/task_05_builder-heavy.md` | builder-heavy | 04 | `extensions/plastic-memory/workers/scheduler.ts`; `extensions/test/plastic-memory-emergency-queue.smoke.mjs` | emergency-queue, workers, chunking, stride smokes | required | checkpoint `c612987` | complete |
| 07 | `TASKS/task_07_builder-heavy.md` | builder-heavy | 05 | `extensions/plastic-memory/runtime/coordinator.ts`; `extensions/plastic-memory/session/recall.ts`; `extensions/test/plastic-memory-emergency-hook.smoke.mjs`; `extensions/test/plastic-memory-apply-cut.smoke.mjs`; `extensions/test/plastic-memory-acknowledge.smoke.mjs`; `extensions/test/plastic-memory-integration.smoke.mjs` | emergency-hook, emergency-queue, apply-cut, acknowledge, integration, retrieval, full Plastic suite | required | checkpoint `d9824ec` | complete |
| 06 | `TASKS/task_06_validator.md` | validator | 07 | none | aggregate queue/model/cut/rebase diagnostics and full Plastic suite | not required | `PASS` on `d9824ec` | complete |

No implementation tasks are authorized in parallel. Although early write sets are disjoint, their focused validation/import closures cross the same worker, engine, scheduler, and summary modules; serialization prevents a task from validating against a concurrently changing dependency.

A task starts only after every listed dependency is complete. A writing dependency also requires its selective checkpoint hash in this schedule; the validator dependency requires the full transitive writing checkpoint chain. The orchestrator records status, hashes, and the validator verdict here.

On validator `BLOCKED`, pause completion, return findings to the producer builder for a bounded repair within the producer write set, checkpoint that repair selectively, and rerun the same validator gate. Completion requires checkpoint hashes for Tasks 01, 02, 03, 04, 05, and 07, plus `PASS` for Task 06.
