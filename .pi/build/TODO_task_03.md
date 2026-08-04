# TODO task_03

## Phase 1 — contract and schema
- Status: complete
- Authorized files/symbols: `project/schema.ts`; schema guards and Markdown parser/serializer.
- Prerequisite: TILL-DO all gates PASS; Task 01 IDs/safety available.
- Exit evidence: strict project/chunk/evidence/link/front-matter/body validation and deterministic serialization implemented.

## Phase 2 — filesystem primitives
- Status: complete
- Authorized files/symbols: `project/io.ts`; root/path, digest, lock, atomic write/rename, cleanup.
- Prerequisite: Phase 1 contract.
- Exit evidence: path-safe project roots and injectable fault-safe writes implemented.

## Phase 3 — canonical publication store
- Status: complete
- Authorized files/symbols: `project/store.ts`; load/create/update/supersede and explicit acceptance transaction.
- Prerequisite: Phases 1–2.
- Exit evidence: stable project identity, one-chunk publication, conflict rejection, canonical-first derived-stale outcome implemented.

## Phase 4 — derived projections
- Status: complete
- Authorized files/symbols: `project/projection.ts`; index/root/category projections.
- Prerequisite: canonical store shape.
- Exit evidence: deterministic digest-stamped 8k/4k projections from chunks only implemented.

## Phase 5 — focused disposable smoke
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-project.smoke.mjs`.
- Prerequisite: Phases 1–4.
- Exit evidence: disposable smoke passes schema, publication, supersession, conflicts, evidence, traversal/secrets, projections, canonical rollback, and derived fault recovery.

## Phase 6 — diff and final validation
- Status: complete
- Authorized files/symbols: no additional product files.
- Prerequisite: Phase 5 PASS.
- Exit evidence: exact smoke PASS and focused `git diff --check` PASS; focused status confirms only the five authorized new files are task outputs.

Completed phases: 1–6
Current phase: none
Next phase: none
Changed files: `extensions/plastic-memory/project/schema.ts`, `io.ts`, `store.ts`, `projection.ts`, `extensions/test/plastic-memory-project.smoke.mjs`
