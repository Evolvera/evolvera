# Schedule — Single QA Capability with Two Levels

**Plan path**: `/Users/j.henrique/.pi/agent/.pi/plans/20260724_220541Z_single_qa_two_levels`  
**Generated**: 2026-07-24 22:05:41Z  
**Status**: complete

| ID | Task File | Agent | Depends | Write Set | Validation | Recovery | Gate | Status | Checkpoint / Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 01 | `TASKS/task_01_builder-light.md` | `builder-light` | — | `skills/testing/scripts/inventory-qa-surfaces.mjs`<br>`skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs`<br>`skills/testing/scripts/test/fixtures/inventory/package.json`<br>`skills/testing/scripts/test/fixtures/inventory/playwright.config.js` | inventory smoke; `node --check`; focused `git diff --check`; pre/post status | none | All checks `NO_STATEFUL_RESOURCES`; only four declared new paths | complete | `8c39a6f16056c2ce387a45b35615d3dae8660c3a` |
| 02 | `TASKS/task_02_builder.md` | `builder-heavy-design` | 01 | `agents/qa.md`<br>`agents/builder.md`<br>`skills/testing/SKILL.md`<br>`skills/testing/references/core-qa.md`<br>`skills/testing/references/full-qa.md`<br>`skills/testing/references/research.md`<br>`skills/testing/templates/qa-handoff.md`<br>`skills/testing/scripts/test/qa-contract.smoke.mjs`<br>`skills/builder/SKILL.md`<br>`skills/planner/SKILL.md`<br>`skills/agent-guide/SKILL.md`<br>`SYSTEM.md`<br>`config/SYSTEM.md`<br>Operational rollback writes only under `.pi/recovery/20260724_220541Z_single_qa_two_levels_task_02/before/` | both Node smokes; four `pi_validate_skill` PASS results; agent discovery; obsolete-route grep empty; SYSTEM `cmp`; `git diff --check`; focused diff/status | required at the named task-specific recovery root for seven existing shared files | Task 01 checkpoint hash recorded; all referenced utility paths present; no target dirty overlap | complete | `0135586ddbf2799bcaec0fb840b9660c9d9ff309` |
| 03 | `TASKS/task_03_validator.md` | `validator` | 02 | none | rerun/read deterministic checks; inspect exact base/head diff and five scenario-group receipts; return `PASS \| BLOCKED` | none | Task 02 checkpoint hash recorded; five prompt-eval groups complete in six fresh `qa` sessions and bound to that checkpoint | complete | `PASS` for `9305bd7a6e43430a37e2e92051c127488d1f7824..0135586ddbf2799bcaec0fb840b9660c9d9ff309` |

## Execution Rules

- A task starts only when every dependency is `complete`; a writing dependency also needs its selective checkpoint hash in the final column. The validator completes only with a recorded `PASS`.
- Critical path: **01 → 02 → post-checkpoint prompt-eval gate → 03**.
- Parallel groups: none. The skill/routing checkpoint consumes the inventory utility, and the validator reviews the complete final checkpoint plus behavior receipts.
- Before each writing task, record the full current status and exclude every pre-existing dirty/untracked path. Stop on write-set overlap.
- After focused validation and diff review, selectively commit only task-owned source files (plus the task-specific recovery artifacts only if existing repository policy tracks them). Never stage PLAN_DIR, unrelated dirty files, pre-existing recovery/build content, broad rewrites, weakened tests, or accidental deletions.
- The orchestrator runs five prompt-evaluation scenario groups after Task 02: CORE, safe FULL, unsafe FULL, mocked browser, and harness build/fresh-run. Harness evaluation requires two separate fresh sessions. These are command-forbidden `NO_STATEFUL_RESOURCES` prompt evaluations and create no task/SCHEDULE row.
- If Task 03 returns BLOCKED, pause completion, return its bounded findings to the producer, checkpoint only an authorized repair, rerun all affected deterministic/prompt gates, then rerun the same validator. Do not pre-create a repair task or let a repair redefine preserved behavior.
- Plan completion requires checkpoint hashes for Tasks 01–02 and `PASS` for Task 03.
