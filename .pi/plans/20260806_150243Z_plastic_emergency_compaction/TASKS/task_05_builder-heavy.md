# Task 05: Add an exclusive scheduler lease for inline emergency observation

**Agent**: builder-heavy  
**Why**: An inline emergency observer must not overlap the scheduler’s active observer, and abort/release races can corrupt queue semantics if handled only in the coordinator.  
**Goal**: The cycle scheduler can synchronously reserve exclusive observer ownership, abort and await any active job, defer normal triggers while leased, and release exactly once without losing the queued reschedule.

## Read

- `extensions/plastic-memory/workers/scheduler.ts` — active job, controllers, queued reschedule, terminal snapshots, and invalidation lifecycle.
- `extensions/plastic-memory/workers/runner.ts` — abort signal behavior used by active role calls.
- `extensions/test/plastic-memory-workers.smoke.mjs` — stale abort and one-snapshot scheduling behavior.
- `extensions/test/plastic-memory-chunking.smoke.mjs` — multi-chunk observer retry and no-partial-record behavior.

## Change

- `extensions/plastic-memory/workers/scheduler.ts` — MODIFY — add a generation-safe exclusive lease used by host-critical emergency work: reserve before awaiting, abort/await the current job, suppress new starts while held, preserve at most one reschedule request, and release/idempotently invalidate without changing normal trigger behavior.
- `extensions/test/plastic-memory-emergency-queue.smoke.mjs` — CREATE — deterministic overlap, abort-settle, queued-trigger, release, invalidation, and no-late-append coverage.

## Proof

- **Semantic delta and anchors**: `CycleScheduler` currently serializes only calls entering `trigger`; an emergency pipeline called directly from the coordinator would bypass `activeJob`. `invalidate` aborts but does not provide a caller an awaited quiescence boundary.
- **Coverage receipt**: searched scheduler construction/call sites, `activeJob`, controller, `rescheduleQueued`, and scheduler invalidation references. **AFFECTED**: `scheduler.ts` and the new queue smoke. **UNAFFECTED**: runner abort mechanics are already sufficient; coordinator will consume the lease later; observer/reflector/compactor APIs and cycle record schemas need no queue edits. No second scheduler implementation or registry was found.
- **Closure**: synchronous lease reservation → active job abort → awaited settlement → exclusive emergency interval → release/reschedule is owned here. This task calls no emergency model pipeline and changes no coordinator state.
- **Checkpoint**: after this task alone, existing callers never acquire the lease, so normal scheduler traces remain unchanged. The new API is independently valid and reversible, with no later task required to restore scheduler operation.
- **Acceptance path**: CHANGE is observed through explicit deferred worker promises, abort signals, trigger counts, append logs, and one reschedule callback. PRESERVE is checked by existing workers/chunking smokes. The oracle controls promises directly rather than relying on timing sleeps.
- **Counterexample pass**: reserving only after awaiting permits a second trigger to start and fails the overlap trace; aborting without awaiting permits emergency work before the old worker settles and fails the settlement barrier; dropping `rescheduleQueued` fails the post-release trigger assertion.

## Contract

- Lease acquisition marks the scheduler unavailable synchronously, before its first promise yield.
- If an active job exists, acquisition aborts it through its existing controller and awaits the job’s settled result; late semantic results may not append after acquisition resolves.
- While leased, `trigger` starts no job, returns a bounded skipped/deferred result, and retains at most one latest reschedule callback.
- Release is idempotent, starts no work inline, and schedules the retained callback once through the established reschedule path.
- `invalidate`/shutdown/switch/fork/reload abort active work, clears queued callbacks, and invalidates any lease so a stale release cannot reopen the scheduler.

## Acceptance

- [ ] Lease ownership is reserved synchronously and two acquisitions cannot both succeed for the same scheduler epoch.
- [ ] Acquisition aborts and awaits an active observer/reflector/compactor job before resolving; no late record append occurs after the barrier.
- [ ] Triggers received while leased start zero worker/model calls and retain at most one reschedule opportunity.
- [ ] One idempotent release permits normal scheduling again and invokes the retained reschedule callback exactly once.
- [ ] Invalidation makes the lease stale, clears deferred work, and prevents a later stale release from restarting anything.
- [ ] Existing normal one-active-job, retry, chunking, terminal snapshot, and lifecycle behavior remains unchanged.

## Constraints

- Reuse the scheduler epoch, active job, controller, and reschedule state; do not introduce a second queue or global lock.
- Keep the API local/in-process and signal-based; no timers, files, settings, or external synchronization.

## NOT TO DO

- Do not run emergency observer/reflector/compactor work, append emergency records, or modify coordinator/engine files in this task.
- Do not treat abort dispatch alone as quiescence; acquisition must await the active job’s settlement.
- Do not permit normal triggers to start while leased or replay more than one queued reschedule.
- Do not change cycle identity, retry limits, persisted records, role prompts, config, dependencies, or files outside the write set.
- Return `BLOCKED` if an active job can append after the proposed acquisition barrier resolves.

## Validation

- `node extensions/test/plastic-memory-emergency-queue.smoke.mjs` — synchronous reservation, abort/await barrier, queued triggers, release, and invalidation pass.
- `node extensions/test/plastic-memory-workers.smoke.mjs` — normal scheduler lifecycle and stale abort pass.
- `node extensions/test/plastic-memory-chunking.smoke.mjs` — multi-chunk retry, atomicity, and no partial persistence pass.
- `node extensions/test/plastic-memory-stride.smoke.mjs` — normal detached compactor scheduling remains unchanged.

## Stop If

- Existing worker promises cannot be awaited without changing their externally observed result or retry bookkeeping.
- A queued reschedule cannot be retained without starting work inside release or introducing another queue.

## Checkpoint

- Recovery snapshot: required — snapshot `extensions/plastic-memory/workers/scheduler.ts` under `.pi/build/recovery/task_05/` before editing; exclude it from the product commit.
- Commit scope: only `extensions/plastic-memory/workers/scheduler.ts` and `extensions/test/plastic-memory-emergency-queue.smoke.mjs`.
