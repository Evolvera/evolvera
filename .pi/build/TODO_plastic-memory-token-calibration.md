# TODO: plastic-memory-token-calibration

## Phase 1 — Implement calibration and physical-budget scaling
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/runtime/coordinator.ts`; calibration helper and physical-budget helpers only.
- Prerequisite: TILL-DO all gates PASS; target read and existing helper behavior verified.
- Exit evidence: factor guards, fixed-token scaling, per-entry scaling, and shared factor path are present; exports are minimal and named.

## Phase 2 — Add focused smoke coverage
- Status: `complete`
- Authorized files/symbols: `extensions/test/plastic-memory-token-calibration.smoke.mjs`; sibling Jiti import pattern and synthetic context fixtures.
- Prerequisite: Phase 1 implementation complete.
- Exit evidence: focused smoke passed, covering sample guard, 1.7x scaling, reserve preservation, non-loosening, clamp, invalid evidence, unestimable entries, and tail agreement.

## Phase 3 — Validate and review diff
- Status: `complete`
- Authorized files/symbols: no further source changes unless a focused failure requires repair in the two declared files.
- Prerequisite: Phases 1–2 complete; stateful-resource receipt remains PASS.
- Exit evidence: focused smoke passed; all 29 `plastic-memory-*.smoke.mjs` scripts passed; `git diff --check` passed with no output; scoped status shows only the coordinator modified and the new smoke untracked.

Completed: Phases 1–3
Current: complete
Next: none
Changed files: `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/test/plastic-memory-token-calibration.smoke.mjs`
