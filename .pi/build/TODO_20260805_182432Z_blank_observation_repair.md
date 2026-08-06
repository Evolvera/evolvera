# TODO — 20260805_182432Z_blank_observation_repair

## Phase 1 — Baseline and contract
- Status: complete
- Authorized files/symbols: observer `clean`, `parseObservation`, `promptFor`, `runObserver`; named worker smoke assertions.
- Material prerequisite: approved repair contract and pre-edit snapshots.
- Exit evidence: target files read; snapshots hashed; TILL-DO gates PASS.

## Phase 2 — Deterministic observer repair
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/workers/observer.ts` only.
- Material prerequisite: preserve strict structural/citation validation and existing empty-valid record behavior.
- Exit evidence: parse order is record/content type → timestamp type → relevance enum → nonempty/subset citations → scrub/normalize → discard only when scrub-empty; fixed failure categories and prompt omission/empty behavior remain.

## Phase 3 — Focused regression coverage
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-worker-contract.smoke.mjs`, `extensions/test/plastic-memory-workers.smoke.mjs` only.
- Material prerequisite: Phase 2 implementation.
- Exit evidence: mixed/all-blank valid candidates remain `empty-valid`/complete; direct and scheduler assertions cover blank + outside citation and blank + invalid relevance as fixed hard failures, with strict privacy assertions preserved.

## Phase 4 — Required validation and final review
- Status: complete
- Authorized files/symbols: three target files for review only; no additional source changes.
- Material prerequisite: Phase 3 tests.
- Exit evidence: focused five smokes and all 21 `extensions/test/plastic-memory-*.smoke.mjs` files passed; targeted syntax/diff checks passed; updated repair patch SHA `70c78a1c2f8a487a622dded9f3bbc6cf995569448d94514fe5a6e25a669a982e`.

## Current execution
- Completed: Phase 4 — Required validation and final review
- Current: none
- Next: none
- Changed files: `extensions/plastic-memory/workers/observer.ts`, `extensions/test/plastic-memory-worker-contract.smoke.mjs`, `extensions/test/plastic-memory-workers.smoke.mjs`
