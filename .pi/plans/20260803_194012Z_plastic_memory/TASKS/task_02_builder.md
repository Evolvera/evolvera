# Task 02: Build the append-only cycle, bootstrap, and legacy kernel

**Agent**: builder  
**Why**: Live cycles need branch-local schemas, exact coverage, legacy import, huge-session bootstrap, retry suppression, and retention before workers run.  
**Goal**: A versioned append-only kernel that safely resumes pre-plastic branches, closes exact semantic cycles, preserves legacy memory/tombstones, and excludes historical gaps from normal work.

## Read
- `extensions/plastic-memory/common/ids.ts` and `common/safety.ts` — identity/scrub/digest boundary
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js` — ancestry, custom entries, compaction-aware active entries
- `npm/node_modules/pi-observational-memory/src/session-ledger/types.ts` — exact legacy records/guards
- `npm/node_modules/pi-observational-memory/src/session-ledger/fold.ts` — first-valid/tombstone precedent
- `npm/node_modules/pi-observational-memory/src/session-ledger/progress.ts` — branch-relative coverage and token-watermark defect
- `npm/node_modules/pi-observational-memory/src/hooks/consolidation-trigger.ts` — single 100k in-flight behavior and false coverage

## Change
- `extensions/plastic-memory/session/types.ts` — CREATE — exact versioned legacy/new record guards
- `extensions/plastic-memory/session/ledger.ts` — CREATE — new/legacy fold, source/branch resolution, active memory, tombstones, compaction acknowledgements
- `extensions/plastic-memory/session/cycles.ts` — CREATE — completed-turn snapshots, ordered manifests/digests, exact closure, eligibility, attempt suppression
- `extensions/plastic-memory/session/bootstrap.ts` — CREATE — idempotent legacy-marker/compaction-aware safe resume and historical gaps
- `extensions/plastic-memory/session/retention.ts` — CREATE — deterministic reflection-supported conservative tombstones
- `extensions/test/plastic-memory-session.smoke.mjs` — CREATE — pure schema/legacy/huge/bootstrap/cycle/retention fixtures

## Proof
- **Semantic delta and anchors:** OM fold/branch markers are reusable, but a nonempty subset advances a whole chunk and an unchanged ~6,956,515-token backlog retries. Pi custom entries preserve branch-local evidence; `buildContextEntries()` is the active-context boundary.
- **Coverage receipt:** durable guards → fold; full branch + active entries → bootstrap window/gap; completed-turn span → snapshot → attempt terminal state → cycle; reflections → tombstones. `AFFECTED`: six paths. `UNAFFECTED`: user recall/backfill operations, hooks, workers, compaction apply, project files, settings, live sessions.
- **Closure:** live state is reconstructable from current-branch records. Bootstrap prevents whole-history work; cycles own coverage/retry; retention consumes the same fold. Cursor/proposal/ack shapes are fixed for later consumers.
- **Checkpoint:** pure fixtures validate current/legacy records and cycles, including a compaction-aware ~7m branch and exact source spans/digests.
- **Acceptance path:** synthetic entries → guarded fold/bootstrap/snapshot/result → observable cycle/gap/retention. Legacy evidence is `PRESERVE`; semantic coverage/safe resume `CHANGE`; whole-history eligibility is `REMOVE`.
- **Counterexample:** selecting from full `getBranch()` after bootstrap recreates the 7m prompt. Every normal snapshot ID must belong to the recorded active window, never `historical-unindexed`.

## Acceptance
- [ ] Guards accept only schemaVersion 1 approved `plastic.*` records; valid legacy `om.*`/`om.folded` remain read-only dual-read, while malformed/off-branch markers advance nothing.
- [ ] One bootstrap imports valid legacy marker identities, binds session/generation/latest compaction/active digest, chooses safe completed-turn bounds, records excluded prefix `historical-unindexed`, and is idempotent.
- [ ] A synthetic ~6,956,515-token branch yields no whole-history normal snapshot; only a fitting compaction-aware active window is eligible, with older active prefix an explicit gap.
- [ ] Snapshot identity binds one contiguous completed-turn span, ordered IDs, bounds, and digest; `partial | oversized | failed | stale` close no cycle, while exact complete input/response yields one `complete | empty-valid` cycle.
- [ ] Repeated triggers share one attempt identity; one automatic retry is durable, then unchanged work waits for source advancement/explicit retry; branch/session/generation changes reject late outcomes.
- [ ] Retention drops only explicitly absorbed, reflection-supported, active, non-critical observations in deterministic order and preserves tombstone evidence.
- [ ] Backfill cursor/proposal/compaction-ack guards are branch/session/generation-bound and reject malformed/cross-session data.

## Constraints
- Exact new custom types are `plastic.observations.recorded`, `plastic.reflections.recorded`, `plastic.observations.dropped`, `plastic.bootstrap.recorded`, `plastic.cycle.attempted`, `plastic.cycle.closed`, `plastic.compaction.applied`, `plastic.backfill.cursor.recorded`, `plastic.project.proposal.recorded`, and `plastic.project.proposal.decided`. Legacy `om.*` is never written.
- Attempt records carry snapshot/session/generation/range/digest, phase/outcome, attempt count, and suppression reason; cycle records carry stable cycle ID, source bounds/ordered digest, completed-turn boundary, status, and linked observation/reflection IDs.
- Evidence is append-only; no source/legacy rewrite, deletion, or sidecar. Normal snapshots start at validated bootstrap/coverage and never traverse historical gaps.
- Reflector status alone cannot close coverage; deterministic code proves complete serialized snapshot and exact manifest/identity. No partition/multipart fan-out.
- Tests are `NO_STATEFUL_RESOURCES`; no real session/settings/auth/model/project/provider.

## Validation
- `node extensions/test/plastic-memory-session.smoke.mjs` — PASS for exact record guards, legacy fold, cycles, partial rejection, retry suppression, stale generation, 100k identity, ~7m safe resume, gaps, retention
- `git diff --check -- extensions/plastic-memory/session extensions/test/plastic-memory-session.smoke.mjs` — no whitespace errors

## Stop If
- Safe bootstrap cannot derive from branch legacy markers plus active entries, normal snapshots include excluded history, or cycle coverage depends on model prose.

## Checkpoint
- Recovery snapshot: not required; targets are new and fixtures in-memory.
- Commit scope: six `Change` paths only.
