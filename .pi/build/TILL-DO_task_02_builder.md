# TILL-DO task_02_builder

## Authority / baseline — PASS
- Task authority: `.pi/plans/20260806_150243Z_plastic_emergency_compaction/TASKS/task_02_builder.md`; relevant PLAN_FULL outcome/contract read.
- Baseline: HEAD `588ffcd`; declared target files are clean before edits; unrelated dirty paths remain out of scope.

## Contract / scope — PASS
- Normal selection remains strict six-or-more valid contiguous cycles with exactly newest four raw; physical failure returns no normal window.
- Emergency is pure/transient, capped at `floor(contextWindow * 3 / 5)` removed entry tokens, safe user cuts, preserve-two where possible, open-turn and tool exchange atomicity, fail-closed malformed/unknown/oversized cases.
- Write set is exactly the five existing declared files plus new `extensions/plastic-memory/compaction/emergency.ts` and `extensions/test/plastic-memory-emergency-selection.smoke.mjs`.
- No coordinator lifecycle, persistence/schema/dependency/model changes.

## Validation / resources — PASS
- Required commands are the five declared in task validation plus full `extensions/test/plastic-memory-*.smoke.mjs` suite and `git diff --check` for write set.
- Stateful proof: `NO_STATEFUL_RESOURCES`; tests are in-process module smokes with fake runtimes/fixtures. No live Pi, providers, network, servers, E2E, user sessions, or credentials.

## Recovery / stop gates — PASS
- Required byte-for-byte snapshots created and compared under `.pi/build/recovery/task_02/` for all five existing owned files.
- Stop if any target is dirty, required scope expands, safe user cut/token proof is unavailable, persistence/fake cycle is required, or guards must be weakened.
