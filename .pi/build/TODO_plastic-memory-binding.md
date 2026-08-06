# TODO plastic-memory-binding

## Phases

1. **Implement deterministic binding digest** — status: complete
   - Authorized files/symbols: `extensions/plastic-memory/runtime/coordinator.ts`, import and `PlasticMemoryCoordinator.binding`.
   - Prerequisite: all TILL-DO gates PASS.
   - Exit evidence: fixed provenance constant and `sessionDigest(hostSessionId, provenance)` with generation/branchId unchanged; focused diff is 3 narrow edits.

2. **Add binding regression smoke test** — status: complete
   - Authorized files/symbols: new `extensions/test/plastic-memory-binding.smoke.mjs`.
   - Prerequisite: phase 1 implementation.
   - Exit evidence: UUIDv7 host id, valid binding/record, cycle id, and cross-instance digest assertions pass.

3. **Run focused and existing smoke validation** — status: blocked
   - Authorized files/symbols: no source changes; required smoke commands only.
   - Prerequisite: phases 1–2.
   - Exit evidence: new test, bootstrap, and compaction smoke tests pass; the required loop stops at pre-existing/concurrent `plastic-memory-cutover.smoke.mjs` system-prompt assertion failure in out-of-scope `extensions/plastic-memory/index.ts`.

Completed phase: 2
Current phase: 3
Next phase: blocked on concurrent index.ts work
Changed files: `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/test/plastic-memory-binding.smoke.mjs`
