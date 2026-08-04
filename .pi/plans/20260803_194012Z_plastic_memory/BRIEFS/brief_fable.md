# Plan Brief — Alternate — plastic-memory semantic-cycle 6/4 revision

## Intent and Success Boundary

Approved: regenerate the plastic-memory plan so one first-party extension at `extensions/plastic-memory/` owns short/medium/long memory with four Luna worker roles, semantic Reflector cycles (not token cuts), sliding `6/4` proactive compaction applied only at idle/settled through `ctx.compact()`, native emergency fallback, and bounded durable project context. Planning only; no implementation, live provider call, reload, or settings mutation.

Success is not "the design is described". Success is that the revised plan can only be executed in a way where **every checkpoint is falsifiable without a provider**, and where each of the eight named failure boundaries (100k arrival, partial-valid worker output, branch divergence, result before/after `agent_settled`, reentrant `ctx.compact`, unsafe custom cut, threshold/overflow, repeated-summary degradation, self-hosted cutover) has a deterministic host-observable oracle. The one ambiguity that materially changes strategy: whether cycle *closure* is a model judgment or a host-deterministic derivation. I recommend the latter (see Strategy), and the plan wording must be explicit, because the approved contract's phrase "explicitly and validly acknowledges the complete supplied span" is otherwise implementable as "trust the model's coverage claim", which is the exact defect being removed from OM.

## Verified Context and Constraints

### KNOWN — the host apply path is narrower than the contract assumes

- `ctx.compact()` is a void wrapper around manual `AgentSession.compact()` with `onComplete`/`onError` callbacks: `dist/core/extensions/types.d.ts:200-204` (`onComplete?: (result: CompactionResult) => void; onError?: (error: Error) => void;`) and `dist/core/agent-session.js:1911-1923`.
- Manual compact starts with `this._disconnectFromAgent(); await this.abort();` — `dist/core/agent-session.js:1367-1369`. Event reconnection happens only in `finally { this._compactionAbortController = undefined; this._reconnectToAgent(); }` — `dist/core/agent-session.js:1479-1482`.
- **Decisive and, in my reading, under-weighted: the hook is gated behind host preparation.** `prepareCompaction()` returns `undefined` when the last branch entry is a compaction (`dist/core/compaction/compaction.js:493-495`) or when `messagesToSummarize.length === 0 && turnPrefixMessages.length === 0` (`compaction.js:539-541`). Manual compact then throws `"Nothing to compact (session too small)"` **before** `session_before_compact` is emitted: `agent-session.js:1381-1388`. Default `keepRecentTokens: 20000` (`compaction.js:77`) drives that cut. So a staged, perfectly valid 6/4 result can be *unreachable*: the extension never gets asked.
- Manual compact resolves auth before the hook: `agent-session.js:1376`. `_getSummarizationRequestAuth` swallows failures and returns `{}` unless `streamFunction === streamSimple`, where it delegates to `_getRequiredRequestAuth` and throws: `agent-session.js:192-205,166-190`. `if (!this.model) throw` at `agent-session.js:1372-1374`. Net: proactive apply still depends on a selected visible model, and in `streamSimple` mode on visible-provider auth, even though Luna produced the summary.
- `{ cancel: true }` from the hook throws `"Compaction cancelled"` on the manual path (`agent-session.js:1394-1396`) and returns `false` without appending on the auto path (`agent-session.js:1625-1634`). Returning **no** result falls through to native `compact(...)` with the visible model (`agent-session.js:1440-1450`, `1652-1660`).
- `appendCompaction()` performs no validation of any kind: `dist/core/session-manager.js:802-816`. `buildContextEntries()` emits `[compaction, ...entries from firstKeptEntryId..compactionIdx, ...descendants]`, and if `firstKeptEntryId` is not found on the path before the compaction, `foundFirstKept` never flips and all retained context collapses to the summary alone: `dist/core/session-manager.js:198-226`.
- Native cut safety comes from `isCutPointMessage` returning `false` for `toolResult` and from `findValidCutPoints`/`findCutPoint`: `dist/core/compaction/compaction.js:227-241,262-276,308-345`. None of that runs on an extension-supplied `firstKeptEntryId`.
- `_isAgentRunActive = false` is set **at the top of** `_emitAgentSettled()`, before the extension `agent_settled` emit: `agent-session.js:314-323`. So `ctx.isIdle()` is already `true` inside an `agent_settled` handler, and `_runAgentPrompt`'s `finally` also clears `_systemPromptOverride` there: `agent-session.js:744-756`.
- `prompt()` checks `isStreaming` but **never** `isCompacting` (`agent-session.js:792-915`; `isCompacting` exists only as an internal getter, `agent-session.js:646-651`, and is not on `ExtensionContext`, `dist/core/extensions/types.d.ts:209-249`). A user prompt submitted during the async window of our compaction proceeds and its run's `agent.state.messages` is later overwritten by `this.agent.state.messages = sessionContext.messages` (`agent-session.js:1434-1437`).
- `session_compact` resolves its entry by `newEntries.find(e => e.type === "compaction" && e.summary === summary)` — first match by **summary text**: `agent-session.js:1439-1441` (manual), `1675-1677` (auto).
- Extensions get `ctx.sessionManager: ReadonlySessionManager` (`types.d.ts:218-219`; `Pick<... "getLeafId" | "getBranch" | "buildContextEntries" | "getEntries" | "getTree" ...>`, `dist/core/session-manager.d.ts:140`) and `pi.appendEntry(customType, data)` for non-context state (`types.d.ts:922-923`; `CustomEntry` "Does NOT participate in LLM context", `session-manager.d.ts:66-73`).

