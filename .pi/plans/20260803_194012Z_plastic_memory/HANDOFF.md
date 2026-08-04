# Planning Handoff — plastic-memory cycle-compaction revision

## Reconciled Planning Contract

Revise the existing plastic-memory plan in place. This is planning only: do not implement, call a live provider, reload Pi, migrate real memory, or mutate live settings.

### Approved outcome

Deliver one first-party modular extension at `extensions/plastic-memory/` that owns short-, medium-, and long-horizon memory with exactly one compaction authority and **four** separately configured model roles:

1. `observer`
2. `reflector`
3. `compactor`
4. `project-promoter`

Installed defaults for all four roles are `openai-codex/gpt-5.6-luna` with thinking `medium`. They never switch the visible session model and never silently fall back to it for ordinary worker work.

### Semantic cycle contract

- Tokens are not compaction units. A Reflector cycle is one contiguous source span closed at a safe completed-turn boundary, with stable cycle ID, start/end source IDs, digest, coverage status, and linked observation/reflection IDs.
- The existing approximate `observeAfterTokens: 10000` and `reflectAfterTokens: 20000` values remain **edge triggers** that decide when to inspect accumulated work; they never imply fixed-size cuts or `floor(backlog/threshold)` repetitions.
- One large uncovered snapshot, including a synthetic ~100k-token arrival, schedules at most one observer→reflector pipeline and closes at most one logical cycle. It must not create five cycles, five concurrent calls, duplicate watermarks, or a hot retry loop.
- A valid Reflector completion may close a coverage cycle with zero new reflections only when it explicitly and validly acknowledges the complete supplied span. Invalid, timed-out, stale, partial, or unauthenticated output does not claim semantic coverage or count toward the compaction window.
- Attempt/failure identity must suppress automatic retry of the same unchanged snapshot after a bounded retry policy; retry can resume after source advancement or explicit request. Session/branch replacement discards late results.
- A cycle boundary must be a Pi-valid cut: never a tool result, never between a tool call and its result, and always an ancestor on the current branch at application time.

### Legacy-session bootstrap and bounded backfill

- A session created before plastic-memory must never treat every historical source entry from `getBranch()` as one new uncovered worker prompt. The observed current failure is an OM observer repeatedly attempting an approximately 6,956,515-token chunk, returning no observations, advancing no coverage, and retrying the same branch backlog.
- Default compatibility mode is **safe resume**. Fold and dual-read valid legacy `om.*` observations/reflections/drops; inspect the latest valid legacy coverage markers and Pi compaction-aware `buildContextEntries()`; create one append-only plastic bootstrap record with session/generation, baseline/start boundary, active-context digest, imported legacy markers, latest compaction identity, and explicit historical-gap status.
- Normal plastic cycles begin after the validated bootstrap boundary. Entries excluded from active compaction-aware context remain append-only evidence and are reported as `historical-unindexed`; they are not deleted, fabricated as covered, or automatically sent to a provider.
- If the active compaction-aware context itself exceeds the resolved Luna input allowance, select one newest safe completed-turn window that fits, record the older active prefix as a gap, and continue without a hot loop. A synthetic 100k active window must still be processed once when it fits.
- Full historical reconstruction is explicit only: `/memory:backfill` is report/no-write-by-default and requires explicit start/publish execution. It walks completed-turn/source boundaries with a persistent branch-local cursor, one bounded window at a time, capped attempts/calls, pause/resume, and no `floor(backlog/threshold)` fan-out. It must show gaps/conflicts/cost-shape before provider work and never inspect another session or project implicitly.
- An unchanged failed/oversized historical window is suppressed until source/cursor advancement or explicit retry. Backfill records do not count as ordinary live cycles until their complete coverage is validated, and they cannot trigger a burst of multiple compactions.

### Sliding `6/4` compaction contract

