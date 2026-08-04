# plastic-memory — Pi 0.83.0 Semantic-Cycle Plan

**Generated**: 2026-08-03 19:40:12 UTC  
**Complexity**: High  
**Estimated tasks**: 13 (12 writing checkpoints, 1 review-only validator)  
**Risk**: High — custom context cuts, async host compaction, semantic coverage, legacy bootstrap, and self-hosted cutover

## Outcome

Deliver one dependency-free first-party extension at `extensions/plastic-memory/` with one compaction authority and four separately configured roles: `observer`, `reflector`, `compactor`, and `project-promoter`. Installed defaults are `openai-codex/gpt-5.6-luna` with thinking `medium` for every role; workers never switch or silently inherit the visible model.

The runtime will close exact completed-turn Reflector cycles, use 10k/20k token values only as edge triggers, process one unchanged ~100k snapshot at most once plus one bounded automatic retry, compact complete cycles with a sliding six/latest-four window and stride two, and apply a verified detached Luna result only at a safe settled/idle host boundary. A pre-plastic session safely resumes from valid legacy markers and Pi’s compaction-aware active context; excluded history remains `historical-unindexed`, and historical backfill is explicit, report-first, cursor-based, one window per invocation, pausable, and idempotent.

Every visible run receives a bounded project summary (8,000 chars), active-chunk index (4,000 chars), and optional architecture index (4,000 chars). Full chunks remain targeted `memory_recall`/`memory_search` results. Canonical Markdown, explicit proposal acceptance, migration safety, architecture JSON authority/HTML derivation, flat fallback, installer deferred activation, and MIT attribution remain intact.

This plan is executable against Pi 0.83.0 only if Task 01’s real-host provider-free fixture returns `HOST_CAPABILITY: PASS`. An unreachable hook, unsafe custom cut, prompt interruption/overwrite, overlapping append, or exact-context projection that needs installed-host mutation records `BLOCKED` and stops the DAG; the 6/4 outcome is never silently weakened.

## Scope

### In scope

- Inert-first modular extension; common config/IDs/safety; versioned append-only session records; four worker adapters; one coordinator; namespaced tools/commands; provider-free fixtures; full upstream notices.
- Deterministic cycle/source coverage, attempt suppression, legacy `om.*` dual-read, safe bootstrap, historical-gap reporting, and explicit bounded backfill.
- Luna-assisted cumulative compaction over a frozen cycle prefix, deterministic extraction/verification/repair, unique cycle-range/digest headers, descendant-safe pending, guarded provider `context` projection, and native emergency fallback.
- Canonical Markdown chunks, derived summaries/index, lexical retrieval, explicit proposals/acceptance, flat fallback, non-destructive migration, and optional architecture index.
- Compatibility bridge plus source installer/config changes for deferred activation, without live cutover.

### Out of scope

- Live provider/Luna evaluation, `/reload`, real installer/package operations, real session compaction, real migration, or mutation of current `.pi/memory/`, sessions, auth, root `settings.json`, or package directories.
- Automatic whole-history processing, another session/project’s history, token-sized cycle fan-out, unbounded retries, timers/polling/quiet sleeps, or acceptance of a residual prompt race.
- Multipart oversized fan-out unless a separately approved revision is required by a failed 100k oracle; this plan does not pre-authorize it.
- New dependencies/manifests, sidecar ledgers, persistent pending blobs, vectors, embeddings, mandatory graphs, dashboards, autonomous publication, or a second compaction owner.

## Material Decisions

