# Task 02: Close semantic-only cycles with bounded chunking and retry

**Agent**: builder  
**Why**: Chunk coverage, model trust removal, immediate retry, record append order, and one-cycle closure share the scheduler's immutable-input persistence boundary.  
**Goal**: Observer/reflector return only semantic content and citations; every current first phase failure retries once immediately, and a completed span over 160k is observed in safe bounded chunks but closes exactly one full-span cycle.

## Read

- `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_01/FINAL_DELTA_RECEIPT.md` and `task-01.final.delta.patch.sha256` — verify the supplied current checkpoint/baseline bridge before snapshotting shared tests
- `extensions/plastic-memory/session/cycles.ts` — terminal boundary, current prefix behavior, 160k oversized classification, code-owned identity, attempt 0/1, exact close
- `extensions/plastic-memory/session/types.ts` — persisted span/attempt/cycle schemas to preserve without modification
- `extensions/plastic-memory/session/ledger.ts` — source digest, source-entry filtering, and record fold; read only
- `extensions/plastic-memory/workers/observer.ts` — identity manifest dependency, model ID handling, source citation allow-list, scrubbed record construction
- `extensions/plastic-memory/workers/reflector.ts` — identity manifest dependency, model ID handling, support citation allow-list, reflector input budget
- `extensions/plastic-memory/workers/runner.ts` — 160k/context-window and transport/privacy enforcement; read only
- `extensions/plastic-memory/workers/scheduler.ts` — captured source, `current()`, append ordering, failure path, compactor handoff
- `extensions/plastic-memory/config.ts` — exact `automaticRetryCount: 1`; read only
- `/tmp/pi-extension-research.isJk76/pi-smart-compact-7.22.0/package/README.md` EESV and tool-pair safeguards plus `dist/index.js` around 5954–6230 — deterministic extract/verify/repair and bounded synthesis oracle; behavior only
- `/tmp/pi-extension-research.isJk76/pi-observational-memory-3.0.3/package/src/session-ledger/render-summary.ts` — semantic observations/reflections with recall citations and no model-owned lifecycle identity; behavior only
- The six smoke targets below — semantic-only fixtures, chunk coverage, retry persistence, privacy, compactor bridge, and coordinator adapter

## Change

- `extensions/plastic-memory/session/cycles.ts` — MODIFY — preserve existing ordinary prefix snapshot identities; add deterministic transient partitioning for a first completed span over 160k using contiguous safe message groups, keeping assistant tool-call/result sequences indivisible and returning a fixed safe impossible-group result
- `extensions/plastic-memory/workers/observer.ts` — MODIFY — request/parse semantic observations and source citations only, always generate IDs/records in code, validate citations against the exact supplied chunk allow-list, and support deterministic aggregate record construction for the full snapshot
- `extensions/plastic-memory/workers/reflector.ts` — MODIFY — request/parse semantic reflections and support citations only, always generate IDs/records in code, preserve exact observation membership, and size the call from its actual bounded prompt/observation aggregate rather than raw full-source token count
- `extensions/plastic-memory/workers/scheduler.ts` — MODIFY — capture one immutable full snapshot/source, observe each bounded chunk in order, aggregate only after exact full coverage, persist observations once, reflect once, close one full-span cycle, and perform at most one immediate phase-local retry with deterministic attempt 0/1 records and stale aborts
- `extensions/test/plastic-memory-worker-contract.smoke.mjs` — MODIFY — no-manifest/no-model-ID success, code-owned identities/records, strict invalid source/support citations, normalization, safe reasons, and unchanged compactor identity prohibition
- `extensions/test/plastic-memory-workers.smoke.mjs` — MODIFY — observer and reflector fail-once/succeed and fail-twice scenarios with same immutable phase input, exact attempt records/calls, no duplicate observations, stale abort, and no later trigger
- `extensions/test/plastic-memory-transport-integrity.smoke.mjs` — MODIFY — prove code-owned binding/span/IDs survive without model echo while semantic content still scrubs secrets/PII and prose fallback remains safe
- `extensions/test/plastic-memory-chunking.smoke.mjs` — MODIFY — >160k first-completed-span partition, ≤160k calls, exact ordered coverage, tool-call/result integrity, one aggregate/reflection/cycle, failure-before-close, and indivisible-group fixed failure
- `extensions/test/plastic-memory-stride.smoke.mjs` — MODIFY — adapt fake semantic worker responses while preserving exact normal/emergency compactor request/cut assertions
- `extensions/test/plastic-memory-integration.smoke.mjs` — MODIFY — adapt fake semantic worker responses and immediate failure fixture while preserving repaired coordinator/host behavior