- Ordinary proactive compaction is cycle-driven.
- When six complete, uncompacted/currently-retained Reflector cycles exist, freeze every complete cycle before the latest four. Initially this means compact C1–C2 and preserve C3–C6 raw.
- After two more complete cycles, compact the next eligible pair while preserving the latest four: cumulative summary(C1–C2) + C3–C8 becomes cumulative summary(C1–C4) + raw C5–C8. Continue with stride two.
- The compactor runs Luna asynchronously over the frozen eligible prefix. It uses the structured ledger, exact cycle/source IDs, deterministic file/command/error/constraint/decision/goal/open-loop extraction, prior structured compaction state, and current bounded project-memory index. It must not recursively trust prior prose as the only source.
- Deterministic verification/repair remains mandatory around Luna output. Required facts, active memory IDs, cycle coverage, file operations, unresolved errors, decisions, constraints, goals, and open loops must survive or the result is not applied.
- A pending result is one-consumer, session-bound, cycle-prefix-bound, cut-bound, scrubbed, bounded, and TTL-limited. It accepts appended descendants only when the frozen entry-ID prefix remains an ordered ancestor prefix and the proposed `firstKeptEntryId` still begins the preserved cycle window. Fork/reload/session switch/branch divergence/another compaction invalidates it.
- The visible model must never be interrupted for ordinary proactive compaction. Background preparation may overlap a visible response. Application occurs only when `ctx.isIdle()` is true, there are no pending messages, and Pi has reached `agent_settled`; if preparation finishes after settlement, apply immediately only after the same idle/pending checks. `ctx.compact()` is never called while an agent run is active.
- The custom hook may return the staged Luna result only after revalidating session, ancestry, exact prefix digest, cut type, tool pairing, cycle window, and no competing compaction. Application is idempotent and cannot start a second overlapping `ctx.compact()`.

### Emergency contract

- Tokens/context-window usage remain a physical circuit breaker only. Do not create an ordinary token-count compaction cadence.
- Pi `threshold` or `overflow` takes priority over the cycle window. If a fresh validated staged result is not ready, plastic-memory returns no custom result and Pi performs native compaction with the **current visible session model**.
- Manual `/compact` may use a fresh validated Luna result when available; otherwise native fallback remains usable.
- A single cycle or atomic source entry that cannot fit the configured Luna input budget is explicit `oversized/partial`, never false full coverage. Use bounded safe-entry/turn partitioning under one logical cycle only if implementation can prove all parts and cap fan-out; otherwise retain raw evidence and rely on the emergency path. No unbounded loop.

### Durable project context

- Human-authoritative canonical Markdown chunks, deterministic root/category summaries, `index.json`, lexical search, namespaced recall, explicit promoter proposals, explicit `/memory:accept`, flat fallback/migration, and optional architecture JSON/HTML remain in scope as planned.
- Every visible model call must receive bounded long-term context through `before_agent_start`: root project summary capped at 8,000 chars, compact active-chunk index capped at 4,000 chars, and optional architecture index capped at 4,000 chars. Never inject all chunks or full architecture JSON.
- `memory_recall`/`memory_search` retrieve full targeted material on demand. Never register a new bare `recall`.
- Project context is assembled once by a shared validated read model and reused by the context hook and compactor input. It need not be duplicated inside the stored compaction prose when Pi’s per-run system-prompt injection already keeps it visible; validation must prove manual/threshold/overflow retry and subsequent prompts still receive it.

### Existing capability disposition

**PRESERVE**
- Pi native recent-message/session behavior outside applied cycle cuts; manual/threshold/overflow fallback; append-only session evidence.
- Dual-read legacy `om.*` records and raw lowercase 12-hex recall with honest collision/partial/unavailable states.
- One compaction owner, fail-soft provider/auth behavior, no visible-model switching by workers.
- Flat Project Memory fallback; 8,000-char summary; CURRENT/POSSIBLY_STALE/HEAD_UNKNOWN architecture status; optional authoritative `architecture.json`; generated `architecture.html`.
- Non-destructive dry-run-first project migration, explicit publication, source/license attribution, recursive cross-platform install and deferred activation.

**CHANGE**
- Three model roles → four roles by adding `compactor`.
- Deterministic-only compaction → Luna-assisted, deterministic-verified compaction.
- No proactive compaction → cycle-window proactive compaction.
- Exact-leaf pending guard → validated ordered-prefix/ancestor guard permitting appended descendants.
- Reflection token watermark alone → explicit semantic cycle/checkpoint records plus separate attempt suppression.
- Startup project summary only → summary + compact chunk index on every visible run.

**REMOVE / supersede from old plan**
- “No model call in compaction.”
- “Exactly three worker roles.”
- “No `ctx.compact()` / no proactive compaction trigger.”
- “Host `firstKeptEntryId` must always remain unchanged” for ordinary cycle compaction. Custom cycle cuts are allowed only after strict validation and the early host fixture proves them; native emergency paths continue to use host preparation.
- Any remaining Qwen worker default, including stale Task 12 wording.

### Acceptance journeys

