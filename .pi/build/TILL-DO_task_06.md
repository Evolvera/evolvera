# TILL-DO task_06

## Authority / baseline — PASS
- Authority: `.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_06_builder.md`.
- Baseline: Task 03 checkpoint `d82adde`; inspected canonical `schema.ts`, `store.ts`, `io.ts`; no source changes yet.
- Scope: create only `extensions/plastic-memory/project/migrate.ts` and `extensions/test/plastic-memory-migration.smoke.mjs` plus required transient build artifacts.

## Contract / scope — PASS
- Report is read-only by default; explicit publication only.
- Six fixed filename/category mappings; deterministic level-two splits; all source bytes retained in canonical bodies or byte archive.
- Preserve originals, `_summary.md`, architecture JSON/HTML bytes; support conflicts, idempotence, fault recovery, and rollback.
- No model categorization, provider, runtime/session/settings/docs/template/plan/current-memory changes.

## Validation / resources — PASS
- Validation commands are local Node smoke scripts and `git diff --check`.
- Smoke fixtures use unique `mkdtemp` roots under the OS temp directory, synthetic bytes only, no network/provider/package install, no database/cache/queue/search/index/shared or live `.pi/memory` resource.
- Existing architecture smoke also uses its own disposable fixture; no teardown hook targets pre-existing state.

## Recovery / stop gates — PASS
- New product files require no source snapshot; git history plus selective diff is the rollback boundary.
- Publish stages in a sibling temp directory and leaves a manifest-backed recovery state on finalization faults; rollback restores archived flat bytes.
- Stop if safe root validation, byte preservation, canonical validation, or authorized write set cannot be maintained.