1. **Hard host gate first.** Pi’s public in-memory session path must exercise real `prepareCompaction()` → `session_before_compact` → append/rebuild → `session_compact`, repeated `context` projection, prompt-arrival interleavings, and overlapping compacts. A direct hook unit test is insufficient. The brief proposing a documented residual race is rejected.
2. **Coverage is deterministic.** Observer/Reflector content is semantic input, not authority. The host binds a fully serialized immutable snapshot to ordered source IDs, start/end IDs, completed-turn boundary, digest, cycle ID, and response identity. Only exact complete input/manifest equality yields `complete | empty-valid`; partial, oversized, malformed, failed, timed-out, stale, or unknown-ID results advance nothing.
3. **One snapshot opportunity.** The 10k/20k values trigger inspection, never `floor(backlog/threshold)` cycles or ordinary token compaction. One unchanged failure receives one automatic retry maximum, then waits for source/cursor advancement or explicit retry.
4. **Safe resume before live cycles.** Without a valid plastic bootstrap, fold valid legacy records/markers, inspect `buildContextEntries()` and latest compaction, choose safe completed-turn bounds, and append one idempotent bootstrap. Only the bounded active window is eligible for normal work. If it exceeds the resolved Luna allowance, keep one newest fitting turn window and record the older active prefix as a gap.
5. **Backfill is explicit and serial.** `/memory:backfill` reports with no write/provider call. Explicit start+publish handles at most one current-branch safe window; pause/resume/retry are durable and idempotent. Backfill records never count as live cycles or trigger a compaction burst.
6. **6/4 is identity-based.** C1–C6 freezes C1–C2 and preserves raw C3–C6; C7–C8 freezes C3–C4 and produces cumulative C1–C4 with raw C5–C8; later strides advance by two. Descendants are allowed only when the complete prepared branch ID vector remains an exact ancestor prefix and the frozen cut/window is unchanged.
7. **Structured state outranks prose.** Luna receives exact newly eligible source/cycle evidence, prior structured state, and the shared bounded project snapshot. Deterministic extraction/verification owns facts, active memory IDs, files, commands/errors, decisions, constraints, goals, and open loops. Each stored summary begins with a deterministic unique cycle-range/state-digest header so Pi’s first-equal-summary lookup cannot bind an older entry.
8. **One narrow provider projection.** Pi’s confirmed second-stride projection is `cmp2,C5,C6,cmp1,C7,C8`. In full plastic mode, a guarded transform retains the first/latest validated plastic cumulative summary and removes only role/order-mapped older plastic summaries proven subsumed. It never matches summary text or filters native-only/emergency evidence; ambiguous mixed ranges block custom apply.
9. **Internal versus host compaction is explicit.** A one-use in-memory nonce binds proactive manual calls. Stale/missing internal intent returns `{ cancel: true }`; actual user manual, threshold, or overflow with no suitable staged result returns no custom result and falls through to current-visible-model native compaction. Threshold/overflow never wait and use staged content only when its already-valid cut exactly equals the host-prepared physical cut.
10. **Apply is event-driven and fail-closed.** Preparation may overlap a visible response. Apply opportunities are `agent_settled` or already-settled completion only, with fresh idle/no-pending/apply-lock checks. The hook is synchronous over staged state and revalidates the fresh branch. `prepareCompaction() === undefined` defers rather than discarding still-valid pending work.
11. **One project read model.** Canonical chunks remain human authority; summaries/indexes are derived. One immutable validated snapshot serves `before_agent_start` and compactor input. Flat-only projects retain the capped summary and an explicit bounded legacy-index marker. Compaction prose does not duplicate durable project truth.
12. **Minimum solution.** No prepare-only feature flag, multipart path, new persistence service, duplicated cache, or adaptive policy. Deferred settings activation, strict custom gates, and native fallback are sufficient.

## Capability Disposition

### PRESERVE

- Append-only source/session evidence and native recent-tail behavior outside validated cuts.
- Native user manual/threshold/overflow usability and fail-soft worker/provider behavior.
- Valid legacy `om.observations.recorded`, `om.reflections.recorded`, `om.observations.dropped`, `om.folded`, conservative tombstones, raw lowercase 12-hex collision-aware recall, and honest `partial | unavailable` states.
- Flat Project Memory fallback; canonical Markdown/derived projections; 8k root summary; CURRENT/POSSIBLY_STALE/HEAD_UNKNOWN; optional authoritative `architecture.json`; derived `architecture.html`.
- Explicit project proposal acceptance, non-destructive migration, namespaced retrieval, deferred cross-platform staging, rollback, and MIT attribution.

### CHANGE

- Three roles become four with `compactor`; all installed role defaults become Luna medium.
- Token watermarks become exact bootstrap/attempt/cycle/backfill/compaction-ack records.
- Model-free/host-cut compaction becomes detached Luna cumulative state plus deterministic verification and guarded custom cycle cuts.
- Exact-leaf pending becomes full ordered-prefix ancestry that accepts appended descendants.
- No proactive apply becomes settled/idle-only 6/4 apply, subject to the host gate.
- Startup summary/architecture becomes summary + active index + optional architecture on every visible run/retry.

### REMOVE / supersede

- Exactly-three-worker and Qwen defaults, deterministic-only compaction, unchanged host cut for ordinary cycle compaction, no proactive `ctx.compact()`, automatic whole-history bootstrap, bare `recall`, and summary-text filtering/identity.

## Evidence and Repository Baseline

### KNOWN