1. **Huge arrival:** inject a synthetic ~100k-token source snapshot, emit repeated `agent_start`/`turn_end`, and observe one snapshot identity, at most one in-flight pipeline, one logical cycle, no duplicate records, and no loop. A valid output covers the complete span; partial output cannot advance full coverage.
2. **Initial 6/4:** close C1–C6 at safe turn boundaries; freeze C1–C2; run fake Luna compactor asynchronously while descendants arrive; at settled/idle apply exactly once; rebuilt context contains verified cumulative summary + raw C3–C6 + all later descendants.
3. **Sliding stride:** close C7–C8; compact only the next eligible pair into cumulative state; retain raw C5–C8. Repeat once more to refute off-by-one/cycle duplication.
4. **No interruption:** staged result becoming ready during a visible response never calls `ctx.compact`; it waits for `agent_settled` and no queued messages. If already settled, completion-side idle checks can apply.
5. **Staleness:** fork, branch divergence, session switch, reload, different cut, another compaction, missing boundary, tool-result boundary, or reordered prefix rejects and clears the pending result without native compaction accidentally starting from an internal stale-apply attempt.
6. **Emergency:** context threshold/overflow before a valid pending result bypasses 6/4 and falls through to native compaction with the current visible model. Worker failure does not block the session.
7. **Durable context:** startup, ordinary next prompt, and post-compaction retry all contain bounded project summary + compact chunk index + optional architecture index; no full chunk sentinel appears; recall retrieves the full chunk by ID.
8. **Legacy safe resume:** load a synthetic pre-plastic branch containing millions of historical estimated tokens, a prior Pi compaction, mixed valid/invalid `om.*` records, and no plastic watermark. Startup imports valid legacy memory, establishes one baseline from compaction-aware active context, reports the older prefix `historical-unindexed`, makes zero multi-million-token provider request, and repeated lifecycle events do not duplicate bootstrap/attempts. Explicit backfill report and one bounded window are separately fixture-proven.
9. **Compatibility/cutover:** legacy/new recall, flat-only project injection, migration, one-owner activation, installer staging, and rollback remain provider-free and non-destructive.

## Pre-Plan Evidence

### KNOWN — Pi 0.83.0 host

- Installed host is `@earendil-works/pi-coding-agent` 0.83.0 under `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/`.
- `ctx.compact()` is fire-and-forget but calls manual `AgentSession.compact()`, which disconnects and aborts an active operation first: `dist/core/agent-session.js:1363-1370,1908-1921`. Therefore ordinary apply must wait for idle/settled.
- `agent_end` can precede retries/auto-compaction/continuations; `agent_settled` follows `_handlePostAgentRun()` completion: `docs/extensions.md:558-571`, `dist/core/agent-session.js:740-755`.
- `session_before_compact` custom results supply `summary`, `firstKeptEntryId`, `tokensBefore`, optional usage/details. Manual and auto paths copy them directly; `appendCompaction()` performs no ancestry, existence, type, or tool-boundary validation: `dist/core/extensions/types.d.ts:440-460,812-815`, `dist/core/agent-session.js:1390-1436,1617-1677`, `dist/core/session-manager.js:802-816`.
- Native `findCutPoint()` never chooses a tool result and retains tool results with their assistant call: `dist/core/compaction/compaction.js:225-267,292-308`.
- `buildContextEntries()` represents the latest compaction then retained ancestors from `firstKeptEntryId`, then descendants after the compaction: `dist/core/session-manager.js:195-225`.
- Direct pure fixture (no stateful resources) proved a valid old `firstKeptEntryId` preserved descendants appended before compaction; a missing boundary collapsed prior retained context to the compaction alone. Result: `pure delayed-boundary projection: PASS`; invalid-boundary loss is confirmed and requires fail-closed validation.
- `before_agent_start` fires after each user prompt before the agent loop and can rebuild the system prompt: `docs/extensions.md:521-556`, `dist/core/agent-session.js:840-906`. The override remains through post-run retry/auto-compaction continuation and resets only in `_runAgentPrompt()` finalization before `agent_settled`: `dist/core/agent-session.js:740-755`.
- Returning no custom result from manual/threshold/overflow invokes built-in compaction. `{ cancel: true }` cancels instead of falling back; internal stale apply must avoid accidentally falling through after calling `ctx.compact()`.

### KNOWN — Observational Memory 3.0.3

