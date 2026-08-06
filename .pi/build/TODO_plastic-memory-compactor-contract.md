# TODO: plastic-memory-compactor-contract

## Ordered phases

### 1. Ground compactor contract and implement prompt
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/workers/compactor.ts` `COMPACTOR_SYSTEM`, `promptFor`.
- Material prerequisite: TILL-DO gates PASS; render/engine identity and fact validation behavior read; observer/reflector prompt patterns read.
- Local exit evidence: system prompt remains short; request includes deterministic read-only context and explicit JSON output schema forbidding identity arrays; focused smoke imports and exercises the prompt.

### 2. Extend deterministic worker contract smoke test
- Status: complete
- Authorized file: `extensions/test/plastic-memory-worker-contract.smoke.mjs`.
- Material prerequisite: compactor prompt schema and `CompactorInput`/six-cycle eligibility grounded in source.
- Local exit evidence: focused smoke PASS with omitted identities and prepared compaction; legacy echo rejected with identity mismatch; parsed prompt explicitly forbids identity arrays.

### 3. Validate focused and full smoke suites; review diff
- Status: complete
- Authorized files: declared product write set only; operational artifacts under `.pi/`.
- Material prerequisite: implementation and focused smoke test complete.
- Local exit evidence: focused test PASS; exact all-smoke loop PASS for all 17 smoke files; diff confirms only compactor prompt/test changes in the declared write set, with render/engine untouched.

## Progress receipt
- Completed phases: 1. Ground compactor contract and implement prompt; 2. Extend deterministic worker contract smoke test; 3. Validate focused and full smoke suites; review diff
- Current phase: complete
- Next phase: none
- Changed files: `extensions/plastic-memory/workers/compactor.ts`; `extensions/test/plastic-memory-worker-contract.smoke.mjs`
- Focused evidence: `node extensions/test/plastic-memory-worker-contract.smoke.mjs` PASS
- Full evidence: exact requested all-smoke loop PASS (17/17)
