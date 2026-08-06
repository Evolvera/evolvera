# Task 03: Cut the active harness over to durable FIFO capture

**Agent**: builder-heavy  
**Why**: Capture timing, restart binding, worker drain, and legacy-path removal must change together so the active extension never loses a qualifying terminal batch or calls a model for a tiny turn.  
**Goal**: The coordinator synchronously persists every qualifying queue item before worker scheduling, resumes valid unresolved work, and uses only the exact queued scheduler path.

## Read

- `extensions/plastic-memory/runtime/coordinator.ts` — `binding`, `ensureBootstrap`, `schedule`, worker append/current identity, lifecycle events, hook registration, and invalidation.
- `extensions/plastic-memory/workers/scheduler.ts` — additive queued path, active-job wake-up, and legacy aggregate path to remove.
- `extensions/plastic-memory/session/{cycles,ledger,bootstrap,types}.ts` — queue capture/reconstruction/resumable-lineage artifacts and existing bootstrap boundary.
- `extensions/test/plastic-memory-integration.smoke.mjs` — fake host append semantics, coordinator lifecycle, notices, and in-memory Pi fixture.
- `extensions/test/plastic-memory-emergency-hook.smoke.mjs` — existing coordinator/worker-overlap fixture that must remain checkpoint-valid using honest queued >=20k cycles until passive hook replacement.
- `extensions/test/plastic-memory-{workers,emergency-queue,chunking}.smoke.mjs` — every remaining direct scheduler caller discovered in the failed-plan closure audit; migrate each to an explicit valid queued item or a queue-rejection oracle before removing the legacy scheduler branch.

## Change

- `extensions/plastic-memory/runtime/coordinator.ts` — MODIFY — recover only a fully valid current-branch queue binding for the stable session; synchronously capture and append every newly crossed FIFO item at completed terminal boundaries before runtime availability/worker speed checks; pass refreshed exact queue state plus distinct visible model to the scheduler; drain on `turn_end` and let `agent_settled` schedule/drain; reject malformed queue state before worker work.
- `extensions/plastic-memory/workers/scheduler.ts` — MODIFY — remove the legacy live aggregate/one-cycle-per-turn entry path and make durable queue reconstruction the only scheduling source; retain one-worker, stale/abort, compactor, and durable wake-up behavior.
- `extensions/test/plastic-memory-integration.smoke.mjs` — MODIFY — observe actual coordinator queue appends and calls at 19,999/20,000, multi-batch capture, runtime-unavailable capture, active-worker B/C capture, restart resume, and malformed no-call behavior while preserving projection/registration/in-memory host coverage.
- `extensions/test/plastic-memory-emergency-hook.smoke.mjs` — MODIFY — make the still-reachable pre-passive hook fixtures use valid queue-backed >=20k closed cycles, preserving the full-suite checkpoint without reintroducing raw/sub-20k capture.
- `extensions/test/plastic-memory-workers.smoke.mjs` — MODIFY — replace every source-derived closure/retry/semantic-result/stale direct scheduler fixture with the same explicit valid queued-item lifecycle; preserve those behavior oracles without keeping a legacy scheduler route.
- `extensions/test/plastic-memory-emergency-queue.smoke.mjs` — MODIFY — seed the lease/reschedule fixture with a valid >=20k queued item so the preview/lease path cannot exercise a 20-token legacy snapshot.
- `extensions/test/plastic-memory-chunking.smoke.mjs` — MODIFY — migrate valid scheduler cases to exact queued items and change malformed/indivisible source-derived scheduler cases into explicit queue-rejection or direct partition assertions; retain cap/tool-integrity proof without legacy execution.

## Proof

- **Semantic delta and anchors**: `coordinator.schedule()` currently returns before capture when no runtime exists and asks the scheduler to derive a live completed prefix; `turn_end` is the completed boundary, while `agent_settled` currently calls autonomous application only. `CycleScheduler.trigger()` still has the legacy source-derived path alongside the queued path.
- **Coverage receipt**: failed-plan closure audit searched coordinator construction from `index.ts`, all lifecycle hooks, binding/generation/bootstrap use, every `schedule`/reschedule call, scheduler entry exports, direct test callers, and queue/closed record readers. **AFFECTED**: coordinator, scheduler legacy cutover, integration runtime journey, emergency-hook checkpoint fixture, and every remaining raw direct scheduler fixture in `workers`, `emergency-queue`, and `chunking` smokes. **UNAFFECTED**: `model-fallback`, `fresh-session`, `stride`, and queue-backed chunking fixtures already seed valid queued items; root registration already supplies runtime and visible context; session queue kernel owns batching/validation; worker adapters own strict outputs; passive compaction behavior remains for the next bounded lifecycle change.
- **Closure**: terminal-boundary event → coordinator capture/append; restart/reload → queue lineage binding recovery; exact persisted queue → scheduler input; active worker plus later boundaries → durable append plus wake-up; final removal of source-derived scheduling → scheduler; observable appends/calls/restart/fail-closure → integration smoke.
- **Checkpoint**: after this task alone, 19,999 cannot reach attempt/model work, >=20k batches are durably schedulable, runtime absence does not lose capture, and every direct scheduler test already uses the queue path. No later task is needed to restore capture validity.
- **Acceptance path**: fake host terminal entries → synchronous `pi.appendEntry(plastic.cycle.queued)` → current branch re-read → oldest exact scheduler item → role traces/attempt/close; restart creates a new coordinator over the persisted branch and must select the same oldest IDs/digest. Assertions inspect actual branch entries and call traces rather than coordinator-private flags.
- **Counterexample pass**: if binding is randomized before examining persisted queue state, restart silently strands valid work; if capture waits for runtime or the active worker, B/C disappear. Both must be covered by fixtures before the legacy scheduler branch is removed.