- Project root `/Users/j.henrique/.pi/agent`, branch `main`, head `e7d8dee51c3a73091ccd93a9d24ada0733ce2369`; plan directory is untracked and no plastic source exists.
- Installed host is Pi 0.83.0 at `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/`.
- `ctx.compact()` invokes manual `AgentSession.compact()`, which disconnects/aborts first. `agent_settled` follows retry/auto-compaction/continuation handling; pending messages are separate from `isIdle()`.
- Host preparation can return undefined before the extension hook. Custom `firstKeptEntryId` is copied without validation; a missing ID collapses retained context. `session_compact` locates the first equal summary.
- `buildContextEntries()` emits the latest compaction plus kept ancestors and later descendants; the direct repeated fixture yields `cmp2,C5,C6,cmp1,C7,C8`.
- `context` handlers transform a deep copy before provider calls. `before_agent_start` fires for each user prompt, and its system-prompt override persists through post-run retry/continuation.
- OM 3.0.3 serializes one 100k chunk but has token-marker coverage, false subset coverage, no durable attempt/generation suppression, and no safe legacy bootstrap.
- Current `extensions/project-memory.ts` injects an 8k summary and 4k architecture index and owns no compaction hook.
- Root `settings.json` and source `config/settings.json` still load OM. No live cutover is authorized.

### INFERRED, made testable

- A synchronous hook-side idle/pending recheck plus JS event ordering may close the prompt race, but only the controlled real-host gate may establish that.
- Repeated custom projection is safe only when removed roles map to earlier plastic summaries fully subsumed by latest structured state; mixed/native ambiguity must block custom apply.
- Descendants are safe when the entire prepared branch ID vector remains an ordered ancestor prefix and latest-compaction/cut invariants remain unchanged.

### Blocking fact, not left unknown

- Pi has no evidenced atomic compact-if-idle API. Task 01 must record `PASS | BLOCKED`; no later task may assume atomicity.

## Repository-State and Shared-File Hazards

- `config/settings.json`, `install.sh`, and `install.ps1` contain unrelated dirty work. Only Task 12 may patch their memory/install-order anchors after pre-edit copies/hashes/diffs; unrelated hunks remain byte-identical and unstaged.
- Root `settings.json` is active evidence only and outside every write set.
- `extensions/plastic-memory/index.ts` is new but auto-discovered: Task 01 leaves it handler-free; only serialized Task 10 wires it after coordinator validation.
- `extensions/project-memory.ts` (~186 lines) is a live context owner: Task 10 snapshots it and replaces only its implementation with a bridge after canonical/flat/architecture parity.
- `SYSTEM.md` and `config/SYSTEM.md` (~134 lines each) share an exact `## Project Memory` block; Task 11 edits only that block and requires byte identity.
- `skills/project-memory/SKILL.md` (~299 lines) and `README.md` (~524 lines) are large preservation-critical files. Task 11 uses named section anchors and preserves Flow/GitHub, architecture, routing, security, and unrelated platform content.
- Architecture contracts/scripts/tests/templates, current project memory, sessions, auth, package directories, and root settings are read-only.
- No implementation checkpoint is active. Stale prior plan text is not progress evidence.

## Acceptance Journeys

1. **Host gate:** actual host preparation reaches/consumes a staged result when possible, defers when too small/last-compaction, rejects unsafe cuts before append, preserves descendants, proves repeated context transformation, and survives prompt/overlap interleavings without abort/overwrite/double append.
2. **100k:** repeated triggers over one fitting ~100k snapshot create one identity/pipeline/cycle opportunity; exact closure succeeds once, while partial/oversized output advances nothing and bounded retry stops.
3. **Legacy safe resume:** a synthetic ~6,956,515-token pre-plastic branch with prior Pi compaction and mixed legacy records appends one bootstrap, imports valid legacy state, sends no historical prefix to fake workers, reports `historical-unindexed`, and exposes report plus one explicit backfill window separately.
4. **Initial/stride 6/4:** C1–C6 → cumulative C1–C2 + raw C3–C6; C7–C8 → cumulative C1–C4 + raw C5–C8; a third stride refutes duplication/off-by-one while facts/IDs/files/errors/constraints/goals/loops survive.
5. **No interruption/staleness:** readiness during response never compacts; readiness after settlement applies once. Queue, prompt arrival, overlap, fork, divergence, reload, session switch, changed compaction, cut loss, and tool-boundary failures cancel/defer safely.
6. **Emergency:** stale internal apply cancels with zero native call. Real manual/threshold/overflow remains usable; absent/nonmatching staged state falls through to native current-visible-model compaction.
7. **Provider context:** repeated plastic strides expose one cumulative summary plus intended raw cycles/descendants. Native-only/emergency messages remain unchanged and no native-only fact is filtered.
8. **Durable context:** startup, next prompt, post-manual-compaction prompt, and emergency retry contain bounded summary + active index + optional architecture; full chunk sentinel is retrieved only by namespaced recall.
9. **Compatibility:** legacy/new recall, flat fallback, explicit proposal acceptance, migration report/publish/rollback, architecture authority, all ownership modes, installer staging, attribution, and dirty-hunk preservation remain provider-free/non-destructive.

