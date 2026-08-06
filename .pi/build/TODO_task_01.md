# TODO task_01

## Phase 1 — Baseline and recovery
- Status: complete
- Authorized files/symbols: five declared source targets; required recovery snapshots.
- Prerequisite: task/plan contract and clean target status.
- Exit evidence: TILL-DO all gates PASS; five byte-for-byte snapshots exist.

## Phase 2 — Candidate-aware runner boundary
- Status: complete
- Authorized files/symbols: `workers/runner.ts` model target types/resolution/execution/deadline; `runtime/runner-runtime.ts` exact adapter model.
- Prerequisite: Phase 1 complete.
- Local exit evidence: exact target resolves/authenticates; default path remains Luna; caller deadline is clamped to the role maximum; focused smokes pass.

## Phase 3 — Worker target plumbing and compactor request boundary
- Status: complete
- Authorized files/symbols: `workers/observer.ts`, `workers/reflector.ts`, `workers/compactor.ts` optional execution target/deadline and shared candidate request/response path.
- Prerequisite: Phase 2 runner API is grounded.
- Local exit evidence: optional target/deadline reach the common runner; normal worker behavior and strict semantic parsing remain unchanged.

## Phase 4 — Focused fallback smoke
- Status: complete
- Authorized files/symbols: create `extensions/test/plastic-memory-model-fallback.smoke.mjs` only.
- Prerequisite: Phases 2–3 complete.
- Local exit evidence: exact candidate order, duplicate Luna retry, deduped visible model, immutable prompt, timeout advancement, fixed diagnostics, and adapter identity pass.

## Phase 5 — Validation and diff review
- Status: complete
- Authorized files/symbols: declared write set only; no source additions outside it.
- Prerequisite: Phases 2–4 complete.
- Local exit evidence: focused smokes pass; full `extensions/test/plastic-memory-*.smoke.mjs` suite passes; `git diff --check` is clean on the tracked write set and the new smoke has no trailing whitespace; focused diff contains only additive target/deadline plumbing, exact adapter selection, candidate construction, and deterministic coverage.

Completed: Phases 1–5
Current: none
Next: orchestrator review/checkpoint
Changed files: `extensions/plastic-memory/workers/runner.ts`, `extensions/plastic-memory/runtime/runner-runtime.ts`, `extensions/plastic-memory/workers/observer.ts`, `extensions/plastic-memory/workers/reflector.ts`, `extensions/plastic-memory/workers/compactor.ts`, `extensions/test/plastic-memory-model-fallback.smoke.mjs`; operational snapshots/TILL-DO/TODO under `.pi/build`.
