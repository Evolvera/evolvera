# TILL-DO task_04

## Authority / baseline
- PASS — Read `/Users/j.henrique/.pi/agent/.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_04_builder.md` and `SCHEDULE.md`; Task 03 checkpoint is `d82adde`.
- PASS — Read Task 04 target contracts, committed project schema/store/projection/io, legacy `extensions/project-memory.ts`, architecture validator, and Pi prompt override/retry lifecycle.

## Contract / scope
- PASS — Authorized source writes are exactly `extensions/plastic-memory/project/search.ts`, `extensions/plastic-memory/project/context.ts`, and `extensions/test/plastic-memory-retrieval.smoke.mjs`.
- PASS — Canonical Markdown remains authority; flat fallback and architecture JSON behavior are preserved; no writes to project files, no full-chunk prompt injection, no edits to excluded paths.

## Validation / resources
- PASS — Required smoke tests use unique `mkdtemp` roots and only Node built-ins/Jiti; no current `.pi/memory`, provider, auth, network, Git mutation, migration, seed, or shared resource.
- PASS — Required validation commands are the Task 04 retrieval smoke, existing architecture smoke, and scoped `git diff --check`.

## Recovery / stop gates
- PASS — New targets are clean/untracked and temp-owned fixtures require no source snapshot; Git history plus selective diff is rollback boundary.
- PASS — Missing derived data is rebuilt only in memory. Stop if acceptance would require persistent writes, migration, excluded architecture edits, or a second source/cache of project truth.
