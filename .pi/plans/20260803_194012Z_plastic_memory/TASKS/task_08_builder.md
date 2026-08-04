# Task 08: Implement retrieval/backfill and expose namespaced surfaces

**Agent**: builder  
**Why**: Users and the visible model need collision-free retrieval plus explicit authority for proposals, migration, retries, and bounded historical backfill.  
**Goal**: One session user-operation layer and registerable tools/commands for honest recall/search, cycle/gap state, explicit publication, and report-first one-window backfill without activating the root.

## Read
- `extensions/plastic-memory/session/types.ts` — recall/backfill/proposal record guards
- `extensions/plastic-memory/session/ledger.ts` — folded new/legacy memory and branch/source resolution
- `extensions/plastic-memory/session/cycles.ts` — cycle/attempt/partial status
- `extensions/plastic-memory/session/bootstrap.ts` — bootstrap boundary and historical gaps
- `extensions/plastic-memory/project/search.ts` — project recall/search
- `extensions/plastic-memory/project/store.ts` — explicit proposal publication
- `extensions/plastic-memory/project/migrate.ts` — report/publish/rollback
- `extensions/plastic-memory/workers/scheduler.ts` — explicit retry/promoter/backfill fake-worker seam
- `npm/node_modules/pi-observational-memory/src/session-ledger/recall.ts` — raw-ID collision/partial/unavailable behavior
- `npm/node_modules/pi-observational-memory/src/tools/recall-observation.ts` — legacy result-state precedent
- `npm/node_modules/pi-observational-memory/src/commands/status.ts` and `src/commands/view.ts` — OM alias behavior
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — tool/command registration and TypeBox APIs

## Change
- `extensions/plastic-memory/session/recall.ts` — CREATE — namespaced/raw-legacy exact recall and bounded lexical session search
- `extensions/plastic-memory/session/backfill.ts` — CREATE — report-first branch-local cursor operations and one safe bounded window per explicit execution
- `extensions/plastic-memory/runtime/tools.ts` — CREATE — injectable `memory_recall` and `memory_search` definitions
- `extensions/plastic-memory/runtime/commands.ts` — CREATE — injectable status/view/propose/accept/migrate/backfill/retry commands and OM aliases
- `extensions/test/plastic-memory-surfaces.smoke.mjs` — CREATE — fake API/in-memory-session/temp-project retrieval/backfill/surface journeys

## Proof
- **Semantic delta and evidence anchors:** installed OM owns bare `recall`; raw 12-hex behavior must remain honest. Pi duplicate tool/command registration can silently collide. Historical provider work and project publication require explicit user-visible authority.
- **Coverage receipt:** folded memory/source IDs → exact recall/search; bootstrap gap + branch/cursor → report/pause/resume/retry/one window; session/project namespaces → tools; cycle/bootstrap/pending interface → status/view; proposal/migration/backfill actions → explicit commands. `AFFECTED`: five paths. `UNAFFECTED`: root registration, coordinator timing, compaction hook/pending, live sessions/projects, and provider execution.
- **Closure:** every approved user operation is owned here, including raw/new recall, `historical-unindexed`, partial/oversized/suppressed attempts, pending/apply display, migration conflicts, and backfill cursor. Runtime modules receive injected engines and cannot construct a second owner.
- **Checkpoint:** fake API plus in-memory/temp roots prove exact retrieval and explicit/idempotent mutations; report paths make zero worker/write calls.
- **Acceptance path:** validated input → session/project read/action layer → bounded tool/command result. OM status/view/raw recall are `PRESERVE`; namespaced surfaces and explicit backfill `CHANGE`; bare recall/autonomous writes are `REMOVE`.
- **Counterexample:** a no-write backfill report can still trigger provider work if report/execution share one eager scheduler method. A call counter requires zero calls/writes until explicit start+publish.

## Acceptance
- [ ] Raw lowercase 12-hex lookup retains found/collision/partial/unavailable and tombstone/source behavior; namespaced observation/reflection/proposal lookup never fabricates missing/off-branch source.
- [ ] Backfill report performs zero writes/provider calls and shows current-branch safe windows, gaps/conflicts/cost shape/cursor. Explicit start+publish handles at most one completed-turn window; pause/resume is durable, and explicit retry alone re-enables an unchanged failed window.
- [ ] Backfill never traverses another session/project, never counts as a live cycle, never bursts compactions, and records terminal partial/oversized/failure without cursor dishonesty or hot retry.
- [ ] Register exactly `memory_recall` and `memory_search`, never bare `recall`; search combines bounded eligible session/project results with deterministic lexical/tag/category/status/confidence filters and no raw-transcript store.
- [ ] Register `/memory:status`, `/memory:view`, `/memory:propose`, `/memory:accept`, `/memory:migrate`, `/memory:backfill`, and retry control; `/om:status` and `/om:view` are thin active-runtime aliases.
- [ ] Status/view expose bootstrap/gap, cycle outcomes, retry suppression, 6/4 eligibility/applied prefix, pending TTL/cut, and last native/custom outcome; accept/migrate remain evidence-revalidated, explicit, idempotent, and temp-root confined.
- [ ] Malformed IDs/args, stale evidence, path escape, cross-session/project request, and write/worker failure return bounded actionable failures with no external mutation or raw secret.

## Constraints
- Use Pi/TypeBox-compatible host schemas and Node built-ins only. User-operation modules receive folded branch/current-root inputs; no sidecar, hook, timer, second store/coordinator, or arbitrary path/session argument.
- No dashboard, autonomous acceptance/backfill, live provider, or current project/session mutation.
- Classify in-memory checks `NO_STATEFUL_RESOURCES` and temp transactions `DISPOSABLE_VERIFIED`.

## Validation
- `node extensions/test/plastic-memory-surfaces.smoke.mjs` — PASS for legacy/new retrieval, names, aliases/status, proposal accept retry, migration report/publish guard, backfill report/one-window/pause/retry/idempotence, malformed input, and temp-root confinement
- `git diff --check -- extensions/plastic-memory/session/recall.ts extensions/plastic-memory/session/backfill.ts extensions/plastic-memory/runtime/tools.ts extensions/plastic-memory/runtime/commands.ts extensions/test/plastic-memory-surfaces.smoke.mjs` — no whitespace errors

## Stop If
- Honest raw recall requires off-branch file access, backfill cannot be one-window/current-branch/idempotent, Pi schemas require a dependency, or acceptance/backfill authority cannot remain explicit.

## Checkpoint
- Recovery snapshot: not required; targets are new and all write journeys are in-memory/temp-owned.
- Commit scope: the five `Change` paths only.
