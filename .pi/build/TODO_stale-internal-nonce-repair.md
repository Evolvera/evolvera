# TODO — stale internal nonce repair

## Phase 1 — inspect and contract
- Status: complete
- Authorized files/symbols: coordinator nonce constants and `session_before_compact`; integration nonce probe.
- Prerequisite: exact baseline and user contract.
- Exit evidence: HEAD `45e4a54c6d9de4a32b5b4baa85b03a20c7519204`; scoped targets clean; required behavior mapped.

## Phase 2 — implement classification and focused assertions
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/runtime/coordinator.ts` `session_before_compact`; `extensions/test/plastic-memory-integration.smoke.mjs` nonce assertions.
- Prerequisite: private-prefix classification must precede native fallback; exact-live path unchanged.
- Exit evidence: prefix classification precedes native fallback; exact-live path remains synchronous and one-use; smoke covers no-intent, wrong, stale, ordinary fallback, exact, and overlap cases.

## Phase 3 — validate and review
- Status: complete
- Authorized files: same two targets for validation only.
- Prerequisite: Phase 2 edits complete.
- Exit evidence: all five requested Node smokes pass; focused `git diff --check` passes; diff is limited to the two authorized source/test files with no unrelated churn.

## Execution state
- Completed: Phases 1–3.
- Current: complete.
- Next: orchestrator bounded repair checkpoint.
- Changed files: `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/test/plastic-memory-integration.smoke.mjs`.
