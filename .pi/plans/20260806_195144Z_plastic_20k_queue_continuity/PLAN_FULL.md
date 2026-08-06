# Plastic Memory 20k Queue and Host Continuity Plan

**Generated**: 2026-08-06T19:51:44Z  
**Complexity**: High  
**Estimated tasks**: 6 (5 builders, 1 validator)  
**Risk**: High

## Outcome

Plastic Memory will capture completed terminal turns into durable, immutable FIFO cycles whose estimated source total is at least 20,000 tokens, process those cycles serially with strict model fallback, and remain passive when compaction is applied. Pi continues to own manual, threshold, and overflow compaction. A guarded repository-delivered patch for only `@earendil-works/pi-coding-agent@0.83.0` preserves Pi's existing queued-message continuation when a **threshold** auto-compaction is cancelled by an extension.

## Scope and Decisions

### In scope

- Add `plastic.cycle.queued` as the persisted distinction between capture and `plastic.cycle.attempted`.
- Batch the earliest contiguous whole completed turns until each immutable batch first reaches at least 20,000 estimated source tokens; retain a sub-20k remainder.
- Reconstruct and validate queue state from the current branch, including exact source IDs, digest, token estimate, binding, order, overlap, conflicts, queue-to-attempt, and queue-to-close relationships.
- Resume the oldest valid unresolved queue item after reload/restart and continue capturing later items while a worker is active.
- Apply Luna → Luna retry → Sonnet 5 → distinct visible-model fallback independently to observer, reflector, and compactor phases over immutable input.
- Keep normal compaction at six valid closed cycles while retaining the newest four; reject any sub-20k closed-cycle input.
- Remove reachable transient raw emergency compaction and every autonomous `ctx.compact()` path. A host hook consumes an exact usable pending or prepares from already-durable eligible closed cycles; otherwise it cancels.
- Append and validate `plastic.compaction.applied` before generation rebase/bootstrap, carrying the verified cumulative state across the rebase.
- Deliver an exact-version, exact-anchor-hash, idempotent Node patcher through both installers, with only disposable fixture tests.

### Out of scope

- Applying the host patch to the installed global package, restarting/reloading Pi, or conducting live manual/threshold/overflow campaigns.
- Provider credentials, network calls, billing, or live model-quality claims.
- Native Pi summaries, synthetic continuation messages, host source forks, model context-limit changes, other extensions/skills/prompts, project-memory initialization, Flow YAML, databases, migrations, services, dependencies, or feature flags.
- Deleting the existing emergency modules or tests. They may remain as disconnected code; the active coordinator must not import or invoke them.

### Material decisions

1. **No separate queue ID.** The queued record contains `schemaVersion`, `SessionBinding`, the flattened `SourceSpan`, code-owned `cycleId`/`snapshotId`, and `estimatedTokenCount`. Existing deterministic cycle/snapshot identities are sufficient; another identifier would not satisfy an additional acceptance criterion.
2. **20,000 is a code invariant, not configuration.** Queue creation, queued attempt/close, and compaction validation all enforce it. Existing inactive config fields do not authorize smaller cycles and are not broadened into a new setting.
3. **Attempt records remain attempts.** Capture appends only `plastic.cycle.queued`; `plastic.cycle.attempted` begins only when the serial worker takes the exact queued item. Fallback candidates are phase attempts within immutable queued work, and fallback exhaustion records failure without closing or consuming the queue item.
4. **Exact duplicates are idempotent; conflicts are not.** A byte-equivalent deterministic queued record may be folded once. A duplicate identity with different span/digest/token data, overlap, gap, off-branch source, stale binding, malformed ancestry, or unbacked attempt/close invalidates queue state before model work.
5. **Compatibility seam before cutover.** The queue kernel and queued scheduler path are introduced while the current coordinator call remains valid. The coordinator and scheduler then switch atomically so no checkpoint leaves active >=20k capture unable to run and no final legacy one-cycle-per-turn path remains.
6. **Passive hook refresh uses closed cycles only.** If no pending survives TTL/identity checks, `session_before_compact` may run the normal compactor fallback only from an immutable, validated six-cycle window. It never re-observes raw source, invents a cycle, aborts a running queue worker, or returns native content.
7. **Successful application always rebases after acknowledgement.** The acknowledged prepared view supplies cumulative state across the in-process generation rebase; all binding, prefix, cut, details, digest, TTL, and branch checks remain mandatory.
8. **The host patch changes one return expression.** In the exact 0.83.0 `_runAutoCompaction()` extension-cancellation branch, threshold cancellation returns `agent.hasQueuedMessages()`; overflow still returns `false`. Manual and successful paths are outside the replacement anchor.

