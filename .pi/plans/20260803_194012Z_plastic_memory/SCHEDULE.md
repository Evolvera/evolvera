# Schedule — plastic-memory semantic cycles

**Plan**: `/Users/j.henrique/.pi/agent/.pi/plans/20260803_194012Z_plastic_memory`  
**Generated**: 2026-08-03 19:40:12 UTC  
**Status**: planning

| ID | Task File | Agent | Depends | Parallel Group | Write Set | Validation | Recovery | Gate | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | `TASKS/task_01_builder.md` | builder | — | — | `extensions/test/plastic-memory-host.smoke.mjs`; `extensions/plastic-memory/index.ts`; `extensions/plastic-memory/config.ts`; `extensions/plastic-memory/common/ids.ts`; `extensions/plastic-memory/common/safety.ts`; `extensions/plastic-memory/THIRD-PARTY-NOTICES.md`; `extensions/test/plastic-memory-bootstrap.smoke.mjs` | host capability + Node/jiti inert-foundation smokes | — | `HOST_CAPABILITY: PASS`; failure blocks all work | complete (`c9b4b60`) |
| 02 | `TASKS/task_02_builder.md` | builder | 01 | P1 | `extensions/plastic-memory/session/types.ts`; `extensions/plastic-memory/session/ledger.ts`; `extensions/plastic-memory/session/cycles.ts`; `extensions/plastic-memory/session/bootstrap.ts`; `extensions/plastic-memory/session/retention.ts`; `extensions/test/plastic-memory-session.smoke.mjs` | schema/legacy/cycle/100k/7m/bootstrap smoke | — | exact coverage and safe-resume | complete (`fb50863`, repair `37f7be8`) |
| 03 | `TASKS/task_03_builder.md` | builder | 01 | P1 | `extensions/plastic-memory/project/schema.ts`; `extensions/plastic-memory/project/io.ts`; `extensions/plastic-memory/project/store.ts`; `extensions/plastic-memory/project/projection.ts`; `extensions/test/plastic-memory-project.smoke.mjs` | canonical schema/publication/projection smoke | — | Markdown authority | complete (`d82adde`) |
| 04 | `TASKS/task_04_builder.md` | builder | 03 | P2 | `extensions/plastic-memory/project/search.ts`; `extensions/plastic-memory/project/context.ts`; `extensions/test/plastic-memory-retrieval.smoke.mjs` | recall/search/every-run context + architecture smoke | — | 8k/4k/4k read model | complete (`16462c7`) |
| 06 | `TASKS/task_06_builder.md` | builder | 03 | P2 | `extensions/plastic-memory/project/migrate.ts`; `extensions/test/plastic-memory-migration.smoke.mjs` | report/publish/archive/rollback migration smoke | — | non-destructive migration | complete (`1ed8c49`) |
| 05 | `TASKS/task_05_builder.md` | builder | 02, 04 | — | `extensions/plastic-memory/compaction/extract.ts`; `extensions/plastic-memory/compaction/render.ts`; `extensions/plastic-memory/compaction/pending.ts`; `extensions/plastic-memory/compaction/engine.ts`; `extensions/test/plastic-memory-compaction.smoke.mjs` | 6/4/stride/cut/pending/repair/ack smoke | — | safe staged custom cut | complete (`57711ce`) |
| 07 | `TASKS/task_07_builder.md` | builder | 02, 04, 05 | — | `extensions/plastic-memory/workers/runner.ts`; `extensions/plastic-memory/workers/observer.ts`; `extensions/plastic-memory/workers/reflector.ts`; `extensions/plastic-memory/workers/compactor.ts`; `extensions/plastic-memory/workers/promoter.ts`; `extensions/plastic-memory/workers/scheduler.ts`; `extensions/test/plastic-memory-workers.smoke.mjs` | four-role fake model/100k/retry/detached smoke | — | Luna medium/no visible fallback | complete (`e387712`) |
| 08 | `TASKS/task_08_builder.md` | builder | 06, 07 | P3 | `extensions/plastic-memory/session/recall.ts`; `extensions/plastic-memory/session/backfill.ts`; `extensions/plastic-memory/runtime/tools.ts`; `extensions/plastic-memory/runtime/commands.ts`; `extensions/test/plastic-memory-surfaces.smoke.mjs` | legacy/new retrieval, namespaced surfaces, publication, and bounded backfill smoke | — | explicit authority | pending |
| 09 | `TASKS/task_09_builder.md` | builder | 05, 07 | P3 | `extensions/plastic-memory/compaction/projection.ts`; `extensions/plastic-memory/runtime/coordinator.ts`; `extensions/test/plastic-memory-integration.smoke.mjs` | actual-host provider-context/settled/race/fallback integration | — | exact projection; no interruption | pending |
| 10 | `TASKS/task_10_builder.md` | builder | 08, 09 | — | `extensions/plastic-memory/index.ts`; `extensions/project-memory.ts`; `extensions/test/plastic-memory-cutover.smoke.mjs` | jiti all-mode owner/context/cutover smoke | required | one compaction/context owner | pending |
| 13 | `TASKS/task_13_validator.md` | validator | 10 | — | none | independent host/cut/projection/race/fallback suite | — | recorded `PASS` required | pending |
| 11 | `TASKS/task_11_builder-light.md` | builder-light | 13 | P4 | `skills/project-memory/SKILL.md`; `SYSTEM.md`; `config/SYSTEM.md`; `README.md` | mirror/stale-reference/architecture/focused diff checks | required | policy matches validated runtime | pending |
| 12 | `TASKS/task_12_builder.md` | builder | 13 | P4 | plastic-memory hunks in `config/settings.json`; `install.sh`; `install.ps1`; `extensions/test/plastic-memory-install.smoke.mjs` | temp staging/order/fault/dirty-hunk + shell/static PowerShell checks | required | deferred activation | pending |

