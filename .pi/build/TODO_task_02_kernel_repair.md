# TODO task_02_kernel_repair

## Phase 1 — Baseline and recovery
- Outcome: capture target baseline and verify contract.
- Authorized files/symbols: `extensions/plastic-memory/session/ledger.ts` (`normalSourceEntries`), `extensions/test/plastic-memory-session.smoke.mjs` focused fixtures/assertions.
- Material prerequisite: TILL-DO all gates PASS.
- Local exit evidence: byte-for-byte snapshots exist; baseline symbols/tests read.
- Status: complete

## Phase 2 — Repair source selection
- Outcome: select active window and valid current-branch descendants after boundary; fail closed on missing/invalid ordering and preserve historical exclusion.
- Authorized files/symbols: `ledger.ts` `normalSourceEntries` only.
- Material prerequisite: Phase 1 complete.
- Local exit evidence: focused diff is narrow and type-compatible.
- Status: complete

## Phase 3 — Focused smoke coverage
- Outcome: cover reproduction, branch divergence/off-branch exclusion, empty-active legacy bootstrap descendants, while retaining existing guards.
- Authorized files/symbols: `plastic-memory-session.smoke.mjs` only.
- Material prerequisite: Phase 2 complete.
- Local exit evidence: direct assertions exercise required cases.
- Status: complete

## Phase 4 — Validation and review
- Outcome: run requested provider-free session/workers smoke and whitespace check; review focused diff.
- Authorized files/symbols: no additional source writes.
- Material prerequisite: Phases 2–3 complete.
- Local exit evidence: all commands PASS and no out-of-scope diff.
- Status: complete

Completed phase: Phases 1–4 — Baseline, repair, focused coverage, validation/review
Current phase: none
Next phase: none
Changed files: extensions/plastic-memory/session/ledger.ts, extensions/test/plastic-memory-session.smoke.mjs
Validation: session smoke PASS; workers smoke PASS; git diff --check PASS; focused diff reviewed with only authorized targets changed.
