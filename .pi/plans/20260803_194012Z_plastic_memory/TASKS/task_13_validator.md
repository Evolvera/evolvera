# Task 13: Validate custom-cut and async-apply safety

**Agent**: validator  
**Why**: An unsupported cut, superseded-summary filter, prompt race, or overlapping compact could pass builder-local checks yet collapse context or interrupt visible work.  
**Goal**: Issue `PASS` only when the exact full-runtime checkpoint independently proves Pi 0.83.0 cut, provider-projection, descendant, and non-interrupting apply barriers.

## Read
- `extensions/plastic-memory/compaction/` — cut, structured verification, pending, unique header, and provider projection
- `extensions/plastic-memory/runtime/coordinator.ts` — settlement, nonce, fallback, generation, and acknowledgement
- `extensions/plastic-memory/index.ts` and `extensions/project-memory.ts` — wired owner surface
- `extensions/plastic-memory/session/` — coverage/bootstrap/attempt/prefix evidence
- `extensions/plastic-memory/workers/` — 100k scheduling, detached compactor, visible-model isolation
- `extensions/test/plastic-memory-host.smoke.mjs` — first capability fixture
- `extensions/test/plastic-memory-compaction.smoke.mjs` — cut/pending oracle
- `extensions/test/plastic-memory-integration.smoke.mjs` — real host coordinator/projector oracle
- `extensions/test/plastic-memory-cutover.smoke.mjs` — wired all-mode oracle
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/package.json` — exact host version
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` — compact/prompt/ack paths
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js` — hook reachability/native cut
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js` — append/rebuild collapse and repeated projection

## Change
- Review the named producer checkpoint only; make no production, test, configuration, documentation, plan, or review-artifact edits.
- Files Touched: none.

## Acceptance
- [ ] Record the exact full-runtime producer hash and confirm focused diffs contain only its declared root/bridge/test paths plus checkpointed dependencies; host is exactly Pi 0.83.0.
- [ ] Source review confirms one production `session_before_compact` owner, one guarded provider `context` projector, unique cycle-range/digest headers, fresh ancestor/cut/tool validation, and no summary-text authority.
- [ ] Real-host fixture proves hook reachability, preparation deferral, valid ancestor plus descendants, and fail-before-append for missing/non-ancestor/tool-result/orphan/fork/reordered cuts.
- [ ] C1–C6/C7–C8/third-stride diagnostics show one cumulative summary plus correct raw cycles/descendants; native-only/emergency branches remain unfiltered with no native-only fact loss.
- [ ] Readiness/prompt/queue/overlap interleavings show no visible abort/overwrite, at most one append, consume-once pending, and acknowledgement only of the matching unique entry.
- [ ] Internal stale/missing nonce cancels with zero native call; actual manual/threshold/overflow without matching usable state reaches native current-visible-model fallback; undefined preparation defers pending.
- [ ] 100k one-shot/partial/retry and ~6,956,515-token safe-resume diagnostics show no false coverage, loop, whole-history provider input, or multipart fan-out; all state is fake/in-memory/temp.

## Validation
- `node extensions/test/plastic-memory-host.smoke.mjs` — mandatory `HOST_CAPABILITY: PASS`
- `node extensions/test/plastic-memory-session.smoke.mjs` — exact coverage, retry, bootstrap, 7m, and gap barriers PASS
- `node extensions/test/plastic-memory-compaction.smoke.mjs` — cut/pending/unique-header/stride barriers PASS
- `node extensions/test/plastic-memory-workers.smoke.mjs` — 100k/fake-Luna/detached/visible-model barriers PASS
- `node extensions/test/plastic-memory-integration.smoke.mjs` — actual host projection/async apply/prompt/overlap/fallback/ack barriers PASS
- `node extensions/test/plastic-memory-cutover.smoke.mjs` — wired one-owner and durable-context integration PASS
- `grep -R -n --include='*.ts' 'pi\.on("session_before_compact"' extensions/plastic-memory extensions/project-memory.ts` — exactly one production registration
- `grep -R -n --include='*.ts' -E 'summary[[:space:]]*===|pi\.setModel|name:[[:space:]]*"recall"|setTimeout\(' extensions/plastic-memory extensions/project-memory.ts` — no summary-text authority, model switch, bare recall, or timer apply; inspect benign matches
- `git diff --check -- extensions/plastic-memory extensions/project-memory.ts` — focused producer surface has no whitespace error

## Stop If
- Any command contacts provider/network, reads/writes non-temp state, or relies on sleeps; producer hash/host version is ambiguous; exact context is inferred without provider-message observation; any prompt can be interrupted; unsafe cut can append; native facts can be filtered; or stale internal apply can fall through.

## Checkpoint
- Recovery snapshot: not required; review-only quality gate.
- Commit scope: none.
- Checkpoint Commit: not required (quality gate).
- Verdict: record `PASS` against the exact producer hash, or `BLOCKED` with the smallest failing cut/projection/race/fallback trace. On `BLOCKED`, pause dependents, return the finding to the owning builder for a bounded checkpoint repair, then rerun this gate.