**P1** is safe in parallel because session-schema/kernel/test and project-schema/persistence/test write sets are disjoint and consume only the read-only common foundation.

**P2** is safe in parallel because project retrieval/context and migration own disjoint production/test paths; both read the canonical store without modifying shared files.

**P3** is safe in parallel because session user-operations/tools/commands/surface tests and compaction projector/coordinator/integration tests are fully disjoint; both consume checkpointed interfaces and neither modifies the inert root.

**P4** is safe in parallel only after validator `PASS`: documentation/policy files and dirty source-config/installer files plus install smoke are disjoint, with separate recovery resources.

## Orchestration Rules

- Start only after every dependency is `complete`. A writing dependency also needs its selective checkpoint hash here; a validator dependency needs recorded `PASS`.
- Task 01 is the bounded host stop. On `BLOCKED`, launch nothing else and do not reinterpret 6/4.
- Launch Task 13 immediately after Task 10. Tasks 11–12 trust the custom-cut runtime and wait for its `PASS`, despite lower IDs.
- Create required recovery snapshots before Tasks 10–12 mutate shared/preservation-critical files. Clean new files rely on selective commits.
- Classify every fixture `NO_STATEFUL_RESOURCES` or `DISPOSABLE_VERIFIED`. Provider/network, live installer/package/reload/migration, or non-temp settings/session/auth/project-memory access blocks the task.
- After focused validation/diff review, create one selective commit containing only the task write set and intentional recovery artifact; record its hash here.
- Task 12 stages only plastic-memory hunks and leaves every pre-existing unrelated hunk in `config/settings.json`, `install.sh`, and `install.ps1` byte-identical and unstaged.
- Task 13 creates no empty commit. `BLOCKED` pauses Tasks 11–12, returns bounded findings for a selective producer repair, then reruns the same gate.
- Completion requires checkpoint hashes for Tasks 01–12 and validator `PASS` for Task 13. Live Luna quality, Windows execution, installer/reload, and real migration remain unverified.
