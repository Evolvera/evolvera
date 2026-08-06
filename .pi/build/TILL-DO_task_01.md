# TILL-DO task_01

## Authority / baseline — PASS
- Authority: approved planner task `20260806_150243Z_plastic_emergency_compaction/TASKS/task_01_builder.md`; relevant plan sections read.
- Baseline: HEAD `1b14f5efdc3138e4a937250a452ee9c4eb232b6f`; declared source targets are clean; unrelated dirty paths remain untouched.

## Contract / scope — PASS
- Add explicit exact-model worker execution and candidate construction while preserving default Luna behavior, parsers, citations, scrubbing, transport cap, max output, and retry semantics.
- Write set is exactly the five declared worker/runtime sources plus the new fallback smoke; no config, schemas, dependencies, scheduler, promoter, or other files.
- No native Pi summarization, visible model mutation, live provider/network/session access, or raw diagnostic logging.

## Validation / resources — PASS
- Declared commands are in-process module smokes with fake registries/runtimes: `NO_STATEFUL_RESOURCES`.
- Will run the new smoke, the three focused existing smokes, full `extensions/test/plastic-memory-*.smoke.mjs`, and `git diff --check` on the write set.
- No live Pi, providers, network, servers, E2E, credentials, or user session files.

## Recovery / stop — PASS
- Required byte-for-byte pre-edit snapshots created under `.pi/build/recovery/task_01/` for all five existing source targets.
- Stop `BLOCKED` if exact model registry/auth/adapter support cannot be preserved without visible-session mutation, or if scope expansion/guard weakening is required.