### KNOWN — OM 3.0.3 already ships a proactive `ctx.compact()` coordinator

Installed source: `/Users/j.henrique/.pi/agent/npm/node_modules/pi-observational-memory/src/`.

- `src/hooks/compaction-trigger.ts:13-95`: on `agent_end`, guard `runtime.compactInFlight`, skip when Pi will auto-retry (`RETRYABLE_ERROR_RE`), capture `hasUI`/`ui` synchronously because "the setTimeout + async work below may outlive the extension ctx", then `setTimeout(..., 0)` → re-check `ctx.isIdle()` → re-check the threshold on a **fresh** `ctx.sessionManager.getBranch()` → `ctx.compact({ onComplete, onError })`, with `onError` special-casing `"Compaction cancelled"`.
- `src/hooks/compaction-hook.ts:16-26`: on re-entry, `if (runtime.compactHookInFlight) return { cancel: true };` — shipped precedent for cancel-on-duplicate rather than silent native fallback.
- `src/hooks/compaction-hook.ts:30-45`: OM always echoes back `preparation.firstKeptEntryId` — i.e. the host's cut. Overriding the cut is genuinely new, unproven surface.
- Scheduling gate: `if (runtime.consolidationInFlight) return;` before `anyStageDue`, shared by `agent_start` and `turn_end`: `src/hooks/consolidation-trigger.ts:100-104,117-140`; flag lifecycle in `src/runtime.ts:63-76,88-104`. No cooldown, no attempt identity, no post-await generation recheck.
- One 100k delta → one chunk, one call: `sourceEntriesAfter(...)` + `serializeSourceAddressedBranchEntries(chunkEntries)` with `coversUpToId = chunkEntries.at(-1)?.id`: `src/hooks/consolidation-trigger.ts:180-196`. Confirms "no `floor(backlog/threshold)` fan-out" is the *existing* behavior, not a new invention.
- False coverage: nonempty observations advance coverage to the whole chunk tip regardless of which allowed IDs were cited: `src/hooks/consolidation-trigger.ts:216-247`.
- **The Reflector never sees the source span at all.** It is called with `folded.reflections` and `folded.activeObservations` only, and its coverage marker is copied from the observer's marker: `src/hooks/consolidation-trigger.ts:262-286` (`const observationCoverageId = latestCoverageMarkerId(entries, OM_OBSERVATIONS_RECORDED)` … `buildReflectionsRecordedData(reflections, observationCoverageId)`).
- Coverage is branch-relative by construction: `latestCoverageIndex` drops any marker whose `coversUpToId` is not resolvable in the current branch's id→index map: `src/session-ledger/progress.ts:46-58,60-74`.

### KNOWN — Smart Compact supplies the exact prefix guard we need

