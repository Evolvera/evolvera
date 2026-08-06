# Plastic Memory — Continuation Handoff

- **Updated**: 2026-08-05
- **Repository**: `/Users/j.henrique/.pi/agent`
- **Active plan**: `.pi/plans/20260805_182432Z_plastic_memory_seamless_retention/`
- **Canonical project-memory publication**: unavailable (`memory_search` returned `CANONICAL_UNAVAILABLE: project is uninitialized`). This file is a durable delivery handoff, not canonical project memory.

## User outcome

Make Plastic Memory seamless by combining:

- observational memory: continuous observations/reflections, IDs, recall/index;
- smart compact: deterministic extraction/verification, one session-bound pending, native host hook as application transport;
- Plastic-specific policy: continuous short/medium/long memory and newest-cycle retention.

No duplicate summaries should remain active. Pi injects only the latest compaction entry. Plastic normally owns the prepared summary/cut; host native summary is an emergency fallback and becomes a fresh boundary.

## External behavioral oracles

Downloaded read-only npm tarballs under `/tmp/pi-extension-research.isJk76/`:

1. `pi-observational-memory@3.0.3`
   - repo: `https://github.com/elpapi42/pi-observational-memory`
   - historical install commit in this repo: `e7d8dee feat(memory): install observational compaction`
   - important files: `src/hooks/compaction-trigger.ts`, `src/hooks/compaction-hook.ts`, `src/session-ledger/render-summary.ts`.
   - useful behavior: observe/reflect continuously; render indexed ledger at compaction; IDs + recall; defer until idle.
2. `pi-smart-compact@7.22.0`
   - repo: `https://github.com/alpertarhan/pi-smart-compact`
   - useful behavior: deterministic Extract → Explore → Synthesize → Verify; one TTL/session-bound pending; `session_before_compact` consumes pending; tool path never compacts mid-turn; deterministic repair before applying.

Use as MIT behavior oracles only; do not vendor/copy broad implementations.

## Final architecture contract

### Memory layers

- **Short**: newest closed cycles retained raw, plus current incomplete turn intact.
- **Medium**: one rolling Plastic cumulative summary containing observations, reflections, state and recall index.
- **Long**: project promotion; out of current implementation scope.

### Cycle retention

- Eligibility begins at 6 CLOSED cycles.
- C1..C6: summarize C1/C2, retain raw C3..C6.
- Delayed C1..C8: summarize C1..C4, retain raw C5..C8.
- Current incomplete suffix is not a cycle and is never split/cut.
- Physical emergency scans retained raw suffix count 4→3→2→1→0. Folded cycles join the SAME rolling Plastic summary. Zero raw is allowed only when a safe user `firstKeptEntryId` exists at an incomplete suffix; otherwise retain at least one representable cycle or fail closed.

### Host integration

- Host default `keepRecentTokens=20_000` is an application gate, not Plastic retention policy.
- Unknown/null/<=20k usage: pending stays prepared; no `ctx.compact()` call.
- Exact `Nothing to compact (session too small)`: informational deferral; clear latch/intent only, retain pending, retry on a later settled edge.
- Valid Plastic pending owns its cut regardless of host advisory cut ordering.
- `priorState` advances only after matching `session_compact` acknowledgement.
- Actual unmatched/native compaction invalidates pending/prior generation and bootstraps from the new host boundary.
- Pi active context contains only the latest compaction entry, so summaries do not stack forever.

### Harness/model separation

Code/harness owns binding, branch, snapshot, cycle, IDs, digest, cut, pending, acknowledgement and citation allow-lists.

Luna returns only:

- observations: semantic content, timestamp, relevance, source citations;
- reflections: semantic content, supporting observation citations.

Model-returned record IDs/manifests/lifecycle identity are ignored. Source/support citations remain strict nonempty subsets.

### Retry and chunking

- Observer/reflector get exactly one immediate phase-local retry against the same immutable input.
- No later-turn retry dependency, third call or hot loop.
- Stale branch/generation aborts without retry.
- Completed source >160k is partitioned into <=160k observer calls.
- Atomic boundary: assistant tool-call message + all matching tool results remain together. Multi-call assistant waits for every result. Orphan/unmatched/malformed exchange fails before worker calls.
- Ordinary prefix is separately packable; packer combines adjacent groups only when they fit.
- Aggregate observations are appended only after every chunk succeeds; reflector runs once; one full-span cycle closes.

## Commits created

1. `7d0a06b` — `fix(plastic-memory): repair live memory pipeline`
   - 21/21 smoke baseline, including all earlier live repairs.
2. `152d4e7` — `feat(plastic-memory): retain recent cycles seamlessly`
   - exact newest-four policy, 20k deferral, physical emergency, host lifecycle/rebase.
