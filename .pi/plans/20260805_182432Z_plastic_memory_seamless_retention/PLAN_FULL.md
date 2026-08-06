# Plastic Memory Seamless Retention — Repaired Implementation Plan

**Generated**: 2026-08-05 18:24:32 UTC  
**Plan repair**: one-time repair from the supplied partial implementation state  
**Complexity**: High  
**Estimated tasks**: 3 (2 builders, 1 independent validator)  
**Risk**: High — a wrong cut, stale pending, false applied state, or incomplete oversized aggregation can silently remove reachable session memory.

## Outcome

Plastic Memory remains the normal owner of one verified rolling compaction. It starts eligibility at six closed cycles, normally folds every older closed cycle into the rolling Plastic summary while retaining exactly the newest four closed cycles raw, and preserves an incomplete suffix whole. The host transports/applies the prepared Plastic result; acknowledged state advances only after the matching `session_compact` event.

The repaired implementation also:

- accepts a valid Plastic pending on host auto-compaction even when the host advisory cut is later;
- keeps a pending after the host reports `Nothing to compact`, and retries only on a later settled edge;
- rebases after an actual non-Plastic fallback boundary so unreachable Plastic recall IDs are not treated as current;
- uses public context/model information plus code-owned conservative token accounting to fold the oldest normally-retained cycle(s) only when four raw cycles cannot safely fit;
- makes observer/reflector output semantic-only while retaining exact citation allow-lists;
- performs one immediate phase-local retry against immutable input; and
- partitions a single completed source span over 160k into bounded, tool-pair-safe observer calls, aggregates full coverage, reflects once, and closes one cycle.

## Approved Semantics and Decisions

### In scope

1. **Normal retention (`CHANGE`)**: eligibility begins at six closed cycles. C6 compacts C1/C2 and cuts at C3. Delayed C8 with no acknowledged prior state compacts C1..C4 and cuts at C5. Any incomplete suffix is outside cycle count and remains after the cut.
2. **Rolling ownership (`CHANGE`)**: one latest verified pending is replaceable and consume-once. The prepared state travels with that pending, but cumulative `priorState` advances only on a matching acknowledgement.
3. **20k application gate (`CHANGE`)**: extension-initiated `ctx.compact()` requires finite public usage strictly above 20,000 plus settled/idle/no queued messages. Unknown or low usage is an informational deferral.
4. **Host `Nothing to compact` (`CHANGE`)**: classify the exact host pre-hook deferral as informational, release only apply intent/latches, preserve the unconsumed pending, and wait for another settled edge. Do not callback-retry or warn.
5. **Host-auto ownership and fallback (`CHANGE`)**: a current pending's verified cut overrides the host advisory cut, regardless of whether that advisory cut is earlier or later. Identity, TTL, generation, branch, prefix, and latest-compaction guards remain mandatory. An actual non-Plastic compaction event becomes a fresh bootstrap boundary and invalidates pending/applied Plastic state from the old reachable window.
6. **Physical emergency (`CHANGE`)**: four closed cycles remain raw by default. A preparation may fold the oldest of those four only when public `contextWindow`, the effective system prompt, the bounded Plastic summary, a fixed conservative reply/reserve allowance, and public host-exported entry/message token estimates prove that the four-cycle raw suffix plus incomplete suffix cannot fit. The cut still starts a whole closed cycle; all folded cycle identities enter the cumulative state. If no whole-cycle cut has a proved fit, the extension cancels rather than allowing a native cut to split or silently violate the boundary.
7. **Worker trust boundary (`REMOVE` only for identity echo)**: observer and reflector no longer request or require model-returned snapshot/cycle/session/branch IDs, digests, manifests, or record IDs. Code still owns those values. Model-provided observation source citations and reflection support citations remain nonempty strict-membership subsets and remain scrubbed.
8. **Immediate retry (`CHANGE`)**: the first current observer or reflector failure records deterministic attempt 0 and immediately retries that phase once as attempt 1 against byte-equivalent input. Stale/aborted generation, branch, or snapshot transitions do not retry. No third attempt or later-turn dependency is introduced.
9. **Oversized completed span (`CHANGE`)**: preserve the existing largest-terminal-prefix behavior for ordinary multi-turn windows. When the first completed source span itself exceeds 160k, deterministically group entries at safe message boundaries, keep an assistant tool call with its corresponding result sequence, and issue observer chunks of at most 160k. Only complete ordered chunk coverage may be aggregated; reflection runs once on the aggregate and one full-span cycle closes. An indivisible over-budget exchange fails with a fixed safe reason and no provider hot loop.