- `buildEntryIdFingerprint(ids)` → `{count, prefixHash, tail}` and `isPrefixOf(cached, currentIds)` (hash of the first `count` current ids + 16-id tail check): `/private/tmp/plastic-memory-evidence/pi-smart-compact/dist/index.js:1999-2039`.
- One-slot pending with TTL + session-id equality only, consume-once: `dist/index.js:6647-6698`; pending shape carries `firstKeptEntryId` at `dist/index.js:6408-6419`; consumption sites `dist/index.js:6917-6920,6966-6969`. The prefix machinery exists but is **not** wired into `consume()` — that is the adaptation, not a port.

### KNOWN — project context and repo state

- `extensions/project-memory.ts` injects `_summary.md` (8,000 chars) and the architecture index (4,000 chars) via `before_agent_start` and owns no compaction hook: `extensions/project-memory.ts:18-19,35-37,142,149-163` (handoff-verified; consistent with the file present at `extensions/project-memory.ts`).
- Active `settings.json` still loads `npm:pi-observational-memory@3.0.3` (`/Users/j.henrique/.pi/agent/settings.json:13`) with `observeAfterTokens: 10000`, `reflectAfterTokens: 20000`, `compactAfterTokens: 81000` (`settings.json:18-30`). The dirty shared file `config/settings.json` is a *different* file with an older `lastChangelogVersion: "0.80.3"` and no `@juicesharp/rpiv-voice` package (`config/settings.json:2,7-12`). Two settings surfaces exist; cutover work must name which one it edits and must not rewrite the other.

### INFERRED

- Because six cycles under the default edge triggers imply roughly ≥120k raw tokens, `prepareCompaction` will normally have material to summarize in production — but small synthetic fixtures will silently hit the `undefined` path. A green unit fixture therefore does not prove the host will ever ask us for the staged result.
- Since `setTimeout(0)` is a macrotask and the `agent_settled` emit chain is microtask-drained, OM's `agent_end`+timer trick usually lands after settlement; the approved `agent_settled` + `hasPendingMessages()` gate is strictly stronger and should replace it rather than sit beside it.
- Because cycle records are `CustomEntry` nodes in the session tree and coverage resolution is branch-local, the cycle ledger is inherently branch-scoped; a sidecar file ledger would desynchronize on fork.
- The frozen prefix ends exactly where the preserved window begins, so `firstKeptEntryId` must equal the branch entry at index `frozenPrefix.count`. That makes prefix fingerprint and cut boundary one predicate rather than two.

### UNKNOWN / TO VERIFY

- **Reentrancy of two overlapping `compact()` calls.** `this._compactionAbortController` is reassigned by the second call (`agent-session.js:1370`) while the first re-reads `this._compactionAbortController.signal` after its awaits (`agent-session.js:1430-1432`); whether that yields two `appendCompaction` calls is not proven by reading alone. TO VERIFY with a synthetic session harness.
- **Damage from a user prompt landing inside the compaction window** (messages array swap at `agent-session.js:1434-1437`). TO VERIFY by fixture; determines whether "cancel late" is sufficient or the trigger needs an extra quiet-period.
- Whether any extension-visible signal other than `session_before_compact`/`session_compact` reports a competing host compaction (`isCompacting` is not exported on `ExtensionContext`). TO VERIFY.
- Resolved runtime context window for `openai-codex/gpt-5.6-luna` (`models-store.json` 272,000 vs `models.json` 300,000) — must be read from the registry at run time, never hardcoded. Live quality/latency remains UNVERIFIED by constraint.
- OM `src/agents/*` prompt/tool contracts were not re-read line-by-line in this pass; the reusable allowlist/fold claims are carried from the handoff as KNOWN, but exact adaptation lines are TO VERIFY during implementation.

## Recommended Strategy and Tradeoffs

**Core thesis: make the model advisory and the boundary arithmetic deterministic.** Every one of the eight failure boundaries collapses into two host-side pure predicates plus one scheduler. Build those three things first, prove them with pure fixtures, and only then let a fake Luna near them.

### 1. Cycle closure is derived, not claimed (rejects the OM inheritance)

