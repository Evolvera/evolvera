# TILL-DO task-03

| Gate | Status | Evidence |
|---|---|---|
| authority/baseline | PASS | Direct brief authorizes exactly seven production/smoke files; `git rev-parse HEAD` is `416963abfa967a9472f7746a34db5b542d9c3841`; scoped status was clean. |
| contract/scope | PASS | `cycles.ts` provides `createQueuedCycleRecords`, `reconstructCycleQueue`, and `selectOldestUnresolvedQueuedCycle`; baseline coordinator resolves runtime before scheduling and scheduler has the `legacy` lookup. No types/cycles/ledger/runner/compaction/emergency/installers/README/global-host writes are permitted. |
| validation/resources | PASS | User supplied `NO_STATEFUL_RESOURCES`: validation is fake/in-process Node smoke modules only; no Pi/provider/network/patcher/global package/session/credential operation will be invoked. Required focused/full Plastic smoke commands and scoped diff check are recorded in the task. |
| recovery/stop | PASS | Byte-for-byte snapshots are under `.pi/build/task-03/before/` for all seven targets, with baseline SHA-256 recorded in the command receipt. Stop before mutation if terminal append cannot be observed before scheduling or valid restart requires stale/ambiguous lineage. |

## Ordered phases
1. **Capture/binding readiness** — target coordinator binding/bootstrap/schedule and queue-kernel reads; prerequisite baseline plus snapshots; exit fixture design names branch queue records.
2. **Harness capture activation** — target `runtime/coordinator.ts`; prerequisite valid queue reconstruction; exit integration observes synchronous no-runtime and active-worker capture.
3. **Legacy worker cutover** — target `workers/scheduler.ts`; prerequisite coordinator exact queue state; exit no source-derived trigger and queued direct smokes pass.
4. **Checkpoint preservation** — targets five owned smokes; prerequisite production behavior; exit focused/full Plastic smoke loop and scoped diff review pass.
