# TODO observer-manifest-diagnostics

## Phase 1 — Inspect and establish baseline
- Status: complete
- Authorized files/symbols: `observer.ts` manifest helpers and `runObserver`; smoke observer fixtures/tests.
- Material prerequisite: TILL-DO all gates PASS and pre-edit snapshots verified.
- Exit evidence: current dirty target state read; snapshots SHA-256 verified.

## Phase 2 — Implement safe observer diagnostics
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/workers/observer.ts` (private manifest failure-code helper and `runObserver` reason path).
- Material prerequisite: preserve current exact validation semantics and aliases.
- Exit evidence: helper checks every manifest field with fixed codes and preserves optional sourceEntryIds/alias selection.

## Phase 3 — Extend focused smoke coverage
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-worker-contract.smoke.mjs` observer runtime stub/tests only.
- Material prerequisite: diagnostic codes implemented without dynamic interpolation.
- Exit evidence: focused smoke passed; tests cover valid/omitted/alias, missing/non-record, branch and digest mismatch privacy.

## Phase 4 — Validate and review
- Status: complete
- Authorized files/symbols: read-only diff/status and declared smoke commands; no source changes outside write set.
- Material prerequisite: phases 2–3 complete.
- Exit evidence: focused smoke and all Plastic Memory smoke scripts passed; `git diff --check` passed; snapshot-relative diff contains only fixed-code helper/reason path and focused tests.

Completed phases: 1–4
Current phase: none
Next phase: none
Changed files: `extensions/plastic-memory/workers/observer.ts`, `extensions/test/plastic-memory-worker-contract.smoke.mjs`
