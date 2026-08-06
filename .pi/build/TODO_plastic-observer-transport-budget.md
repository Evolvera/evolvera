# TODO: plastic-observer-transport-budget

## Phase 1 — Runner normalization and cap surface
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/workers/runner.ts`, `runBoundedRole`, prompt transport helpers.
- Material prerequisite: TILL-DO authority, scope, resources, and recovery gates all PASS.
- Local exit evidence: structured prompt is normalized without truncation; over-cap returns fixed `oversized` diagnostics before `agentLoop`; unrelated bounds remain unchanged.

## Phase 2 — Observer request construction and fit
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/workers/observer.ts`, `promptFor`, observer fit helper.
- Material prerequisite: Phase 1 deterministic runner fit surface.
- Local exit evidence: execution and fit helper use the same prompt; output contract precedes source entries; no dynamic fit reason/payload is emitted.

## Phase 3 — Worker-agnostic dual-budget partition
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/session/cycles.ts`, partition functions.
- Material prerequisite: Phase 2 fit predicate contract; preserve atomic group formation and 160,000-token bound.
- Local exit evidence: adjacent groups flush on token or fit failure; indivisible groups return existing reason before worker calls.

## Phase 4 — Scheduler integration and focused tests
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/workers/scheduler.ts`; declared focused smoke tests only.
- Material prerequisite: Phases 1–3 complete; same immutable input used for fit and `runObserver`.
- Local exit evidence: char-cap split, atomic/order coverage, no partial observation persistence on later failure, runner and ordering assertions pass.

## Phase 5 — Validation and diff review
- Status: `complete`
- Authorized files/symbols: no source edits expected; declared tests only if assertion adjustment is required.
- Material prerequisite: Phase 4 focused tests pass.
- Local exit evidence: all 21 Plastic smoke tests pass, focused `git diff --check` passes, target diff has no unrelated churn or retained execution-path truncation.

Completed phase: Phases 1–5
Current phase: complete
Next phase: none
Changed files: `extensions/plastic-memory/workers/runner.ts`, `extensions/plastic-memory/workers/observer.ts`, `extensions/plastic-memory/session/cycles.ts`, `extensions/plastic-memory/workers/scheduler.ts`, `extensions/test/plastic-memory-transport-integrity.smoke.mjs`, `extensions/test/plastic-memory-chunking.smoke.mjs`, `extensions/test/plastic-memory-worker-contract.smoke.mjs`
