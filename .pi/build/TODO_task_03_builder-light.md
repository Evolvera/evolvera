# TODO task_03_builder-light

## Phase 1 — Render overlay seam
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/session/render-summary.ts`.
- Task: add optional validated in-memory observation/reflection overlay input to `renderSessionSummary`, merge with folded ledger rows using existing row builders and caps, preserve existing output when overlay omitted.
- Prerequisite: TILL-DO gate PASS and recovery snapshot available.
- Exit evidence: merged rows preserve dedupe and ordering, drop tombstoned observations, and retain existing formatting/scrubbing.

## Phase 2 — Emergency summary smoke
- Status: complete
- Authorized files/symbols: `extensions/test/plastic-memory-emergency-summary.smoke.mjs`.
- Task: add deterministic overlay merge, dedupe, ordering, cap, and scrubbing assertions plus no-overlay compatibility matrix.
- Prerequisite: Phase 1.
- Exit evidence: fixture verifies rendered guidance, IDs, caps, no tombstone revival, and scrubbed overlay content.

## Phase 3 — Validation
- Status: complete
- Authorized actions: `node` smoke runs and `git diff --check`.
- Prerequisite: Phases 1 and 2.
- Exit evidence: required tests pass and there are no whitespace/merge issues.

Current phase: none
Next phase: none
Changed files: `extensions/plastic-memory/session/render-summary.ts`, `extensions/test/plastic-memory-emergency-summary.smoke.mjs`