### Preserve

- Exact observation/reflection citation allow-lists, content normalization, secret/PII scrubbing, record guards, source digests, ancestry checks, safe user-entry cuts, pending TTL/consume-once semantics, generation/branch guards, and synchronous internal nonce ownership.
- The per-worker-call 160k ceiling, Luna role/model configuration, transport bounds, no-provider deterministic smokes, and current project promotion/publication behavior.
- Host implementation and settings, including the installed package and native compaction defaults.
- Existing Plastic summary/index rendering, cumulative state verification/repair, context projection, and long-term project promotion.
- Every pre-existing intentional dirty repair, diagnostic, test fixture, recovery artifact, and unrelated file.

### Out of scope

- Host source/settings changes, private host imports, provider or Pi execution by builders/validator, new dependencies, settings, flags, schemas, migrations, publication work, or project-memory promotion.
- Broad copying or vendoring from either MIT oracle package. They are behavioral/design references only.
- Credential inspection, real provider calls in deterministic validation, PR/merge work, branch cleanup, or unrelated dirty-file cleanup.

### Material rationale

- The host root package publicly exports `estimateTokens` and `sessionEntryToContextMessages`; `ExtensionContext` publicly supplies `getContextUsage()`, `getSystemPrompt()`, idle/queue state, and `compact()`. This is enough for conservative post-cut accounting without importing private host implementation.
- The engine already verifies whole contiguous closed-cycle spans and user-entry cuts. Extending that selection with a bounded retained-cycle count preserves tool-pair and incomplete-suffix integrity; no adapter or migration is needed.
- `renderVerifiedCompaction()` already accepts any nonempty cycle array, adds deterministic identities/facts to prior state, and renders one current observations/reflections recall index. Emergency-folded cycles therefore use the established producer rather than a second summary subsystem.
- `PendingStore` already has one replaceable five-minute slot and separate identity-versus-consumption checks. `Nothing to compact` occurs before `session_before_compact`, so preserving the slot while clearing only coordinator intent is the minimum repair.
- A real unmatched/non-Plastic `session_compact` means the host has already created a new context boundary. Reusing the existing invalidation/bootstrap path is safer than carrying stale `priorState` or introducing dual-read state.
- For an oversized first completed span, partitioning is an in-memory execution concern. Existing persisted span/cycle schemas can continue to describe the one full source span; chunk identities and aggregation remain code-owned transient data.

## Evidence Baseline

### KNOWN

- The working tree contains an uncommitted partial Task 01 delta in exactly eight product/test paths. Its reported recovery patch SHA-256 is `3cff8e488b2d9e9cccbd0c874fc2b69885c939e25518f175a1a18a78dbea4bfd`; all previously declared smokes passed, but no selective checkpoint exists.
- `.pi/build/TILL-DO_task-01.md` and `TODO_task-01.md` currently claim completion. Those claims are stale because new defects and required semantics were supplied before checkpointing.
- Current `engine.ts` now selects every unacknowledged older cycle before the newest four; current `coordinator.ts` carries prepared state, promotes it on acknowledgement, and applies only above 20k; current `compactor.ts` accepts a variable-length eligible set.
- Current `coordinator.ts:preparationMatches()` still rejects `cutIndex < hostIndex`. The installed host uses the extension-returned `firstKeptEntryId` verbatim, so that rejection permits a competing native summary/cut.
- Host `compact()` throws `Nothing to compact (session too small)` before the extension hook when preparation is undefined. Extension `CompactOptions.onError` receives that error.
- Host `session_compact` exposes `fromExtension`, reason, and the appended compaction entry. The compaction entry also carries `fromHook`; these are observable without host modification.
- Host context construction is rooted at the latest compaction boundary; existing Plastic `context` projection removes provably subsumed Plastic summaries. Existing projection deliberately preserves a latest native/ambiguous summary.
- `cycles.ts` currently marks a first completed span over 160k as `oversized`; `scheduler.ts` skips it. Multiple completed turns still use the largest terminal-ending prefix under the bound.
- Observer and reflector currently request and validate `coverageManifest`; their citation checks are separate. Scheduler currently performs no immediate same-trigger retry.
- The root host package publicly exports `estimateTokens` (documented as conservative) and `sessionEntryToContextMessages`; no private path import is required.
- The observational-memory oracle defers application to a settled edge, rechecks state before `ctx.compact`, and renders one recall-ID summary index. The smart-compact oracle stages one five-minute/session-bound pending and consumes it in `session_before_compact` after deterministic preparation/verification.

