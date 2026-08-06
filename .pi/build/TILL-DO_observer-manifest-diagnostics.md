# TILL-DO observer-manifest-diagnostics

## Authority / baseline — PASS
- Authority: reconciled user contract; exact write set is `extensions/plastic-memory/workers/observer.ts` and `extensions/test/plastic-memory-worker-contract.smoke.mjs`.
- Baseline inspected: observer manifest validation, aliases, optional `sourceEntryIds`, runner transport, reflector reference, and existing smoke fixture.
- Existing target state was dirty/untracked before work; byte-for-byte snapshots captured before mutation.

## Contract / scope — PASS
- Change only observer failure diagnostics and focused smoke coverage.
- Preserve all manifest acceptance/rejection semantics, aliases, omitted `sourceEntryIds`, persistence behavior, safety validators, and all out-of-scope files.
- Invalid manifest helper returns only fixed safe category codes; reasons contain the unchanged generic prefix plus a fixed code and no dynamic values.

## Validation / resources — PASS
- Required smoke commands are in-process jiti tests using stub runtime and no network/provider calls.
- Resource receipt: `NO_STATEFUL_RESOURCES` — reads source/test files only; no DB, filesystem fixture mutation, server, external service, credentials, or cleanup hooks.
- Validation commands: `node extensions/test/plastic-memory-worker-contract.smoke.mjs`; then all `extensions/test/plastic-memory-*.smoke.mjs` scripts.

## Recovery / stop gates — PASS
- Recovery snapshots: `.pi/recovery/observer-manifest-diagnostics/before/` with verified SHA-256 equality to pre-edit targets.
- Stop if safe fixed categories cannot preserve current semantics, validation needs a real provider/network, or scope expands beyond the two targets.
