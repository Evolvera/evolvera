# Task 02: Process exact queued cycles with full normal fallback

**Agent**: builder  
**Why**: Durable capture is useful only if the worker consumes the oldest exact item serially and retries each semantic phase without changing its input.  
**Goal**: An additive queued scheduler path runs observer, reflector, and eligible compactor work over exact persisted queue items with Luna → Luna → Sonnet → distinct visible-model fallback.

## Read

- `extensions/plastic-memory/session/cycles.ts` — queued reconstruction artifact, attempt/close identities, partitioning, and token invariant.
- `extensions/plastic-memory/workers/scheduler.ts` — active-job serialization, stale checks, append path, phase loops, compactor launch, and invalidation.
- `extensions/plastic-memory/workers/runner.ts` — model resolution, target builder, bounded role execution, prompt caps, and diagnostic scrubbing.
- `extensions/plastic-memory/workers/{observer,reflector,compactor}.ts` — strict-result adapters already accepting an optional model target.
- `extensions/test/plastic-memory-{workers,model-fallback,emergency-queue,chunking,stride,fresh-session}.smoke.mjs` — all direct scheduler/model fixtures that must adopt the queued contract before active-runtime cutover.

## Change

- `extensions/plastic-memory/session/cycles.ts` — MODIFY — bind queued attempts and closes to an exact valid queued record, reject sub-20k queued work, and leave an exhausted queued item eligible for a later trigger without weakening actual attempt semantics.
- `extensions/plastic-memory/workers/scheduler.ts` — MODIFY — add a queued-input path that selects only the oldest valid unresolved item, captures exact immutable entries/IDs/digest, runs one worker per branch, drains durable FIFO state, exposes a read-only non-aborting busy signal for host-hook deferral, and applies strict per-phase fallback to observer, reflector, and eligible compactor work.
- `extensions/plastic-memory/workers/runner.ts` — MODIFY — generalize the existing emergency candidate builder into the normal model-target sequence while retaining any compatibility export still used by disconnected emergency code/tests.
- `extensions/test/plastic-memory-workers.smoke.mjs` — MODIFY — drive the scheduler with queued records and assert strict fallback, attempts, closes, immutable phase input, retryability, and busy/idle observation without aborting work.
- `extensions/test/plastic-memory-model-fallback.smoke.mjs` — MODIFY — prove the shared candidate order/deduplication and normal phase use, not only the emergency helper.
- `extensions/test/plastic-memory-emergency-queue.smoke.mjs` — MODIFY — replace in-memory emergency-lease ownership as the primary oracle with durable A/B/C capture-and-drain behavior while A is active.
- `extensions/test/plastic-memory-chunking.smoke.mjs` — MODIFY — supply exact queued items to scheduler cases and retain 160k/tool-exchange failure oracles.
- `extensions/test/plastic-memory-stride.smoke.mjs` — MODIFY — make direct scheduler cycles valid >=20k queued work and verify compactor fallback only after strict six/four eligibility.
- `extensions/test/plastic-memory-fresh-session.smoke.mjs` — MODIFY — queue a qualifying resumed turn before worker execution and retain fresh-bootstrap/history exclusion assertions.

## Proof

- **Semantic delta and anchors**: `CycleScheduler.trigger()` currently derives one aggregate completed prefix from live source and uses one in-memory deferred callback; observer/reflector loops make only two implicit Luna calls; `startCompactor()` makes one Luna call. All three strict adapters already accept `model`, and `buildEmergencyModelTargets()` already expresses the required order.
- **Coverage receipt**: searched every scheduler construction/call in `extensions/test`, all `runObserver`/`runReflector`/`runCompactor` call sites, model-target references, attempt suppression, compactor pending launch, and coordinator input construction. **AFFECTED**: the three production files and six direct scheduler/model smokes listed above. **UNAFFECTED**: observer/reflector/compactor adapters already validate strict results and accept exact targets; pending/engine remain unchanged; coordinator retains its existing call shape at this additive checkpoint.
- **Closure**: queued identity and >=20k attempt/close binding → `cycles.ts`; oldest-item selection, immutable source, branch serialization, append order, non-aborting busy observation, and phase fallback → `scheduler.ts`; candidate order/visible dedupe → `runner.ts`; every direct scheduler caller and fallback/stride/resource oracle → owned smokes.
- **Checkpoint**: queued mode is independently deterministic and all direct tests use it, while the existing coordinator-compatible entry remains available. No active >=20k product journey is broken before harness capture is switched.
- **Acceptance path**: validated queued record → exact source lookup/digest → attempted record → strict observer result → strict reflector result → exact close → optional six/four compactor pending. Literal call traces, queued IDs, append types/order, busy state, and pending cardinality are external oracles; failed model output cannot authorize progress.
- **Counterexample pass**: later B/C branch entries could enter A if the scheduler rebuilt a live snapshot after awaiting. The task must freeze A's recorded source entries and assert B/C IDs never appear in A's prompts before allowing closure.

