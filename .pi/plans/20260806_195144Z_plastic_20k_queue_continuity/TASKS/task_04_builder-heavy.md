# Task 04: Make Plastic compaction passive and host-owned

**Agent**: builder-heavy  
**Why**: Removing autonomous and transient emergency application crosses the coordinator's worker, pending, host-hook, acknowledgement, and generation boundaries and must preserve all exact guards.  
**Goal**: Plastic only prepares verified normal compaction; Pi invokes it, the hook returns an exact pending or safely refreshes from valid closed cycles, and acknowledgement is visible before rebase.

## Read

- `extensions/plastic-memory/runtime/coordinator.ts` — autonomous state/methods, schedule compactor completion, pending matching, emergency pipeline, host hooks, acknowledgement, projection, and invalidation.
- `extensions/plastic-memory/compaction/engine.ts` — `validateClosedCycleSet`, six/four eligibility, pending construction, cut/details digests, and acknowledgement.
- `extensions/plastic-memory/compaction/pending.ts` — TTL, identity-versus-consumption split, and store behavior to preserve.
- `extensions/plastic-memory/workers/{scheduler,compactor,runner}.ts` — queue-worker busy state, normal closed-cycle compactor, and shared model fallback.
- `extensions/plastic-memory/compaction/emergency.ts` — read only to remove every active coordinator import/call; do not edit or delete it.
- `extensions/test/plastic-memory-{apply-cut,acknowledge,emergency-hook,integration,compaction,stride,emergency-pipeline,emergency-selection,worker-contract}.smoke.mjs` — autonomous, hook, acknowledgement, six/four, fallback, disconnected emergency fixtures, and compactor contract fixture journeys to change/preserve.

## Change

- `extensions/plastic-memory/runtime/coordinator.ts` — MODIFY — remove reachable emergency imports/state/pipeline, internal compaction instructions, nonce/latch/retry machinery, `maybeApply`, every `ctx.compact()` call, application threshold, and `Nothing to compact` notices; keep background normal preparation; make `agent_settled` schedule/drain only; make `session_before_compact` consume an exact usable pending or, only when the queue worker is idle, run normal compactor fallback over an immutable already-durable eligible closed-cycle window, otherwise cancel; on success append and validate `plastic.compaction.applied`, carry verified cumulative state, then rebase/bootstrap.
- `extensions/plastic-memory/compaction/engine.ts` — MODIFY — make each closed cycle's recomputed exact source-token estimate >=20,000 part of `validateClosedCycleSet` before six/four selection or compactor invocation; preserve every branch/digest/contiguity/cut/physical-budget/acknowledgement guard.
- `extensions/test/plastic-memory-apply-cut.smoke.mjs` — MODIFY — replace autonomous threshold/nonce assertions with exact pending hook use, descendant/cut/TTL rejection, no `ctx.compact()`, and raw-context preservation on cancel.
- `extensions/test/plastic-memory-acknowledge.smoke.mjs` — MODIFY — drive ordinary host hook results directly and prove applied-record visibility precedes rebase/bootstrap for successive cumulative boundaries.
- `extensions/test/plastic-memory-emergency-hook.smoke.mjs` — MODIFY — replace transient emergency acceptance with passive manual/threshold/overflow cases: pending match, safe closed-cycle refresh, no-pending cancel, busy-worker cancel without abort, fallback order/exhaustion, and no raw/native/synthetic result.
- `extensions/test/plastic-memory-integration.smoke.mjs` — MODIFY — remove nonce/autonomous probes and assert repeated `turn_end`/`agent_settled` never invokes `ctx.compact()`, pending waits, and active hook imports contain no emergency path.
- `extensions/test/plastic-memory-compaction.smoke.mjs` — MODIFY — use >=20k cycle fixtures and add sub-20k cycle-set rejection before the compactor callback.
- `extensions/test/plastic-memory-stride.smoke.mjs` — MODIFY — retain exact six/four and physical-budget oracles using honest >=20k cycles and shared fallback expectations.
- `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs` — MODIFY — retain the disconnected pure semantic-pipeline regression shape but make every closed-cycle fixture >=20k, so the global closed-cycle validator never accepts a tiny-cycle exception.
- `extensions/test/plastic-memory-emergency-selection.smoke.mjs` — MODIFY — retain disconnected selector coverage using whole 20k closed-cycle fixtures; do not assert a below-threshold cycle is eligible.
- `extensions/test/plastic-memory-worker-contract.smoke.mjs` — MODIFY — make direct compactor closed-cycle fixtures >=20k so strict engine eligibility is tested honestly.