The Reflector in OM cannot honestly certify a source span — it never receives one (`consolidation-trigger.ts:262-286`). So do not restate the contract as "the Reflector acknowledges the span". Restate it as: the *observer* stage produces per-source-ID observations under an allowlist; a **deterministic cycle-closer** compares the set of acknowledged source IDs against the snapshot's ID set and emits exactly one of `complete` / `partial` / `oversized`. The Reflector contributes semantic content and an echoed cycle ID; if the echo is missing, stale, or references IDs outside the snapshot, the run yields `partial` and advances nothing. This single decision:

- kills false coverage (`consolidation-trigger.ts:216-247`) without new model trust;
- makes "valid completion with zero new reflections" trivially representable (`complete` coverage, empty reflection list);
- makes partial-valid output a *first-class* state instead of an error path;
- makes the 100k case a pure arithmetic question (does the snapshot fit the resolved budget? if not → `oversized`, retain raw, no retry until source advances).

Cost: the plan loses the elegance of "the model tells us when a cycle is done". I accept that; a model-asserted watermark is unfalsifiable in a provider-free test suite, and the entire validation policy here is provider-free.

### 2. One snapshot identity + attempt identity, both content-addressed

Replace OM's single boolean (`runtime.consolidationInFlight`, `runtime.ts:25`) with: snapshot id = digest of the ordered source-ID list after the last valid coverage marker; attempt record = `{snapshotDigest, sessionId, leafGeneration, outcome, attemptCount}` appended as a `CustomEntry`. Suppression rule: refuse a new pipeline for the same digest after N failures; unblock only when the digest changes (source advanced) or the user explicitly asks. Post-await recheck of `sessionId` + branch membership discards late results. This one mechanism covers *both* the hot-retry loop and branch divergence, and it is pure-testable (no model). Keeping the existing `agent_start`/`turn_end` edge triggers and the in-flight gate is right — they already behave correctly for the 100k case; simplify them, do not rebuild them.

### 3. The pending guard is one predicate, not a checklist

Adapt `buildEntryIdFingerprint`/`isPrefixOf` (`smart-compact dist/index.js:1999-2039`) into the pending slot's `consume()` (which today checks only TTL + session, `dist/index.js:6647-6698`). Acceptance requires, evaluated against a **fresh** `ctx.sessionManager.getBranch()` at hook time: same session id; within TTL; `isPrefixOf(frozenPrefix, currentIds)`; `currentIds[frozenPrefix.count] === firstKeptEntryId`; that entry is a valid cut (not a tool result, not orphaned, not a compaction) by re-implementing the host's own `isCutPointMessage` rule (`compaction.js:227-241`); and no compaction entry appended since freeze. Appended descendants pass by construction; fork, divergence, reorder, and competing compaction all fail the same predicate. Rejecting anything → clear the slot.

### 4. The internal/external fork is the answer to Stop-If #2

Tag the request. When `session_before_compact` fires:

- **Internal proactive request** (our `ctx.compact()` in flight) and validation fails → return `{ cancel: true }`. Manual path throws `"Compaction cancelled"` (`agent-session.js:1394-1396`) straight into our `onError`; nothing is appended; native compaction never runs. OM already uses exactly this idiom (`compaction-hook.ts:16-26`).
- **Host-originated** `manual`/`threshold`/`overflow` and no fresh valid result → return nothing, let native compaction run with the visible model (`agent-session.js:1440-1450,1652-1660`).

That is a two-line rule, fully testable with a fake hook emitter, and it is the crispest available discharge of the "internal stale-apply must not accidentally trigger native compaction" constraint.

### 5. Shrink the apply window rather than trying to lock it

The window between `ctx.compact()` and hook consumption contains real awaits (`abort`, auth) and the host does **not** block prompts during compaction (`prompt()` at `agent-session.js:792-915` checks only `isStreaming`). Therefore: the hook body must be pure and synchronous over already-staged state (no I/O, no model call, no file read); trigger only from `agent_settled` with `ctx.isIdle() && !ctx.hasPendingMessages()`; re-assert both inside the hook and `{cancel:true}` if either flipped. Accept and *document* the residual race (event listeners are detached between `_disconnectFromAgent()` and the `finally` reconnect, `agent-session.js:1368,1479-1482`). Do not attempt to defeat it with polling or timers — that adds machinery without removing the race.

### 6. Cumulative summary must be re-derivable, and must never repeat verbatim