- `agent_start` and `turn_end` share one `consolidationInFlight` gate and serialize observer→reflector→dropper: `src/hooks/consolidation-trigger.ts:72-179`, `src/runtime.ts:64-76`.
- Due checks sum raw source tokens after the furthest valid `coversUpToId`; there are no cycle IDs, source-span digests, generation guards, or semantic completeness records: `src/session-ledger/progress.ts:36-110`, `src/session-ledger/types.ts:41-62`.
- One ~100k uncovered delta is serialized as one unbounded observer chunk and one call, not five. There is no provider input budget; only output max tokens are bounded: `src/hooks/consolidation-trigger.ts:53-55,181-247`, `src/agents/observer/agent.ts:139-188`, `src/model-budget.ts:3-7`.
- A live observed legacy-session failure reached approximately 6,956,515 estimated source tokens. OM returned no observations, appended no coverage, and repeated the same run. This matches the source behavior: empty/invalid output does not append, failures clear only the in-flight flag, and the next `agent_start`/`turn_end` sees the same unchanged branch backlog.
- Empty/invalid output appends nothing, but a nonempty valid subset currently advances coverage to the entire selected chunk tip; this false-coverage path must not be preserved: `src/hooks/consolidation-trigger.ts:187-247`, `src/session-ledger/types.ts:178-184`.
- Failures clear the in-flight flag but have no retry cooldown/attempt identity; unchanged work can retry on later events. No session/branch generation recheck exists after model awaits: `src/runtime.ts:79-105`, `src/hooks/consolidation-trigger.ts:187-294`.
- Source allowlisting and first-valid fold/tombstones are reusable: `src/agents/observer/agent.ts:67-82`, `src/agents/reflector/agent.ts:80-191`, `src/session-ledger/fold.ts:46-99`.

### KNOWN — Smart Compact 7.22.0

- Reusable mechanisms: one-slot consume-once pending state, five-minute TTL, exact session guard, bounded retries/backoff, timeout/abort, call/latency budgets, deterministic extraction, verification/repair, recursive secret/PII scrubbing, and native fallback: `/private/tmp/plastic-memory-evidence/pi-smart-compact/dist/index.js:2051-2132,2169-2273,6004-6221,6486-6693,6916-6970`.
- Entry-ID fingerprints support ordered-prefix reuse with appended descendants: `dist/index.js:1999-2039,5006-5062`.
- Current pending objects do not carry branch fingerprints and consumption checks only session/TTL; this is insufficient for same-session forks/divergence: `dist/index.js:6407-6419,6658-6677`.
- Smart Compact awaits preparation inside its tool/hook; it does not implement detached background preparation or an idle/settled apply gate. Its mechanisms require adaptation, not wholesale porting.

### KNOWN — durable project context

- Current `extensions/project-memory.ts` injects `_summary.md` and architecture index through `before_agent_start`, capped at 8,000/4,000 characters, and owns no compaction hook: `extensions/project-memory.ts:18-19,35-37,142,149-163`.
- Architecture Git vocabulary is CURRENT/POSSIBLY_STALE/HEAD_UNKNOWN; `architecture.json` is authoritative and `architecture.html` derived: `extensions/project-memory.ts:90-121`, `skills/project-memory/references/architecture-contract.md:3,92`.
- Existing plan tasks 03/04 own canonical chunks, projections, retrieval, flat fallback, and context. They require adjustment for a new compact chunk-index projection and shared compactor input; architecture authority remains unchanged.

### Model evidence

- Local model records identify `openai-codex/gpt-5.6-luna` with thinking support and at least a 272,000-token context in `models-store.json`; `models.json` reports 300,000. Runtime registry data is authoritative, so input budgeting must query the resolved model and not hardcode either value. A 100k synthetic snapshot is a required oracle, not permission for unbounded input.

## Scout Fan-out Map and Seam Synthesis

Capacity snapshot: configured background max `12`, active `0`, free `12`; four `ADMIT` shards launched concurrently.

| Shard | Admission | Boundary | Result |
|---|---|---|---|
| `pi-compaction-lifecycle` | ADMIT | host cut/apply/lifecycle | PARTIAL: core mechanics known; arbitrary custom-cut safety needs fixture |
| `om-cycle-ledger` | ADMIT | worker scheduling/watermarks/huge delta | PARTIAL: reusable gates known; cycle/retry/generation absent |
| `smart-pending` | ADMIT | pending/fingerprint/scrub/verify | PARTIAL: reusable mechanisms known; descendant-safe pending absent |
| `durable-context` | ADMIT | project injection/index authority | PARTIAL: injection known; host survival bridged by direct host read |
| cycle 6/4 synthesis | SYNTHESIS | cross-shard state machine | reconciled in this handoff |

