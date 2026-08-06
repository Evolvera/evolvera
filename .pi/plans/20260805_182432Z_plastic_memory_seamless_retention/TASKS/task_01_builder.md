# Task 01: Resume and repair retention/application ownership

**Agent**: builder  
**Why**: The uncommitted partial delta already crosses selector and host lifecycle boundaries, and the repaired request/state/cut must remain one independently valid checkpoint.  
**Goal**: Preserve the existing partial work while making Plastic the normal auto-compaction owner, deferring benign host refusal, rebasing real fallback boundaries, and selecting a whole-cycle emergency cut only from proved public context budget.

## Read

- `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_01/task-01.delta.patch` — immutable partial delta; recompute reported SHA-256 before repair
- `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_01/before/` — original eight-target baselines and dirty-content preservation boundary
- `.pi/build/TILL-DO_task-01.md` and `.pi/build/TODO_task-01.md` — stale completion claims to reopen as repair/resume state
- `extensions/plastic-memory/compaction/engine.ts` — `EngineInput`, `eligibleWindow`, whole-cycle cut, prior-state prefix, pending details, acknowledgement
- `extensions/plastic-memory/compaction/render.ts` — variable-length cumulative state and 48k summary bound; read only
- `extensions/plastic-memory/compaction/pending.ts` — one-slot TTL/identity/consume behavior; read only
- `extensions/plastic-memory/workers/compactor.ts` — detached request must use the same eligible set as final engine preparation
- `extensions/plastic-memory/workers/scheduler.ts` — confirm compaction engine input is passed through selector and producer; read only
- `extensions/plastic-memory/runtime/coordinator.ts` — public context budget, pending view, host advisory match, apply callback, both compaction hooks, invalidation/bootstrap
- `extensions/plastic-memory/session/bootstrap.ts` and `extensions/plastic-memory/compaction/projection.ts` — existing fallback-boundary/bootstrap and one-current-summary paths; read only
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` lines 1367–1432, 1607–1695, and 1905–1924 — read-only host preparation, extension-cut application, event, and callback behavior
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js` lines 194–226 — read-only active compaction boundary behavior
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` lines 209–260 and 452–460 — public usage/system/compact and `session_compact` surfaces
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.d.ts` lines 49–63 and `dist/index.d.ts` exports — public conservative `estimateTokens`; no private import
- `/tmp/pi-extension-research.isJk76/pi-observational-memory-3.0.3/package/src/hooks/compaction-trigger.ts` and `compaction-hook.ts` — settled-edge deferral and host-cut projection oracle; behavior only
- `/tmp/pi-extension-research.isJk76/pi-smart-compact-7.22.0/package/dist/index.js` around 6408–6432, 6647–6713, and 6916–6971 — one TTL/session-bound pending consumed by host hook; behavior only

## Change

- `extensions/plastic-memory/compaction/engine.ts` — MODIFY — preserve the current delayed all-older-cycle delta; add one deterministic normal/emergency retained-cycle selection driven by a conservative public context-budget input, include every emergency-folded cycle in the eligible request/state, and fail closed when no whole-cycle fit is proved
- `extensions/plastic-memory/runtime/coordinator.ts` — MODIFY — build/pass the budget from public context window/system prompt and public host-exported token helpers, recheck the prepared cut against current descendants at hook time, accept a valid Plastic cut regardless of host advisory ordering, classify exact `Nothing to compact` as deferred without clearing pending, and rebase state/bootstrap after an actual unmatched or non-Plastic compaction boundary
- `extensions/plastic-memory/workers/compactor.ts` — MODIFY — retain the current variable eligible-cycle contract and clarify that an emergency-folded member of the normally raw four is part of the same verified cumulative request, not a second summary
- `extensions/test/plastic-memory-compaction.smoke.mjs` — MODIFY — fixed C6/C8 normal and physical-emergency request/state/cut oracles, impossible-fit failure, and intact incomplete suffix
- `extensions/test/plastic-memory-stride.smoke.mjs` — MODIFY — normal and emergency selector → detached request → final preparation equality, with zero calls below six or on impossible fit
- `extensions/test/plastic-memory-apply-cut.smoke.mjs` — MODIFY — later host advisory acceptance, hook-time budget recheck, <=20k/unknown deferral, exact `Nothing to compact` pending preservation, later settled retry, and non-sticky guards
- `extensions/test/plastic-memory-acknowledge.smoke.mjs` — MODIFY — matching Plastic acknowledgement promotion plus unmatched/native/tampered actual-boundary rebase and stale-state invalidation
- `extensions/test/plastic-memory-integration.smoke.mjs` — MODIFY — public context/system/token-estimator fixture closure, one current fromHook Plastic result, and native fallback bootstrap/context behavior

