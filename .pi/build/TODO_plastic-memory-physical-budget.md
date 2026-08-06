# TODO: plastic-memory-physical-budget

## Phase 1 — Inspect and baseline
- Status: complete
- Authorized files/symbols: engine PhysicalBudget/validPhysicalBudget/eligibility; coordinator physicalBudgetFor/schedule; affected smokes.
- Prerequisite: TILL-DO all PASS and dirty-target snapshot.
- Exit evidence: proven root cause and current old budget references inspected; scheduler closed-cycle append confirmed without editing it.

## Phase 2 — Implement branch-derived physical proof
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/compaction/engine.ts`, `extensions/plastic-memory/runtime/coordinator.ts`.
- Prerequisite: Phase 1 complete.
- Exit evidence: PhysicalBudget uses entryTokens; candidate tail sums branch entries from firstKept; coordinator maps estimable branch IDs and only fixed-budget absence returns null; production 6/4 constants restored.

## Phase 3 — Update regression smokes
- Status: complete
- Authorized files: `extensions/test/plastic-memory-stride.smoke.mjs`, `extensions/test/plastic-memory-apply-cut.smoke.mjs`, `extensions/test/plastic-memory-compaction.smoke.mjs`.
- Prerequisite: Phase 2 complete.
- Exit evidence: no old per-cycle fields or permissive physical-budget Proxy maps remain; pre-close entry map regression and original emergency/zero-raw/fail-closed/hook assertions retained.

## Phase 4 — Validate and review
- Status: complete
- Authorized files: write-set review only; no source expansion.
- Prerequisite: Phases 2–3 complete.
- Exit evidence: all 21 smoke files pass (`SMOKE_COUNT: 21/21`), write-set `git diff --check` passes, focused diff has no scope expansion or masking regressions, and no old per-cycle budget fields remain under `extensions/`.

## Execution receipt
- Completed phase: Phase 4
- Current phase: complete
- Next phase: none
- Changed source files: `extensions/plastic-memory/compaction/engine.ts`, `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/test/plastic-memory-stride.smoke.mjs`, `extensions/test/plastic-memory-apply-cut.smoke.mjs`, `extensions/test/plastic-memory-compaction.smoke.mjs`
