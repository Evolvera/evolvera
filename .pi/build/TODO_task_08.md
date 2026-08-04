# TODO Task 08

## Phase 1 — Retrieval and bounded backfill
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/session/recall.ts`, `session/backfill.ts`
- Prerequisite: PASS TILL-DO authority, contract, validation, recovery gates.
- Exit evidence: exact branch-local recall/search and report-first one-window cursor operations implemented; smoke imports and exercises both.

## Phase 2 — Injectable tools and commands
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/runtime/tools.ts`, `runtime/commands.ts`
- Prerequisite: Phase 1 public operation/result shapes.
- Exit evidence: exactly `memory_recall`/`memory_search` and the requested memory/OM command aliases register through injected API; no root registration.

## Phase 3 — Focused smoke journey
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-surfaces.smoke.mjs`
- Prerequisite: Phases 1–2.
- Exit evidence: fake API, in-memory branch, unique temp project, cursor/retry, malformed input, alias, and no-write journeys pass.

## Phase 4 — Validation and diff review
- Status: complete
- Authorized files/symbols: five target files only for product diff review.
- Prerequisite: Phase 3 test exists.
- Exit evidence: `node extensions/test/plastic-memory-surfaces.smoke.mjs` PASS; focused tracked and untracked-target diff checks PASS; only five authorized target files are new.

Completed phase: Phases 1–4
Current phase: complete
Next phase: none
Changed files: `extensions/plastic-memory/session/recall.ts`, `extensions/plastic-memory/session/backfill.ts`, `extensions/plastic-memory/runtime/tools.ts`, `extensions/plastic-memory/runtime/commands.ts`, `extensions/test/plastic-memory-surfaces.smoke.mjs`