Two independent reasons, one mechanism. (a) `buildContextEntries` keeps only the *latest* compaction (`session-manager.js:198-215`), so each new cumulative summary must subsume all prior ones — summary-of-summary drift is unbounded across strides. (b) `session_compact` resolves its entry by summary-text equality (`agent-session.js:1439-1441`), so two identical summaries silently mis-bind the acknowledgement. Mechanism: the compactor's input is the structured ledger + exact cycle/source IDs + prior *structured* compaction state + the bounded project index, and every stored summary carries a unique cycle-range header (`cycles C1–C4 @ <digest>`). Deterministic verification then re-checks required facts, active memory IDs, cycle coverage, file ops, unresolved errors, decisions, constraints, goals, open loops against the structured state — not against prose. Raw source entries remain readable via `getBranch()` even after they leave context (append-only session), so re-derivation from evidence is always possible; bound it by structured state to keep cost finite.

### Sequencing logic (dependencies, not a schedule)

1. **Host truth first.** The custom-cut characterization fixtures are the gate for everything else, because `appendCompaction` validates nothing (`session-manager.js:802-816`) and an invalid cut silently destroys retained context (`session-manager.js:216-226`). Add the two cases I believe are currently missing from the plan's fixture list: **`prepareCompaction` returns `undefined` → hook never fires**, and **prompt submitted inside the compaction window**. If host truth fails here, Stop-If #1 fires before any worker code exists.
2. **Pure ledger algebra next** (snapshot digest, cycle records, coverage classification, 6/4 window arithmetic with stride two, prefix/cut predicate). All provider-free, all pure functions over an entry array.
3. **Then the scheduler/coordinator** (edge triggers, attempt suppression, settled/idle apply, internal-vs-host cancel rule), tested with a fake session emitting the real event order.
4. **Then the Luna compactor behind a fake adapter** (structured input, model resolution from the registry, medium thinking, timeout/auth failure, verification/repair, scrubbing).
5. **Project context** (shared read model producing the 8,000-char summary + 4,000-char active-chunk index + optional 4,000-char architecture index, consumed by both `before_agent_start` and the compactor input) is genuinely parallel to 2–4 once the schema exists; its only ordering constraint is that exactly one owner injects it before the old `project-memory.ts` becomes a bridge.
6. **Cutover last**, deferred and non-destructive.

### Rollback / preservation boundaries

Three natural rollback boundaries, each self-contained: (a) everything up to and including the pure ledger is inert — no hooks, no settings, deletable with zero session effect; (b) the coordinator behind a config flag that defaults to "prepare but never apply" — staged results are computed and asserted but `ctx.compact()` is never called, so proactive compaction can be disabled by config without code removal; (c) cutover, which stays a separate, reversible settings edit. I recommend the plan *require* boundary (b) as a shipped configuration state, because it is also the safest self-host cutover posture: run plastic-memory in prepare-only mode alongside native compaction first, and flip to applying cuts only after the staged results have been observed to validate repeatedly.

### Explicitly rejected

- **Rejected: keeping OM's `agent_end` + `setTimeout(0)` trigger** (`compaction-trigger.ts:60-95`). It relies on macrotask ordering to approximate settlement; `agent_settled` is the documented signal (`docs/extensions.md:558-571`) and `_isAgentRunActive` is already false when it fires (`agent-session.js:314-318`).
- **Rejected: a sidecar JSON cycle ledger.** Branch-local coverage resolution (`progress.ts:46-58`) makes tree-resident `CustomEntry` records the only representation that stays honest across forks.
- **Rejected: bounded partition of an oversized cycle in the first delivery.** The contract permits it only if all parts are provable and fan-out is capped; `oversized/partial` + raw retention + the emergency path already satisfies every acceptance journey. Adding partitioning now buys nothing and reintroduces the fan-out risk the contract exists to prevent.
- **Rejected: asking the Reflector to certify coverage** (see §1).

## Useful Disagreement / Alternative

**The strongest objection to my own recommendation:** the sliding 6/4 window with custom cuts is the single highest-risk element, and a credible alternative is to keep cycles and Luna-assisted summaries but **never override `preparation.firstKeptEntryId`** — echo the host's cut exactly as OM does today (`compaction-hook.ts:38-44`), and let the cycle window only decide *when* to compact and *what content* to summarize. That eliminates the entire unsafe-cut class, removes the `buildContextEntries` collapse hazard, and needs no ancestry validation at all.