### INFERRED, verified by focused relationship reads

- Passing one conservative context-budget contract through scheduler → selector → detached compactor → final engine preparation is sufficient to keep the model request, cumulative identities, and applied cut aligned. No pending schema change is required.
- A hook-time recheck can include descendants/incomplete suffix that appeared after preparation. If the prepared cut is no longer proved safe, cancelling while leaving no false acknowledgement is a valid fail-closed boundary.
- On a real fallback compaction, coordinator invalidation followed by the existing `bootstrapSession()` over `buildContextEntries()` establishes the host boundary under a fresh generation. Old-generation observations/reflections then fail current-binding folds without deleting historical records.
- Semantic-only worker responses can keep current persisted schemas because snapshot/span/attempt/observation/reflection IDs are all already generated by code.
- Safe chunk views can be transient. Per-chunk citation checks plus exact ordered full-span coverage and one final full-span close avoid a new chunk record schema.

### UNKNOWN / TO VERIFY (bounded runtime facts only)

- Whether live host auto-compaction is emitted during a particular incomplete tool turn. Any hook event received must preserve or cancel around the incomplete suffix; the post-validator PTY campaign records actual timing.
- Exact live post-compaction token usage for a physical emergency on the selected active model. Deterministic accounting and fixtures are the builder gate; live observed usage remains a campaign result.
- Whether Luna produces useful natural output variance during a bounded campaign. Variance evidence is attempted without weakening schema/citation checks; lack of variance is reported, not manufactured.

## Repository State, Recovery, and Checkpoints

- Task 01 is **repair/resume required**, not complete. Its eight current files must not be reverted. The existing `before/` snapshots and `task-01.delta.patch` are immutable recovery evidence.
- Before further Task 01 mutation, the builder reopens the stale TILL-DO/TODO, recomputes the supplied partial patch hash, records current hashes/status, and snapshots the current partial state under `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_01/resume_before/`.
- Task 01 final evidence is additive: `FINAL_DELTA_RECEIPT.md`, `task-01.final.delta.patch`, and `task-01.final.delta.patch.sha256`. The final patch represents the complete task-owned delta while preserving all original dirty baseline hunks; the original partial patch is never overwritten.
- Task 02 snapshots every target only after the Task 01 selective checkpoint hash is recorded. Its shared-test baseline hashes must match Task 01's final receipt.
- Builders never stage or commit. After focused validation, receipt verification, and diff review, the orchestrator creates one selective checkpoint per writing task containing only task-owned product hunks. Recovery/build artifacts remain evidence and are not accidentally absorbed with unrelated dirty content.
- Rollback uses the verified task delta/recovery patch, never whole-file restoration over a dirty shared file.

## Shared-File Hazards

| File | Approx. lines | Preservation markers | Hazard and mitigation |
|---|---:|---|---|
| `extensions/plastic-memory/compaction/engine.ts` | 228 | `branchIsOrdered`, `exactCycleSpan`, `safeCutEntry`, `acknowledgeCompaction` | Partial dirty correctness kernel. Patch only retained-boundary/budget inputs and preserve digest, ancestry, prior-state-prefix, cut, Plastic-compaction, and acknowledgement checks. |
| `extensions/plastic-memory/runtime/coordinator.ts` | 530 | internal nonce prefix, `preparationMatches`, `resetApplyState`, `maybeApply`, both compaction hooks, `context` | Shared lifecycle owner. Preserve synchronous consume, settled gating, context projection, UI scrubbing, and all invalidation events. Resume snapshot required. |
| `extensions/plastic-memory/session/cycles.ts` | 274 | terminal assistant predicate, snapshot identity, attempt 0/1, exact close | Task 02 adds transient chunking without changing persisted schemas or reopening incomplete turns. Snapshot required before Task 02. |
| `extensions/plastic-memory/workers/scheduler.ts` | 254 | `current`, `terminalSnapshots`, append order, detached compactor | Chunk aggregation and immediate retry share one persistence path. Preserve stale abort checks around every await. |
| `extensions/plastic-memory/workers/observer.ts` / `reflector.ts` | 183 / 141 | citation membership, fixed safe reasons, scrubbers | Remove model identity echo only; do not relax source/support membership or trust model IDs. |
| `plastic-memory-stride.smoke.mjs` / `plastic-memory-integration.smoke.mjs` | ~176 / ~345 | fixed IDs/calls, fake registry, temp teardown | Both builders modify them. They are serialized; the later recovery baseline must equal the earlier final hash. |
| Task 01 recovery/build artifacts | existing | reported SHA-256 and original `before/` tree | Stale completion prose must be reopened, but original snapshots/partial patch remain immutable. Final receipt uses new names. |

