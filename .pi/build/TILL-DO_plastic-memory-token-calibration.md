# TILL-DO: plastic-memory-token-calibration

## Authority / baseline — PASS
- User request is authoritative; repository is `/Users/j.henrique/.pi/agent`, HEAD `b217346`.
- `git status --porcelain -- extensions` was clean before edits.
- Relevant production surface is `extensions/plastic-memory/runtime/coordinator.ts`; existing physical-budget helpers are local and currently use unscaled `estimateEntryTokens` / system estimate.
- Existing sibling smoke import convention uses `createJiti` from the pinned Pi package and imports the coordinator by file URL.

## Contract / scope — PASS
- Modify only `extensions/plastic-memory/runtime/coordinator.ts` and create `extensions/test/plastic-memory-token-calibration.smoke.mjs`.
- Add conservative provider/estimate calibration with minimum sample, only-higher-factor guard, max factor 3, and fail-closed factor 1; scale fixed estimated tokens and per-entry tokens, never the host reserve.
- Preserve host context window sourcing, null-on-invalid behavior, non-negative integer invariants, and all behavior outside physical-budget math.
- Do not touch compaction engine/emergency/session/workers or anything outside `extensions`; do not commit/stage or run installers/patchers/restart Pi.

## Validation / resources — PASS
- Required commands are deterministic Node smoke scripts, a shell loop over the same smokes, `git diff --check`, and scoped status.
- Per user receipt, smokes use only unique temp roots with synthetic data and no provider, network, user session, global package mutation, or shared state; no destructive hooks/resources are reached. Runtime validation is safe to execute.

## Recovery / stop gates — PASS
- Source file is tracked and clean, so Git history plus the working-tree diff is the rollback boundary; no pre-edit snapshot is required.
- Use narrow edits only. Stop before mutation if required symbols/patterns or validation assumptions conflict; do not broaden scope or weaken existing assertions.