## Evidence and Repository Baseline

- **KNOWN** repository baseline: `d9824ec8ba3af00583e1136d62f3ebc0ca2d00b0`.
- **KNOWN** all 27 existing `extensions/test/plastic-memory-*.smoke.mjs` passed at handoff; they are in-process fake-runtime tests and do not prove the requested semantics.
- **KNOWN** target Plastic/install files were clean at handoff.
- **KNOWN dirty exclusions**: unrelated changes under `SYSTEM.md`, `agents/`, `skills/`, `config/`, and `.pi/` must never be staged, reverted, reformatted, or included in task checkpoints. The current plan directory is the only authorized plan output under `.pi/`.
- **Active checkpoints**: no continuing implementation checkpoint was supplied. Historical plans/recovery artifacts are collision and recovery evidence only; their scope is not imported.
- **KNOWN queue anchors**: `session/cycles.ts:isTerminalAssistantEntry`, `partitionEntries`, and `createCompletedTurnSnapshot`; `session/types.ts:PLASTIC_TYPES` and `isPlasticRecord`; `session/ledger.ts:foldLedger` and `normalSourceEntries`; `workers/scheduler.ts:CycleScheduler.trigger/run`.
- **KNOWN compaction anchors**: `compaction/engine.ts:validateClosedCycleSet`, `eligibleWindow`, `prepareSemanticCompaction`, `acknowledgeCompaction`; `runtime/coordinator.ts:schedule`, `maybeApply`, `session_before_compact`, and `session_compact`.
- **KNOWN host anchor**: Pi 0.83.0's installed `dist/core/agent-session.js` emits an aborted `compaction_end` and returns `false` immediately on extension cancellation; the successful auto path later returns `agent.hasQueuedMessages()`.

## Scout Fan-out Map and Seam Synthesis

- Root inventory: active product under `extensions/plastic-memory`, in-process validation under `extensions/test`, delivery under `scripts/`, `install.sh`, `install.ps1`, and `README.md`; installed Pi dist is read-only evidence.
- Structural trigger: durable capture/session state and passive host lifecycle were independent initial evidence regions, while `runtime/coordinator.ts` is their serial bridge. Installer delivery is disjoint.
- Capacity at scout launch: 0 active; two independent candidates admitted concurrently.
- Candidate A — **ADMIT / COMPLETE**: decision question was how to persist and resume honest >=20k FIFO work. Scope covered session types/cycles/ledger/bootstrap relationships, scheduler, coordinator scheduling, and focused tests. Required handoff established the missing queued semantic record and exact closure.
- Candidate B — **ADMIT / PARTIAL**: decision question was how to make application passive without losing queued follow-up continuity. Scope covered coordinator/compaction/hooks/tests and read-only Pi host behavior. Required handoff established that the extension cannot continue Pi and the host needs a guarded patch.
- Test discovery — **MERGE** into each semantic concern; tests do not own a separate implementation lane.
- Fallback plumbing — **MERGE** into queued worker processing because strict-result validity, immutable inputs, and retryability share the worker checkpoint.
- Installer delivery — **SYNTHESIS**, disjoint from Plastic source writes and admitted as the second initial-wave task.
- Cross-shard anchors: queue schema → scheduler exact item → coordinator capture/drain; closed queue cycles → normal engine eligibility → host hook pending; extension cancellation → host `_runAutoCompaction()` return → `_handlePostAgentRun()` continuation.
- Shared/serial artifacts: `runtime/coordinator.ts` and `workers/scheduler.ts` serialize queue cutover before passive lifecycle. No contradiction remains. Live host application and provider campaigns remain orchestrator-owned gaps.

## Shared-File and Preservation Hazards