## Acceptance Journeys and Failure Behavior

- **A — Normal C6/C8**: C6 requests C1/C2 and cuts at C3. A delayed unacknowledged C8 requests C1..C4 and cuts at C5. A matching acknowledged C6 state lets C8 request only C3/C4 while rendering cumulative C1..C4.
- **B — Incomplete suffix**: a C9 user/tool-call/tool-result suffix is not a closed cycle, is never split, and remains wholly after the selected retained-cycle cut.
- **C — Physical emergency**: if four raw retained cycles fit, the cut stays C5. If only three fit, C5 is included in the verified model request/state and the cut advances to C6. If even the smallest whole-cycle raw suffix plus incomplete suffix/system/summary/reserve cannot be proved safe, no compaction is returned.
- **D — Application deferral**: usage unknown/null/≤20k makes zero `ctx.compact()` calls and preserves pending. A later >20k settled edge calls once. Exact host `Nothing to compact` resets intent, remains informational, preserves pending, and does not retry until another settled edge.
- **E — Valid host auto**: a later host advisory cut does not defeat the earlier Plastic cut. The hook consumes once, returns the verified Plastic summary/cut/details, host appends one from-extension/fromHook compaction, and matching acknowledgement alone promotes state.
- **F — Native/non-Plastic fallback**: without a usable Plastic result, an actual fallback compaction remains the current host summary. Plastic clears pending/in-flight/applied assumptions, creates a fresh bootstrap generation at the new active window, and does not expose old-generation recall IDs as current.
- **G — Semantic worker output**: outputs without manifests or identity echoes close from code-owned binding/span/attempt data. Out-of-set or empty citations still fail with fixed safe reasons.
- **H — Immediate retry**: observer or reflector fail-once/succeed completes in the same trigger with attempt outcomes 0/1 and identical phase input. A second failure is terminal/suppressed; stale work gets no retry.
- **I — Oversized completed turn**: a >160k completed span produces deterministic ≤160k observer chunks, preserves tool-call/result groups, aggregates all citations/observations, reflects once, appends no partial closure, and closes one full-span cycle only after all chunks succeed.

## Risks and Mitigations

1. **Advisory host cut competes with Plastic** — remove only advisory ordering as a validity criterion; retain every branch/prefix/TTL/generation/latest-compaction guard and assert the returned cut directly.
2. **Conservative budget still undercounts** — use the host's public exported message estimator and session-entry projection, include effective system prompt, maximum bounded Plastic summary, and fixed reserve; hook-time recheck descendants. Unknown or impossible accounting cancels.
3. **Emergency cut omits a retained cycle semantically** — derive both compactor eligible cycles and cut from one engine selection; assert folded cycle IDs/citations appear in request and cumulative state.
4. **`Nothing to compact` becomes a warning/hot loop** — exact safe classification, no callback retry, pending preserved, and exact call-count tests across settled edges.
5. **Fallback carries false Plastic state** — handle every real unmatched/non-Plastic `session_compact` as a bootstrap boundary; clear old generation state and verify current recall/fold behavior.
6. **Chunking splits a tool exchange or closes partial coverage** — deterministic atomic grouping, ordered coverage receipt, per-call token assertions, append only after complete aggregation, and one full-span close oracle.
7. **Retry duplicates observations or changes source** — reuse captured chunks/aggregate, append deterministic records once, check `current()` around every await, and assert byte-equivalent prompts/source IDs.
8. **Model identity removal weakens trust** — code generates all identity/record values; strict citation membership and invalid-citation fixtures remain the non-self-fulfilling oracle.
9. **Dirty partial work is lost or falsely checkpointed** — immutable original recovery, resume snapshots, full final delta receipt, selective orchestrator commit, and serialized shared tests.