## Proof

- **Semantic delta and anchors**: coordinator `schedule()` calls `maybeApply()` after preparation; `agent_settled` calls it again; `maybeApply()` gates on 20k application usage and invokes `ctx.compact()` with nonce/latch callbacks; ordinary no-pending hooks run `prepareEmergencyCompaction()` from raw source. `engine.validateClosedCycleSet()` proves exact spans/digests but not the 20k source minimum.
- **Coverage receipt**: searched every `ctx.compact`, internal instruction, apply latch/intent, emergency import/call, `Nothing to compact`, pending store use, direct host-hook invocation, compaction acknowledgement reader, generation rebase, `priorState`, and closed-cycle engine caller under `extensions/plastic-memory` and all Plastic smokes. **AFFECTED**: coordinator, engine, and nine listed smokes. **UNAFFECTED**: `pending.ts` already has correct TTL/identity/consumption separation; queued scheduler and shared fallback are sufficient; emergency modules can remain disconnected; recall's branch-local older-generation guards remain unchanged.
- **Closure**: autonomous/removal delta → coordinator state/method/hook registration; sub-20k closed-cycle defense → engine cycle-set gate; exact pending/refresh/fallback → coordinator using existing compactor/runner; host boundary → existing acknowledgement plus visible-record proof → state carry/rebase/bootstrap; changed/preserved journeys → owned smokes.
- **Checkpoint**: after this task alone, no active callback calls `ctx.compact()`, every enabled host attempt returns Plastic or `{ cancel: true }`, compactor work has six valid >=20k closes, and success cannot rebase before a visible exact applied record. Full smokes execute this final active behavior without later restoration.
- **Acceptance path**: background queued closes → strict engine stride → verified pending waits; or host hook → immutable closed-cycle stride → strict compactor fallback → exact pending consume → returned compaction → host append → exact acknowledgement append/visibility → state-preserving rebase/bootstrap. Oracles count model calls, `ctx.compact()` calls, hook return shapes, branch entry order, generation, and raw source retention.
- **Counterexample pass**: refreshing while an observer is active could abort or race queued flow; the hook must observe busy state and cancel without acquiring the old aborting lease. Rebasing before applied visibility could strand queue/citations; branch order assertions prevent it.

## Acceptance

- [ ] Repeated `turn_end`, worker completion, and `agent_settled` events invoke `ctx.compact()` zero times; `agent_settled` only schedules/drains durable queue work.
- [ ] A usable exact pending is returned for manual, threshold, or overflow host hooks and remains subject to binding/prefix/cut/digest/TTL/physical-tail checks.
- [ ] Without a pending, the hook prepares only from six valid durable >=20k closed cycles with the normal model fallback; fewer cycles, invalid queue/cycles, busy worker, timeout, or exhaustion returns `{ cancel: true }` with no semantic/source/pending side effect.
- [ ] No coordinator import/call reaches transient emergency selection/finalization, native summary content, fake cycle, or synthetic continuation message.
- [ ] Six/four retention remains exact; one sub-20k closed cycle makes the entire compaction window ineligible before a compactor model call.
- [ ] A successful host boundary appends exactly one valid `plastic.compaction.applied`, verifies it on the branch, carries verified cumulative state, and only then rebases/bootstrap; mismatch/failure does not claim success.
- [ ] Binding, branch, digest, cut, TTL, citation, scrub, projection, current-branch older-generation exact recall, and diagnostic privacy guards remain intact.

## Constraints

- Host reason does not weaken Plastic validation: manual/threshold/overflow share the same pending-or-cancel extension contract.
- Hook refresh may consume only immutable, already-closed, queue-backed cycles and must use the normal fallback order over exact input.
- Preserve the public physical-budget proof and newest-four retention; no pressure-based smaller normal suffix.

## NOT TO DO

- Do not call `ctx.compact()` anywhere, synthesize user/assistant content, return `undefined` for an enabled no-pending hook, use Pi native summary, or recreate observer semantics from raw source.
- Do not edit/delete `compaction/emergency.ts` or its pure tests, patch the installed host, modify installers/README, change model context limits, add flags/dependencies, or weaken acknowledgement/pending/cut tests.
- Do not abort an active queue worker to service compaction and do not rebase before an applied record is both appended and validated.
- Return `BLOCKED` if safe hook refresh requires transient raw source, an active-worker abort, or a synthetic continuation.

