# TODO 01 — plastic-memory host gate and inert foundation

## Phase 1 — Host gate
- Status: `complete`
- Authorized files/symbols: `extensions/test/plastic-memory-host.smoke.mjs`; public Pi SDK APIs and temp-local fake extension only.
- Material prerequisite: TILL-DO_01 all gates PASS.
- Outcome: preserved the unguarded invalid-cut collapse and direct-overlap double-append negative controls; added a test-local one-use internal-intent/pending guard consumed synchronously by the first valid overlapping hook invocation. The temporary plastic context prototype now marks only test-created cumulative compactions with structured state/range details, maps `compactionSummary` messages to fresh public `getBranch()`/`buildContextEntries()` order, and filters only structurally subsumed marked entries; summary text remains output-only evidence. Native/emergency compactions remain unmarked and are returned unchanged.
- Exit evidence: `node extensions/test/plastic-memory-host.smoke.mjs` reports Pi 0.83.0 controls and `HOST_CAPABILITY: PASS`; guarded overlap has one fulfilled request, one cancellation, one appended entry, and one `session_compact` observation. The repeated fixture asserts public branch/context role-order mapping plus structured plastic metadata drives projection, while native/emergency details remain undefined and their observed summaries remain unchanged. Prior valid descendant, undefined-preparation deferral, and prompt-settlement assertions remain passing.


## Phase 2 — Inert foundation
- Status: `complete`

- Authorized files/symbols: `extensions/plastic-memory/index.ts`, `config.ts`, `common/ids.ts`, `common/safety.ts`, `THIRD-PARTY-NOTICES.md`.
- Material prerequisite: Phase 1 `HOST_CAPABILITY: PASS`.
- Exit evidence: strict absent/invalid config is disabled; exact four Luna-medium roles and caps are present; injectable global/project namespace resolution deep-merges with project precedence and fails closed on malformed fragments; package collision detection is exact and version-aware; IDs/safety reject malformed and sensitive input; root performs zero registrations; both complete MIT notices and adaptation provenance are present.

## Phase 3 — Loader closure
- Status: `complete`

- Authorized files/symbols: `extensions/test/plastic-memory-bootstrap.smoke.mjs` plus Phase 2 foundation files.
- Material prerequisite: Phase 2 complete.
- Exit evidence: `node extensions/test/plastic-memory-bootstrap.smoke.mjs` passes plain Node and installed Pi-jiti imports from a unique manifest-free temp sandbox with no user-data fallback or registrations.

## Current execution
- Completed: TILL-DO gates, host gate, inert foundation, loader closure, and focused validation.
- Current: complete; no Task 02+ work started.
- Validation evidence: host smoke PASS, bootstrap Node+jiti smoke PASS including in-memory global/project merge, disable/enable precedence, malformed fail-closed, versioned/global/project OM detection, nonmatching package rejection, and no real-setting reads; focused tracked/untracked whitespace checks PASS.
- Next: none for Task 01; do not commit transient TODO/TILL-DO artifacts.
- Changed files: `.pi/build/TILL-DO_01.md`, `.pi/build/TODO_01.md` (transient only), `extensions/test/plastic-memory-host.smoke.mjs`, `extensions/test/plastic-memory-bootstrap.smoke.mjs`, `extensions/plastic-memory/index.ts`, `extensions/plastic-memory/config.ts`, `extensions/plastic-memory/common/ids.ts`, `extensions/plastic-memory/common/safety.ts`, `extensions/plastic-memory/THIRD-PARTY-NOTICES.md`.
