# Task 02: Separate strict normal six/four selection from emergency safe-cut selection

**Agent**: builder  
**Why**: Budget pressure must stop shrinking normal pending windows and instead produce a bounded transient emergency span.  
**Goal**: Normal preparation retains exactly four closed cycles or defers, while a pure emergency selector handles 0–3+ cycle cases, the 60% removal ceiling, preserve-two policy, incomplete turns, and atomic exchanges.

## Read

- `extensions/plastic-memory/compaction/engine.ts` — current variable retained-count loop, exact cycle validation, physical tail proof, and normal tests’ API.
- `extensions/plastic-memory/compaction/extract.ts` — `CycleClosedData`-only source facts adapter.
- `extensions/plastic-memory/session/cycles.ts` — terminal assistant rules, completed-turn snapshots, and atomic partitioning.
- `extensions/plastic-memory/session/ledger.ts` — ordered branch and source digest helpers.
- `extensions/test/plastic-memory-compaction.smoke.mjs` — direct engine, rendering, pending, and physical-budget oracles.
- `extensions/test/plastic-memory-stride.smoke.mjs` — scheduler-to-normal-compactor eligibility oracle.
- `extensions/test/plastic-memory-apply-cut.smoke.mjs` — coordinator fixture that currently assumes a two-cycle normal pending.
- `extensions/test/plastic-memory-chunking.smoke.mjs` — atomic tool exchange and completed-turn partition oracle.

## Change

- `extensions/plastic-memory/compaction/engine.ts` — MODIFY — keep normal selection at six-or-more cycles with exactly the newest four raw; a failed four-cycle physical proof returns ineligible, and shared exact-cycle validation becomes reusable by emergency selection without weakening it.
- `extensions/plastic-memory/compaction/extract.ts` — MODIFY — add a code-owned transient source-span facts adapter with the same digest/facts shape used by rendering, without requiring or creating `CycleClosedData`.
- `extensions/plastic-memory/compaction/emergency.ts` — CREATE — pure emergency window selection and typed transient semantic unit.
- `extensions/test/plastic-memory-emergency-selection.smoke.mjs` — CREATE — independent token/boundary fixtures for the new selector.
- `extensions/test/plastic-memory-compaction.smoke.mjs` — MODIFY — replace old normal 4→2/zero-raw expectations with exact four-or-ineligible normal behavior.
- `extensions/test/plastic-memory-stride.smoke.mjs` — MODIFY — prove normal detached compaction does not run when the newest four fail the physical budget.
- `extensions/test/plastic-memory-apply-cut.smoke.mjs` — MODIFY — remove the direct-engine assumption that a normal pending may retain only two cycles; retain all existing host/pending guards.

## Proof

- **Semantic delta and anchors**: `eligibleWindow` currently loops retained counts from four to zero, so physical pressure is already conflated with normal stride. `createCompletedTurnSnapshot` and `partitionCompletedTurnSnapshot` already define terminal-complete spans and exchange atomicity. `extractCycleSourceFacts` is the only facts adapter and unnecessarily requires a persisted cycle.
- **Coverage receipt**: searched `compaction/**/*.ts`, `session/{cycles,ledger,types}.ts`, coordinator `physicalBudget` call sites, and all Plastic smoke references to `physicalBudget`/“emergency”. **AFFECTED**: `engine.ts`, `extract.ts`, new `emergency.ts`, compaction/stride/apply-cut expectations, and new selector coverage. **UNAFFECTED**: `cycles.ts` and `ledger.ts` already supply exact boundary/digest primitives; scheduler remains correct once normal selector returns no window; pending/render/types need no selection edits. No greppable candidate remains unresolved.
- **Closure**: normal stride/budget → `engine.ts`; emergency cut/transient identity → new `emergency.ts`; digest-preserving facts → `extract.ts`; changed direct expectations → the three existing tests plus a new independent selector smoke. Scheduler and coordinator require no change for this pure checkpoint.
- **Checkpoint**: after this task alone, all normal callers remain valid: four retained cycles fit and prepare, or no pending is produced. The unused emergency selector is independently deterministic and has no runtime side effects.
- **Acceptance path**: PRESERVE normal six/four is checked from independently constructed cycle spans and exact expected cut. CHANGE emergency selection is checked by summing fixture `entryTokens`, locating user boundaries directly, and inspecting retained entry IDs. No oracle asks the selector to calculate its own expected result.
- **Counterexample pass**: a selector that treats 60% as usage activation still fails fixtures that invoke it below that level; a selector that cuts after a tool call or inside the open turn fails direct retained-tail equality; a normal selector that still loops below four fails the revised stride test.

