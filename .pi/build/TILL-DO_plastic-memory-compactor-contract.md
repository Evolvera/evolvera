# TILL-DO: plastic-memory-compactor-contract

## Authority / baseline — PASS
- Authority: user task; exact product write set is `extensions/plastic-memory/workers/compactor.ts` and `extensions/test/plastic-memory-worker-contract.smoke.mjs`.
- Baseline: `render.ts` already deterministically repairs omitted identity arrays and rejects mismatches; compactor currently instructs Luna to echo them. Observer/reflector prompt structure is the local convention.
- Existing smoke test is untracked/dirty from prior work; byte-for-byte snapshot saved before mutation.

## Contract / scope — PASS
- Change only `COMPACTOR_SYSTEM` and `promptFor` model-facing contract, preserving all exports/signatures and all render/engine validators and behavior.
- Extend the existing worker-contract smoke test with offline compactor success, legacy identity-echo rejection, parsed prompt prohibition, realistic bound cycles, and no stateful resources.
- Preserve scheduler, coordinator, pending store, record shapes, and all other files.

## Validation / resources — PASS
- Pure in-process Node/jiti imports over synthetic branch entries with a stub `agentLoop`; no server, database, network, model call, or writes outside the declared files and operational artifacts.
- Validation: focused worker-contract smoke test, then the exact all `extensions/test/plastic-memory-*.smoke.mjs` loop.

## Recovery / stop gates — PASS
- Recovery boundary: `.pi/recovery/plastic-memory-compactor-contract/before/extensions__test__plastic-memory-worker-contract.smoke.mjs` plus git diff for tracked compactor.
- Stop blocked if compactor response requires identity arrays, validator/render/engine edits, existing smoke semantics fail legitimately, or scope expands beyond the exact write set.