## Acceptance

- [ ] The scheduler makes zero model calls and appends no attempt/close for missing, invalid, stale, conflicting, overlapping, noncontiguous, or sub-20k queue state.
- [ ] While A is blocked in a fake observer, B and C persist; A's prompts contain only A IDs, the read-only busy signal reports busy without aborting A, then B and C drain once each in FIFO order.
- [ ] A new scheduler instance over the same persisted records resumes the oldest unresolved exact item.
- [ ] Observer, reflector, and eligible compactor each try Luna, Luna immediate retry, Sonnet 5, then one distinct visible `ctx.model`, stopping at the first strict valid result.
- [ ] Every candidate in one phase receives byte-equivalent immutable input; later branch entries and prior failed output never enter it.
- [ ] Fallback exhaustion appends no close or pending, leaves the queued item retryable, and emits only scrubbed bounded diagnostics.
- [ ] Six/four compactor eligibility, 160k no-truncation behavior, stale aborts, one active worker per branch, and exact citation/identity checks remain intact.

## Constraints

- Preserve `pm:o:`, `pm:r:`, cycle/snapshot identities, exact citations, one active branch worker, prompt cap, no truncation, and lifecycle diagnostic scrubbing.
- Exact queue records are the queued path's source of truth; an in-memory wake-up may prompt a re-read but may not carry source content or order.
- The busy interface is observation only: it must not abort, lease, drain, mutate, or expose source payload.
- Keep tests in-process with fake runtimes and no stateful resources.

## NOT TO DO

- Do not modify `runtime/coordinator.ts`, compaction engine/pending, installers, README, config, recall, project memory, or emergency production modules.
- Do not append queued records from the worker, coalesce later entries into an active item, add model dependencies/config, create a second worker service, or consume a queue item on fallback exhaustion.
- Do not preserve the old two-failure suppression for queued exhaustion if it makes the persisted item permanently unretryable.
- Return `BLOCKED` if one phase cannot keep exact immutable input across all candidates or if compactor fallback would run before six valid cycles.

## Validation

- `node extensions/test/plastic-memory-workers.smoke.mjs && node extensions/test/plastic-memory-model-fallback.smoke.mjs && node extensions/test/plastic-memory-emergency-queue.smoke.mjs` — exact FIFO, non-aborting busy state, and normal fallback traces pass.
- `node extensions/test/plastic-memory-chunking.smoke.mjs && node extensions/test/plastic-memory-stride.smoke.mjs && node extensions/test/plastic-memory-fresh-session.smoke.mjs` — atomicity, cap, stride, and restart boundaries pass.
- `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done` — all Plastic smokes pass.
- `git diff --check -- extensions/plastic-memory/session/cycles.ts extensions/plastic-memory/workers/scheduler.ts extensions/plastic-memory/workers/runner.ts extensions/test/plastic-memory-workers.smoke.mjs extensions/test/plastic-memory-model-fallback.smoke.mjs extensions/test/plastic-memory-emergency-queue.smoke.mjs extensions/test/plastic-memory-chunking.smoke.mjs extensions/test/plastic-memory-stride.smoke.mjs extensions/test/plastic-memory-fresh-session.smoke.mjs` — no whitespace errors.

## Stop If

- Queue retryability requires treating queued as attempted/closed, or any fallback candidate needs mutable/live source reconstruction.
- A direct scheduler checkpoint cannot preserve the 160k/tool atomicity or one-worker branch invariant.

## Checkpoint

- Recovery snapshot: required for shared scheduler/cycles/runner files and the large existing smokes before editing.
- Commit scope: `extensions/plastic-memory/session/cycles.ts`, `extensions/plastic-memory/workers/scheduler.ts`, `extensions/plastic-memory/workers/runner.ts`, `extensions/test/plastic-memory-workers.smoke.mjs`, `extensions/test/plastic-memory-model-fallback.smoke.mjs`, `extensions/test/plastic-memory-emergency-queue.smoke.mjs`, `extensions/test/plastic-memory-chunking.smoke.mjs`, `extensions/test/plastic-memory-stride.smoke.mjs`, `extensions/test/plastic-memory-fresh-session.smoke.mjs`.
