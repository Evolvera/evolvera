# Task 06: Validate queue replay safety and host reason isolation

**Agent**: validator  
**Why**: Overlapping/replayed queue spans and a broadened host cancellation patch can pass shallow happy-path tests while causing duplicate model work or lost overflow/manual behavior.  
**Goal**: Return `PASS` only if the recorded final Plastic and host-delivery checkpoints satisfy the deterministic safety barriers without production edits.

## Read

- `SCHEDULE.md` — obtain the orchestrator-recorded Plastic lifecycle and host patch checkpoint hashes/verdict context.
- `extensions/plastic-memory/session/{types,cycles,ledger}.ts` — queued schema, batching, reconstruction, and branch/token/digest validation.
- `extensions/plastic-memory/workers/{scheduler,runner}.ts` — exact FIFO consumption, immutable fallback, retryability, and compactor gating.
- `extensions/plastic-memory/runtime/coordinator.ts` — synchronous capture, restart binding, passive hooks, acknowledgement, and absence of emergency/autonomous application.
- `extensions/plastic-memory/compaction/engine.ts` — >=20k closed-cycle and six/four gate.
- `extensions/test/plastic-memory-{queue,workers,emergency-queue,integration,emergency-hook,apply-cut,acknowledge,compaction,stride}.smoke.mjs` — risk-specific deterministic oracles.
- `scripts/patch-pi-083-threshold-cancel.mjs` and `scripts/test/patch-pi-083-threshold-cancel.smoke.mjs` — version/hash/cardinality and reason-isolation proof.
- `install.sh`, `install.ps1`, and `README.md` — delivery ordering, refusal, and rollback contract.

## Change

- Files Touched: none — review the recorded checkpoints and run safe deterministic checks only; do not repair or add tests in this gate.

## Acceptance

- [ ] Queue review confirms code-owned exact identity/count/digest, whole-turn atomicity, exact-duplicate idempotency, conflict/overlap/gap/stale/off-branch fail-closure, oldest-only FIFO, and no attempt/close/model call below 20,000.
- [ ] Runtime review confirms synchronous capture survives no runtime/active worker/restart, fallback inputs are immutable in Luna/Luna/Sonnet/distinct-visible order, exhaustion is retryable, and six/four compaction rejects sub-20k closes before model work.
- [ ] Passive lifecycle review finds no reachable coordinator `ctx.compact`, emergency source pipeline, nonce/latch/application-threshold/`Nothing to compact` loop, native result, fake cycle, or synthetic continuation.
- [ ] Host-boundary review confirms an exact applied record is appended and validated before state-preserving generation rebase/bootstrap, with branch/digest/cut/TTL/citation/scrub guards intact.
- [ ] Patcher review confirms exact package/version plus exact anchor SHA-256/cardinality, atomic no-write refusal, idempotency, threshold-only queued-state return, and unchanged overflow/manual/success controls.
- [ ] Full Plastic and patch fixture suites pass without network, provider, npm/global-root writes, user sessions, or non-run-owned state.
- [ ] Verdict is recorded as `PASS` with exact checkpoint hashes and command signals, or `BLOCKED` with the smallest reproducible finding set.

## Constraints

- Review only the checkpointed task-owned changes from baseline `d9824ec8ba3af00583e1136d62f3ebc0ca2d00b0`; unrelated dirty files are not evidence and must not be staged/reverted.
- Use in-process Plastic fakes and the patch smoke's run-owned temporary fixture only.
- Treat unavailable live provider/host campaigns and unavailable PowerShell parser execution as explicitly unverified, not as failures of deterministic code unless a claimed gate depends on them.

## NOT TO DO

- Do not edit production/tests/docs/config, create a commit, apply the patcher to the installed package, execute installers/npm, use network/providers/credentials, restart Pi, or run live manual/threshold/overflow sessions.
- Do not accept changed tests as sole proof: inspect fixed literal ID/digest/count/call-order/branch-order oracles and the exact patch replacement.
- On any queue replay/overlap escape, sub-20k call, autonomous application, acknowledgement-order defect, or host reason broadening, return `BLOCKED` and pause dependents for bounded producer repair and rerun.

## Validation

- `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done` — complete deterministic Plastic suite passes.
- `node scripts/test/patch-pi-083-threshold-cancel.smoke.mjs` — patch semantics/refusal/idempotency and installer wiring pass in a disposable temp root.
- `if grep -nE 'ctx\.compact|prepareEmergencyCompaction|selectEmergencyWindow|internalCompactionInstructions|applyLatch|Nothing to compact' extensions/plastic-memory/runtime/coordinator.ts; then exit 1; fi` — removed active paths have no coordinator marker.
- `git diff --check d9824ec8ba3af00583e1136d62f3ebc0ca2d00b0..<recorded-final-checkpoint>` — exact final checkpoint range has no whitespace errors.
- Focused diff review of `plastic.cycle.queued` creation/validation and the patcher's unpatched/patched anchors — one fixed semantic path each, no undeclared artifact or weakened negative oracle.

## Stop If

- Recorded checkpoint hashes are missing, the reviewed tree differs from them, a deterministic test touches live/global state, or any acceptance barrier lacks a non-self-fulfilling oracle.

## Checkpoint

- Recovery snapshot: not required (review-only quality gate).
- Checkpoint Commit: not required (quality gate).
