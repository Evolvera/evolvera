# TODO task-01

## Phase 1 — Resume and characterize
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/compaction/engine.ts` (`eligibleWindow`, selector, preparation); `extensions/plastic-memory/workers/compactor.ts` (contract text); `extensions/test/plastic-memory-compaction.smoke.mjs`; `extensions/test/plastic-memory-stride.smoke.mjs`.
- Prerequisite: baseline snapshots and current six-cycle selection characterized.
- Local exit evidence: supplied partial SHA matched; reverse patch check passed; resume snapshots and pre-repair synthetic baseline were recorded.

## Phase 2 — Selection and physical policy
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/runtime/coordinator.ts`; `extensions/test/plastic-memory-apply-cut.smoke.mjs`; `extensions/test/plastic-memory-acknowledge.smoke.mjs`; `extensions/test/plastic-memory-integration.smoke.mjs`.
- Prerequisite: exact selector checkpoint from Phase 1.
- Local exit evidence: compaction and stride smokes PASS for normal four, emergency three-cycle fold, impossible/unknown fail-closed, selector/request/final equality, and incomplete suffix retention.

## Phase 3 — Host lifecycle ownership
- Status: `complete`
- Authorized files/symbols: all eight task targets; scoped recovery artifacts.
- Prerequisite: Phases 1–2 complete.
- Local exit evidence: apply, acknowledge, and integration smokes PASS for advisory independence, hook recheck, exact benign deferral, matching promotion, unmatched/native rebase, bootstrap, and one-current context behavior.

## Phase 4 — Integrated recovery review
- Status: `complete`
- Authorized files/symbols: all eight task targets; scoped recovery artifacts.
- Prerequisite: Phases 1–3.
- Local exit evidence: session and host smokes PASS; scoped diff-check PASS; final target hashes, patch, and receipt are recorded under task_01 recovery.

## Execution receipt
- Completed phase: Phases 1–4 for revised resume; supplied partial delta and prior dirty content preserved.
- Current phase: none.
- Next phase: orchestrator selective checkpoint; builder will not stage or commit.
- Changed files: exact eight Task 01 targets plus transient `.pi/build` and recovery receipts.
- Changed files: `extensions/plastic-memory/compaction/engine.ts`; `extensions/plastic-memory/runtime/coordinator.ts`; `extensions/plastic-memory/workers/compactor.ts`; `extensions/test/plastic-memory-compaction.smoke.mjs`; `extensions/test/plastic-memory-stride.smoke.mjs`; `extensions/test/plastic-memory-apply-cut.smoke.mjs`; `extensions/test/plastic-memory-acknowledge.smoke.mjs`; `extensions/test/plastic-memory-integration.smoke.mjs`; transient `.pi/build` and recovery artifacts. Pre-existing dirty/untracked content remains preserved.

## Repair Phase 1 — characterize and select retained suffix
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/compaction/engine.ts` (`eligibleWindow`, `safeCutEntry`); `extensions/test/plastic-memory-compaction.smoke.mjs`; `extensions/test/plastic-memory-stride.smoke.mjs`; `extensions/plastic-memory/workers/compactor.ts` contract comment only if needed.
- Prerequisite: repair/resume gates PASS and `repair_before/` snapshots complete.
- Local exit evidence: retained selection scans 4→0, 4→2 fixture proves request/state/cut, zero-cut representability and impossible one-cycle fit are fixed/tested, incomplete suffix remains whole.

## Repair Phase 2 — integrated validation and recovery receipt
- Status: `complete`
- Authorized files/symbols: exact eight Task 01 targets plus task-owned recovery receipt/final patch/SHA.
- Prerequisite: Repair Phase 1 complete; coordinator hook-time 2-cycle tail behavior reviewed and changed only if a focused fixture proves rejection.
- Local exit evidence: all seven Task 01 smokes and scoped diff check PASS; final current-target hashes and additive repair recovery evidence recorded.

- Completed phase: Repair Phases 1–2; current phase: none; next phase: orchestrator selective checkpoint only.
- Changed files: exact eight Task 01 product targets only, plus transient build/recovery artifacts; Task 02 untouched.