| File | Size | Hazard and preservation markers | Mitigation |
|---|---:|---|---|
| `extensions/plastic-memory/runtime/coordinator.ts` | 847 lines | Sole hook owner; preserves binding, projection, notices, physical budget, acknowledgement, exact recall boundary, and invalidation events. | Tasks 03 and 04 are serialized; each takes a recovery snapshot and patches named methods only. |
| `extensions/plastic-memory/workers/scheduler.ts` | ~372 lines | Owns serial worker, abort/stale guards, compactor launch, and current in-memory reschedule behavior. | Tasks 02 and 03 are serialized; durable records become the source of truth before legacy path removal. |
| `extensions/plastic-memory/session/cycles.ts` | 393 lines | Terminal/tool atomicity, 160k partitioning, identities, attempts, and exact close are co-located. | Tasks 01 and 02 are serialized; preserve `isTerminalAssistantEntry`, partition integrity, and code-owned IDs. |
| `extensions/plastic-memory/session/types.ts` | 386 lines | One strict type registry/switch controls all persisted Plastic records. | Task 01 makes one additive exact-key schema change and preserves every existing validator. |
| `extensions/plastic-memory/session/ledger.ts` | 285 lines | Current-branch fold, historical gap, and source digest guard recall and capture. | Task 01 extends current-branch queue folding without reopening historical source. |
| `extensions/plastic-memory/compaction/engine.ts` | 387 lines | Six/four stride, exact source/cut validation, pending identity, and acknowledgement are correctness-critical. | Task 04 adds the >=20k validity proof inside the existing cycle-set gate and preserves all other guards. |
| `extensions/test/plastic-memory-integration.smoke.mjs` | ~366 lines | Broad fake-host lifecycle fixture; changed by queue cutover and passive lifecycle. | Tasks 03 and 04 are serialized; preserve projection, registration, and in-memory Pi lifecycle sections. |
| `install.sh` / `install.ps1` | 148 / 187 lines | Global package installation and final settings activation are consequential. | Task 05 inserts only the fail-closed patch invocation immediately after npm installation; no installer execution in validation. |
| `README.md` | >500 lines | Shared setup truth and rollback guidance. | Task 05 edits only install compatibility/rollback sections; no broad rewrite. |

## Scenarios and Failure Behavior

1. 19,999 estimated completed source tokens append no queue record, attempt, or close and make zero model calls. At 20,000, one queue item is appended and may run.
2. Completed turns of 15k + 15k + 15k append one 30k item and retain 15k. A single 50k terminal turn remains one item. Open turns and assistant-tool/result sequences remain indivisible.
3. While item A runs, later terminal boundaries durably append B and C. A sees only its recorded IDs/digest; completion drains B then C. Reload resumes the oldest exact unresolved item.
4. Any malformed, stale-generation, off-branch, noncontiguous, overlapping, or conflicting queue relationship cancels worker/model activity and appends no semantic result.
5. Each phase receives byte-equivalent immutable input across Luna, Luna retry, Sonnet, and distinct visible model. The first strict valid result wins; exhaustion leaves the item retryable and no pending compaction is fabricated.
6. Fewer than six valid >=20k closes cannot invoke the compactor. At six, normal 6/4 preparation can occur in background but waits for Pi.
7. Repeated `turn_end`/`agent_settled` events never call `ctx.compact()`. A host hook uses an exact pending, safely refreshes from valid closed cycles, or returns `{ cancel: true }`; raw emergency/native/synthetic content is never returned.
8. A matching successful host boundary appends one valid `plastic.compaction.applied`, verifies its visibility, then rebases/bootstrap. A mismatch, append failure, or invisible acknowledgement does not claim success.
9. The patcher changes an exact unpatched 0.83.0 anchor once, accepts the exact patched form idempotently, and refuses wrong package/version/hash or zero/multiple anchors without writing. Threshold cancellation preserves queued-message state; overflow, manual, and success controls remain unchanged.

## Risks and Mitigations

