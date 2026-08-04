# Task 05: Build verified 6/4 compaction and descendant-safe pending

**Agent**: builder  
**Why**: A custom cycle cut is safe only when cumulative facts, exact branch ancestry, and consume-once staged state are deterministic before any host hook uses them.  
**Goal**: A register-free engine that freezes stride-two prefixes, verifies fake-Luna cumulative state, and stages one scrubbed descendant-safe result with exact cut metadata.

## Read
- `extensions/plastic-memory/config.ts` — pending/result bounds and no ordinary token cadence
- `extensions/plastic-memory/session/ledger.ts` — current-branch cycles, memories, and acknowledgements
- `extensions/plastic-memory/session/cycles.ts` — exact complete-cycle identities/manifests
- `extensions/plastic-memory/project/context.ts` — shared bounded project snapshot
- `extensions/plastic-memory/common/safety.ts` — scrub/bound/digest contract
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js` — turn/cut/tool-pair rules and preparation shape
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js` — unvalidated append, ancestry, and repeated context reconstruction
- `/private/tmp/plastic-memory-evidence/pi-smart-compact/dist/index.js` — bounded extraction/repair/scrub/prefix/TTL mechanisms to adapt
- `extensions/test/plastic-memory-host.smoke.mjs` — passed host cut/repeated-projection counterexamples

## Change
- `extensions/plastic-memory/compaction/extract.ts` — CREATE — exact source/cycle facts, active IDs, files, commands/errors, decisions, constraints, goals, and open loops
- `extensions/plastic-memory/compaction/render.ts` — CREATE — structured cumulative state, unique cycle-range/digest summary, deterministic verification/repair, and bounded details
- `extensions/plastic-memory/compaction/pending.ts` — CREATE — one-slot TTL/consume-once session-generation-prefix-cut/latest-compaction state
- `extensions/plastic-memory/compaction/engine.ts` — CREATE — 6/4 frozen-prefix/cut validation, injected compactor callback, staging, and acknowledgement reconciliation
- `extensions/test/plastic-memory-compaction.smoke.mjs` — CREATE — pure/fake-Luna/stride/cut/pending/ack fixtures and Pi pre-transform counterexamples

## Proof
- **Semantic delta and evidence anchors:** Pi accepts arbitrary custom cuts, repeated custom cuts retain an older compaction inside active context, and `session_compact` finds the first equal summary. Smart Compact supplies extraction/prefix/TTL patterns but lacks branch-safe consume. The delta is cumulative cycle state under deterministic guards; provider message filtering remains host-coordinator-owned.
- **Coverage receipt:** complete cycles → eligible frozen pair/preserved-window cut; branch IDs/tool pairs/latest compaction → validity predicate; structured prior state + exact new evidence + project snapshot → fake-Luna request → verification/repair → uniquely headed pending; matching acknowledgement → applied prefix. `AFFECTED`: five paths. `UNAFFECTED`: provider `context` hook, worker model/auth resolution, host event timing, visible model, project storage, and live sessions.
- **Closure:** semantic range, source facts, cut, full preparation prefix, previous compaction identity, pending lifetime, and summary identity are bound in one compaction domain. The engine emits enough role/order/range metadata for the later coordinator projector without itself registering a hook.
- **Checkpoint:** fixtures independently produce exact C1–C6/C7–C8/third-stride staged payloads; Pi’s public rebuild is the negative oracle that still contains the older summary, making the later projector requirement explicit rather than claiming exact provider context here.
- **Acceptance path:** branch/cycles/project snapshot → injected fake Luna → verified staged payload → synthetic append/ack. Raw latest cycles/native facts are `PRESERVE`; cumulative content/custom cut `CHANGE`; summary-text identity and exact-leaf pending are superseded.
- **Counterexample:** cut membership alone accepts a same-session fork or changed prior compaction. Fixtures bind the entire prepared branch prefix, latest compaction identity, first-kept turn/tool shape, and structured state digest.

## Acceptance
- [ ] Six complete contiguous retained cycles freeze exactly the prefix before the latest four; later eligibility advances exactly two cycles and a third stride refutes duplication/off-by-one. Partial/oversized/backfill/stale cycles never count.
- [ ] `firstKeptEntryId` is the context-visible safe completed-turn start of the first preserved cycle; missing/non-ancestor/compaction/tool-result/orphaned/reordered cuts or changed latest compaction fail before a payload exists.
- [ ] Fake Luna receives exact cycle/source IDs/digests, prior structured state, deterministic facts/active memory IDs, and bounded project snapshot; prior prose alone is never truth.
- [ ] Verification/repair preserves every required fact, ID, file operation, command/error, decision, constraint, goal, and open loop within 48,000 chars or rejects the result; provider/persisted text is scrubbed.
- [ ] Every summary starts with a deterministic unique cycle-range/state-digest header; acknowledgement matches header/details/cut/entry identity and never first-equal prose alone.
- [ ] Pending is one-slot, one-consumer, 300,000-ms TTL, session/generation/cycle-prefix/cut/latest-compaction/state-bound; an exact prepared branch-ID prefix accepts appended descendants, while fork/reorder/reload/session/compaction divergence clears it.
- [ ] Synthetic Pi rebuilds prove initial raw retention and the confirmed second-stride `cmp2,C5,C6,cmp1,C7,C8` pre-transform shape; pending carries deterministic metadata that distinguishes subsumed plastic summaries from native/ambiguous compactions.

## Constraints
- No hook/provider-context registration, `ctx.compact()`, model/auth resolution, persistent pending file, token threshold, or model call. The compactor is injected fake.
- No multipart/partition fan-out. Oversized atomic spans remain explicit/raw and emergency-capable.
- Do not identify an acknowledgement or older compaction by prose equality. Ambiguous/native compactions in the proposed removable range make the staged custom apply ineligible.
- Adapt only evidenced Smart Compact mechanisms and retain attribution. Tests are `NO_STATEFUL_RESOURCES`.

## Validation
- `node extensions/test/plastic-memory-compaction.smoke.mjs` — PASS for 6/4/three strides, cut/tool/ancestry guards, fake-Luna request, deterministic repair/scrub, unique headers, pending TTL/prefix/consume, acknowledgement, and Pi repeated pre-transform counterexample
- `node extensions/test/plastic-memory-host.smoke.mjs` — installed-host cut/projection capability remains PASS
- `git diff --check -- extensions/plastic-memory/compaction extensions/test/plastic-memory-compaction.smoke.mjs` — no whitespace errors

## Stop If
- A valid custom cut cannot be bound to the complete ancestor prefix and safe turn/tool shape, subsumed plastic versus native/ambiguous compactions cannot be represented deterministically for the projector, or required structured facts cannot fit the bound.

## Checkpoint
- Recovery snapshot: not required; targets are new and fixtures are in-memory.
- Commit scope: the five `Change` paths only.