## Wide-Task Decomposition and Delivery Shape

Both writing tasks trigger the three-semantic-region audit despite staying below 20 paths.

- **Task 01 (8 paths)** spans deterministic retention/budget selection, detached compactor preparation, and host lifecycle/ack/bootstrap. A kernel-only cut was tested conceptually against the actual partial working tree: coordinator would still apply a cut without the same physical policy and the physical-budget/application smokes would fail. A lifecycle-only cut would leave the already-present engine/compactor delta uncheckpointed and could not prove emergency-folded cycle membership. Because the uncommitted partial patch already crosses these regions and the selector/request/cut must share one contract, Task 01 remains one repair checkpoint.
- **Task 02 (10 paths)** spans snapshot/chunk partitioning, semantic worker adapters, and scheduler attempt/persistence orchestration. A partition-helper-only checkpoint leaves `scheduler.ts`'s explicit oversized skip and fails the >160k cycle oracle. A semantic-parser-only checkpoint leaves the scheduler's `manifestValid` dependency and no immediate retry. Retry and chunk aggregation both mutate the same `run()` append/close boundary and the same fixtures, so splitting would serialize overlapping writes without creating a useful independent acceptance checkpoint.
- There is no safe parallel builder wave. Tasks share `plastic-memory-stride.smoke.mjs` and `plastic-memory-integration.smoke.mjs`; Task 02 also validates the engine/compactor checkpoint. The critical path is therefore `repair retention/application → worker chunk/retry → independent validator → orchestrator live campaigns`.

Counterexample refutation: a seemingly independent worker lane still depends on the retained-cycle checkpoint because its closed full-span cycle feeds `startCompactor()` and the shared stride fixture. Running it before the retention checkpoint could bless a cycle that later yields a different eligible request/cut, so the selected serialization is required.

## Implementation Order

1. Resume the current Task 01 tree without reverting it. Repair advisory-cut ownership, exact host deferral, fallback rebase, and normal/emergency physical budget while retaining the existing exact-four/applied-state partial work.
2. After the selective Task 01 checkpoint, implement semantic-only observer/reflector output, deterministic oversized chunk aggregation, and immediate phase-local retry in one worker-pipeline checkpoint.
3. Independently validate the exact cuts, physical fit policy, fallback/retry state machines, privacy/citation barriers, receipts, and focused diffs.
4. Only after validator `PASS`, the orchestrator runs the three approved live PTY campaigns from fresh `/tmp` session roots; no builder or validator owns those campaigns.

## Validation Strategy

- Focused Node smokes use fixed synthetic branch IDs, token counts, fake model registries, and in-process host adapters. They assert actual requests, returned cuts, branch/context survivors, pending slots, notices, call counts, persisted attempt records, citation sets, and cycle closure.
- Core compaction/worker smokes are `NO_STATEFUL_RESOURCES`: no network, provider, credential, database, user session, or shared cache is reachable.
- Integration/host fixtures may create only unique test-owned OS-temp directories with in-process teardown. Before execution they must be reclassified `DISPOSABLE_VERIFIED`, with no fallback path and credentials/network/user state unreachable.
- Type/lint-only checks are insufficient. Every behavior-changing task observes the host hook reply, state/pending transition, worker call/prompt, persisted record, or projected context result.
- Task 01 validates normal and emergency cuts, host-later advisory acceptance, one consume/ack, exact `Nothing` deferral, and fallback bootstrap.
- Task 02 validates semantic-only success, invalid citations, ≤160k chunks, full ordered coverage, tool-pair integrity, exactly one reflector call, immediate attempt 0/1 retries, stale abort, and one closure.
- The validator reruns one bounded high-consequence suite and records `PASS | BLOCKED` without edits.
- Live PTY evidence is separate from deterministic completion evidence. Campaign failure or unavailable variance is reported explicitly; deterministic barriers are never weakened to make a live run pass.