Cross-shard state model:

```text
source append
  -> edge-triggered snapshot identity
  -> observer
  -> reflector coverage checkpoint / cycle close
  -> active complete-cycle window
  -> if >= 6: freeze prefix before latest 4
  -> background Luna compactor + deterministic verify
  -> READY pending(prefix/cut/session fingerprints)
  -> idle + no pending messages + agent_settled
  -> revalidate ancestry/cut/tool pairs/no competing compact
  -> ctx.compact internal request
  -> session_before_compact consumes staged result once
  -> append compaction + rebuild context
  -> session_compact marks eligible cycles applied
```

Shared serial surfaces: session custom-entry schemas/fold, worker scheduler, compaction engine/pending, runtime coordinator, and composition root. Project storage/search remains independently parallelizable after shared schema foundation. Tests follow each production slice; final integration owns cross-slice 6/4 and emergency journeys.

## Post-Brief Counterexamples and Required Resolutions

- A direct pure Pi projection fixture confirmed that repeated custom 6/4 cuts retain an older compaction entry inside the raw window. For branch `C1…C6 -> cmp1(C1–C2) -> C7–C8 -> cmp2(C1–C4, keep C5)`, `buildContextEntries()` returns `cmp2,C5,C6,cmp1,C7,C8`. The provider would see two `compactionSummary` messages. The revised design therefore requires a guarded `context` projection in full plastic mode that keeps the first/latest `compactionSummary` and removes subsequent superseded compaction-summary messages by role/order, never by summary-text matching. Repeated native/custom/emergency fixtures must prove no native-only fact is lost.
- `session_compact` locates the saved entry using first summary-text equality in Pi 0.83.0 (`agent-session.js:1439-1441,1675-1677`). Every plastic cumulative summary must therefore carry a deterministic unique cycle-range/digest header so an acknowledgement cannot bind to an older equal summary.
- `prepareCompaction()` can return `undefined` before `session_before_compact` fires when the branch has no host-summarizable span or its last entry is a compaction (`compaction.js:493-495,539-541`; `agent-session.js:1381-1388`). Host integration fixtures—not direct hook calls alone—must prove the staged 6/4 result is actually consumed. A deferred internal attempt must not discard a still-valid pending result merely because the host says the session is temporarily too small.
- Pi does not expose an atomic `compact-if-still-idle` operation and `prompt()` does not visibly gate on `isCompacting`. A user prompt may race after the final idle check while manual compact awaits abort/auth/hook work. The revised plan must front-load a synthetic prompt-arrival/overlapping-compact characterization. If the coordinator cannot prove that an ordinary proactive apply never aborts or overwrites a newly started visible run, planning/execution is `BLOCKED` on host capability; do not accept polling, arbitrary sleeps, or a documented race as completion.
- Cycle closure must be deterministic over the frozen source span. The Reflector is semantic input, not authority to claim coverage. Exact source-ID/span/digest checks decide `complete | empty-valid | partial | oversized | failed/stale`; only complete/empty-valid cycles count. This removes OM’s known false-coverage behavior.
- Keep the ordinary oversized path simple: first prove one 100k snapshot fits the resolved Luna budget and runs once. Do not add multipart fan-out unless that required fixture proves it necessary; otherwise report one explicit oversized/partial cycle, retain raw source, suppress unchanged hot retries, and rely on native emergency compaction.

## Current Plan Impact

The old plan is materially inconsistent and must be regenerated, not patched locally:

- Task 01: update four-role Luna config and cycle/pending schemas.
- Task 02: add legacy safe-resume bootstrap, cycle/attempt/coverage/prefix fold semantics, historical-gap/backfill cursor state, and 100k/7m/no-loop fixtures.
- Task 04: add bounded compact active-chunk index to shared project context.
- Task 05: replace deterministic-only compaction with cycle-aligned Luna preparation, structured state, verification, descendant-safe pending, and strict cut guards.
- Task 07: four workers, including compactor; separate edge-trigger snapshot/cycle scheduler and bounded failure suppression.
- Task 08: status/view/retry surfaces must expose cycles/pending/partial/historical-gap states and report-first explicit `/memory:backfill` without adding bare recall.
- Task 09: proactive `ctx.compact()` only through settled/idle coordinator; manual/threshold/overflow fallback; no overlap/reentrancy.
- Task 10: preserve one project context owner and shared context assembler; prove post-compaction visibility.
- Task 11: document four roles, cycle 6/4, async apply, emergency fallback, and index context.
- Task 12: four Luna blocks; remove stale Qwen wording; installer/cutover safety unchanged.
- Task 13: validator must review the exact custom-cut/descendant/huge-input escape risks.

