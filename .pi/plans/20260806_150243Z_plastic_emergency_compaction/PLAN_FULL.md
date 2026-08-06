# Plastic Emergency Compaction Ownership Plan

**Generated**: 2026-08-06 15:02:43 UTC  
**Complexity**: High  
**Estimated tasks**: 7 (6 writing tasks, 1 validator gate)  
**Risk**: High

## Outcome

Plastic Memory will own every host-delivered `session_before_compact` opportunity while enabled. A usable normal pending preserves the six-closed-cycle/newest-four policy. Otherwise the hook prepares emergency compaction inline, removes at most three fifths of the public model context window, preserves the newest two closed cycles when representable, and always preserves the current incomplete turn and atomic tool exchanges.

Emergency remains semantic: observer, reflector, and compactor use the existing portable JSON contracts, code-owned identities, citations, scrubbing, cumulative renderer, pending, and acknowledgement. Attempts are Luna, immediate Luna retry, `anthropic/claude-sonnet-5`, then distinct usable `ctx.model`. Exhaustion or structural impossibility cancels and preserves raw context; Pi native summary content is never the emergency fallback.

Before emergency observation, the normal scheduler yields an awaited exclusive lease, preserving one active observer. After a matching emergency boundary, the coordinator appends and validates `plastic.compaction.applied` before invalidating the old generation and bootstrapping the retained raw tail. No transient emergency span is persisted as `plastic.cycle.closed`.

## Evidence Baseline

### KNOWN

- Project root: `/Users/j.henrique/.pi/agent`; baseline head: `1b14f5efdc3138e4a937250a452ee9c4eb232b6f`.
- Handoff baseline: all 21 existing `extensions/test/plastic-memory-*.smoke.mjs` pass.
- Focused reads established:
  - `runtime/coordinator.ts`: budget, pending guards, hooks, acknowledgement, rebase.
  - `compaction/engine.ts`: six/four selection, exact cycle validation, physical budget, render/pending, acknowledgement.
  - `compaction/extract.ts`: facts currently require `CycleClosedData`.
  - `workers/{runner,observer,reflector,compactor,scheduler}.ts`: Luna transport, strict parsers, detached normal compactor, active-job queue/abort.
  - `session/{cycles,bootstrap,ledger,render-summary,recall,types}.ts`: terminal turns, atomic partitioning, bootstrap, bounded index, exact recall, persisted types.
- Host package reads prove async handlers are awaited; hook cancellation/compaction is literal; custom and compaction records attach to the current leaf; `ExtensionContext.model` and public context usage exist.
- Existing observation, reflection, compaction-applied, and bootstrap records are sufficient; no persisted type/version is needed.

### INFERRED, bounded by tests

- The host may reject a too-small session before emitting the hook. That host gate is outside this change.
- Live catalogue/auth varies; unavailable candidates must advance/cancel deterministically.

### TO VERIFY after implementation

- Orchestrator-run live campaigns must confirm actual Sonnet/current-model credentials and manual, threshold, and overflow journeys.
- The host pre-hook “Nothing to compact” limitation remains outside scope.

## Scope

### In scope

- Candidate-aware worker execution with unchanged normal Luna defaults.
- Exact normal four-cycle retention and a separate emergency selector.
- Transient terminal-complete selection with 60% cap, preserve-two, open-turn, and exchange safety.
- Existing bounded index rendering for transient memories.
- Immutable emergency phases under a hard deadline and exact fallback order.
- An exclusive scheduler lease for emergency observer ownership.
- Async hook integration, successful-record append, pending consume, cancellation, acknowledgement, and emergency rebase.
- Branch-local exact recall for emergency IDs after rebase.
- Deterministic new coverage and intentional updates to old physical/direct-hook expectations.

### Out of scope

- A Plastic `/compact` command; host changes; oracle vendoring; deployment/provider setup; live campaigns.
- New dependencies, settings, flags, migrations, schema versions, persisted types, or model-free summaries.
- Changes to normal six/four stride, cycle digest/closure rules, projection format, project promotion, or general retry counts.
- Reported dirty areas: `SYSTEM.md`, `config/**`, `agents/**`, `skills/**`, unrelated `.pi/**`.

## Material Decisions

