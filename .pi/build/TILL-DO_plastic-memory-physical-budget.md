# TILL-DO: plastic-memory-physical-budget

## Authority / baseline — PASS
- Authority: user task, proven root cause, exact write set, and validation contract.
- Baseline: Plastic head `b3c2ab0`; existing unrelated dirty files preserved. Target `extensions/plastic-memory/compaction/engine.ts` was already dirty with diagnostic constants/categories; byte-for-byte snapshot saved before mutation.
- Relevant existing scheduler behavior is already present in dirty `workers/scheduler.ts` and is outside this task's write set; it appends the just-closed cycle before engine selection.

## Contract / scope — PASS
- Change only branch-entry physical proof in `compaction/engine.ts`, coordinator entry-token budget construction in `runtime/coordinator.ts`, and smoke tests that build the old physical budget shape: stride, apply-cut, and compaction.
- Restore production policy to 6 closed cycles / 4 retained cycles.
- Preserve fail-closed missing/invalid/overflow behavior, pure-caller default policy, candidate ordering, safe cuts, zero-raw representability, contiguity, digest, acknowledgement, pending/cut logic, hook behavior, and fixed diagnostic codes.
- Do not touch scheduler or unrelated dirty files; no Proxy/catch-all test budgets; no commit or stage.

## Validation / resources — PASS
- Required validation: run all 21 `extensions/test/plastic-memory-*.smoke.mjs` files and `git diff --check` for the write set.
- Stateful resource receipt: `NO_STATEFUL_RESOURCES`; smokes are in-process module tests with fake runtimes and no database, server, network, provider, credential, or filesystem cleanup.
- Prohibited operations: Pi, Luna, providers, network, servers, E2E, and live-session reads.

## Recovery / stop gates — PASS
- Recovery: `.pi/recovery/plastic-memory-physical-budget/before/extensions-plastic-memory-compaction-engine.ts` captures the pre-edit dirty target.
- Stop if a required file outside the exact write set is needed, if an assertion requires weakening fail-closed safety, if any validation resource is not isolated, or if final validation is not 21/21.
