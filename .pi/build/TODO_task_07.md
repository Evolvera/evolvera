# TODO task_07

## Phase 1 — contracts and shared runner
- Status: complete
- Authorized targets/symbols: `workers/runner.ts`; role adapter inputs/outputs and injected runtime seam.
- Material prerequisite: completed Task 02/04/05 interfaces and Pi registry/auth APIs.
- Exit evidence: each role resolves exact Luna medium with context window and bounded timeout/abort; scrubbed bounded output/diagnostics.

## Phase 2 — role adapters
- Status: complete
- Authorized targets/symbols: `workers/observer.ts`, `reflector.ts`, `compactor.ts`, `promoter.ts`.
- Material prerequisite: Phase 1 runner contracts.
- Exit evidence: exact identity/allowlist validation and append-shaped outputs; compactor detached; promoter proposal-only.

## Phase 3 — generation-safe scheduler
- Status: complete
- Authorized targets/symbols: `workers/scheduler.ts`.
- Material prerequisite: role adapters and deterministic session/compaction seams.
- Exit evidence: one snapshot/pipeline/cycle, safe bootstrap exclusion, retry suppression, stale invalidation, detached compactor/promoter gates.

## Phase 4 — provider-free smoke and validation
- Status: complete
- Authorized targets/symbols: `extensions/test/plastic-memory-workers.smoke.mjs`.
- Material prerequisite: worker modules.
- Exit evidence: exact Task 07 commands pass and scoped diff is clean.

Completed phase: Phase 4 — provider-free smoke and validation
Current phase: none
Next phase: none
Changed files: extensions/plastic-memory/workers/runner.ts, observer.ts, reflector.ts, compactor.ts, promoter.ts, scheduler.ts, extensions/test/plastic-memory-workers.smoke.mjs