1. **Normal is exactly six/four.** Four retained cycles either fit or no normal pending is created. Existing physical 4→2/zero behavior moves to emergency selection.
2. **60% is a removal maximum, not activation.** Activation is “enabled ordinary hook + no usable pending.” Selection maximizes a safe prefix under `floor(contextWindow * 3 / 5)` and retained-tail fit.
3. **Emergency identity is transient but real.** A code-derived snapshot supplies `pm:cy:` semantic identity; observations/reflections use normal `pm:o:`/`pm:r:` IDs. No attempted/closed cycle is persisted.
4. **Fallback is additive.** Normal calls keep Luna and scheduler retry semantics. Emergency pins whole phases to Luna, Luna, Sonnet 5, then a distinct usable visible model; invalid semantic output advances.
5. **Phase input is immutable.** Sources, chunks, prompts, prior state, and project snapshot are captured once. Failed observer candidate aggregates are discarded.
6. **Emergency work is globally exclusive.** A scheduler lease reserves synchronously, aborts and awaits active work, defers triggers, and releases one queued reschedule. Abort dispatch alone is insufficient.
7. **One hard deadline.** The existing 60,000 ms role maximum becomes the whole inline ceiling; remaining-time aborts allow advancement while time remains.
8. **Persist only after semantic success.** The pipeline returns existing semantic records and verified render/pending. Coordinator revalidates branch before append. Partial append failure leaves only independently valid semantic records and cancels.
9. **Acknowledgement ordering is strict.** Host compaction → valid `plastic.compaction.applied` → generation invalidation → retained-tail bootstrap. Normal acknowledgement remains established.
10. **Historical exact recall stays branch-local.** Exact older-generation namespaced lookup is allowed on the supplied current branch; broad search/folding remains generation-scoped.
11. **Structural failure cancels.** Unsafe cut, malformed order, unknown tokens, indivisible over-cap exchange, stale branch, unavailable runtime, queue failure, or exhausted models returns `{ cancel: true }`.

## Affected-Artifact Closure

| Delta | Relationship | Owner |
|---|---|---|
| Candidate model execution | registry/auth → exact model adapter → worker parser | Task 01 |
| Normal/emergency selection | budget → normal four/no pending; terminal boundaries → emergency cut | Task 02 |
| IDs in summary | transient values → bounded session index | Task 03 |
| Semantic emergency result | span → chunks → phases → verified render/pending | Task 04 |
| One-active observer | active job → abort/settle → lease/reschedule | Task 05 |
| Host/durable lifecycle | async hook → lease → append/pending → boundary → applied/bootstrap/recall | Task 07 |
| Independent review | checkpoint chain → queue/model/cut/state diagnostics | Task 06 |

No-change closure:

- `session/types.ts`: schemas already cover all durable records.
- `session/cycles.ts`: snapshot/atomic partition APIs cover open turns/exchanges.
- `compaction/render.ts`: strict state, scrubbing, header, details already suffice.
- `compaction/pending.ts`: identity/TTL/branch guards suffice; emergency mode stays coordinator-local.
- `compaction/projection.ts`: cumulative details shape already projects correctly.
- `runtime/commands.ts`, `index.ts`: no command or registration edit required.

## Repository State and Shared-File Hazards

No relevant dirty overlap was reported. Builders must recheck owned paths; a newly dirty target stops for ownership resolution.

| File | Approx. size / hazard | Preservation markers | Mitigation |
|---|---|---|---|
| `workers/runner.ts` | ~240 lines; four roles | `ROLE_CONFIGS`, caps, diagnostics, Luna default | additive target path; worker/transport smokes |
| `workers/scheduler.ts` | ~350 lines; concurrency | active job, epoch, reschedule, stale abort, terminal snapshots | separate lease checkpoint; deferred-promise tests |
| `compaction/engine.ts` | ~350 lines; normal/ack shared | 6/4 constants, exact spans, pending binding | serialized Tasks 02/04; recovery snapshots |
| `runtime/coordinator.ts` | ~590 lines; all hooks/latches | nonce, pending guards, projection, ack | final integration; exact queue/ack tests |
| `session/render-summary.ts` | ~70 lines; visible index | guidance, recency, caps/scrubbing | additive overlay; byte-compatible empty case |
| `session/recall.ts` | ~300 lines; privacy boundary | ID validation, branch traversal, search scope | exact lookup only; off-branch negative test |
| `extensions/test/plastic-memory-apply-cut.smoke.mjs` | ~290 lines; shared harness | nonce, pending, cut ownership | serialized Tasks 02/07; recovery snapshots |
| `extensions/test/plastic-memory-integration.smoke.mjs` | ~365 lines; host lifecycle | Pi registration, projection, overlap | await hook without weakening controls |

