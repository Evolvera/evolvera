# TODO plastic-memory-reflector-prompt

## Phases

1. Live baseline reproduction — primary authorized files/symbols: `/tmp/pm-obs/reflector-harness.mjs`, `runObserver`, `runReflector`; prerequisite: TILL-DO gates PASS; exit evidence: real observer and reflector results plus scrubbed raw outputs captured with <=2 provider calls; status: complete (observer and reflector both passed, so the reported failure was not reproduced).
2. Prompt/test implementation — primary authorized files/symbols: `extensions/plastic-memory/workers/reflector.ts` `promptFor`, `extensions/test/plastic-memory-worker-contract.smoke.mjs` reflector assertions; prerequisite: baseline cause evidence; exit evidence: impossible under the observed byte-identical validator contract because multiline content is normalized before the newline predicate; status: blocked.
3. Live post-fix proof — primary authorized files/symbols: `/tmp/pm-obs/reflector-harness.mjs`; prerequisite: implementation complete; exit evidence: one post-fix live reflector result `ok: true`, manifestValid true, raw output captured; status: pending.
4. Smoke validation and diff review — primary authorized files/symbols: all `extensions/test/plastic-memory-*.smoke.mjs` commands, target diff; prerequisite: post-fix proof; exit evidence: complete PASS table and no out-of-scope source changes; status: blocked.

Completed phase: 1. Live baseline reproduction
Current phase: 2. Prompt/test implementation (blocked on contract conflict)
Next phase: user/contract reconciliation: either authorize validator change or remove the impossible negative acceptance
Changed files: no source/test changes; operational harnesses only under `/tmp/pm-obs/`