- **Queue replay/overlap can silently re-observe source.** Mitigation: current-branch source-position reconstruction, deterministic digest/token recomputation, strict queue-to-attempt/close matching, negative fixtures, and independent validation.
- **Reload binding recovery could revive stale work.** Mitigation: recover only one fully valid current-branch queue lineage for the stable session; successful compaction generation/bootstrap makes older queued records stale.
- **Fallback may accidentally mix candidate outputs or later entries.** Mitigation: freeze/copy queued source manifests and phase inputs, restart a failed phase from the same bytes, and append semantic records only after current identity revalidation.
- **Hook-time refresh could interrupt a queued worker.** Mitigation: never acquire the old aborting emergency lease; cancel when the serial queue worker is active.
- **Rebase could lose cumulative state.** Mitigation: carry only the already-verified prepared view after acknowledgement; never derive state from model prose or an unmatched host entry.
- **Dead emergency modules might remain callable by tests.** Mitigation: active-root proof is the coordinator import/hook graph; no deletion is authorized, but no active coordinator import or hook call may reach emergency selection/finalization.
- **Host drift could turn a one-line patch into broad corruption.** Mitigation: package name/version plus exact unpatched/patched anchor SHA-256 and cardinality checks, atomic write, idempotent verification, and refusal by default.
- **Installer validation could mutate live state.** Mitigation: fixture-only patch smoke; installers are inspected, not executed. Live application requires a new consequential-action manifest and fresh confirmation.
- **Unrelated dirty work could be lost.** Mitigation: per-task recovery for large/shared files and selective commits containing only declared write sets.

## Decomposition and Delivery Shape

No provisional task crosses the wide-task gate: each owns at most nine paths and no more than two semantic regions. Tests remain with the production region they verify. The compatibility seam is repository-supported: an additive persisted queue kernel, then an additive queued scheduler mode, followed by one atomic active-runtime cutover. The counterexample considered was switching the scheduler before the coordinator could persist queue records; that would make valid >=20k capture temporarily unprocessable, so that split was rejected.

The largest safe initial wave is:

- Task 01: session queue kernel.
- Task 05: versioned host patch delivery.

Their complete write sets and validation resources are disjoint. Plastic work then follows the serial shared-file path Task 01 → Task 02 → Task 03 → Task 04. The validator joins the final Plastic checkpoint and host patch-delivery checkpoint.

## Implementation Order

1. Establish the strict queued record, batch selector, current-branch queue reconstruction, and resumable binding evidence without changing active worker behavior.
2. Add the serial exact-queue worker path and normal phase fallback; convert direct scheduler tests to the new contract while retaining the current coordinator seam.
3. Cut the active coordinator over to synchronous durable capture/recovery/drain and remove the legacy aggregate scheduler path in the same checkpoint.
4. Remove autonomous/emergency application, enforce >=20k closed-cycle compaction input, implement pending-or-closed-cycle host-hook behavior, and make acknowledgement precede rebase.
5. In parallel with the Plastic chain, add and wire the exact 0.83.0 host patcher and fixture smoke.
6. Independently validate replay/overlap fail-closure, passive lifecycle behavior, and host patch reason isolation against recorded checkpoint hashes.

## Validation Strategy

- Targeted queue kernel and worker fixtures cover 19,999/20,000, 15k batching, 50k atomicity, B/C capture during A, restart, FIFO, malformed overlap/conflict/stale state, and zero sub-20k calls.
- Fake runtimes observe actual per-role model order, immutable prompt bytes, semantic record appends, exhaustion side effects, and compactor pending state.
- Fake host hooks observe zero `ctx.compact()` calls, exact hook returns for manual/threshold/overflow, pending TTL refresh, busy-worker cancellation, acknowledgement visibility, and rebase order.
- Engine fixtures prove that six/four eligibility rejects a sub-20k cycle before compactor invocation.
- The patch smoke uses one run-owned temporary root and synthetic package/file fixture only. It executes patched semantics and all refusal/idempotency controls without npm, network, or global package access.
- Every builder runs the full Plastic smoke loop after focused checks and `git diff --check` for its owned paths. The validator reruns the full deterministic suite and patch smoke read-only.

## TO VERIFY / Orchestrator-Owned After Build

- Applying the patch to the actual global installation, the exact files that action will change, process restart/reload, and rollback execution. These require a fresh consequential-action manifest and explicit confirmation.
- Live provider auth, latency, quality, billing, and model fallback behavior.
- Live `/compact`, threshold, queued-follow-up, and overflow campaigns in disposable sessions. Smokes must not be reported as proving these runtime campaigns.
- PowerShell parser execution if `pwsh` is unavailable in the builder environment; the fixture smoke still must verify the exact installer invocation text and fail-closed ordering.
