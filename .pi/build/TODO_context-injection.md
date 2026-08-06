# TODO context-injection

## Phase 1 — Implement handler result contract
- Status: `complete`
- Authorized files/symbols: `extensions/plastic-memory/index.ts` (`prependProjectContext`, `before_agent_start`); `extensions/project-memory.ts` (same helper/handler)
- Material prerequisite: TILL-DO all gates PASS; host runner applies `handlerResult.systemPrompt`.
- Local exit evidence: both handlers return block-first combined prompt; no mutation transport; plastic current context assignment precedes fallible assembly and failures return no override.

## Phase 2 — Add regression smoke test
- Status: `complete`
- Authorized files/symbols: new `extensions/test/plastic-memory-context-injection.smoke.mjs`
- Material prerequisite: Phase 1 result contract implemented; existing jiti/fake-pi conventions.
- Local exit evidence: test asserts returned systemPrompt marker/order and does not use ctx.systemPrompt; project bridge early-return is reported if observed.

## Phase 3 — Validate and review diff
- Status: `blocked`
- Authorized files/symbols: same three product files only for diff review; no additional source mutation.
- Material prerequisite: Phases 1–2 complete; NO_STATEFUL_RESOURCES receipt.
- Local exit evidence: standalone test PASS and all smoke tests except the legacy cutover assertion PASS. Blocked by the untouched `plastic-memory-cutover.smoke.mjs` expecting the removed `ctx.systemPrompt` mutation; this conflicts with the required result-only contract and exact write set.

## Execution receipt
- Completed phase: Phases 1–2
- Current phase: Phase 3 blocked by contract conflict
- Next phase: Reconcile the legacy cutover smoke oracle versus the explicit result-only contract, then rerun the exact smoke loop
- Changed files: `extensions/plastic-memory/index.ts`, `extensions/project-memory.ts`, `extensions/test/plastic-memory-context-injection.smoke.mjs`
