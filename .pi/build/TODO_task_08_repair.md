# TODO Task 08 Repair

## Phase 1 — inspect and design
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/session/backfill.ts` (`safeHistoricalSources`, `windowsFor`, report/cursor flow); smoke fixture in `extensions/test/plastic-memory-surfaces.smoke.mjs`.
- Prerequisite: TILL-DO all gates PASS.
- Exit evidence: bounded report-window semantics identified without weakening current-branch validation; source-count validation remains exhaustive while prospective windows are capped.

## Phase 2 — implement bounded historical discovery/report
- Status: complete
- Authorized files/symbols: same two target files only.
- Prerequisite: Phase 1.
- Exit evidence: total historical count no longer conflicts; prospective windows cap source IDs at 2,000, report count at 8, stop on partial/oversized windows, and cursor advancement remains explicit.

## Phase 3 — validate and review diff
- Status: complete
- Authorized files/symbols: same two target files only.
- Prerequisite: Phase 2.
- Exit evidence: `node extensions/test/plastic-memory-surfaces.smoke.mjs` PASS; scoped `git diff --check` PASS; target-only status confirms no other source files changed.

Completed: Phases 1–3
Current: complete
Next: none
Changed files: `extensions/plastic-memory/session/backfill.ts`, `extensions/test/plastic-memory-surfaces.smoke.mjs`
