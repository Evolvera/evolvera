# TODO task-03

**Completed:** All four phases, focused validation, full Plastic smoke loop, and scoped diff check.  
**Current:** Complete.  
**Next:** Handover; do not stage or commit.

| Phase | Status | Primary authorized files/symbols | Material prerequisite | Local exit evidence |
|---|---|---|---|---|
| 1. Capture/binding readiness | complete | `extensions/plastic-memory/runtime/coordinator.ts` binding/bootstrap/schedule; queue-kernel reads | HEAD `416963a`, clean target baseline, `.pi/build/task-03/before/` snapshots | Queue capture/reconstruction uses the persisted bootstrap source window; restart candidates require one valid unresolved current binding. |
| 2. Harness capture activation | complete | `extensions/plastic-memory/runtime/coordinator.ts` | Valid reconstructed queue state | Capture/re-read precedes runtime lookup; exact queue state and host-visible model reach scheduler; `agent_settled` schedules/drains. |
| 3. Legacy worker cutover | complete | `extensions/plastic-memory/workers/scheduler.ts` | Coordinator supplies exact queue state | Legacy lookup/live snapshot path removed; one queue-only worker branch chooses oldest unresolved record and arms durable FIFO wake-up. |
| 4. Checkpoint preservation | complete | Five authorized smoke files | Production behavior complete | Required focused suite and `for f in extensions/test/plastic-memory-*.smoke.mjs; do node "$f" || exit 1; done` passed; scoped `git diff --check` passed. |

**Changed product files:** `extensions/plastic-memory/runtime/coordinator.ts`, `extensions/plastic-memory/workers/scheduler.ts`, and five authorized smoke files.  
**Recovery:** `.pi/build/task-03/before/` (baseline SHA-256 recorded in `TILL-DO_task-03.md`).  
**Validation:** focused coordinator/queue/worker/chunking/fresh-session suite and full Plastic loop passed with supplied `NO_STATEFUL_RESOURCES` receipt.