## Risks and Mitigations

- **No atomic idle apply:** hard host gate with forced interleavings; failure blocks all work.
- **Context collapse:** fresh full-prefix/ancestor/cut/tool validation before hook return.
- **Summary leakage/native loss:** unique headers, structured range/digest, role/order projection, and mixed/native block/no-op controls.
- **False coverage/hot loop:** immutable snapshot identity, exact manifest, generation checks, terminal outcomes, and one automatic retry.
- **Huge legacy prompt:** compaction-aware bootstrap, explicit gap, runtime model budget, and one-window cursor.
- **Stale async result:** one scrubbed bounded TTL slot bound to session/generation/full prefix/latest compaction/cut/state; apply acknowledgement only from matching unique entry.
- **Emergency confusion:** in-memory nonce; stale internal cancel versus host fallthrough.
- **Project truth duplication:** one read model; canonical chunks remain authority.
- **Dirty cutover loss:** recovery snapshots, exact anchors, temp fault/order checks, and selective hunk staging.

## Decomposition and Parallel Shape

The provisional work was wide across host lifecycle, shared contracts, session state, project persistence/read model, workers, compaction, user surfaces, and activation. It is decomposed through repository-supported valid seams:

- Task 01 owns only host feasibility plus common inert config/IDs/safety/attribution.
- Session schema/kernel (Task 02) and project schema/store (Task 03) then run in parallel with disjoint paths.
- Project context (Task 04) and migration (Task 06) run in parallel.
- Compaction/pending/projection (Task 05) precedes the four-role worker subsystem (Task 07).
- Registerable surfaces (Task 08) and directly registerable coordinator (Task 09) run in parallel while `index.ts` remains inert.
- Task 10 is the bounded two-region root/legacy-bridge authority switch.
- The custom-cut validator runs before disjoint docs and source installer/config lanes.

No final writing task exceeds 20 paths or spans three semantic regions: the seven-path worker task is one worker-adapter region plus its scheduler; tests stay with that subsystem. The full-runtime provisional task was rejected because it would combine coordinator timing, project surfaces, and auto-discovered authority. Direct coordinator registration is the compatibility seam. Splitting the final bridge switch is also rejected: root-first can create duplicate project handlers and bridge-first can create zero handlers. All parallel full write sets are disjoint; shared root/bridge/settings/docs are serialized. No checkpoint relies on later restoration.

## Implementation and Validation Order

1. Host gate, then inert common foundation.
2. Parallel session and project domain checkpoints.
3. Parallel project read model and migration.
4. Pure 6/4 compaction/pending/projector, then four fake-tested Luna roles.
5. Parallel namespaced surfaces and real-host direct coordinator integration.
6. One-owner root/project bridge.
7. Independent validator of exact custom-cut/async-apply checkpoint.
8. Parallel policy/docs and deferred source config/install staging.

Every executable check is classified first as `NO_STATEFUL_RESOURCES` (pure/in-memory) or `DISPOSABLE_VERIFIED` (unique run-owned temp roots). Validation uses plain Node 22.19+ and Pi jiti, synthetic branches, fake model/auth/agent loops, and temp project/installer roots. Runtime tasks must observe actual hook calls, appended entries, rebuilt/provider messages, run abort state, native-call counts, persisted temp state, or rendered context—not only type/lint/build output. Unexpected network/provider, real installer/package/reload/migration, or non-temp settings/session/auth/project-memory access blocks the task.

## Material TO VERIFY

- Live Luna quality, latency, cost, and provider authentication are **UNVERIFIED**.
- Real Windows PowerShell execution, real installer/update, live `/reload`, active settings cutover, and real project migration are **UNVERIFIED**.
- External legacy flat-memory corpus variety/volume beyond fixtures is **UNVERIFIED**, bounded by report-first migration/backfill.
- Host custom-cut/async atomicity is not `TO VERIFY`; it is the first blocking implementation gate.