## Proof

- **Semantic delta and anchors**: current `engine.ts:100–141` already selects all unacknowledged cycles before four; `coordinator.ts:298–314` still rejects an earlier Plastic cut when host advice is later; `maybeApply()` treats every callback error as failure; `session_compact` returns early with no in-flight pending. Host source proves the extension cut is applied verbatim, `Nothing to compact` occurs before the hook, and a real compaction event identifies the appended boundary.
- **Coverage receipt**: searched `extensions/plastic-memory/{compaction,runtime,session,workers}` and all `plastic-memory-{compaction,stride,apply-cut,acknowledge,integration,host,session}.smoke.mjs` references to cuts, pending, `priorState`, context usage/window/system prompt, token accounting, `fromExtension`/`fromHook`, bootstrap, projection, and acknowledgement. The three production files and five changed smokes are `AFFECTED`. `pending.ts` is `UNAFFECTED` because the host deferral occurs before consumption and its slot already replaces/expires safely. `render.ts` is `UNAFFECTED` because any nonempty variable cycle set is cumulative and identity-repaired. `scheduler.ts` is `UNAFFECTED` because it passes the engine contract to both selection and preparation. `bootstrap.ts` and `projection.ts` are `UNAFFECTED` because existing fresh-generation bootstrap and current-summary projection are sufficient. Host/config files are read-only.
- **Closure**: normal/emergency budget → coordinator public context/system inputs + public root token exports → engine whole-cycle retained count → scheduler selector → compactor request → final engine cut/pending/state; valid host auto → coordinator pending identity → extension summary/cut/details → host append → matching acknowledgement/prior-state promotion; exact host pre-hook deferral → callback classification → latch reset with pending retained; real non-Plastic/unmatched append → session event → coordinator invalidation + existing bootstrap → old-generation state excluded. Every modified representation is owned here.
- **Checkpoint**: after this task alone, `compaction`, `stride`, `apply-cut`, `acknowledge`, `integration`, `session`, and `host` smokes pass against the current working tree; fixed requests/cuts/call counts/state records prove validity without any worker-contract change.
- **Acceptance path**: normal C6/C8 and incomplete suffix are `CHANGE` with fixed cycle IDs and branch survivors; four-raw behavior is `PRESERVE` unless a fixed token fixture proves emergency; host-auto ordering, benign refusal, and native rebase are `CHANGE`; digest/ancestry/user cut/TTL/nonce/projection/citation behavior is `PRESERVE`; nothing is removed. Expected cuts and state membership are fixture constants, not derived from engine output.
- **Counterexample pass**: accepting host advice as a minimum cut lets native summary cut inside the four raw cycles; removing only that comparison fixes it while identity guards remain. Reusing a four-cycle pending after a large descendant suffix could still overflow, so hook-time post-cut accounting is required. Reusing old `priorState` after an actual unmatched append leaves unreachable IDs; the fresh bootstrap boundary closes that gap.
- **Wide-Task Receipt**: 8 product paths; semantic regions are deterministic selection/budget, detached compactor production, and host apply/ack/bootstrap. Attempted cuts: (a) kernel-only fails the emergency hook/application smoke because coordinator cannot prove the selected cut; (b) lifecycle-only leaves the existing uncommitted engine/compactor delta outside a valid checkpoint and cannot prove folded cycle membership; (c) separate fallback repair overlaps `coordinator.ts`, `acknowledge`, and `integration`. Atomic repair is selected. Exact checkpoint evidence is the seven named smokes plus fixed normal/emergency request IDs, hook reply, context survivors, fallback generation/bootstrap record, and final delta receipt.

