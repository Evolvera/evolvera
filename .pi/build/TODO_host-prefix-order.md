# TODO — host-prefix-order

## Phases

### 1. Evidence and shared helper
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/session/ledger.ts`, new `hasOrderedContextTail`; engine/coordinator/projection guard call sites.
- Prerequisite: TILL-DO PASS and byte-for-byte snapshots under `.pi/recovery/host-prefix-order/before/`.
- Exit evidence: `hasOrderedContextTail(readonly SessionEntry[])` enforces unique IDs, first context-bearing anchor, anchor predecessor link, strict parent chain through tail, and no-anchor fail-closed; all three local duplicates removed.

### 2. Focused regression fixtures
- Status: `complete`
- Authorized files/symbols: `extensions/test/plastic-memory-stride.smoke.mjs`, `extensions/test/plastic-memory-apply-cut.smoke.mjs`, `extensions/test/plastic-memory-integration.smoke.mjs` projection fixture.
- Prerequisite: phase 1 complete.
- Exit evidence: stride reproduces session/model/thinking/bootstrap prefix and starts one compactor; apply-cut covers host-prefix acceptance and post-anchor rejection; integration covers projection acceptance, malformed tail noop, and no-anchor fail-closed.

### 3. Validation and diff review
- Status: `complete`
- Authorized files/symbols: target files only for validation/review.
- Prerequisite: phases 1–2 complete; `NO_STATEFUL_RESOURCES` receipt.
- Exit evidence: focused stride/apply-cut/integration tests pass; all 21 Plastic smoke tests pass; `git diff --check` passes for the seven changed targets; focused diff is limited to one shared helper, three call-site replacements, and targeted fixtures.

## Current receipt
- Completed: phases 1–3; focused and full validation pass; target-only diff reviewed.
- Current: none.
- Next: none.
- Changed files: `extensions/plastic-memory/session/ledger.ts`, `extensions/plastic-memory/compaction/engine.ts`, `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/plastic-memory/compaction/projection.ts`, `extensions/test/plastic-memory-stride.smoke.mjs`, `extensions/test/plastic-memory-apply-cut.smoke.mjs`, `extensions/test/plastic-memory-integration.smoke.mjs`.