I retain the custom-cut design, for one reason grounded in evidence: the host cut is purely token-metric (`findCutPoint`, `compaction.js:308-345`, `keepRecentTokens: 20000`, `compaction.js:77`) and will slice through the middle of a retained cycle, so "preserve the latest four cycles raw" is simply not expressible without overriding it. The approved contract's acceptance journey 2 ("rebuilt context contains verified cumulative summary + raw C3–C6") is unsatisfiable under the alternative.

**Evidence that would flip me:** if the host characterization fixture shows that a valid ancestor cut plus descendants appended during preparation does *not* reproduce the intended context (or that overlapping `compact()` calls can double-append), then the custom-cut path is unsafe at the host level and the plan should fall back to host-cut echoing with cycle-aware *content* only — and the approved 6/4 retention shape must be renegotiated rather than faked. That is a contract escalation, not a silent substitution.

**Where I likely diverge from the other briefs:** I treat `prepareCompaction`'s pre-hook gate and the summary-equality lookup in `session_compact` as first-order design constraints rather than trivia, and I recommend a shipped "prepare-only" mode as both the rollback boundary and the cutover posture.

## Risks and Bounded Open Questions

1. **Silent unreachability (highest, most likely to be missed).** `prepareCompaction` → `undefined` means the hook never fires and the staged result is never consumed (`compaction.js:493-495,539-541`; `agent-session.js:1381-1388`). *Mitigation:* treat `onError("Nothing to compact…")` as **defer**, not discard; keep the pending slot until TTL; size integration fixtures above `keepRecentTokens`. **Counterexample to the approved checkpoint set:** acceptance journey 2 can pass in a unit harness that calls the hook directly while the real host never invokes it — a checkpoint that depends on omitted work (a host-level "hook was actually reached" assertion). The revised plan must make "the host emitted `session_before_compact` and the resulting `firstKeptEntryId` equals ours" the observable, not "our hook returned a result".
2. **Prompt inside the apply window.** `prompt()` ignores `isCompacting`; a late `appendCompaction` overwrites `agent.state.messages` mid-run (`agent-session.js:792-915,1434-1437`). *Mitigation:* pure synchronous hook, re-assert idle/no-pending, cancel late. Residual risk documented; TO VERIFY by fixture.
3. **Repeated-summary mis-binding.** Identical summary text across two compactions resolves `session_compact` to the wrong entry (`agent-session.js:1439-1441,1675-1677`). *Mitigation:* unique cycle-range digest header in every stored summary.
4. **Invalid cut destroys context.** `appendCompaction` validates nothing; a non-ancestor id collapses retained context (`session-manager.js:802-816,198-226`). *Mitigation:* fail-closed prefix/cut predicate re-evaluated at hook time against a fresh branch; never trust the freeze-time snapshot.
5. **Apply path depends on visible model/auth.** `if (!this.model) throw` (`agent-session.js:1372`) and `streamSimple` auth throw (`agent-session.js:192-194`). *Mitigation:* fail-soft — treat as defer, never as cycle invalidation; never switch the visible model.
6. **Branch-divergence coverage amnesia.** Coverage markers unresolvable on the current branch are ignored (`progress.ts:46-58`), so a fork can make a large span look uncovered and schedule a huge re-observation. *Mitigation:* the same snapshot-digest + oversized classification bounds it to one attempt; no fan-out, no loop.
7. **Two settings surfaces.** `/Users/j.henrique/.pi/agent/settings.json` is the active one (`:13`); `config/settings.json` is dirty and stale (`:2,7-12`). *Mitigation:* cutover names exactly one file, is deferred, and preserves unrelated hunks in `config/settings.json`, `install.sh`, `install.ps1`.

**Bounded open questions that could change execution:** (a) does overlapping `compact()` double-append (`agent-session.js:1370,1430-1432`)? (b) what is the observable damage of a prompt landing mid-window? (c) is there any extension-visible competing-compaction signal beyond the two hook events? Each is answerable by a synthetic in-memory fixture with no provider and no real session path, and each is a pre-condition for trusting the coordinator, not a post-hoc check.
