# TODO: task09_nonce_repair

## Phase 1 — Grounded contract and hook evidence
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/runtime/coordinator.ts` (`maybeApply`, `session_before_compact`); `extensions/test/plastic-memory-integration.smoke.mjs`.
- Prerequisite: exact host hook evidence.
- Exit evidence: Pi forwards `customInstructions` unchanged into `session_before_compact`; static instruction is the defect.

## Phase 2 — UUID intent binding
- Status: complete
- Authorized files/symbols: coordinator nonce encoding/comparison.
- Prerequisite: Phase 1.
- Exit evidence: coordinator now encodes the generated UUID with a private prefix and compares exact equality against the live intent value.

## Phase 3 — Integration assertions
- Status: complete
- Authorized files/symbols: integration smoke nonce/manual/overlap assertions.
- Prerequisite: Phase 2.
- Exit evidence: integration smoke asserts former-static, wrong, stale, exact-live, and one-use overlap behavior.

## Phase 4 — Stateful-safe validation and diff review
- Status: complete
- Authorized files/symbols: none beyond validation of declared files.
- Prerequisite: Phases 2–3.
- Exit evidence: integration, host, compaction, workers smokes passed under the requested `NO_STATEFUL_RESOURCES` receipt; scoped `git diff --check` passed.

Completed: Phases 1–4
Current: none
Next: none
Changed files: `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/test/plastic-memory-integration.smoke.mjs`
