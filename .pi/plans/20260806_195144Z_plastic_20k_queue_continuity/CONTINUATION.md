# Continuation — Plastic 20k Queue and Flow Continuity

**Status:** deterministic implementation complete and independently reviewed at `7ded8feff73117478bebb344cc2f6e2948adb9b4`; live host/provider behavior remains unverified.

## Delivered

- `7017943` — durable strict `plastic.cycle.queued` records, whole-terminal-turn FIFO batching at >=20,000 estimated source tokens, reconstruction/replay/overlap guards.
- `416963a` — queued FIFO scheduler and normal phase fallback: Luna → Luna retry → Sonnet 5 → distinct visible model.
- `2397e4c` — coordinator captures queue items synchronously before runtime lookup, queue/restart recovery, and no scheduler raw-source fallback.
- `7359dd1` — repository-only guarded Pi 0.83.0 threshold-cancel patcher, fixture smoke, installer wiring, docs. It was **not** applied to the global host.
- `b217346` — **restored continuous automatic compaction**: after six closed >=20k cycles, with a started incomplete cycle and context usage strictly above 120,000 tokens, Plastic applies its own compaction while settled/idle/no-queued-messages. Below-threshold waiting is silent.
- `7ded8fe` — passive Plastic compaction: no autonomous `ctx.compact`, no reachable transient emergency source path, >=20k closed-cycle validation, normal pending-or-cancel host hook, acknowledgement-before-rebase.

## Before → Now

- **Before:** any terminal turn could invoke an observer; six tiny cycles prepared compaction; `agent_settled` could call `ctx.compact` and retry `Nothing to compact`; absent pending used transient sub-20k emergency behavior.
- **Now:** only whole completed batches >=20k queue and reach semantic workers, queue capture is durable while a worker runs, and Plastic compacts automatically at six closed cycles + started next cycle + >120k context, but only while settled/idle with no queued messages. Manual/threshold/overflow host compaction still consumes an exact pending or returns `{ cancel: true }`.

## Deterministic evidence

- Full Plastic suite: **28/28 PASS** under classified resources:
  - module smokes: `NO_STATEFUL_RESOURCES`;
  - temp-writing smokes: unique `mkdtemp` synthetic roots with same-root cleanup (`DISPOSABLE_VERIFIED`);
  - `host.smoke`: `SessionManager.inMemory`, `allowModelNetwork:false`, fake stream, `noTools:"all"`;
  - `install.smoke`: shadows npm/pi/node with fixture executables.
- `node scripts/test/patch-pi-083-threshold-cancel.smoke.mjs`: PASS (`DISPOSABLE_VERIFIED`).
- `bash -n install.sh`, coordinator removed-path grep, and baseline-to-final `git diff --check`: PASS.
- Independent validator: **PASS** at `7ded8fe`.

## Unverified / requires fresh confirmation

Do not claim live success yet. The following are consequential runtime operations:

1. Apply the guarded patch to `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` by running the repository patcher after confirming the exact target/version/anchor/digest and providing a recovery copy independent of the target. The patch changes only threshold cancellation behavior, but it modifies the installed global runtime.
2. Restart/reload Pi and run a new disposable local session to observe: <20k no worker call; >=20k queue capture; A/B/C FIFO while active; no autonomous compaction; manual/threshold/overflow host hooks; applied-record/rebase; queued follow-up continuity.
3. Provider calls/billing/auth are external non-disposable state and require explicit authorization; never use user session directories.

PowerShell parser/runtime remains `UNVERIFIED` because `pwsh` is unavailable.
