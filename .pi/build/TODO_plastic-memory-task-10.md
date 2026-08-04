# TODO plastic-memory-task-10

## Phase 1 — Resolver and ownership roots
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/index.ts` owner-mode resolver/default factory; `extensions/project-memory.ts` bridge factory.
- Material prerequisite: TILL-DO all gates PASS and exact recovery snapshots present.
- Local exit evidence: both entrypoints use identical synchronous mode decision and register only their contract inventory.

## Phase 2 — Cutover smoke
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-cutover.smoke.mjs`.
- Material prerequisite: Phase 1 inventories and shared assembler wiring available.
- Local exit evidence: temp-root fake-host test proves all modes, context parity, retrieval/search boundaries, and no duplicate owners.

## Phase 3 — Focused validation and diff review
- Status: complete
- Authorized files/symbols: changed product targets and recovery snapshot only for review.
- Material prerequisite: Phase 2 complete.
- Local exit evidence: required Node smokes and diff checks pass; focused diff has no out-of-scope changes.

Completed: Phases 1–3
Current: none
Next: none
Changed files: `extensions/plastic-memory/index.ts`, `extensions/project-memory.ts`, `extensions/test/plastic-memory-cutover.smoke.mjs`