## Contract

- Emergency input contains the immutable current branch, active context entry IDs, current binding, valid current-generation closed cycles, and a non-null `PhysicalBudget`.
- `maxRemovedTokens = floor(contextWindow * 3 / 5)` counts entry-derived tokens actually discarded before the proposed cut; fixed/system/summary reserve is used only to prove the retained tail fits.
- Safe candidates begin at a branch-local user message immediately after a terminal-complete removable source prefix. The candidate retains every source entry after the last terminal assistant as one incomplete turn.
- With more than two exact valid closed cycles, a candidate may not remove either newest cycle. With two or fewer, preserve as many as a representable fitting cut permits.
- Choose the candidate removing the largest positive safe prefix within the cap; return no selection for unknown tokens, malformed order/digest, an indivisible over-cap group, or no user `firstKeptEntryId`.
- The returned transient unit uses a code-derived snapshot/cycle identity and source digest but is not a persistable `plastic.cycle.closed` value.

## Acceptance

- [ ] Normal selection still requires at least six exact contiguous closed cycles and retains exactly the newest four; physical failure yields no normal pending/model call.
- [ ] Emergency selection succeeds deterministically with 0, 1, 2, and 3 valid closed-cycle records when a safe completed prefix exists.
- [ ] Removed entry tokens are positive and never exceed `floor(contextWindow * 3 / 5)`; 60% is not used as an activation threshold.
- [ ] The newest two valid closed cycles remain raw whenever more than two exist; with two or fewer, only whole representable completed content may be removed.
- [ ] The entire current incomplete turn remains after `firstKeptEntryId`, and no cut or transient span splits a tool-call/tool-result exchange.
- [ ] A single indivisible exchange over the removal cap, a branch ending without a representable user boundary, unknown token proof, stale digest, or malformed order returns no selection before model work.
- [ ] Transient fact extraction reproduces the exact source IDs/digest and creates no attempted/closed-cycle record.

## Constraints

- Reuse `isTerminalAssistantEntry`, completed-turn snapshot/partition logic, `sourceDigest`, and the existing `PhysicalBudget`; do not create parallel terminal or token semantics.
- Preserve previous-compaction/foreign-compaction guards and exact normal acknowledgement behavior.
- Keep fixture token maps explicit objects; no proxies or default-all token access.

## NOT TO DO

- Do not call a model, append a record, stage pending state, or modify coordinator lifecycle in this task.
- Do not retain fewer than four cycles on the normal engine path.
- Do not count 60% as a trigger, count fixed prompt/reserve as removed old context, or split source/tool groups to manufacture a fit.
- Do not persist the transient unit or add a schema/type/config/dependency.
- Do not weaken exact cycle contiguity, terminal assistant, source digest, foreign-compaction, or host-cut checks.
- Do not edit files outside the declared write set or broadly reformat shared tests.
- Return `BLOCKED` if safe selection requires a host cut that is not a real user entry on the current branch.

## Validation

- `node extensions/test/plastic-memory-emergency-selection.smoke.mjs` — 0/1/2/3-cycle, cap, preserve-two, open-turn, exchange, and structural failure matrix passes.
- `node extensions/test/plastic-memory-compaction.smoke.mjs` — normal cumulative six/four, strict render, pending, and acknowledgement pass with revised budget behavior.
- `node extensions/test/plastic-memory-stride.smoke.mjs` — no normal compactor call below stride or when four retained cycles do not fit.
- `node extensions/test/plastic-memory-apply-cut.smoke.mjs` — existing coordinator cut/pending guards remain valid after normal selector change.
- `node extensions/test/plastic-memory-chunking.smoke.mjs` — terminal and exchange atomicity remains unchanged.

## Stop If

- Existing branch entries cannot provide explicit token values for every removed/retained candidate through `PhysicalBudget`.
- A 0-cycle opportunity cannot be represented as a terminal-complete transient source span without creating a fake persisted cycle.

## Checkpoint

- Recovery snapshot: required — snapshot the five existing owned files under `.pi/build/recovery/task_02/` before editing; exclude it from the product commit.
- Commit scope: only `extensions/plastic-memory/compaction/engine.ts`, `extensions/plastic-memory/compaction/extract.ts`, `extensions/plastic-memory/compaction/emergency.ts`, `extensions/test/plastic-memory-emergency-selection.smoke.mjs`, `extensions/test/plastic-memory-compaction.smoke.mjs`, `extensions/test/plastic-memory-stride.smoke.mjs`, and `extensions/test/plastic-memory-apply-cut.smoke.mjs`.
