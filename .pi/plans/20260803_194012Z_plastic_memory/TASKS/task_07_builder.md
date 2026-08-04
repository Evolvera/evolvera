# Task 07: Implement four bounded Luna roles and one cycle scheduler

**Agent**: builder  
**Why**: Semantic observation, reflection, cumulative compaction, and project proposals need separate model contracts while sharing one strict no-visible-model-fallback runner and one snapshot opportunity gate.  
**Goal**: Four independently resolved Luna-medium adapters plus a generation-safe scheduler that closes exact cycles, detaches compactor preparation, and fails soft without loops.

## Read
- `extensions/plastic-memory/config.ts` — four role and budget defaults
- `extensions/plastic-memory/session/cycles.ts` — snapshot/attempt/closure contract
- `extensions/plastic-memory/session/ledger.ts` — active observations/reflections and append shapes
- `extensions/plastic-memory/session/bootstrap.ts` — normal-work boundary and historical gaps
- `extensions/plastic-memory/compaction/engine.ts` — injected compactor request/result seam
- `extensions/plastic-memory/project/context.ts` — bounded compactor/promoter context
- `npm/node_modules/pi-observational-memory/src/agents/observer/agent.ts` — source allowlist/agent-loop precedent
- `npm/node_modules/pi-observational-memory/src/agents/reflector/agent.ts` — support-ID validation precedent
- `npm/node_modules/pi-observational-memory/src/hooks/consolidation-trigger.ts` — serialized trigger behavior and false coverage to replace
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — runtime model/auth registry and abort/session APIs

## Change
- `extensions/plastic-memory/workers/runner.ts` — CREATE — per-role registry/auth resolution, medium thinking, bounded prompts/results, timeout/abort, and diagnostics
- `extensions/plastic-memory/workers/observer.ts` — CREATE — exact source-snapshot observation adapter and coverage-manifest echo
- `extensions/plastic-memory/workers/reflector.ts` — CREATE — exact snapshot/observation semantic reflection and absorption proposals
- `extensions/plastic-memory/workers/compactor.ts` — CREATE — structured cycle-state compactor adapter for the verified engine
- `extensions/plastic-memory/workers/promoter.ts` — CREATE — evidence-backed proposal-only adapter
- `extensions/plastic-memory/workers/scheduler.ts` — CREATE — edge-trigger snapshot attempts, observer→reflector closure, detached compactor job, bounded retry/generation discard, and promoter triggers
- `extensions/test/plastic-memory-workers.smoke.mjs` — CREATE — fake registry/auth/agent-loop/100k/7m/no-loop fixtures

## Proof
- **Semantic delta and evidence anchors:** OM already serializes one 100k chunk but advances false coverage, lets Reflector omit source, and lacks attempt/generation guards. Pi exposes registry/auth without selecting the visible model. The four adapters are one worker subsystem; the scheduler is its only producer boundary.
- **Coverage receipt:** resolved role config/auth/context limit → bounded full snapshot/request → schema/allowlist/identity validation → append-shaped terminal result; snapshot/attempt fold → one observer→reflector pipeline → deterministic closure; eligible prefix → detached compactor; milestone/manual evidence → proposal. `AFFECTED`: seven paths. `UNAFFECTED`: source fold, custom cut/pending, hook apply, project publication, visible model, and live provider/auth.
- **Closure:** each approved model judgment has exactly one adapter; shared runner owns all model/auth/timeout/scrub behavior; scheduler owns in-flight/queued opportunity and post-await session/generation/branch checks. Deterministic retention/coverage/verification remain outside model authority.
- **Checkpoint:** fake roles independently resolve `openai-codex/gpt-5.6-luna` medium, one 100k snapshot runs once and closes only under exact identity, huge pre-plastic history is never input, and stale/failing jobs append nothing.
- **Acceptance path:** synthetic branch/context + fake registry/agent loop → bounded requests → validated append-shaped records/jobs/proposals. Fail-soft serialized worker behavior is `PRESERVE`; four separate roles/exact cycle closure `CHANGE`; dropper/shared-visible-model fallback are `REMOVE`.
- **Counterexample:** checking only session ID lets a response from an earlier leaf/snapshot append after branch advancement. Fixtures advance session generation, ancestor chain, snapshot digest, and compaction identity while each role is suspended.

## Acceptance
- [ ] Exactly `observer`, `reflector`, `compactor`, and `project-promoter` adapters exist; each resolves only configured `openai-codex/gpt-5.6-luna` with `medium`, independent limits, and runtime `contextWindow`, never `ctx.model` fallback or `pi.setModel`.
- [ ] One fitting ~100k completed-turn snapshot is serialized once, creates at most one in-flight observer→reflector pipeline and one logical cycle across repeated triggers, and never becomes threshold-sized repetitions or multipart fan-out.
- [ ] Observer and Reflector are bound to the same complete snapshot/cycle/span/digest; unknown/missing/reordered IDs, partial input/output, timeout, stale generation, or unauthenticated output advances no complete coverage. Exact full-span semantic success may close `empty-valid` with zero reflections.
- [ ] One unchanged failure receives at most one automatic retry and then suppresses further automatic work; source advancement or explicit retry is required. The ~7m historical prefix is never presented because only bootstrap-approved snapshots are accepted.
- [ ] Compactor runs detached with exact eligible cycle/source evidence, prior structured state, and bounded project snapshot; timeout/auth/invalid output leaves raw cycles and produces no pending payload.
- [ ] Promoter runs only after matching applied-compaction acknowledgement or explicit request, returns a session proposal with repository evidence, and has no file/publication capability.
- [ ] Shutdown/session switch/fork/reload aborts work; post-await session/generation/ancestor/snapshot rechecks discard late results, and all prompts/results/diagnostics are scrubbed/bounded.

## Constraints
- Provider-free tests inject registry/auth/agent-loop outcomes and resolved context sizes; do not read auth files or contact a provider.
- A model echo/status cannot grant coverage: scheduler invokes the deterministic cycle closer over the exact request snapshot and response identity.
- No dropper, classifier, indexer, fifth role, multipart worker fan-out, token compaction cadence, project write, hook registration, or `ctx.compact()`.
- Keep tests `NO_STATEFUL_RESOURCES`; retain MIT attribution in substantially adapted role code.

## Validation
- `node extensions/test/plastic-memory-workers.smoke.mjs` — PASS for four role configs, runtime budget/medium, 100k one-shot/full-vs-partial closure, bounded retries, 7m exclusion, stale aborts, detached fake compactor, proposal-only promoter, scrub, and visible-model immutability
- `node extensions/test/plastic-memory-session.smoke.mjs` — append-shaped worker outcomes still satisfy exact cycle/bootstrap fold
- `node extensions/test/plastic-memory-compaction.smoke.mjs` — compactor adapter contract remains compatible with verification engine
- `git diff --check -- extensions/plastic-memory/workers extensions/test/plastic-memory-workers.smoke.mjs` — no whitespace errors

## Stop If
- The installed registry cannot resolve Luna/context/thinking without selecting the visible model, a 100k fitting snapshot cannot be sent once within conservative runtime budget/overhead, or the injectable runner cannot hard-timeout/abort provider-free. Do not add multipart without a new approved plan.

## Checkpoint
- Recovery snapshot: not required; targets are new and no live worker/session/project state is used.
- Commit scope: the seven `Change` paths only.
