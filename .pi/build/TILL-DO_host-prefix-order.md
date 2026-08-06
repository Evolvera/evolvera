# TILL-DO — host-prefix-order

## Authority / baseline — PASS
- User contract is authoritative; repository HEAD is `a3cef500fdd4ef29317f4a42402d7b228ba17035`.
- Required existing surfaces read: `session/ledger.ts`, `compaction/engine.ts`, `runtime/coordinator.ts`, `compaction/projection.ts`, stride/apply-cut/context-injection smokes, plus integration projection coverage.
- Existing duplicate guards confirmed in engine, coordinator, and projection; `SessionEntry` is defined in `session/types.ts`.

## Contract / scope — PASS
- Change only the leading host-prefix treatment: shared helper accepts `readonly SessionEntry[]`, requires unique/nonempty IDs, finds first context-bearing anchor (`message`, `custom_message`, `branch_summary`, `compaction`), requires anchor-to-tail immediate parent links, and fails closed without an anchor.
- Preserve strict identity/order after anchor and all existing cycle, binding, digest, cut, budget, acknowledgement, and projection semantics.
- Authorized source/test write set is exactly the seven target files named by the user; no files outside it may be edited. No staging/commit/live Pi/provider/network/app/server/E2E/credential inspection.

## Validation / resources — PASS
- `NO_STATEFUL_RESOURCES`: listed smoke tests are in-process fake runtime/module tests only; no providers, network, app/server, database, filesystem cleanup, sessions, credentials, or shared state.
- Run focused stride, apply-cut, and projection coverage first; then all 21 `extensions/test/plastic-memory-*.smoke.mjs`; run `git diff --check` restricted to target files.

## Recovery / stop gates — PASS
- Before source mutation, snapshot preservation-critical/shared target files byte-for-byte under `.pi/recovery/host-prefix-order/before/`.
- Stop if helper placement creates a dependency cycle or requires scope expansion; stop if host-prefix shape cannot be reproduced; reject any post-anchor mismatch acceptance; do not broaden ordering or relax ID checks.