3. `37f8d2e` — `feat(plastic-memory): chunk and retry semantic workers`
   - semantic-only workers, code-owned IDs, immediate retry, deterministic chunking/tool integrity.
4. `899ade5` — `fix(plastic-memory): discard blank semantic candidates safely`
   - blank/scrub-empty candidates are discarded only AFTER timestamp/relevance/citation validation.

Current product tree is committed. Untracked `.pi/build`, `.pi/recovery`, and plan artifacts remain intentionally uncommitted.

## Deterministic validation

- All `extensions/test/plastic-memory-*.smoke.mjs`: **21/21 PASS** after `899ade5`.
- `git diff --check`: PASS.
- Independent validator at head `37f8d2ec5f42915d14a8b8b8996aa8ce75b35942`: PASS, 11 critical smokes; receipts verified.
- Latest repair `899ade5` has not yet had a fresh independent validator pass.

Task receipts:

- Task 01: `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_01/FINAL_DELTA_RECEIPT.md`
- Task 01 final patch SHA: `4d6135ff9c6cf22166759d9024a440816ede0e953db4180bd612c41f7d189091`
- Task 02: `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/FINAL_DELTA_RECEIPT.md`
- Task 02 final patch SHA after chunk repairs: `ae144cec040609e9363a47e573ca4ad05a56dc115ec5658204feafd4f4a6ad87`
- Blank repair recovery: `.pi/recovery/20260805_182432Z_blank_observation_repair/`
- Blank repair patch SHA: `70c78a1c2f8a487a622dded9f3bbc6cf995569448d94514fe5a6e25a669a982e`

## Live campaign evidence

### Successful earlier sandbox

Before this final redesign, `/tmp/pm-manifest-live.gIlXcv` produced 15 closed cycles and 8 `fromHook:true` Plastic compactions. It exposed host `Nothing to compact` before the 20k gate fix.

### Giant-turn harness attempts

Two early pty drivers failed operationally before creating a session because boot waited for TUI silence / prompt injection was unreliable:

- `/tmp/pm-live-oversized.rPEdN8`
- `/tmp/pm-live-oversized-fixed.O3Tpin`

Do not interpret them as product failures.

`pi -p` campaign `/tmp/pm-live-oversized-print.LGjLqj` completed 55 reads and created 112 source messages, but print mode exited while detached observer remained pending. Not a product verdict.

### Authoritative giant live run before blank repair

`/tmp/pm-live-oversized-interactive.Rt019q`

- one completed agentic turn, 112 source entries;
- snapshot ~151,659 tokens;
- attempt 0 observer failed: `invalid-observation-content`;
- immediate attempt 1 used same snapshot and failed identically;
- no partial observation/reflection/cycle record;
- proves chunking reached workers and bounded retry/persistence behavior worked.

### Giant live run after blank repair

`/tmp/pm-live-oversized-repair.i17gvr`

- one completed agentic turn, 112 source entries;
- snapshot ~153,185 tokens;
- attempt 0 observer failed: `invalid-observation-content`;
- attempt 1 failed identically;
- no cycle/compaction.

Conclusion: the rejected candidate is NOT merely a blank/scrub-empty string. Given current parser, likely `content` is missing or non-string. Exact shape is unknown because raw model output is intentionally not persisted. Add safe fixed subcategories before changing acceptance:

- missing content property;
- non-string content (possibly array/object/null);
- blank string (already safely discardable).

Do not log values. First classify shape safely, repeat the giant campaign, then decide whether a deterministic normalization (e.g. strict array-of-text parts) is supported. Never accept arbitrary objects or weaken citation/relevance/timestamp validation.

## Remaining work — exact next order

1. Add safe observer content-shape diagnostics (`missing`, `null`, `array`, `object`, other primitive) with no dynamic values or payload.
2. Add deterministic smoke fixtures for each class; keep blank-with-invalid-citation/relevance as hard failure.
3. Commit diagnostics/repair and run 21/21.
4. Repeat one giant >150k Luna campaign. Expected goal: one full cycle closes; if non-string shape recurs, use the safe category to design bounded normalization.
5. Run retention/application live campaign:
   - 8 small complete cycles below 20k so C8 pending represents C1..C4;
   - then one large descendant turn crosses 20k;
   - observe pending consumed, `fromHook:true`, C5 cut, applied acknowledgement, one active summary, suffix preserved, no `Nothing to compact` warning/hot loop.
6. Run bounded model-variance campaign; record natural retry/closure. If no variance occurs, mark that surface `TO VERIFY`, do not inject malformed live model output.
7. Fresh validator on final head including `899ade5` and any content-shape repair.
8. Update plan schedule/live run log. Canonical project-memory publication remains unavailable until a supported provider-backed path exists.

## Current blocker

Only the live Luna semantic content shape on ~153k snapshots. Deterministic implementation and tests are green; do not claim live completion until this closes.