## Repository State

- Project root: `/Users/j.henrique/.pi/agent`
- Branch: `main`
- Head: `e7d8dee51c3a73091ccd93a9d24ada0733ce2369`
- Existing plan directory: `/Users/j.henrique/.pi/agent/.pi/plans/20260803_194012Z_plastic_memory`
- The plan directory is untracked. Shared implementation files `config/settings.json`, `install.sh`, and `install.ps1` already contain unrelated dirty work. No implementation task may overwrite or stage those unrelated hunks.
- Current active settings still load `npm:pi-observational-memory@3.0.3`; no plastic-memory code exists and no live cutover is authorized.

## Constraints

- Plan only. No source implementation, real installer, `/reload`, package removal/install, live provider evaluation, real project migration, or current `.pi/memory/` mutation.
- One auto-discovered extension root and exactly one compaction owner after activation; disabled/default and OM-configured modes remain inert.
- Node built-ins and installed Pi APIs only; no new dependency, root package manifest, vector DB, embeddings, mandatory graph, dashboard, or autonomous durable publication.
- Session evidence remains append-only. Compaction hides old entries from active LLM context but never deletes source records.
- New custom-cut behavior must fail closed. Missing/non-ancestor/tool-result/orphaned cuts must never be appended. Internal proactive stale/missing pending must not accidentally invoke native compaction; emergency/manual host events may fall through intentionally.
- Provider-bound and persisted text must be scrubbed/bounded. Durable known/inferred project claims require current repository-relative evidence.
- All tests are synthetic/in-memory or under unique run-owned temp roots with no real settings/session/auth/project-memory fallback. Classify such commands `NO_STATEFUL_RESOURCES` or `DISPOSABLE_VERIFIED` before execution.
- Retain full MIT notices/provenance for substantially adapted OM and Smart Compact mechanisms.

## Validation Required in Revised Plan

- Plain Node 22.19+ and Pi jiti multi-module loader smoke; no manifest/dependency.
- Pure ledger/cycle fixtures including 100k single arrival, repeated events, partial-valid output, bounded retries, stale generation, empty valid cycle, six/four/stride-two folding, branch reconstruction, pre-plastic bootstrap, compaction-aware baseline selection, `historical-unindexed`, and bounded backfill cursor/idempotence.
- Host custom-cut characterization fixtures for valid ancestor, descendants appended during preparation, missing ID, tool-result ID, fork divergence, overlapping compact calls, and context rebuild.
- Fake Luna compactor fixtures for structured input, model resolution, medium thinking, timeout/auth failure, deterministic coverage verification/repair, scrubbing, pending TTL/consume once, descendant prefix acceptance, and divergence invalidation.
- Runtime integration for background result during active response, queue until settled, completion after settlement, no pending messages, single internal `ctx.compact`, session_compact acknowledgement, native emergency fallback, manual behavior, threshold/overflow, and no visible-model switch by workers.
- Repeated compaction oracle: C1–C6 -> summary(C1–C2)+raw C3–C6; C7–C8 -> summary(C1–C4)+raw C5–C8; another stride; exact facts/IDs/files survive.
- Durable context oracle: each fresh prompt and post-compaction retry receives bounded project summary + active-chunk index + optional architecture index; full chunk text appears only through recall.
- Existing migration, architecture, retrieval, cutover, installer, attribution, dirty-hunk preservation, and exactly-one-owner oracles remain.

## Stop If

- A synthetic Pi 0.83.0 fixture cannot prove cycle-aligned custom cuts preserve all intended descendants and reject unsafe IDs before append.
- The coordinator cannot distinguish internal proactive stale-apply failure from intentional manual/threshold/overflow native fallback.
- Background Luna preparation cannot be detached, aborted, generation-bound, and applied only at idle without risking a current response.
- A 100k snapshot cannot be handled once within the resolved Luna budget or fail explicitly without false coverage/hot loops.
- A pre-plastic multi-million-token branch cannot establish a safe compaction-aware baseline without sending the entire historical branch to a provider, falsely advancing coverage, or silently discarding the historical gap.
- Shared project context cannot remain bounded and visible across ordinary prompts and compaction retry without duplicating canonical truth.