## Proof

- **Semantic delta and anchors**: `cycles.ts:142–176` currently marks only a first over-bound completed span oversized; `scheduler.ts:151–154` skips it, and `174–193` runs one observer then returns after failure. `observer.ts`/`reflector.ts` currently require `coverageManifest` and may accept model-supplied IDs, even though citations are separately membership-validated and all snapshot/attempt/record constructors are code-owned.
- **Coverage receipt**: searched all `extensions/plastic-memory/**/*.ts` and `extensions/test/plastic-memory-*.smoke.mjs` references to `coverageManifest`, `expectedCoverageManifest`, `manifestValid`, `snapshot.status`, `oversized`, `160_000`, `beginCycleAttempt`, attempt counts/phases, observer/reflector calls, and source/support citations. The four production files and six smokes are `AFFECTED`. `types.ts` is `UNAFFECTED` because one full span/attempt/cycle remains representable. `ledger.ts` is `UNAFFECTED` because current record spans and folds accept code-owned records. `runner.ts` is `UNAFFECTED` because it already enforces context window, bounded transport, timeout, and safe fallback. `config.ts` is `UNAFFECTED` because retry remains exactly one. `compactor.ts`/engine/coordinator are `UNAFFECTED` and consumed through existing handoff.
- **Closure**: model identity removal → observer/reflector prompts/parsers/result checks → all fake response fixtures; oversized full span → cycles transient safe groups/token counts → scheduler ordered observer calls → per-chunk citation allow-lists → aggregate observations → one reflection → exact full-span close → existing compactor handoff; phase failure → finish attempt 0 → immediate begin attempt 1 with phase label → same captured chunk/aggregate → one final close or suppression. No durable chunk schema, new module, setting, or dependency is required.
- **Checkpoint**: after this task alone, fitting snapshots retain existing identity/call behavior; >160k first spans make only bounded calls and one cycle; fail-once completes in one trigger; fail-twice stops; all Plastic smokes pass without a provider. No later task restores worker or cycle validity.
- **Acceptance path**: semantic-only no-echo success and code-owned IDs are `CHANGE`; identity echo as prerequisite/model ID authority is `REMOVE`; exact citations/privacy/stale generation/ordinary prefix/incomplete suffix/160k per-call/detached compactor are `PRESERVE`; oversized first-span closure and immediate retry are `CHANGE`. Oracles assert fixed source IDs, prompt source arrays, call counts, attempt phase/count/outcome, append counts, and one fixed full-span cycle—not production-derived expectations.
- **Counterexample pass**: partitioning at arbitrary entries can separate tool calls/results, so chunks must derive from atomic safe groups. Appending each chunk's observations before complete coverage leaves partial memory after a later chunk failure, so aggregation/append is delayed until all observer chunks succeed. Retrying the whole pipeline after reflector failure duplicates observations, so reflector retry reuses the exact aggregate and observation record.
- **Wide-Task Receipt**: 10 product paths; semantic regions are snapshot/chunk kernel, semantic worker adapters, and scheduler attempt/persistence orchestration. Attempted cuts: (a) cycles-only leaves the explicit scheduler oversized skip and fails the >160k cycle gate; (b) adapters-only leaves `manifestValid` scheduler coupling and no retry; (c) retry separate from aggregation overlaps `scheduler.ts`, `workers`, `chunking`, and append/close invariants, providing no disjoint wave. Atomic disposition selected. Exact checkpoint evidence is the six focused smokes, existing `session` smoke, full Plastic loop, fixed ≤160k call inputs, ordered source coverage, exact attempts 0/1, one observation append, one reflection call, and one full-span closure.

