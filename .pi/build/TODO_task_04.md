# TODO task_04

## Phase 1 — Define read-model contracts and safe bounded helpers
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/project/search.ts`; `extensions/plastic-memory/project/context.ts`
- Prerequisite: TILL-DO all gates PASS; Task 03 canonical interfaces verified.
- Exit evidence: exports and bounds/state vocabulary are grounded in schema/store/projection and architecture validator.

## Phase 2 — Implement exact recall/search and immutable context assembly
- Status: complete
- Authorized files/symbols: `search.ts`, `context.ts`
- Prerequisite: Phase 1 contracts.
- Exit evidence: canonical/flat/no-memory, stale-derived, architecture, and no-write behavior implemented.

## Phase 3 — Add disposable retrieval/context smoke fixtures
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-retrieval.smoke.mjs`
- Prerequisite: Phase 2 exports.
- Exit evidence: required scenarios assert bounded sections, exact recall, filters, retry identity, and no writes.

## Phase 4 — Run focused validation and diff review
- Status: complete
- Authorized files: the three Task 04 targets only.
- Prerequisite: Phase 3 smoke.
- Exit evidence: required commands PASS, scoped diff check PASS, no out-of-scope changes.

Completed: Phases 1–4; implementation, disposable fixtures, required validation, and scoped diff review are complete.
Current: none
Next: none
Changed files: `extensions/plastic-memory/project/search.ts`, `extensions/plastic-memory/project/context.ts`, `extensions/test/plastic-memory-retrieval.smoke.mjs`
Validation: retrieval smoke PASS; architecture smoke PASS (54 assertions); scoped diff check PASS.
Repository review: only the three authorized Task 04 source/test paths changed; pre-existing dirty paths were left untouched.
