# Task 07: Make the host hook own emergency compaction and rebase after acknowledgement

**Agent**: builder-heavy  
**Why**: This checkpoint coordinates an awaited host hook, scheduler exclusivity, model work, branch side effects, pending consumption, acknowledgement, generation state, and post-rebase recall.  
**Goal**: Manual, threshold, and overflow hooks use a valid normal pending or prepare emergency inline; failures cancel raw-safe, and successful emergency boundaries acknowledge then rebase into contiguous new-generation cycles.

## Read

- `extensions/plastic-memory/runtime/coordinator.ts` — hook branching, pending guards, mutable latches, append path, `session_compact`, and rebase/bootstrap.
- `extensions/plastic-memory/compaction/emergency.ts` — side-effect-free emergency pipeline result.
- `extensions/plastic-memory/compaction/engine.ts` — final pending and acknowledgement contract.
- `extensions/plastic-memory/compaction/pending.ts` — pending TTL/branch/runtime consumption rules.
- `extensions/plastic-memory/workers/scheduler.ts` — exclusive lease and normal trigger lifecycle.
- `extensions/plastic-memory/session/bootstrap.ts` — post-boundary active-context bootstrap.
- `extensions/plastic-memory/session/ledger.ts` — applied-record branch validation.
- `extensions/plastic-memory/session/recall.ts` — exact lookup and broad search boundaries.
- `extensions/plastic-memory/session/types.ts` — existing persisted record shapes.
- `extensions/test/plastic-memory-apply-cut.smoke.mjs` — direct normal/internal hook and cut guards.
- `extensions/test/plastic-memory-acknowledge.smoke.mjs` — two-hook lifecycle and recovery.
- `extensions/test/plastic-memory-integration.smoke.mjs` — nonce overlap, projection, and Pi lifecycle.
- `extensions/test/plastic-memory-retrieval.smoke.mjs` — branch-local exact recall/search.
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` — read-only host hook await and append sequence.
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js` — read-only current-leaf append and context rebuild behavior.

## Change

- `extensions/plastic-memory/runtime/coordinator.ts` — MODIFY — make `session_before_compact` awaited; preserve internal nonce and usable-normal-pending priority; acquire scheduler exclusivity and execute emergency preparation when no pending is usable; append successful semantic records only after branch revalidation; stage/consume the fresh pending; cancel on every emergency failure; and perform emergency acknowledgement → applied-record validation → rebase/bootstrap in order.
- `extensions/plastic-memory/session/recall.ts` — MODIFY — allow exact namespaced observation/reflection recall from an older generation only when its valid record is on the supplied current branch; keep broad search/fold generation scoping and all malformed/off-branch guards.
- `extensions/test/plastic-memory-emergency-hook.smoke.mjs` — CREATE — observable host-hook, queue handoff, append, cancellation, overlap, acknowledgement, rebase, post-boundary cycle, normal stride, and recall journey.
- `extensions/test/plastic-memory-apply-cut.smoke.mjs` — MODIFY — await every direct hook call and update no-usable-pending outcomes to emergency cancellation while retaining independent cut/branch/pending assertions.
- `extensions/test/plastic-memory-acknowledge.smoke.mjs` — MODIFY — await direct hook calls and assert emergency-only applied-before-rebase ordering without weakening normal repeat/failure recovery.
- `extensions/test/plastic-memory-integration.smoke.mjs` — MODIFY — await nonce probe hook calls and preserve overlap/private-prefix/Pi 0.83.0 lifecycle assertions.

## Proof