## Internal Execution Order

Before TODO creation or source mutation, create and fill `.pi/build/TILL-DO_task-04.md` with evidence-backed `PASS | BLOCKED` gates for authority/baseline, contract/scope, validation/resources, and recovery/stop. Only all-`PASS` permits `.pi/build/TODO_task-04.md`, mirrored from these phases; a blocked gate returns `BLOCKED` with no source mutation.

1. **Eligibility defense** — authorized target: `compaction/engine.ts` and its compaction/stride fixtures; prerequisite: shared source-token estimator; exit: sub-20k set fails before callback and six/four >=20k controls pass.
2. **Passive state removal** — authorized target: coordinator imports/fields, compactor completion, `maybeApply`, and `agent_settled`; prerequisite: queue drain already active; exit: static and runtime zero-`ctx.compact` proof.
3. **Host hook and acknowledgement** — authorized target: coordinator pending/refresh hooks and rebase path; prerequisite: idle/busy and fallback evidence; exit: pending/refresh/cancel plus acknowledgement-before-rebase fixtures pass.
4. **Journey reconciliation** — authorized targets: the four remaining lifecycle smokes; prerequisite: production paths complete; exit: all affected `PRESERVE | CHANGE | REMOVE` journeys and full Plastic loop pass before selective commit.

## Validation

- `node extensions/test/plastic-memory-compaction.smoke.mjs && node extensions/test/plastic-memory-stride.smoke.mjs` — >=20k six/four eligibility and no-call rejection pass.
- `node extensions/test/plastic-memory-apply-cut.smoke.mjs && node extensions/test/plastic-memory-acknowledge.smoke.mjs && node extensions/test/plastic-memory-emergency-hook.smoke.mjs && node extensions/test/plastic-memory-integration.smoke.mjs` — passive hook, fallback, cancellation, acknowledgement, and zero-autonomous-call observations pass.
- `if grep -nE 'ctx\.compact|prepareEmergencyCompaction|selectEmergencyWindow|internalCompactionInstructions|applyLatch|Nothing to compact' extensions/plastic-memory/runtime/coordinator.ts; then exit 1; fi` — no removed active lifecycle marker remains.
- `node extensions/test/plastic-memory-emergency-pipeline.smoke.mjs && node extensions/test/plastic-memory-emergency-selection.smoke.mjs && node extensions/test/plastic-memory-worker-contract.smoke.mjs` — disconnected emergency and compactor-contract fixtures honor >=20k closed-cycle invariant.
- `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done` — all Plastic smokes pass.
- `git diff --check -- extensions/plastic-memory/runtime/coordinator.ts extensions/plastic-memory/compaction/engine.ts extensions/test/plastic-memory-apply-cut.smoke.mjs extensions/test/plastic-memory-acknowledge.smoke.mjs extensions/test/plastic-memory-emergency-hook.smoke.mjs extensions/test/plastic-memory-integration.smoke.mjs extensions/test/plastic-memory-compaction.smoke.mjs extensions/test/plastic-memory-stride.smoke.mjs extensions/test/plastic-memory-emergency-pipeline.smoke.mjs extensions/test/plastic-memory-emergency-selection.smoke.mjs extensions/test/plastic-memory-worker-contract.smoke.mjs` — no whitespace errors.

## Stop If

- The hook cannot distinguish a valid closed-cycle refresh from raw/transient source, or cannot cancel without interrupting active queue work.
- Applied-record visibility cannot be established before generation rebase/bootstrap while retaining cumulative state.

## Checkpoint

- Recovery snapshot: required for the coordinator, engine, and all nine large/preservation-critical smokes before editing.
- Commit scope: `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/plastic-memory/compaction/engine.ts`, `extensions/test/plastic-memory-apply-cut.smoke.mjs`, `extensions/test/plastic-memory-acknowledge.smoke.mjs`, `extensions/test/plastic-memory-emergency-hook.smoke.mjs`, `extensions/test/plastic-memory-integration.smoke.mjs`, `extensions/test/plastic-memory-compaction.smoke.mjs`, `extensions/test/plastic-memory-stride.smoke.mjs`, `extensions/test/plastic-memory-emergency-pipeline.smoke.mjs`, `extensions/test/plastic-memory-emergency-selection.smoke.mjs`, `extensions/test/plastic-memory-worker-contract.smoke.mjs`.
