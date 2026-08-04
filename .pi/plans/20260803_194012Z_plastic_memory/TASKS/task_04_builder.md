# Task 04: Add the shared bounded project read model

**Agent**: builder  
**Why**: Visible runs and Luna compaction need one validated project snapshot without duplicating canonical truth or losing flat-only projects.  
**Goal**: Exact recall/search plus one immutable context assembler that always emits bounded summary, active-chunk index, and optional architecture index.

## Read
- `extensions/plastic-memory/project/schema.ts` — canonical/index contracts and filters
- `extensions/plastic-memory/project/store.ts` — canonical load and derived-freshness outcomes
- `extensions/plastic-memory/project/projection.ts` — root/index representation and digest
- `extensions/project-memory.ts` — `findMemorySummary`, architecture validation/index, Git status vocabulary, and current caps
- `skills/project-memory/scripts/validate-architecture.mjs` — optional architecture validity boundary; read only
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` — per-prompt override lifetime through retry/settlement

## Change
- `extensions/plastic-memory/project/search.ts` — CREATE — exact project/chunk recall and bounded deterministic lexical/filter search
- `extensions/plastic-memory/project/context.ts` — CREATE — validated immutable summary/active-index/architecture snapshot for visible runs and compactor input, including flat fallback
- `extensions/test/plastic-memory-retrieval.smoke.mjs` — CREATE — canonical/flat/no-memory/architecture/retry context fixtures

## Proof
- **Semantic delta and evidence anchors:** `project-memory.ts` injects capped summary/architecture at `before_agent_start`; Pi retains that override through post-run retry. The approved delta adds a 4,000-char active canonical chunk index every run and reuses one read model for compactor input.
- **Coverage receipt:** canonical chunks/index/freshness → recall/search; canonical or flat files + architecture + Git head → bounded immutable snapshot; fresh prompt/retry → same snapshot sections. `AFFECTED`: three paths. `UNAFFECTED`: canonical writes, architecture authority/renderer, hook registration, stored compaction prose, migration, and real project files.
- **Closure:** every artifact needed to discover/observe long-term context is either returned by this assembler or remains targeted recall. Missing/stale derived files are rebuilt in memory only; flat/no-memory states receive an explicit bounded active-index marker rather than silently omitting the required section.
- **Checkpoint:** temp-root canonical, flat-only, and no-memory fixtures produce observable 8k/4k/4k blocks repeatedly and retrieve a full sentinel chunk only by exact recall.
- **Acceptance path:** validated project files → snapshot → repeated prompt/compactor consumers. Flat summary and architecture status are `PRESERVE`; active index/every-run assembly `CHANGE`; bulk chunk injection is not authorized.
- **Counterexample:** testing canonical startup alone permits flat cutover loss and retry omission. Fixtures assert flat-only behavior and post-manual/threshold/overflow continuation context separately.

## Acceptance
- [ ] Exact `pm:p:`/`pm:c:` recall returns canonical body/metadata/evidence with explicit partial/stale/unavailable states and never trusts generated JSON over the chunk.
- [ ] Lexical search supports bounded text/tag/category/status/confidence filters deterministically; malformed paths/filters fail closed.
- [ ] Canonical snapshots contain root summary ≤8,000 chars, active chunk index ≤4,000 chars (IDs/category/title/synopsis/tags/status/confidence), and valid optional architecture index ≤4,000 chars; no full chunk body is injected.
- [ ] Flat-only projects preserve capped `_summary.md`/architecture behavior and include an explicit bounded legacy-flat active-index marker; no-memory projects return bounded uninitialized/empty-index guidance without an automatic scan.
- [ ] Stale/missing derived project files are reconstructed in memory from canonical chunks, marked explicit, and cause no durable write.
- [ ] Architecture remains CURRENT/POSSIBLY_STALE/HEAD_UNKNOWN; JSON is authority, HTML is never read, and invalid JSON warns without discarding Markdown.
- [ ] Startup, ordinary next prompt, and post-compaction/retry simulations retain all required bounded sections; full sentinel text appears only in targeted recall.

## Constraints
- Preserve 8,000/4,000/4,000 caps. Project context is assembled once per visible run and the immutable result is reusable by compactor input.
- Do not duplicate project truth into stored compaction prose, modify `extensions/project-memory.ts`, write project files on read, or fall back to user/global memory.
- Tests are `DISPOSABLE_VERIFIED` under unique roots; no real `.pi/memory/`, Git mutation, provider, or auth access.

## Validation
- `node extensions/test/plastic-memory-retrieval.smoke.mjs` — PASS for recall/search, active index, canonical/flat/no-memory context, architecture states/caps, repeated/retry visibility, traversal, and no writes
- `node skills/project-memory/scripts/test/architecture-memory.smoke.mjs` — existing architecture authority/renderer remains PASS
- `git diff --check -- extensions/plastic-memory/project/search.ts extensions/plastic-memory/project/context.ts extensions/test/plastic-memory-retrieval.smoke.mjs` — no whitespace errors

## Stop If
- Every-run bounded context cannot be assembled without writing/migrating a project, flat fallback requires excluded architecture edits, or compactor and visible-run consumers would require separate truth/caches.

## Checkpoint
- Recovery snapshot: not required; targets are new and fixtures are temp-owned.
- Commit scope: the three `Change` paths only.
