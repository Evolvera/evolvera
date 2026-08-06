# Task 06: Validate emergency compaction ownership and fail-closed lifecycle

**Agent**: validator  
**Why**: Context overflow, public hook compatibility, observer exclusivity, async overlap, and generation rebasing can pass shallow checks while still losing raw context or memory identity.  
**Goal**: Independently issue `PASS` only if the aggregate emergency-hook checkpoint owns every delivered opportunity without regressing normal six/four behavior, one-active-observer scheduling, or branch safety.

## Read

- The orchestrator-recorded emergency-hook integration checkpoint and its ancestor checkpoint diffs — exact review baseline.
- `extensions/plastic-memory/runtime/coordinator.ts` — async state machine, scheduler lease, cancellation, append/ack/rebase order.
- `extensions/plastic-memory/compaction/emergency.ts` — emergency cap/cut and semantic pipeline.
- `extensions/plastic-memory/compaction/engine.ts` — normal policy, emergency finalizer, and acknowledgement.
- `extensions/plastic-memory/compaction/extract.ts` — transient source facts.
- `extensions/plastic-memory/compaction/pending.ts` — pending identity/TTL guards.
- `extensions/plastic-memory/compaction/render.ts` — strict cumulative output.
- `extensions/plastic-memory/workers/runner.ts` — candidate order, model resolution, deadlines, and diagnostics.
- `extensions/plastic-memory/workers/observer.ts` — strict source citations.
- `extensions/plastic-memory/workers/reflector.ts` — strict observation citations.
- `extensions/plastic-memory/workers/compactor.ts` — portable compactor contract.
- `extensions/plastic-memory/workers/scheduler.ts` — exclusive emergency lease and preserved normal queue.
- `extensions/plastic-memory/runtime/runner-runtime.ts` — exact selected-model execution.
- `extensions/plastic-memory/session/cycles.ts` — terminal and exchange atomicity.
- `extensions/plastic-memory/session/render-summary.ts` — bounded transient index.
- `extensions/plastic-memory/session/recall.ts` — branch-local exact historical recall.
- `extensions/plastic-memory/session/bootstrap.ts` — post-boundary bootstrap.
- `extensions/plastic-memory/session/ledger.ts` — record/branch validation.
- `extensions/plastic-memory/session/types.ts` — persisted type closure.
- All changed and existing `extensions/test/plastic-memory-*.smoke.mjs` relevant to compaction/workers/lifecycle — oracle quality and skipped-surface review.

## Change

- Review the named aggregate changed surface without production edits.
- Files Touched: none.

## Acceptance

- [ ] `PASS` evidence shows normal six/four/newest-four behavior and normal pending/internal nonce paths are unchanged, including no normal 4→2 physical cut.
- [ ] `PASS` evidence independently confirms the 60% number is a removal maximum, preserve-two/open-turn/exchange boundaries, 0/1/2/3-cycle operation, and structural cancellation.
- [ ] `PASS` evidence proves active scheduler work settles before emergency observation, triggers cannot bypass the exclusive interval, and exactly one queued reschedule survives release.
- [ ] `PASS` evidence records exact per-phase Luna → Luna → Sonnet 5 → distinct current-model calls, immutable inputs, exact adapter model identity, semantic rejection fallback, and no post-success extra calls.
- [ ] `PASS` evidence proves every exhausted/stale/timed-out path returns cancel with no host compaction/native content and no fake attempted/closed-cycle record.
- [ ] `PASS` evidence proves host compaction → valid applied record → rebase/bootstrap order, retained raw state, contiguous later cycles, and exact current-branch-only historical recall.
- [ ] `PASS` evidence confirms no new dependency, setting, flag, migration, schema/version, record type, model-free summary, raw payload logging, permissive Proxy fixture, unrelated dirty-file inclusion, or skipped runtime observation.

## Constraints

- Review-only: do not repair production/tests or create an empty commit.
- Treat a test that derives its expected cut/cap/order from the implementation under test as insufficient evidence.
- Inspect abort settlement, failed-path append logs, and branch state, not only returned reason strings.

## NOT TO DO

- Do not accept native fallback on all-model failure, 60% as a usage trigger, a cut inside an open turn/exchange, observer overlap, or rebase before validated acknowledgement.
- Do not accept a passing suite if changed smokes weakened old assertions, skipped model calls, used catch-all registries/proxies, or omitted normal-path coverage.
- Do not perform network/live provider campaigns; record those as orchestrator `TO VERIFY`, not deterministic `PASS` evidence.
- On any material defect, return `BLOCKED` with the smallest reproducible finding set and pause completion.

## Validation

- `node extensions/test/plastic-memory-model-fallback.smoke.mjs` — inspect exact model object/order/input/deadline trace.
- `node extensions/test/plastic-memory-emergency-selection.smoke.mjs` — inspect independently summed token cap and explicit branch boundaries.
- `node extensions/test/plastic-memory-emergency-pipeline.smoke.mjs` — inspect strict IDs/citations/fallback and zero returned records on exhaustion.
- `node extensions/test/plastic-memory-emergency-queue.smoke.mjs` — inspect synchronous reservation, abort settlement, deferred trigger, and release.
- `node extensions/test/plastic-memory-emergency-hook.smoke.mjs` — inspect queue handoff, hook result, append log, host boundary, applied/bootstrap order, retained tail, later cycle, and recall.
- `for name in compaction stride apply-cut acknowledge integration chunking workers worker-contract transport-integrity retrieval; do node "extensions/test/plastic-memory-$name.smoke.mjs" || exit 1; done` — every named regression passes without rewritten expectations.
- `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done` — every existing and new Plastic smoke exits zero and prints its PASS marker.
- Focused diff review — only scheduled files, no broad churn/deletions, preserved constants/guidance/guards, and no sensitive payload diagnostics.

## Stop If

- Any command can pass while skipping the changed hook/model/queue/rebase surface, or relevant files differ from the recorded checkpoint chain.
- Live credentials are the only missing evidence: leave live campaigns `TO VERIFY`, but do not mark deterministic behavior blocked if all offline gates pass.

## Checkpoint

- Recovery snapshot: not required (review-only quality gate).
- Checkpoint Commit: not required (quality gate); record an unambiguous `PASS` or `BLOCKED` verdict in `SCHEDULE.md`.