## Acceptance

- [ ] `turn_end` appends no queue/attempt/model call at 19,999 and appends exactly one deterministic queued item at 20,000.
- [ ] Capture appends all newly crossed batches synchronously even with no runtime or while A is active; a sub-20k remainder stays unqueued.
- [ ] Worker A never sees later B/C entries, and durable wake-up drains B then C without duplicate capture.
- [ ] A fresh coordinator over the same valid current branch resumes the oldest unresolved exact item; stale/ambiguous/no-queue lineage is not revived.
- [ ] Malformed, overlapping, conflicting, off-branch, or noncontiguous queue state prevents capture extension and makes zero worker/model calls.
- [ ] No active scheduler path derives a cycle directly from the latest completed live prefix or appends an attempt without an exact queued record.
- [ ] Existing projection, registration, bootstrap historical-gap, invalidation, lifecycle scrubbing, and still-temporary normal/emergency compaction tests remain valid at this checkpoint.

## Constraints

- Capture must precede runtime lookup and asynchronous worker work at each terminal boundary.
- Preserve current session ID digest provenance, successful-compaction generation semantics, one worker per branch, exact worker append revalidation, and diagnostic privacy.
- Patch only named coordinator scheduling/binding sections and scheduler entry/drain sections; preserve context projection and unrelated hooks.

## NOT TO DO

- Do not yet redesign `session_before_compact`, `session_compact`, pending TTL, `maybeApply`, nonce/latch state, or emergency compaction internals; this checkpoint owns capture/drain cutover only.
- Do not call `ctx.compact()`, synthesize messages, change config, modify root registration, recall, installers, README, or project memory.
- Do not use an in-memory list as queue truth or recover a binding from legacy attempted/closed records without valid queued state.
- Return `BLOCKED` if synchronous append cannot be observed on the current branch before scheduling, or restart can only work by accepting stale/ambiguous lineage.

## Internal Execution Order

Before TODO creation or source mutation, create and fill `.pi/build/TILL-DO_task-03.md` with evidence-backed `PASS | BLOCKED` gates for authority/baseline, contract/scope, validation/resources, and recovery/stop. Only all-`PASS` permits `.pi/build/TODO_task-03.md`, mirrored from these phases; a blocked gate returns `BLOCKED` with no source mutation.

1. **Capture/binding readiness** — authorized targets: coordinator binding/bootstrap/schedule methods and queue-kernel reads; prerequisite: exact baseline and recovery snapshot; exit: restart/capture fixture design names literal branch entries and expected queue records.
2. **Harness capture activation** — authorized target: `runtime/coordinator.ts`; prerequisite: valid queue reconstruction artifact; exit: focused integration cases observe synchronous no-runtime and active-worker capture.
3. **Legacy worker cutover** — authorized target: `workers/scheduler.ts`; prerequisite: coordinator passes exact queued state; exit: no source-derived trigger remains and queued direct smokes pass.
4. **Checkpoint preservation** — authorized targets: integration, emergency-hook, workers, emergency-queue, and chunking smokes; prerequisite: production behavior complete; exit: focused tests, full Plastic loop, diff review, and selective checkpoint are clean.

## Validation

- `node extensions/test/plastic-memory-integration.smoke.mjs && node extensions/test/plastic-memory-emergency-hook.smoke.mjs` — actual coordinator branch records/calls and the checkpoint-preserved hook fixture pass.
- `node extensions/test/plastic-memory-queue.smoke.mjs && node extensions/test/plastic-memory-workers.smoke.mjs && node extensions/test/plastic-memory-emergency-queue.smoke.mjs && node extensions/test/plastic-memory-chunking.smoke.mjs && node extensions/test/plastic-memory-fresh-session.smoke.mjs` — lineage, direct scheduler cutover, active-worker FIFO, atomicity, and restart paths pass.
- `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done` — all Plastic smokes pass after active cutover.
- `git diff --check -- extensions/plastic-memory/runtime/coordinator.ts extensions/plastic-memory/workers/scheduler.ts extensions/test/plastic-memory-integration.smoke.mjs extensions/test/plastic-memory-emergency-hook.smoke.mjs extensions/test/plastic-memory-workers.smoke.mjs extensions/test/plastic-memory-emergency-queue.smoke.mjs extensions/test/plastic-memory-chunking.smoke.mjs` — no whitespace errors.

## Stop If

- Pi append semantics do not make queue capture durable at the terminal callback boundary, or a model call can start before queue append/validation.
- Restart requires carrying mutable in-memory scheduler state or accepting a stale generation.

## Checkpoint

- Recovery snapshot: required for the 847-line coordinator, shared scheduler, and every owned lifecycle/direct-scheduler smoke before editing.
- Commit scope: `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/plastic-memory/workers/scheduler.ts`, `extensions/test/plastic-memory-integration.smoke.mjs`, `extensions/test/plastic-memory-emergency-hook.smoke.mjs`, `extensions/test/plastic-memory-workers.smoke.mjs`, `extensions/test/plastic-memory-emergency-queue.smoke.mjs`, `extensions/test/plastic-memory-chunking.smoke.mjs`.