## Acceptance

- [ ] C6 compacts C1/C2 and cuts at C3; delayed unacknowledged C8 compacts C1..C4 and cuts at C5; acknowledged C6 then C8 requests only C3/C4 while cumulative state remains C1..C4.
- [ ] Four raw closed cycles remain the default. A fixed budget that fits only three folds the oldest normally-retained cycle into the same model request/state and advances the cut by one whole cycle; impossible/unknown proof returns no Plastic compaction and never splits a cycle, incomplete turn, or tool-call/result sequence.
- [ ] A valid current pending is returned and consumed once when host auto advice is later than the Plastic cut; every branch/prefix/binding/runtime/TTL/latest-compaction/user-cut guard still rejects.
- [ ] Unknown/null/<=20,000 usage makes zero extension compact calls and retains pending. Exact `Nothing to compact (session too small)` is informational, clears only intent/latches, retains pending, makes no callback retry, and permits exactly one later call on a later settled high-usage edge.
- [ ] Matching `session_compact` appends one Plastic applied record and only then promotes its prepared state. An actual unmatched/native/non-Plastic boundary clears stale pending/prior state and bootstraps a fresh generation from the host active context without deleting history.
- [ ] Repeated compaction exposes one current verified Plastic summary/index to provider context; a latest native fallback remains the current host summary and old-generation recall records are not current.
- [ ] Existing source digest/ancestry, safe user cut, 300s TTL, consume/ack-once, nonce overlap guard, context projection, UI scrubbing, and all original dirty diagnostics remain intact.

## Constraints

- Do not revert the current eight-file partial delta. Preserve the original `before/` tree and `task-01.delta.patch` byte-for-byte.
- Use only public root exports from `@earendil-works/pi-coding-agent`; do not import `dist/core/...` in production or modify installed host files.
- Normal policy is exactly four raw closed cycles. Emergency reduction is allowed only from a conservative proved fit that includes effective system prompt, bounded Plastic summary, reserve, retained cycles, and incomplete suffix.
- Do not modify `pending.ts`, `render.ts`, `scheduler.ts`, `bootstrap.ts`, `projection.ts`, config/settings, worker observer/reflector behavior, or any undeclared path.
- Do not add a timer, callback retry, setting, flag, schema, dependency, second summary, or broad abstraction. No repo-wide formatting/codemod.
- Builders do not stage or commit and never run Pi/providers or inspect credentials.

## Internal Execution Order

Before TODO creation or source mutation, reopen `.pi/build/TILL-DO_task-01.md` as a repair/resume gate. Record `PASS | BLOCKED` for authority/baseline, contract/scope, validation/resources, and recovery/stop; recompute the supplied partial SHA, hash all current targets, and create `resume_before/` snapshots. Replace the stale completed TODO with phases below only after every gate is `PASS`.

1. **Resume and characterize** — all eight targets plus immutable recovery evidence; prerequisite: current bytes match the supplied partial patch and no target drift is unexplained; exit: fixed tests reproduce the later-host-cut defect, host-deferral behavior, native fallback stale-state risk, and physical-budget cases before production repair.
2. **Selection and physical policy** — `engine.ts`, `compactor.ts`, `plastic-memory-compaction.smoke.mjs`, `plastic-memory-stride.smoke.mjs`; prerequisite: public token helpers/context inputs are verified; exit: normal four, emergency whole-cycle fold, impossible fit, request/state/cut equality, and incomplete suffix pass.
3. **Host lifecycle ownership** — `coordinator.ts`, `plastic-memory-apply-cut.smoke.mjs`, `plastic-memory-acknowledge.smoke.mjs`, `plastic-memory-integration.smoke.mjs`; prerequisite: selected cut contract is stable; exit: advisory independence, hook recheck, exact benign refusal, matching ack, fallback rebase, and one-current-summary cases pass.
4. **Integrated recovery review** — all task targets; prerequisite: phases 1–3; exit: validation below, snapshot-to-current preservation review, final full-delta patch/hash, and selective-commit receipt are complete.