- **Semantic delta and anchors**: the coordinator currently returns `undefined` whenever ordinary pending use fails, which enables native summary; successful acknowledgement currently appends `plastic.compaction.applied` but does not emergency-rebase. Host code awaits the handler and appends the returned compaction to the current leaf. `recallSession` filters Plastic records by current binding, so emergency IDs become unreachable after the required generation change.
- **Coverage receipt**: searched coordinator hook registrations/state fields, every direct `session_before_compact` smoke invocation, scheduler construction/invalidation, `PLASTIC_COMPACTION_APPLIED` readers, bootstrap/fold/recall paths, root registration, commands, and projection. **AFFECTED**: `coordinator.ts`, exact recall in `recall.ts`, the three async direct-hook smokes, and the new emergency journey smoke. **UNAFFECTED**: the scheduler’s completed lease, pending, bootstrap, ledger, and types APIs already represent/validate the transition; projection recognizes existing cumulative details; `index.ts` already supplies registry/context; commands need no `/compact`. No local call site remains unresolved.
- **Closure**: hook ownership/model input (`ctx.model`, signal, public budget) and queue handoff → coordinator; semantic record append/current-branch validation → coordinator and existing types; pending/ack → existing engine/pending; new-generation bootstrap → existing bootstrap; actionable old-generation IDs → exact recall only; affected direct tests/new journey are owned here.
- **Checkpoint**: after this task alone, every host-delivered ordinary compaction event while enabled returns either a verified Plastic compaction or `{ cancel: true }`. A successful emergency boundary is independently valid at commit: the normal observer is quiesced, applied record/bootstrap are visible, retained context builds, exact recall works, and later cycles close/qualify without repair.
- **Acceptance path**: CHANGE is traced from hook event through scheduler barrier, captured model calls, returned compaction, branch append order, generation, bootstrap, later cycle IDs, and recall. PRESERVE normal pending/internal nonce/projection/six-four paths run existing tests. Oracles inspect explicit promises, branch arrays, append logs, generations, and call counters rather than status prose.
- **Counterexample pass**: starting emergency before scheduler settlement fails the queue barrier trace; appending before full success fails all-model-failure counts; rebasing before applied validation fails exact record order; allowing native fallback fails the required cancel result; widening recall off-branch fails the second branch fixture.

## Contract

- **Internal private-prefix event**: use the existing one-use nonce path only; invalid/stale/overlapping nonce cancels before model work.
- **Ordinary event with usable normal pending**: consume and return the existing prepared view exactly as before; do not acquire emergency exclusivity or change normal rebase behavior.
- **Ordinary event without usable pending**: acquire the scheduler’s generation-safe exclusive lease before emergency worker work. Capture branch, binding, budget, cycles, project snapshot, active memory, signal, and usable `ctx.model`; run the emergency pipeline only after prior scheduler work settles; revalidate exact generation/branch before append.
- **Emergency success**: append returned observation/reflection records, confirm the branch is only the captured prefix plus those appends, stage/consume the fresh pending against the current branch, set emergency in-flight state, return verified compaction with host `tokensBefore`, and release the scheduler lease without starting work inline.
- **Emergency failure/stale/abort/structural impossibility**: release/invalidate the lease and return `{ cancel: true }`; do not expose model content or invoke native summary.
- **Emergency `session_compact`**: validate host entry/pending; append `plastic.compaction.applied`; read/fold branch to prove that record valid; only then invalidate and bootstrap retained active context. Normal pending acknowledgement stays on its established path.
- **Exact recall**: older-generation lookup is namespaced, exact, current-branch-only, and source/support validated; search remains current-generation scoped.

## Acceptance

- [ ] The awaited ordinary hook prefers a usable normal pending and otherwise acquires one exclusive emergency interval for manual, threshold, and overflow reasons, including 0/1/2/3-cycle fixtures.
- [ ] Active normal observer work is aborted/settled before emergency calls; overlapping ordinary hooks produce at most one emergency pipeline and one compaction result.
- [ ] All-model failure, timeout, stale branch, unavailable runtime/model, unsafe cut, and structural impossibility return `{ cancel: true }`, append no host compaction, and preserve raw context for retry.
- [ ] Success appends only validated existing observation/reflection records, returns verified cumulative details/cut, and never appends attempted/closed-cycle records for the transient span.
- [ ] Matching emergency host append is followed by exactly one valid `plastic.compaction.applied`, then generation increment/bootstrap; no successful rebase occurs before applied-record validation.
- [ ] Retained raw tail contains protected cycles/open turn, exact emergency IDs remain branch-locally recallable after rebase, and off-branch lookup remains unavailable/not found.
- [ ] New-generation cycles are contiguous and normally six/four eligible; existing normal pending, internal apply, projection, acknowledgement recovery, queue rescheduling, and 20k application threshold remain green.

