# TILL-DO — stale internal nonce repair

## Authority / baseline — PASS
- Authority: user contract in current task; exact baseline required: `45e4a54`.
- Target evidence read: `extensions/plastic-memory/runtime/coordinator.ts` nonce prefix, `session_before_compact`, `consumeInternalIntent`; integration smoke nonce probe.
- Baseline check: pending `git rev-parse HEAD` verification before source mutation.

## Contract / scope — PASS
- Modify only `extensions/plastic-memory/runtime/coordinator.ts` and `extensions/test/plastic-memory-integration.smoke.mjs`.
- Preserve exact full nonce encoding and exact-live synchronous one-use consumption/latch plus pending/fresh-cut checks.
- Change unmatched private-prefix events to `{ cancel: true }`; preserve non-private ordinary native/manual fallback and usable pending custom apply.
- Update stale/wrong/private-prefix assertions and retain a clearly non-internal ordinary manual custom-instructions fallback assertion.
- No root/bridge/settings/project/worker/plan files and no recovery snapshot changes.

## Validation / resources — PASS
- Required commands are direct Node smokes and `git diff --check`; supplied receipt says provider-free, in-memory, unique temp fixtures with no server/network/provider/auth/settings/session/project-memory mutation or reload.
- Run exactly the five requested smoke commands plus focused diff check after edits.
- Review resolved command paths and focused diff before reporting.

## Recovery / stop gates — PASS
- Tracked target files are clean per scoped status; git history plus orchestrator checkpoint is rollback boundary; no pre-edit snapshot required.
- Stop if customInstructions is not preserved by Pi or ordinary non-internal native fallback changes; do not expand scope.
