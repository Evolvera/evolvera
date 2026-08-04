# TODO 02 — session cycle/bootstrap/legacy kernel

## Phase 1 — versioned records and guards
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/session/types.ts`; exported record constants, types, and guards.
- Material prerequisite: Task 01 IDs/safety APIs and legacy record shapes read.
- Local exit evidence: smoke passed v1 approved `plastic.*` guards, namespaced new observation IDs, raw legacy compatibility, malformed/off-branch rejection, and branch/session/generation-bound record checks.

## Phase 2 — append-only fold and safe bootstrap
- Status: `complete`
- Authorized files/symbols: `session/ledger.ts`, `session/bootstrap.ts`; branch fold, active memory/tombstones, compaction-aware bootstrap, historical gap and later cursor/proposal/ack guards.
- Material prerequisite: Phase 1 guards and Pi current-branch/buildContextEntries semantics.
- Local exit evidence: smoke passed idempotent bootstrap from compaction-aware active context, legacy coverage import, historical-unindexed prefix, current-branch fold, normal window exclusion, and compaction acknowledgement collection.

## Phase 3 — exact cycles and conservative retention
- Status: `complete`
- Authorized files/symbols: `session/cycles.ts`, `session/retention.ts`; completed-turn snapshots, manifests/digests, attempts/retry suppression, exact closure, deterministic tombstones.
- Material prerequisite: Phase 2 branch/source resolution and append-only identity primitives.
- Local exit evidence: smoke passed fitting 100k one-opportunity identity, oversized/partial rejection, exact complete and empty-valid closure, one automatic retry plus durable suppression/explicit retry, stale generation rejection, and deterministic conservative retention.

## Phase 4 — focused smoke and final review
- Status: `complete`
- Authorized files/symbols: `extensions/test/plastic-memory-session.smoke.mjs`; pure in-memory acceptance fixtures.
- Material prerequisite: Phases 1–3 exports available through the installed TypeScript loader.
- Local exit evidence: `node extensions/test/plastic-memory-session.smoke.mjs` returned `PLASTIC_MEMORY_SESSION: PASS`; required `git diff --check -- extensions/plastic-memory/session extensions/test/plastic-memory-session.smoke.mjs` returned no output.

## Execution receipt
- Completed phase: Phase 4
- Current phase: none
- Next phase: none
- Changed files: `extensions/plastic-memory/session/types.ts`, `extensions/plastic-memory/session/ledger.ts`, `extensions/plastic-memory/session/cycles.ts`, `extensions/plastic-memory/session/bootstrap.ts`, `extensions/plastic-memory/session/retention.ts`, `extensions/test/plastic-memory-session.smoke.mjs`