## Constraints

- Use `event.signal`, public `ctx.getContextUsage()`/system prompt budget, and `ctx.model`; if current model is absent/invalid, the chain ends at Sonnet 5.
- Release or invalidate the exclusive lease on every success, failure, abort, branch change, session invalidation, switch, fork, tree, reload, and shutdown path.
- A semantic-record append failure may leave only independently valid existing records; cancel without staging/returning a compaction.
- Update direct hook tests to `await`; do not make them pass through conditional synchronous returns.

## NOT TO DO

- Do not return `undefined` from an enabled ordinary no-usable-pending hook and thereby permit native summary content.
- Do not run emergency or acquire its lease for the exact internal nonce path or a usable normal pending.
- Do not overlap scheduler observer work with emergency observation, or treat abort dispatch without settlement as exclusive ownership.
- Do not rebase before host match, applied append, and applied-record visibility/validity.
- Do not persist a fake cycle, weaken pending guards, accept a non-user cut, split open turn/exchange, widen broad search, or allow off-branch exact recall.
- Do not add a command, setting, schema, dependency, migration, provider operation, live network call, or edit host files.
- Do not weaken host negative controls, overlap assertions, scrubbing, projection tests, or broadly format unrelated code.
- Return `BLOCKED` if the host result cannot carry verified summary/cut/details, scheduler quiescence cannot be held through the inline pipeline, or applied-record visibility cannot be proved before rebase.

## Validation

- `node extensions/test/plastic-memory-emergency-hook.smoke.mjs` — observe queue barrier, hook result/cancel, calls, record order, retained tail, rebase/bootstrap, later cycles, and recall.
- `node extensions/test/plastic-memory-emergency-queue.smoke.mjs` — scheduler lease and reschedule behavior remains valid.
- `node extensions/test/plastic-memory-apply-cut.smoke.mjs` — awaited normal/internal cut ownership, stale pending, cancellation, and latch recovery pass.
- `node extensions/test/plastic-memory-acknowledge.smoke.mjs` — host boundary, applied validation, repeat/failure recovery, and emergency ordering pass.
- `node extensions/test/plastic-memory-integration.smoke.mjs` — Pi registration/projection/private nonce behavior passes asynchronously.
- `node extensions/test/plastic-memory-retrieval.smoke.mjs` — exact current-branch recall/search guards pass.
- `for name in compaction stride emergency-selection emergency-pipeline model-fallback workers; do node "extensions/test/plastic-memory-$name.smoke.mjs" || exit 1; done` — normal/emergency policy, fallback, and scheduler behavior remain valid.
- `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done` — all existing and new Plastic smokes pass.

## Stop If

- Relevant coordinator/test files are dirty from another owner or branch changes during the emergency pipeline cannot be detected before append.
- Host append/ack order differs from focused evidence, post-boundary bootstrap cannot isolate retained raw tail, or exact historical recall cannot remain current-branch-only.

## Checkpoint

- Recovery snapshot: required — snapshot the five existing owned files under `.pi/build/recovery/task_07/` before editing; exclude it from the product commit.
- Commit scope: only `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/plastic-memory/session/recall.ts`, `extensions/test/plastic-memory-emergency-hook.smoke.mjs`, `extensions/test/plastic-memory-apply-cut.smoke.mjs`, `extensions/test/plastic-memory-acknowledge.smoke.mjs`, and `extensions/test/plastic-memory-integration.smoke.mjs`.