TILL-DO/TODO are transient execution state and excluded from the selective product checkpoint.

## Validation

- `node extensions/test/plastic-memory-compaction.smoke.mjs` — observes fixed normal/emergency requests, cumulative cycle IDs, cuts, impossible fit, and intact incomplete suffix
- `node extensions/test/plastic-memory-stride.smoke.mjs` — observes selector/request/final-preparation equality and zero model calls below six/impossible fit
- `node extensions/test/plastic-memory-apply-cut.smoke.mjs` — observes later host advice overridden, budget recheck, strict usage gate, exact benign callback classification, pending retention, later call count, and guard recovery
- `node extensions/test/plastic-memory-acknowledge.smoke.mjs` — observes consume/ack once, applied-only state promotion, and real fallback generation/bootstrap rebase
- `node extensions/test/plastic-memory-integration.smoke.mjs` — observes public host adapter/context/system behavior, one current fromHook Plastic summary, and latest native fallback context
- `node extensions/test/plastic-memory-session.smoke.mjs` — preserved cycle/tool/incomplete/attempt guards remain PASS
- `node extensions/test/plastic-memory-host.smoke.mjs` — in-process fake-host evidence for verbatim extension cuts, one append, active context, overlap guard, and native preservation
- `git diff --check -- extensions/plastic-memory/compaction/engine.ts extensions/plastic-memory/runtime/coordinator.ts extensions/plastic-memory/workers/compactor.ts extensions/test/plastic-memory-compaction.smoke.mjs extensions/test/plastic-memory-stride.smoke.mjs extensions/test/plastic-memory-apply-cut.smoke.mjs extensions/test/plastic-memory-acknowledge.smoke.mjs extensions/test/plastic-memory-integration.smoke.mjs` — no whitespace damage

**STATEFUL RESOURCE PROOF**: compaction/stride/apply/ack/session are synthetic and `NO_STATEFUL_RESOURCES`. Integration/host may run only after confirming unique `mkdtemp` roots, bounded teardown, fake model/runtime, no network/provider, no credential access, and no user/shared path fallback; record these as `DISPOSABLE_VERIFIED`. If that proof fails, do not run the affected command.

## Stop If

- Public root token/session-entry exports or `getSystemPrompt()`/`getContextUsage()` cannot support a conservative whole-cycle post-cut proof without a private host import.
- A valid emergency cannot preserve folded cycle identities in the same cumulative request/state, or any candidate cut splits an incomplete turn/tool exchange.
- Rebase requires changing persisted schemas, deleting records, or modifying host/config/projection behavior.
- The partial patch hash does not match `3cff8e488b2d9e9cccbd0c874fc2b69885c939e25518f175a1a18a78dbea4bfd`, a target changed after resume snapshot, or a repair would absorb/revert unexplained dirty content.
- Any validation can reach a real provider, Pi live session, credential, or non-run-owned mutable path.

## Checkpoint

- **Recovery snapshot**: required. Preserve existing original recovery; add `resume_before/<relative-path>` for all eight current targets and produce `FINAL_DELTA_RECEIPT.md`, `task-01.final.delta.patch`, and `task-01.final.delta.patch.sha256` without overwriting the partial patch.
- **Commit scope**: exact task-owned hunks in the eight Change files, including the already-uncommitted partial delta and bounded repair. Builder commits nothing; the orchestrator verifies receipts/diffs and creates one selective checkpoint without unrelated dirty/untracked content.