Selective commits include only task write sets. `.pi/build` recovery state is excluded. No active implementation checkpoint was supplied.

## Scenarios and Failure Behavior

- **PRESERVE normal pending:** return existing six/four result; no emergency lease/model calls.
- **CHANGE no pending:** after scheduler quiescence, prepare inline with 0/1/2/3 valid cycles.
- **CHANGE normal four do not fit:** normal defers; emergency may preserve two and compact more, never over 60%.
- **PRESERVE open turn/exchange:** every entry after the last terminal assistant remains raw; calls/results are indivisible at cut/chunk boundaries.
- **PRESERVE one observer:** active work settles before emergency; triggers defer and reschedule once.
- **CHANGE candidate failure:** retry immutable phase on next model; final failure cancels with no native content.
- **FAIL CLOSED structural:** cancel on no user cut, unknown budget, malformed branch, or indivisible group.
- **CHANGE successful ack:** applied record validates before rebase/bootstrap; later cycles are contiguous/eligible.
- **PRESERVE projection:** only subsumed verified Plastic summaries are removed.

## Risks and Mitigations

- 60% misread as trigger → invoke independently and sum fixture removed tokens.
- Normal silently shrinks below four → normal pressure must yield no pending.
- Model input mutates/mixes chunks → exact prompt/manifest traces and discarded aggregates.
- Runtime stays Luna-hardcoded → exact Sonnet/current model object must reach `complete`.
- Observer overlap → synchronous lease, awaited settlement, no-late-append oracle.
- Inline hang → one lease, host abort, per-candidate abort, 60-second ceiling.
- Fake cycle → appended-type assertions reject attempted/closed emergency records.
- Premature rebase → exact branch order and post-boundary eligibility journey.
- Recall leakage → record must be on supplied branch; search remains scoped.
- Async test weakening → direct hooks are awaited with independent branch/cut oracles.

## Decomposition and Execution Shape

No writing task exceeds 20 paths or spans three independent semantic regions; the wide-task threshold is not triggered. Compatibility seams are additive model execution, pure selection, transient summary, semantic finalization, scheduler exclusivity, then host integration.

Counterexample refutation: integrating before semantic finalization permits native fallback or cancels all no-pending events; bypassing a scheduler checkpoint permits two observers; combining runner, engine, scheduler, coordinator, and recall destroys independent rollback/checkpoint boundaries.

No implementation tasks are authorized in parallel. Early write sets are disjoint, but their validation/import closures are not: worker-contract execution reads the engine/summary path, compaction/stride execution reads worker/scheduler code, and summary compatibility is exercised through compaction. Serialization prevents validation against concurrently changing code.

**Critical path**: Task 01 → Task 02 → Task 03 → Task 04 → Task 05 → Task 07 → Task 06.

## Validation Strategy

Smokes use real modules through the established Jiti harness and explicit registries/host stubs; no permissive `Proxy` token maps. Expected cuts, tokens, model order, queue settlement, and record order derive independently from fixture entries, explicit token maps, controlled promises, call traces, and branch arrays.

Key commands:

- `node extensions/test/plastic-memory-model-fallback.smoke.mjs`
- `node extensions/test/plastic-memory-emergency-selection.smoke.mjs`
- `node extensions/test/plastic-memory-emergency-summary.smoke.mjs`
- `node extensions/test/plastic-memory-emergency-pipeline.smoke.mjs`
- `node extensions/test/plastic-memory-emergency-queue.smoke.mjs`
- `node extensions/test/plastic-memory-emergency-hook.smoke.mjs`
- `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done`

The final hook smoke must observe scheduler settlement, hook response, model trace, semantic records, host compaction, applied record, bootstrap generation, retained raw branch, later eligibility, and exact recall. Compile/lint-only evidence is insufficient. Live campaigns remain unverified until orchestrator execution.
