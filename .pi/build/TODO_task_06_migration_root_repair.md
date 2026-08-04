# TODO: Task 06 migration-root repair

## Phase 1 — Baseline and recovery
- Status: complete
- Authorized files/symbols: `migrate.ts` `migrationRoot`; migration smoke fixture helpers/tests
- Material prerequisite: Task 06 contract and user repair scope read; target files are untracked
- Local exit evidence: `.pi/recovery/task_06_migration_root_repair/before/` contains byte-identical snapshots of both target files

## Phase 2 — Root validation repair and nested fixture
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/project/migrate.ts` `migrationRoot`; `extensions/test/plastic-memory-migration.smoke.mjs` fixture and nested-root journey
- Material prerequisite: preserve absolute existing directory validation, regular-file/no-symlink checks, internal path safety, and all existing migration controls
- Local exit evidence: focused diff shows only removal of blanket `.pi/memory` rejection plus disposable nested `<temp>/project/.pi/memory` report/publish/archive/rollback assertions

## Phase 3 — Required validation and focused review
- Status: complete
- Authorized files/symbols: same two target files; no source expansion
- Material prerequisite: Phase 2 complete
- Local exit evidence: `node extensions/test/plastic-memory-migration.smoke.mjs` PASS; `node skills/project-memory/scripts/test/architecture-memory.smoke.mjs` PASS (54 assertions); required `git diff --check` PASS; focused diff reviewed with no unrelated changes

Completed phase: Phase 3 — Required validation and focused review
Current phase: complete
Next phase: none
Changed files: `extensions/plastic-memory/project/migrate.ts`, `extensions/test/plastic-memory-migration.smoke.mjs`
