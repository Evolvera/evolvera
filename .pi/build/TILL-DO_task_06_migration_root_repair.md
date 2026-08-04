# TILL-DO: Task 06 migration-root repair

- Authority/baseline: PASS — user request and Task 06 contract authorize only `extensions/plastic-memory/project/migrate.ts` and `extensions/test/plastic-memory-migration.smoke.mjs`; both targets are present as untracked task outputs, so recovery snapshots are required before mutation.
- Contract/scope: PASS — remove only the blanket rejection of caller-supplied absolute roots containing `.pi/memory`; preserve absolute-root, regular-file/no-symlink, safe internal paths, archive/rollback/fault/idempotence behavior, and explicit publication. Do not touch Task 08 or any live/current memory.
- Validation/resources: PASS — required smoke commands use only disposable temp roots; migration fixture will create `<temp>/project/.pi/memory`; no provider, network, current project, or external state is permitted.
- Recovery/stop: PASS — byte snapshots will be created for both untracked target files before source edits. Stop if support requires real memory, Task 08, or weakening path/archive/rollback safety.
