# Task 09: Implement the settled-only host coordinator and provider projection

**Agent**: builder  
**Why**: Staged custom cuts, repeated provider context, native fallback, and cycle workers need one generation-bound host owner that proves the real lifecycle before auto-discovered wiring.  
**Goal**: A directly registerable coordinator that projects one safe cumulative summary, prepares asynchronously, applies once only at settled/idle, distinguishes internal from host compaction, and never interrupts visible work.

## Read
- `extensions/plastic-memory/config.ts` — enable/collision/runtime limits
- `extensions/plastic-memory/session/ledger.ts` and `session/bootstrap.ts` — append/acknowledgement/startup state
- `extensions/plastic-memory/workers/scheduler.ts` — attempt/cycle/compactor/promoter jobs
- `extensions/plastic-memory/compaction/engine.ts` — prepare/stage/ack API and projection metadata
- `extensions/plastic-memory/compaction/pending.ts` — fresh descendant-safe staged state
- `extensions/test/plastic-memory-host.smoke.mjs` — required host capability traces
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` — actual manual/auto compact, prompt, and acknowledgement ordering
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js` — active entry ordering
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/messages.js` — provider `compactionSummary` shape
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js` — chained provider `context`
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — lifecycle/context/idle/pending/append APIs

## Change
- `extensions/plastic-memory/compaction/projection.ts` — CREATE — guarded role/order provider-message transform tied to fresh branch/latest structured plastic details
- `extensions/plastic-memory/runtime/coordinator.ts` — CREATE — directly registerable generation/bootstrap/workers, sole compaction/context hooks, internal nonce/apply latch, settlement, fallback, and acknowledgement owner
- `extensions/test/plastic-memory-integration.smoke.mjs` — CREATE — real Pi in-memory lifecycle with fake workers/model/auth and native/custom/emergency context branches

## Proof
- **Semantic delta and evidence anchors:** `ctx.compact()` enters manual compaction, aborts active work, can miss the hook when preparation is undefined, and falls through natively on no result. `agent_settled` follows retry/continuation; pending messages are separate. Repeated host context retains older summaries and provider messages expose role/order but no entry ID.
- **Coverage receipt:** fresh branch + latest validated plastic details/range → role/order projector; lifecycle/start/turn/settled/shutdown/tree → generation/bootstrap/scheduler; detached completion + settled epoch + idle/queue/apply lock → internal nonce call; hook reason/nonce + fresh branch → custom/cancel/fallthrough; unique `session_compact` entry → applied ack. `AFFECTED`: three paths. `UNAFFECTED`: inert root, project before-start/tools/commands registration, settings, installers, live sessions/providers.
- **Closure:** one host-integration region owns every mutable apply latch, compaction/context decision, and provider projection. Worker/model operations remain detached; only fresh results append after generation/ancestry recheck. The projector consumes Task 05 metadata and never becomes a second memory truth.
- **Checkpoint:** direct registration into a temp-loaded extension and public in-memory Pi drives actual preparation, hook consumption, append/rebuild, provider context, prompt races, native fallback, and acknowledgement with fakes.
- **Acceptance path:** host events + synthetic branches/fake roles → staged result → compact entry → observed provider messages/run/native-call/ack state. Native paths and visible run are `PRESERVE`; settled 6/4 apply and narrow plastic filtering `CHANGE`; timer compaction, broad transcript rewriting, and accidental internal native fallback are `REMOVE`.
- **Counterexample:** removing every later `compactionSummary` passes custom strides but erases an emergency native summary. Fixtures map each role/order position to fresh branch entries and require native/mixed no-op or apply block.

## Acceptance
- [ ] Guarded provider projection yields latest cumulative + raw C3–C6, then latest cumulative + raw C5–C8, then a third stride with descendants; it removes only branch-mapped older plastic summaries proven subsumed by latest structured range/digest.
- [ ] Native-only and emergency-latest branches are message-equivalent no-op. A native/ambiguous compaction inside a proposed removable range blocks custom apply rather than filtering or pretending exact 6/4 context.
- [ ] Startup appends at most one safe bootstrap; edge events schedule one snapshot pipeline; tree/fork/session switch/reload/shutdown advances generation, aborts jobs, clears stale pending, and rejects late append.
- [ ] Background work may run during a response, but no `ctx.compact()` occurs until recorded settlement plus fresh idle/no pending/apply lock; completion after settlement uses the same checks.
- [ ] One unguessable in-memory intent binds internal manual call. The synchronous hook revalidates session/generation/full prefix/latest compaction/window/cut/tool pairs and consumes once; stale/missing internal state returns `{ cancel: true }`, never native fallback.
- [ ] Real manual may consume fresh valid staged state or fall through. Threshold/overflow never wait and use staged state only when its cut exactly equals host preparation; otherwise native current-visible-model fallback runs. `Nothing to compact` defers valid pending until source advancement/TTL.
- [ ] Matching uniquely headed `session_compact` alone acknowledges cycles. Real host integration proves prompt/queue/overlap interleavings, at most one append, no visible abort/overwrite/model switch, and correct custom/native provider messages.

## Constraints
- Do not import/modify `index.ts`, register project `before_agent_start`/tools/commands, edit `project-memory.ts`, or touch settings. The module remains unwired.
- Do not filter by summary text; projector uses role/order plus fresh branch and structured plastic details. Ambiguity blocks/no-ops.
- No timer/polling/sleep workaround, provider call, live auth/state, `pi.setModel`, or second compaction owner. Hook consumption performs no model/file I/O.
- Integration is `NO_STATEFUL_RESOURCES`/`DISPOSABLE_VERIFIED` with public in-memory Pi and run-owned temp agent roots.

## Validation
- `node extensions/test/plastic-memory-integration.smoke.mjs` — PASS with actual host hook/entry/provider context and observed three-stride, native/emergency no-op, active/settled, prompt/queue/overlap, deferral, nonce cancel, host fallback, acknowledgement, generation, and visible-model signals
- `node extensions/test/plastic-memory-host.smoke.mjs` — foundational host capability remains PASS
- `node extensions/test/plastic-memory-workers.smoke.mjs` — worker scheduler remains PASS
- `node extensions/test/plastic-memory-compaction.smoke.mjs` — staged cut/pending metadata remains PASS
- `git diff --check -- extensions/plastic-memory/compaction/projection.ts extensions/plastic-memory/runtime/coordinator.ts extensions/test/plastic-memory-integration.smoke.mjs` — no whitespace errors

## Stop If
- Exact repeated provider context requires text matching or filtering native/ambiguous evidence; coordinator cannot reproduce `HOST_CAPABILITY: PASS`; internal versus real manual intent is ambiguous; a prompt can be aborted/overwritten; overlap can double-append; or host never reaches a valid staged hook.

## Checkpoint
- Recovery snapshot: not required; all targets are new and the root stays inert.
- Commit scope: the three `Change` paths only.