## Acceptance

- [ ] Observer and reflector prompts/results require only semantic arrays and citations; no model manifest, snapshot/cycle/session/branch identity, digest, or model-supplied record ID is required or authoritative.
- [ ] Observation source citations remain nonempty subsets of the exact observer chunk; reflection support citations remain nonempty subsets of the exact aggregate observation IDs. Invalid/out-of-set/empty citations fail with fixed non-value-bearing reasons.
- [ ] A fitting completed snapshot preserves its pre-change span/snapshot/cycle identity and ordinary call/record/closure behavior; multiple-turn windows preserve largest-terminal-prefix progression and the current incomplete turn remains outside coverage.
- [ ] A >160k first completed span is partitioned into deterministic contiguous observer calls each ≤160k, with no assistant tool-call/result sequence split; exact ordered union equals the full snapshot once, observations aggregate, reflector runs once, and exactly one full-span cycle closes only after all chunks succeed.
- [ ] An indivisible over-budget tool exchange makes no oversized worker call, reports one fixed safe reason, appends no partial observation/reflection/cycle, and cannot create a third attempt or settled-edge hot loop.
- [ ] Observer or reflector fail-once/succeed records deterministic failed attempt 0 then immediate attempt 1 in the same trigger against byte-equivalent source chunk or aggregate; reflector retry reuses observations and persists them once. Fail-twice makes exactly two phase calls and no closure/third call.
- [ ] Stale branch/generation/snapshot transitions abort without retry; failure text remains scrubbed; transport bounds, Luna role settings, detached compactor behavior, and every Plastic smoke pass with no real provider.

## Constraints

- Keep the per-worker-call source ceiling at 160k. Do not raise model context, truncate source, or treat a partial chunk set as full coverage.
- A tool-call assistant and all corresponding result entries are indivisible for chunking. The incomplete current turn is never partitioned or observed.
- Reuse one captured full source and one deterministic chunk list. Do not reread a later branch between attempts and do not callback/settled-edge retry.
- Use existing attempt count 0/1 and persisted schemas. Do not add a setting, backoff, third attempt, chunk schema, flag, dependency, or new module.
- Code generates observation/reflection IDs even if a model returns ID-shaped fields. Preserve exact citation allow-lists and all scrubbers.
- Do not modify `types.ts`, `ledger.ts`, `runner.ts`, config, engine/compaction/coordinator behavior, host files, or undeclared tests. No broad rewrite/format/codemod.
- Builders do not stage or commit and never run Pi/providers or inspect credentials.

## Internal Execution Order

Before TODO creation or source mutation, create and fill `.pi/build/TILL-DO_task-02.md` with evidence-backed `PASS | BLOCKED` gates for authority/baseline, contract/scope, validation/resources, and recovery/stop. Verify the current shared-test hashes against the supplied final receipt, then snapshot all ten targets. Only all-`PASS` permits `.pi/build/TODO_task-02.md` mirrored from these phases:

1. **Semantic trust boundary** — `observer.ts`, `reflector.ts`, `plastic-memory-worker-contract.smoke.mjs`, `plastic-memory-transport-integrity.smoke.mjs`; prerequisite: current citation/ID/privacy behavior characterized; exit: no-echo/code-ID success, invalid citations, and scrubbing pass without runner changes.
2. **Safe oversized partition** — `cycles.ts`, `plastic-memory-chunking.smoke.mjs`; prerequisite: current ordinary prefix identities captured; exit: deterministic full-span groups, ≤160k token proof, tool integrity, ordinary identity preservation, and fixed indivisible failure pass.
3. **Aggregation and retry orchestration** — `scheduler.ts`, `plastic-memory-workers.smoke.mjs`; prerequisite: semantic result and chunk contracts stable; exit: ordered full coverage, append-once/reflection-once/close-once, observer/reflector attempt 0/1, and stale/fail-twice gates pass.
4. **Shared adapters and integrated review** — `plastic-memory-stride.smoke.mjs`, `plastic-memory-integration.smoke.mjs`, then all targets; prerequisite: phases 1–3; exit: focused/full validation, preservation review, final delta receipt/patch/hash, and selective-commit scope pass.

