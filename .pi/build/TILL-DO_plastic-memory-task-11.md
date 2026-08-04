# TILL-DO: Task 11 — Project Memory policy docs alignment

## Scope
- Update docs only in:
  - `skills/project-memory/SKILL.md`
  - `SYSTEM.md`
  - `config/SYSTEM.md`
  - `README.md`
- Preserve all other files, architecture/Flow/GitHub authority text, and runtime behavior.

## Anchors & Evidence
- Task file reviewed: `.pi/plans/20260803_194012Z_plastic_memory/TASKS/task_11_builder-light.md`
- Runtime evidence reviewed:
  - `extensions/plastic-memory/config.ts`
  - `extensions/plastic-memory/runtime/tools.ts`
  - `extensions/plastic-memory/runtime/commands.ts`
  - `extensions/plastic-memory/runtime/coordinator.ts`
  - `extensions/plastic-memory/session/bootstrap.ts`
  - `extensions/plastic-memory/session/backfill.ts`
  - `extensions/plastic-memory/project/schema.ts`
  - `extensions/plastic-memory/project/migrate.ts`
  - `extensions/plastic-memory/project/context.ts`
  - `extensions/plastic-memory/project/search.ts`
  - `extensions/plastic-memory/index.ts`
  - `extensions/project-memory.ts`
- Pre-edit snapshots created under:
  - `.pi/recovery/plastic-memory-task-11/before/skills/project-memory/SKILL.md`
  - `.pi/recovery/plastic-memory-task-11/before/SYSTEM.md`
  - `.pi/recovery/plastic-memory-task-11/before/config/SYSTEM.md`
  - `.pi/recovery/plastic-memory-task-11/before/README.md`

## Pass Gates
- [x] All required target files are present and writable.
- [x] No stateful mutation commands will be executed (docs + snapshots only).
- [x] Source/runtime contracts are fully known from checked-in implementation.
- [x] Recovery plan: exact baseline snapshots and no unrelated source mutation.

## Exit Criterion
- `SYSTEM.md` and `config/SYSTEM.md` project memory sections must be byte-identical.
- No stale guidance (recall(<id>), flat-only scan overwrite, explicit OM commands, full-rescan loops) remains in updated docs.
