# TODO: plastic-memory-worker-contract

## Ordered phases

### 1. Ground contracts and implement prompt builders
- Status: complete
- Authorized files/symbols: `extensions/plastic-memory/workers/observer.ts` `promptFor`/`buildObserverRequest`; `extensions/plastic-memory/workers/reflector.ts` `promptFor`/`buildReflectorRequest`.
- Material prerequisite: TILL-DO gates PASS; exact validator schemas read.
- Local exit evidence: prompts contain literal expected manifest and exact item contracts without validator edits.

### 2. Add deterministic offline contract smoke test
- Status: complete
- Authorized file: `extensions/test/plastic-memory-worker-contract.smoke.mjs` (new).
- Material prerequisite: prompt field names and worker schemas grounded in source.
- Local exit evidence: stub model copies parsed manifest and emits one strictly documented observer/reflection item; both results validate complete with one normalized item.

### 3. Validate focused and full smoke suites
- Status: complete
- Authorized files: declared write set only; `/tmp/pm-obs/` harness artifacts permitted.
- Material prerequisite: implementation and offline test complete.
- Local exit evidence: new smoke PASS; required all-smoke loop PASS; live observer result has `ok: true`, `manifestValid: true` with at most one authorized call.

## Progress receipt
- Completed phases: 1. Ground contracts and implement prompt builders; 2. Add deterministic offline contract smoke test; 3. Validate focused and full smoke suites
- Current phase: review diff and close
- Next phase: none
- Changed files: `extensions/plastic-memory/workers/observer.ts`, `extensions/plastic-memory/workers/reflector.ts`, `extensions/test/plastic-memory-worker-contract.smoke.mjs`
- Evidence: focused contract smoke PASS; all 16 required plastic-memory smoke tests PASS; live observer one-call result `ok: true`, `status: complete`, `manifestValid: true`; diff check PASS.
