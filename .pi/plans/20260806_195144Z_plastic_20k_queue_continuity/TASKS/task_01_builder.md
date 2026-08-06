# Task 01: Establish the durable >=20k cycle queue kernel

**Agent**: builder  
**Why**: Capture needs an honest persisted state and deterministic reconstruction before any worker or hook can consume it safely.  
**Goal**: A strict additive `plastic.cycle.queued` contract batches and reconstructs exact current-branch FIFO work without changing active scheduling yet.

## Read

- `extensions/plastic-memory/session/types.ts` — persisted type registry, exact-key validators, and record guards.
- `extensions/plastic-memory/session/cycles.ts` — terminal/tool atomicity, source-token estimation, snapshot identities, attempts, and exact close.
- `extensions/plastic-memory/session/ledger.ts` — current-branch resolution, source digest, fold, and bootstrap-bounded source selection.
- `extensions/plastic-memory/session/bootstrap.ts` — confirm that recovered bindings can reuse the existing bootstrap path without reopening historical source.
- `extensions/test/plastic-memory-session.smoke.mjs` — preserved cycle, binding, bootstrap, and atomicity oracles.

## Change

- `extensions/plastic-memory/session/types.ts` — MODIFY — add the exact `plastic.cycle.queued` data type, constant, map/registry entry, strict validator, and typed guard; fields are `schemaVersion`, `SessionBinding`, flattened `SourceSpan`, code-owned `cycleId`/`snapshotId`, and `estimatedTokenCount`, with no separate queue ID.
- `extensions/plastic-memory/session/cycles.ts` — MODIFY — add the fixed 20,000-token queue invariant, deterministic whole-terminal-turn batching, queued-record construction, strict current-branch queue reconstruction, unresolved FIFO selection, and resumable binding/lineage selection; keep current scheduler/attempt behavior unchanged at this additive checkpoint.
- `extensions/plastic-memory/session/ledger.ts` — MODIFY — fold valid current-branch queued records and recognize flattened source spans for branch validation without reopening the historical gap or changing recall/search semantics.
- `extensions/test/plastic-memory-queue.smoke.mjs` — CREATE — exercise schema strictness, batching boundaries, exact duplicates, queue/close resolution, restart lineage, and malformed fail-closure.

## Proof

- **Semantic delta and anchors**: `PLASTIC_TYPES`/`isPlasticRecord` currently have attempted and closed but no capture state; `createCompletedTurnSnapshot` takes every completed prefix; `partitionEntries` already preserves terminal/tool exchange atomicity; `foldLedger` is the current-branch persisted-state reader.
- **Coverage receipt**: searched `session/{types,cycles,ledger,bootstrap}.ts`, all `plastic.cycle.*` references, scheduler snapshot creation, coordinator binding/bootstrap, compaction closed-cycle readers, and Plastic session/chunking/worker tests. **AFFECTED**: the three changed session files and the new queue smoke. **UNAFFECTED**: `bootstrap.ts` already accepts an explicit binding and bounded active window; workers/coordinator remain on the existing path until the queued consumer is available; compaction consumes closes, not queue records.
- **Closure**: queued semantic identity → `types.ts`; deterministic completed-turn grouping/digest/token count and conflict/overlap/gap validation → `cycles.ts`; current-branch persistence/fold and flattened span ownership → `ledger.ts`; all required boundary and malformed examples → the new smoke.
- **Checkpoint**: the queue API is additive and is not called by the active scheduler, so the baseline 27 smokes retain their current deterministic gate while the new queue smoke proves the new contract independently.
- **Acceptance path**: branch source entries → existing terminal/tool grouping → earliest threshold-crossing span → code-owned queued record → fold/reconstruction → oldest unresolved item. Oracles compare literal IDs, digests, counts, record cardinality, and zero returned queue items; they cannot be weakened by model output.

## Acceptance

- [ ] 19,999 completed source tokens produce no queued record; exactly 20,000 produce one valid queued record.
- [ ] 15k + 15k + 15k produces one 30k item and a 15k remainder; one 50k terminal turn remains one item.
- [ ] Open turns and complete assistant tool-call/result exchanges are never split or treated as terminal early.
- [ ] Exact duplicate queued records fold idempotently, while conflicting duplicate identity, overlap, gap, bad digest/count, off-branch source, and stale binding invalidate the queue.
- [ ] Queue reconstruction distinguishes unresolved queued items from exact attempted/closed descendants and selects the oldest FIFO item.
- [ ] A restart candidate is returned only for one fully valid current-branch queue lineage with the stable session ID; legacy/no-queue or ambiguous lineages are not revived.

## Constraints

- Preserve the 160k structured prompt cap, no truncation, code-owned IDs, terminal/open-turn and tool exchange atomicity, and all existing record validators.
- Treat estimated source tokens as deterministic nonnegative integer estimates and recompute them from exact current-branch source before trusting persisted data.
- Patch only the named session symbols; preserve legacy fold, recall, bootstrap historical-gap, and unrelated record behavior.

## NOT TO DO

- Do not modify `workers/`, `runtime/coordinator.ts`, compaction code, config, installers, README, emergency modules, or existing test expectations outside the new queue smoke.
- Do not create a queue ID, database, migration, dependency, config flag, background service, raw-payload diagnostic, or sub-20k exception.
- Do not reinterpret `plastic.cycle.attempted` or `plastic.cycle.closed` as capture records.
- Return `BLOCKED` if exact queue validity cannot be derived from current-branch source and persisted records without trusting model prose or reopening historical source.

## Validation

- `node extensions/test/plastic-memory-queue.smoke.mjs` — all threshold, batching, replay, lineage, and malformed assertions pass with no provider/network access.
- `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done` — the new smoke and all baseline Plastic smokes pass.
- `git diff --check -- extensions/plastic-memory/session/types.ts extensions/plastic-memory/session/cycles.ts extensions/plastic-memory/session/ledger.ts extensions/test/plastic-memory-queue.smoke.mjs` — no whitespace errors.

## Stop If

- Queue state needs an identifier beyond the existing deterministic cycle/snapshot identities, or valid restart requires accepting ambiguous/stale/off-branch state.
- Any required threshold batch would split an open turn or tool exchange.

## Checkpoint

- Recovery snapshot: required for the three shared session files before editing.
- Commit scope: `extensions/plastic-memory/session/types.ts`, `extensions/plastic-memory/session/cycles.ts`, `extensions/plastic-memory/session/ledger.ts`, `extensions/test/plastic-memory-queue.smoke.mjs`.
