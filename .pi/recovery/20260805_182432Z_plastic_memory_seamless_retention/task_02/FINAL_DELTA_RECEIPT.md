# Task 02 Final Delta Receipt — acceptance repair 2

## Baseline and scope
- Task authority: `.pi/plans/20260805_182432Z_plastic_memory_seamless_retention/TASKS/task_02_builder.md`.
- HEAD remains `152d4e75211812706216ae1427602fd0a782ec74`; Task 01 production was not touched.
- Exact ten-file Task 02 write set preserved. No runner/config/types/ledger/engine/coordinator/host files changed.
- Original byte snapshots remain under `task_02/before/`; repair-start byte snapshots remain under `task_02/repair_before/`, and second-repair byte snapshots were added under `task_02/repair_before_2/` for all ten targets.

## Repair delta
- `cycles.ts`: when a tool-call assistant starts after ordinary entries, the ordinary run is flushed as its own atomic group before the exchange begins with only the assistant entry; matching results remain in that exchange. Existing terminal/ordinary boundaries, malformed/orphan guards, `<=160,000` packing, and fixed oversized-exchange reason remain unchanged.
- `plastic-memory-chunking.smoke.mjs`: added the fixed large ordinary-prefix/large-valid-tool-exchange regression proving separate bounded chunks, exact ordered union, call/result co-location, and one terminal-complete close; the giant three-exchange campaign and impossible single-exchange case remain.
- `plastic-memory-workers.smoke.mjs`: inspected retry fixtures/assertions; no adaptation was required.

## Validation and resource evidence
| Command | Result |
|---|---|
| `node extensions/test/plastic-memory-chunking.smoke.mjs` | PASS |
| `node extensions/test/plastic-memory-worker-contract.smoke.mjs` | PASS |
| `node extensions/test/plastic-memory-workers.smoke.mjs` | PASS; retry assertions unchanged and valid |
| `node extensions/test/plastic-memory-transport-integrity.smoke.mjs` | PASS |
| `node extensions/test/plastic-memory-stride.smoke.mjs` | PASS |
| `node extensions/test/plastic-memory-integration.smoke.mjs` | PASS; fake in-memory runtime, unique OS-temp sandbox, teardown |
| `node extensions/test/plastic-memory-session.smoke.mjs` | PASS |
| `for test in extensions/test/plastic-memory-*.smoke.mjs; do node "$test" || exit 1; done` | PASS; all 21 Plastic smokes |
| scoped `git diff --check` over all ten targets | PASS |

All focused deterministic smokes use in-process fakes with `NO_STATEFUL_RESOURCES`. Integration uses a unique run-owned `mkdtemp` sandbox, fake model/runtime, no provider/network/credential access, and bounded teardown. No Pi/provider call or credential inspection was performed.

## Fixed acceptance evidence
- Large ordinary prefix: `95,000`; valid tool exchange: `70,000`; each is below `160,000` while their combined `165,000` exceeds the bound, so partition produced `[[prefix-user], [prefix-call, prefix-result, prefix-terminal]]`, with every chunk `<=160,000`.
- Terminal-complete ordinary/tool fixture closed once; call/result stayed in one chunk and the exact ordered union matched all four source IDs.
- Giant agentic source token count: `170,000`; deterministic partition produced multiple chunks, each `<=160,000`.
- Ordered partition union equals all eight source IDs exactly once; each of the three assistant calls shares its chunk with its corresponding result.
- Scheduler observed all chunks, reflected once, appended observations once, appended reflections once, and closed exactly one full-span cycle.
- Unmatched multi-call and orphan-result spans returned `tool-exchange-integrity-failure`; worker-call count remained zero.
- Oversized complete exchange returned `indivisible-message-group-exceeds-bound`; no worker call.

## Recovery artifacts and hashes
- Patch: `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/task-02.delta.patch`
- Patch SHA: `ae144cec040609e9363a47e573ca4ad05a56dc115ec5658204feafd4f4a6ad87`
- Target hashes: `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/task-02.target.sha256`
- Original snapshots: `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/before/`
- Repair snapshots: `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/repair_before/`; second repair snapshots: `.pi/recovery/20260805_182432Z_plastic_memory_seamless_retention/task_02/repair_before_2/`

## Residual unknown
Windows runtime remains unverified as reported by the existing install smoke; it is outside this local deterministic repair. No other material acceptance gap remains.
