# TODO task_01_builder

## Phases

1. Type registry — authorized `session/types.ts`; add strict queued schema and guard. Prerequisite: PASS TILL-DO. Exit: schema/type symbols compile by smoke import. Status: complete — focused smoke passed.
2. Queue kernel — authorized `session/cycles.ts`; add fixed >=20k whole-turn batching, queued construction, strict reconstruction/FIFO/restart helpers without changing legacy attempt/close behavior. Prerequisite: phase 1. Exit: focused queue smoke passed. Status: complete.
3. Ledger integration — authorized `session/ledger.ts`; fold valid queued records and validate flattened source spans on current branch. Prerequisite: phases 1–2. Exit: queue fold and legacy session assertions passed. Status: complete.
4. Queue smoke — authorized `extensions/test/plastic-memory-queue.smoke.mjs`; cover threshold, batching, atomicity, replay, lineage, malformed fail-closure. Prerequisite: phases 1–3. Exit: exact focused smoke passed. Status: complete.
5. Full validation/review — authorized four target files only; run full Plastic loop and scoped diff check, review accidental churn. Prerequisite: phase 4. Exit: all commands pass and diff is scoped. Status: complete — full loop passed; scoped diff review and diff-check passed.

Completed phase: 5. Full validation/review
Current phase: none
Next phase: none
Changed files:
- extensions/plastic-memory/session/types.ts
- extensions/plastic-memory/session/cycles.ts
- extensions/plastic-memory/session/ledger.ts
- extensions/test/plastic-memory-queue.smoke.mjs
