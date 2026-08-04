# TODO task_06

## Phase 1 — inspect and define migration contract
- Status: complete
- Authorized files/symbols: `project/schema.ts`, `project/store.ts`, `project/io.ts`, task authority; no source mutation.
- Prerequisite: all TILL-DO gates PASS.
- Exit evidence: canonical front matter/store publication and IO fault primitives inspected; deterministic six-source mapping and temp-only smoke plan fixed.

## Phase 2 — implement read-only report and staged publication
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/project/migrate.ts`; report, parser, staging, manifest, recovery/rollback.
- Prerequisite: Phase 1 evidence.
- Exit evidence: implementation added; migration smoke exercises report/publish/archive/conflict/fault/rollback criteria.

## Phase 3 — add disposable smoke coverage
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-migration.smoke.mjs`.
- Prerequisite: Phase 2 implementation.
- Exit evidence: `node extensions/test/plastic-memory-migration.smoke.mjs` PASS with unique temp roots and teardown.

## Phase 4 — focused validation and diff review
- Status: complete
- Authorized files: the two task paths; transient TODO only.
- Prerequisite: Phases 2–3 complete.
- Exit evidence: migration smoke PASS; architecture-memory smoke PASS (54 assertions); `git diff --check` PASS; focused diff reviewed with no out-of-scope source paths.

## Execution state
- Completed phase: Phases 1–4.
- Current phase: complete.
- Next phase: none.
- Changed files: `extensions/plastic-memory/project/migrate.ts`, `extensions/test/plastic-memory-migration.smoke.mjs`.