TILL-DO/TODO are transient execution state and excluded from the selective product checkpoint.

## Validation

- `node extensions/test/plastic-memory-worker-contract.smoke.mjs` — observes semantic-only responses, code-owned IDs/records, strict citations, safe reasons, and unchanged compactor identity prohibition
- `node extensions/test/plastic-memory-workers.smoke.mjs` — observes immediate phase retries, byte-equivalent inputs, deterministic attempt records, append counts, final failure, stale abort, and no hot loop
- `node extensions/test/plastic-memory-transport-integrity.smoke.mjs` — observes code-owned binding/span/IDs and content redaction without identity echo
- `node extensions/test/plastic-memory-chunking.smoke.mjs` — observes ≤160k chunks, ordered full coverage, tool-pair integrity, one aggregate/reflection/cycle, no partial append, and fixed impossible-group reason
- `node extensions/test/plastic-memory-stride.smoke.mjs` — semantic fake outputs still feed the repaired normal/emergency compactor path unchanged
- `node extensions/test/plastic-memory-integration.smoke.mjs` — semantic fake outputs and immediate failure behavior still cross the public coordinator adapter
- `node extensions/test/plastic-memory-session.smoke.mjs` — existing terminal/incomplete/attempt/exact-close invariants remain PASS
- `for test in extensions/test/plastic-memory-*.smoke.mjs; do node "$test" || exit 1; done` — all Plastic deterministic surfaces pass after resource re-verification
- `git diff --check -- extensions/plastic-memory/session/cycles.ts extensions/plastic-memory/workers/observer.ts extensions/plastic-memory/workers/reflector.ts extensions/plastic-memory/workers/scheduler.ts extensions/test/plastic-memory-worker-contract.smoke.mjs extensions/test/plastic-memory-workers.smoke.mjs extensions/test/plastic-memory-transport-integrity.smoke.mjs extensions/test/plastic-memory-chunking.smoke.mjs extensions/test/plastic-memory-stride.smoke.mjs extensions/test/plastic-memory-integration.smoke.mjs` — no whitespace damage

**STATEFUL RESOURCE PROOF**: worker-contract/workers/transport/chunking/stride/session are fake in-process runtimes and `NO_STATEFUL_RESOURCES`; no provider/network/credential/database/shared cache is reachable. Before integration or the full loop, inspect each smoke and require any write to be a unique run-owned OS-temp root with bounded teardown and no fallback, recorded `DISPOSABLE_VERIFIED`. Otherwise skip that command and report the surface unverified.

## Stop If

- Safe partitioning requires splitting an assistant tool call from a corresponding result, changing persisted schemas, or showing a worker more than 160k.
- Full ordered source coverage cannot be proved before observation append/cycle close, or reflection retry would reconstruct/change the observation aggregate.
- Existing attempt helpers cannot persist bounded phase-local outcomes 0/1 without a third attempt or schema/config change.
- Removing model identity echo would require trusting model IDs or weakening source/support citation membership, binding checks, or snapshot closure.
- Shared-test hashes do not match the supplied checkpoint receipt, a target changes after snapshot, or any validation can reach Pi/live provider/credentials/non-run-owned state.

## Checkpoint

- **Recovery snapshot**: required for all ten Change targets under `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/before/<relative-path>`, plus `FINAL_DELTA_RECEIPT.md`, `task-02.delta.patch`, and SHA-256 after validation.
- **Commit scope**: exact task-owned hunks in the ten Change files. Builder commits nothing; the orchestrator verifies the receipt and creates one selective checkpoint without recovery/build or unrelated dirty content unless explicitly tracked by repository policy.
