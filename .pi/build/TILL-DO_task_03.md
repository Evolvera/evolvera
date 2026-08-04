# TILL-DO task_03

## Authority / baseline
- PASS — Task authority read: `.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_03_builder.md` and `SCHEDULE.md`.
- PASS — Task 01 checkpoint `c9b4b60` verified; `common/ids.ts`, `common/safety.ts`, and `config.ts` are the reusable foundation.
- PASS — Existing project-memory extension and architecture contract read; Markdown summary remains human authority and architecture JSON/HTML remain outside this transaction.

## Contract / scope
- PASS — Authorized source writes are exactly four new project modules and one new smoke test: `extensions/plastic-memory/project/{schema,io,store,projection}.ts` and `extensions/test/plastic-memory-project.smoke.mjs`.
- PASS — No migration/search/context/runtime/settings/docs/plan edits; existing memory and non-temp projects remain read-only.
- PASS — Node built-ins only; explicit acceptance required; canonical chunks are authoritative and projections are derived only.

## Validation / resources
- PASS — Validation is the exact requested Node smoke plus focused `git diff --check`.
- PASS — Smoke fixtures will use unique `mkdtempSync` roots owned by the test, no current-memory/provider/auth/network/settings/live Git access, and teardown in `finally`; classified `DISPOSABLE_VERIFIED`.

## Recovery / stop gates
- PASS — New product files have no pre-edit snapshot requirement; git history is the rollback boundary and fixtures are disposable.
- PASS — Canonical chunk publication is designed canonical-first under lock/temp-write/rename; derived failures return an explicit stale/repairable outcome and never become truth.
- PASS — Stop if required acceptance needs undeclared paths, dependency/real project access, or canonical-vs-derived success cannot be distinguished.
